import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  MoreHorizontal,
  Activity,
  AlertCircle,
} from 'lucide-react';
import optimusIcon from '../assets/channels/optimus.png';
import optimusSidebarIcon from '../assets/channels/optimus-sidebar.png';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { agentApi } from '../services/agentApi';
import { AgentMessage, AgentInput, AgentHistory } from '../components/Agent';
import type { AIAction } from '../components/Agent/InsightCard';
import { useAuth } from '../contexts/AuthContext';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../hooks/useBrandPrimaryColor';

/* ===== Types ===== */

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  tokenUsage?: TokenUsage;
  suggestions?: string[];
  action?: AIAction;
}

interface Conversation {
  id: string;
  messages: Array<{ role: string; content: string; timestamp: string }>;
  created_at: string;
  updated_at: string;
}

const SUGGESTIONS = [
  { icon: '📊', label: 'Analisar vendas', desc: 'do último trimestre por canal' },
  { icon: '📦', label: 'Pedidos por status', desc: 'distribuição geral dos pedidos' },
  { icon: '💰', label: 'Ticket médio', desc: 'dos últimos 90 dias' },
  { icon: '🏪', label: 'Marketplaces', desc: 'comparar vendas por canal' },
];

export function AgentPage() {
  const navigate = useNavigate();
  const { sidebarCollapsed, setSidebarCollapsed } = useApp();
  const { user } = useAuth();
  const brandPrimaryColor = useBrandPrimaryColor();
  const [messages, setMessages] = useState<Message[]>([]);
  const hasTenant = !!user?.tenant_id;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCollapsedRef = useRef(sidebarCollapsed);

  // Colapsar sidebar ao entrar no agente, restaurar ao sair
  useEffect(() => {
    prevCollapsedRef.current = sidebarCollapsed;
    setSidebarCollapsed(true);
    return () => setSidebarCollapsed(prevCollapsedRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, loading]);

  // Health check on mount + periodic re-check every 60s
  useEffect(() => {
    const check = () => agentApi.health().then((r) => setIsConnected(r.success)).catch(() => setIsConnected(false));
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  const loadConversations = useCallback(async (autoSelectFirst = false) => {
    const result = await agentApi.getChatHistory();
    if (result.success && result.data) {
      setConversations(result.data);
      if (autoSelectFirst && result.data.length > 0 && !conversationId) {
        const latest = result.data[0];
        setConversationId(latest.id);
        setMessages(
          latest.messages.map((m) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
            timestamp: m.timestamp,
          })),
        );
      }
    }
  }, [conversationId]);

  useEffect(() => {
    loadConversations(true);
  }, []);

  const handleSend = async (message: string) => {
    const userMsg: Message = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    // Placeholder for assistant response during stream
    const assistantMsg: Message = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, assistantMsg]);

    let fullText = '';
    let lastAction: AIAction | undefined;

    try {
      const stream = agentApi.sendMessageStream(message, conversationId || undefined);

      for await (const chunk of stream) {
        if (chunk.type === 'text') {
          fullText += chunk.content;
          setMessages((prev) => {
            const newMessages = [...prev];
            const last = newMessages[newMessages.length - 1];
            if (last && last.role === 'assistant') {
              last.content = fullText;
            }
            return newMessages;
          });
        } else if (chunk.type === 'action') {
          lastAction = chunk.content;
          setMessages((prev) => {
            const newMessages = [...prev];
            const last = newMessages[newMessages.length - 1];
            if (last && last.role === 'assistant') {
              last.action = lastAction;
            }
            return newMessages;
          });
        } else if (chunk.type === 'done') {
          if (chunk.conversation_id) setConversationId(chunk.conversation_id);
          setMessages((prev) => {
            const newMessages = [...prev];
            const last = newMessages[newMessages.length - 1];
            if (last && last.role === 'assistant') {
              last.tokenUsage = chunk.tokenUsage;
              last.suggestions = chunk.suggestions;
            }
            return newMessages;
          });
          loadConversations();
        } else if (chunk.type === 'error') {
          throw new Error(chunk.content);
        }
      }
    } catch (err: any) {
      console.error('[AgentPage] Stream error:', err);
      setMessages((prev) => {
        const newMessages = [...prev];
        const last = newMessages[newMessages.length - 1];
        if (last && last.role === 'assistant') {
          last.content = err.message || 'Erro ao processar mensagem. Tente novamente.';
        }
        return newMessages;
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExecuteAction = async (action: AIAction) => {
    console.log('[AgentPage] Executing action:', action);
    // Dispatch to backend insight action endpoint if we have an insight context
    // For now, send a follow-up message to the agent asking it to elaborate on the action
    const followUp = `Quero executar a ação "${action.action}". ${action.reason}. Me dê mais detalhes sobre como proceder.`;
    handleSend(followUp);
  };

  const handleChartClick = (label: string, value: number, chartTitle?: string) => {
    const prompt = `Me dê mais detalhes sobre "${label}" ${chartTitle ? `no gráfico de "${chartTitle}"` : ''}. O valor é ${value}.`;
    handleSend(prompt);
  };

  const handleNewChat = async () => {
    const result = await agentApi.newConversation();
    if (result.success && result.data) {
      setConversationId(result.data.id);
      setMessages([]);
      loadConversations();
    } else {
      setConversationId(null);
      setMessages([]);
    }
    setHistoryOpen(false);
  };

  const handleSelectConversation = (conv: Conversation) => {
    setConversationId(conv.id);
    setMessages(
      conv.messages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
        timestamp: m.timestamp,
      })),
    );
    setHistoryOpen(false);
  };

  const handleDeleteConversation = async (id: string) => {
    await agentApi.clearConversation(id);
    if (id === conversationId) {
      setConversationId(null);
      setMessages([]);
    }
    loadConversations();
  };

  const handleHealthCheck = async () => {
    setLoading(true);
    const result = await agentApi.getHealthCheck();
    if (result.success && result.data) {
      setMessages([{
        role: 'assistant',
        content: result.data.message,
        timestamp: new Date().toISOString(),
      }]);
    }
    setLoading(false);
  };

  return (
    <div
      className="flex h-screen"
      style={{ animation: 'fade-in 0.4s cubic-bezier(0.16,1,0.3,1) both' }}
    >
      {/* Backdrop (mobile/tablet) */}
      <div
        className={`fixed inset-0 z-30 transition-opacity duration-300 hidden max-lg:block ${historyOpen ? 'bg-overlay opacity-100 pointer-events-auto backdrop-blur-[2px]' : 'opacity-0 pointer-events-none'
          }`}
        onClick={() => setHistoryOpen(false)}
      />

      <div
        className={`max-lg:fixed max-lg:left-0 max-lg:top-0 max-lg:z-40 max-lg:h-full transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${historyOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
          }`}
      >
        <AgentHistory
          conversations={conversations}
          currentId={conversationId}
          onSelect={handleSelectConversation}
          onDelete={handleDeleteConversation}
          onNewChat={handleNewChat}
        />
      </div>

      {/* Main Chat */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex h-[56px] shrink-0 items-center gap-3 border-b border-border px-5 max-sm:px-3">
          <button
            onClick={() => navigate('/')}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-secondary transition-all duration-200 hover:bg-card hover:text-primary hover:shadow-soft active:scale-95"
            title="Voltar ao Dashboard"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>

          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              className="h-6 w-6 shrink-0"
              style={{
                backgroundColor: brandPrimaryColor || 'var(--color-brand-primary)',
                maskImage: `url(${optimusSidebarIcon})`,
                maskSize: 'contain',
                maskRepeat: 'no-repeat',
                maskPosition: 'center',
                WebkitMaskImage: `url(${optimusSidebarIcon})`,
                WebkitMaskSize: 'contain',
                WebkitMaskRepeat: 'no-repeat',
                WebkitMaskPosition: 'center',
              }}
              aria-label="Optimus"
            />
            <div className="min-w-0">
              <h1 className="text-[15px] font-semibold text-primary tracking-[-0.02em] leading-tight">
                Optimus
              </h1>
              <div className="flex items-center gap-1.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${isConnected === null ? 'bg-warning' : isConnected ? 'bg-success' : 'bg-danger'
                    }`}
                />
                <p className="text-[11px] text-muted leading-tight">
                  {loading ? 'Analisando...' : isConnected === null ? 'Conectando...' : isConnected ? 'Online' : 'Offline'}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={() => setHistoryOpen((p) => !p)}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-secondary transition-all duration-200 hover:bg-card hover:text-primary hover:shadow-soft active:scale-95 lg:hidden"
          >
            <MoreHorizontal size={18} strokeWidth={2} />
          </button>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 && !loading ? (
            <EmptyState
              onPromptClick={(prompt) => handleSend(prompt)}
              onHealthCheck={handleHealthCheck}
              isConnected={isConnected}
              hasTenant={hasTenant}
            />
          ) : (
            <div className="mx-auto max-w-[960px] px-4 lg:px-8">
              {messages.map((msg, i) => (
                <div key={i}>
                  <AgentMessage
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                    tokenUsage={msg.tokenUsage}
                    action={msg.action}
                    onExecuteAction={handleExecuteAction}
                    onChartClick={handleChartClick}
                  />
                  {/* Suggestion chips */}
                  {msg.role === 'assistant' && msg.suggestions && msg.suggestions.length > 0 &&
                    i === messages.length - 1 && !loading && (
                      <div className="flex flex-wrap gap-2 px-5 pb-4 pl-[52px] max-md:pl-[44px]" style={{ animation: 'slide-up 0.3s ease-out' }}>
                        {msg.suggestions.map((s) => (
                          <button
                            key={s}
                            onClick={() => handleSend(s)}
                            className="rounded-full border border-border bg-card/60 px-3 py-1.5 text-[12px] text-secondary transition-all duration-200 active:scale-95"
                            style={{
                              ['--hover-border-color' as any]: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.3) : 'color-mix(in srgb, var(--color-brand-primary) 30%, transparent)',
                              ['--hover-color' as any]: brandPrimaryColor || 'var(--color-brand-primary)',
                              ['--hover-bg' as any]: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.05) : 'color-mix(in srgb, var(--color-brand-primary) 5%, transparent)',
                            }}
                            onMouseEnter={(e) => {
                              if (brandPrimaryColor) {
                                e.currentTarget.style.borderColor = getBrandPrimaryWithOpacity(brandPrimaryColor, 0.3);
                                e.currentTarget.style.color = brandPrimaryColor;
                                e.currentTarget.style.backgroundColor = getBrandPrimaryWithOpacity(brandPrimaryColor, 0.05);
                              } else {
                                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-brand-primary) 30%, transparent)';
                                e.currentTarget.style.color = 'var(--color-brand-primary)';
                                e.currentTarget.style.backgroundColor = 'color-mix(in srgb, var(--color-brand-primary) 5%, transparent)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = '';
                              e.currentTarget.style.color = '';
                              e.currentTarget.style.backgroundColor = '';
                            }}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                    )}
                </div>
              ))}
              {loading && <AgentMessage role="assistant" content="" isLoading />}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <AgentInput onSend={handleSend} disabled={loading || !hasTenant} />
      </div>
    </div>
  );
}

/* ===== Empty State ===== */

function EmptyState({
  onPromptClick,
  onHealthCheck,
  isConnected,
  hasTenant,
}: {
  onPromptClick: (text: string) => void;
  onHealthCheck: () => void;
  isConnected: boolean | null;
  hasTenant: boolean;
}) {
  const brandPrimaryColor = useBrandPrimaryColor();

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      {/* Icon */}
      <div
        className="mb-6 flex h-[72px] w-[72px] items-center justify-center rounded-[22px] shadow-[0_8px_32px_rgba(56,182,255,0.12)]"
        style={{
          animation: 'scale-in 0.5s cubic-bezier(0.16,1,0.3,1) both',
          background: brandPrimaryColor
            ? `linear-gradient(to bottom right, ${getBrandPrimaryWithOpacity(brandPrimaryColor, 0.15)}, ${getBrandPrimaryWithOpacity(brandPrimaryColor, 0.08)})`
            : 'linear-gradient(to bottom right, color-mix(in srgb, var(--color-brand-primary) 15%, transparent), color-mix(in srgb, var(--color-brand-primary) 8%, transparent))',
        }}
      >
        <div
          className="h-[40px] w-[40px]"
          style={{
            backgroundColor: brandPrimaryColor || 'var(--color-brand-primary)',
            maskImage: `url(${optimusIcon})`,
            maskSize: 'contain',
            maskRepeat: 'no-repeat',
            maskPosition: 'center',
            WebkitMaskImage: `url(${optimusIcon})`,
            WebkitMaskSize: 'contain',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskPosition: 'center',
          }}
          aria-label="Optimus"
        />
      </div>

      <h2
        className="text-[24px] font-bold tracking-[-0.03em] text-primary mb-2"
        style={{ animation: 'slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.1s both' }}
      >
        Olá! Sou o Optimus
      </h2>
      <p
        className="text-[14px] text-secondary text-center max-w-[420px] leading-relaxed mb-8"
        style={{ animation: 'slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.15s both' }}
      >
        Seu assistente de análise de dados e-commerce. Pergunte sobre pedidos, vendas, faturamento e marketplaces.
      </p>

      {!hasTenant && (
        <div className="mb-8 flex items-center gap-3 rounded-2xl bg-warning/10 px-6 py-4 text-[13px] text-warning border border-warning/20 max-w-[420px]" style={{ animation: 'slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.18s both' }}>
          <AlertCircle size={20} className="shrink-0" />
          <p className="font-medium text-left">
            Vincule uma empresa ao seu perfil para começar a usar o Optimus.
          </p>
        </div>
      )}

      {/* Health Check CTA */}
      <button
        onClick={onHealthCheck}
        disabled={!isConnected || !hasTenant}
        className="mb-6 flex items-center gap-2 rounded-full border px-5 py-2.5 text-[13px] font-semibold transition-all duration-300 hover:text-white active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          animation: 'slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.2s both',
          borderColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.3) : 'color-mix(in srgb, var(--color-brand-primary) 30%, transparent)',
          backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.05) : 'color-mix(in srgb, var(--color-brand-primary) 5%, transparent)',
          color: brandPrimaryColor || 'var(--color-brand-primary)',
        }}
        onMouseEnter={(e) => {
          if (!e.currentTarget.disabled && brandPrimaryColor) {
            e.currentTarget.style.backgroundColor = brandPrimaryColor;
            const rgb = brandPrimaryColor.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
              e.currentTarget.style.boxShadow = `0 4px 20px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.2)`;
            } else if (brandPrimaryColor.startsWith('#')) {
              const hex = brandPrimaryColor.replace('#', '');
              const r = parseInt(hex.substring(0, 2), 16);
              const g = parseInt(hex.substring(2, 4), 16);
              const b = parseInt(hex.substring(4, 6), 16);
              e.currentTarget.style.boxShadow = `0 4px 20px rgba(${r}, ${g}, ${b}, 0.2)`;
            }
          }
        }}
        onMouseLeave={(e) => {
          if (!e.currentTarget.disabled) {
            e.currentTarget.style.backgroundColor = brandPrimaryColor
              ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.05)
              : 'color-mix(in srgb, var(--color-brand-primary) 5%, transparent)';
            e.currentTarget.style.boxShadow = '';
          }
        }}
      >
        <Activity size={15} strokeWidth={2.2} />
        Como está meu negócio hoje?
      </button>

      {/* Suggestion cards */}
      <div
        className="grid grid-cols-2 gap-3 max-w-[560px] w-full max-sm:grid-cols-1"
        style={{ animation: 'slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.25s both' }}
      >
        {SUGGESTIONS.map((prompt) => (
          <button
            key={prompt.label}
            onClick={() => onPromptClick(`${prompt.label} ${prompt.desc}`)}
            className="group flex items-start gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-all duration-300 hover:shadow-soft-hover dark:hover:shadow-dark-hover hover:-translate-y-0.5 active:scale-[0.98]"
            style={{
              ['--hover-border-color' as any]: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.2) : 'color-mix(in srgb, var(--color-brand-primary) 20%, transparent)',
            }}
            onMouseEnter={(e) => {
              if (brandPrimaryColor) {
                e.currentTarget.style.borderColor = getBrandPrimaryWithOpacity(brandPrimaryColor, 0.2);
              } else {
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-brand-primary) 20%, transparent)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = '';
            }}
          >
            <span className="text-[18px] shrink-0 mt-0.5">{prompt.icon}</span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-primary tracking-[-0.01em]">
                {prompt.label}
              </p>
              <p className="text-[11px] text-muted mt-0.5 leading-snug">
                {prompt.desc}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
