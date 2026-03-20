import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  MoreHorizontal,
  Activity,
  AlertCircle,
  BarChart3,
  Package2,
  ReceiptText,
  Store,
} from 'lucide-react';
import optimusIcon from '../assets/channels/optimus.png';
import optimusSidebarIcon from '../assets/channels/optimus-sidebar.png';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApp } from '../contexts/AppContext';
import { agentApi } from '../services/agentApi';
import { AgentMessage, AgentInput, AgentHistory, type UploadedAgentFile } from '../components/Agent';
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
  title?: string | null;
  created_at: string;
  updated_at: string;
  last_message_preview?: string | null;
  last_message_at?: string | null;
  message_count?: number;
  summary?: string | null;
}

interface ConversationDetail extends Conversation {
  messages: Array<{ role: string; content: string; timestamp: string }>;
}

const SUGGESTIONS = [
  { Icon: BarChart3, label: 'Analisar vendas', desc: 'do último trimestre por canal' },
  { Icon: Package2, label: 'Pedidos por status', desc: 'distribuição geral dos pedidos' },
  { Icon: ReceiptText, label: 'Ticket médio', desc: 'dos últimos 90 dias' },
  { Icon: Store, label: 'Marketplaces', desc: 'comparar vendas por canal' },
];

export function AgentPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sidebarCollapsed, setSidebarCollapsed } = useApp();
  const { user } = useAuth();
  const brandPrimaryColor = useBrandPrimaryColor();
  const [messages, setMessages] = useState<Message[]>([]);
  const hasTenant = !!user?.tenant_id;
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedAgentFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevCollapsedRef = useRef(sidebarCollapsed);
  const abortControllerRef = useRef<AbortController | null>(null);
  const autoPromptHandledRef = useRef<string | null>(null);
  const announcedFileIdsRef = useRef<Set<string>>(new Set());
  const conversationIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  // Health check on mount + periodic re-check every 60s
  useEffect(() => {
    const check = () => agentApi.health().then((r) => setIsConnected(r.success)).catch(() => setIsConnected(false));
    check();
    const interval = setInterval(check, 60_000);
    return () => clearInterval(interval);
  }, []);

  const mapConversationMessages = useCallback((conversation: ConversationDetail) => (
    conversation.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
      timestamp: m.timestamp,
    }))
  ), []);

  const loadConversationDetails = useCallback(async (id: string) => {
    const result = await agentApi.getConversation(id);
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Nao foi possivel carregar a conversa.');
    }

    conversationIdRef.current = result.data.id;
    setConversationId(result.data.id);
    setMessages(mapConversationMessages(result.data));
  }, [mapConversationMessages]);

  const loadConversations = useCallback(async (options?: { reset?: boolean; autoSelectFirst?: boolean; offset?: number }) => {
    const reset = options?.reset ?? false;
    const autoSelectFirst = options?.autoSelectFirst ?? false;
    const offset = options?.offset ?? 0;

    const result = await agentApi.getChatHistory({ limit: 20, offset });
    if (!result.success || !result.data) return;

    setConversations((prev) => reset ? result.data!.items : [...prev, ...result.data!.items]);
    setHasMoreHistory(result.data.has_more);

    if (autoSelectFirst && result.data.items.length > 0 && !conversationIdRef.current) {
      const latest = result.data.items[0];
      await loadConversationDetails(latest.id);
    }
  }, [loadConversationDetails]);

  useEffect(() => {
    void loadConversations({ reset: true, autoSelectFirst: true, offset: 0 }).catch((error) => {
      console.error('[AgentPage] History load error:', error);
    });
  }, [loadConversations]);

  const mapUploadedFile = useCallback((file: any): UploadedAgentFile => ({
    localId: file.id,
    id: file.id,
    name: file.original_name,
    mimeType: file.mime_type,
    size: file.size_bytes,
    status: file.status === 'processed' ? 'processed' : file.status === 'error' ? 'error' : file.status === 'processing' ? 'processing' : 'queued',
    progress: file.processing_progress || 0,
    stage: file.processing_stage,
    summary: file.summary || undefined,
    error: file.error_message || undefined,
  }), []);

  const loadUploadedFiles = useCallback(async (targetConversationId?: string | null) => {
    if (!targetConversationId) {
      setUploadedFiles([]);
      return;
    }

    const result = await agentApi.getOptimusFiles({ conversationId: targetConversationId, limit: 30 });
    if (!result.success || !result.data) return;

    const mapped = (result.data.files || []).map(mapUploadedFile);
    setUploadedFiles(mapped);

    const readyFiles = mapped.filter((file) => file.status === 'processed' && file.id && !announcedFileIdsRef.current.has(file.id));
    if (readyFiles.length > 0) {
      readyFiles.forEach((file) => announcedFileIdsRef.current.add(file.id!));
      setMessages((prev) => [
        ...prev,
        ...readyFiles.map((file) => ({
          role: 'assistant' as const,
          content: `📎 Recebi seu arquivo "${file.name}"! ${file.summary || 'Já processei o conteúdo e ele está pronto para perguntas.'}`,
          timestamp: new Date().toISOString(),
        })),
      ]);
    }
  }, [mapUploadedFile]);

  useEffect(() => {
    loadUploadedFiles(conversationId);
  }, [conversationId, loadUploadedFiles]);

  useEffect(() => {
    if (!conversationId) return;
    const hasPending = uploadedFiles.some((file) => file.status === 'queued' || file.status === 'processing' || file.status === 'uploading');
    if (!hasPending) return;

    const interval = setInterval(() => {
      loadUploadedFiles(conversationId);
    }, 2500);

    return () => clearInterval(interval);
  }, [conversationId, uploadedFiles, loadUploadedFiles]);

  const ensureConversationForFiles = useCallback(async () => {
    if (conversationId) return conversationId;
    const result = await agentApi.newConversation();
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Nao foi possivel criar conversa para anexos.');
    }
    conversationIdRef.current = result.data.id;
    setConversationId(result.data.id);
    void loadConversations({ reset: true, offset: 0 });
    return result.data.id;
  }, [conversationId, loadConversations]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    try {
      const targetConversationId = await ensureConversationForFiles();
      const localFiles: UploadedAgentFile[] = files.map((file) => ({
        localId: `${Date.now()}-${file.name}-${Math.random()}`,
        name: file.name,
        mimeType: file.type,
        size: file.size,
        status: 'uploading',
        progress: 10,
        stage: 'upload',
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
      }));

      setUploadedFiles((prev) => [...localFiles, ...prev]);

      const response = await agentApi.uploadOptimusFiles(files, targetConversationId);
      if (!response.success || !response.data) {
        throw new Error(response.error || 'Erro ao enviar arquivos');
      }

      const uploaded = (response.data.files || []).map(mapUploadedFile);
      uploaded.forEach((file: UploadedAgentFile) => {
        if (file.id) announcedFileIdsRef.current.delete(file.id);
      });

      setUploadedFiles((prev) => {
        const remaining = prev.filter((item) => !localFiles.some((local) => local.localId === item.localId));
        return [...uploaded, ...remaining];
      });

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `📎 Recebi ${uploaded.length} arquivo(s). Vou processar e te aviso quando estiver pronto.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (err: any) {
      console.error('[AgentPage] Upload error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: err.message || 'Nao consegui enviar os arquivos.',
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  }, [ensureConversationForFiles, loadConversations, mapUploadedFile]);

  const handleRemoveUploadedFile = useCallback(async (localId: string) => {
    const file = uploadedFiles.find((item) => item.localId === localId);
    if (!file) return;

    if (file.previewUrl) {
      URL.revokeObjectURL(file.previewUrl);
    }

    if (file.id) {
      await agentApi.deleteOptimusFile(file.id).catch((err) => {
        console.error('[AgentPage] Delete file error:', err);
      });
    }

    setUploadedFiles((prev) => prev.filter((item) => item.localId !== localId));
  }, [uploadedFiles]);

  const handleDownloadUploadedFile = useCallback(async (fileId: string) => {
    const result = await agentApi.getOptimusFileDownloadUrl(fileId);
    const url = result.data?.url;
    if (result.success && url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
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

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const fileIds = uploadedFiles
        .filter((file) => file.status === 'processed' && file.id)
        .map((file) => file.id as string);

      const stream = agentApi.sendMessageStream(
        message,
        conversationId || undefined,
        abortController.signal,
        fileIds,
      );

      for await (const chunk of stream) {
        if (abortController.signal.aborted) throw new Error('AbortError');
        
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
          if (chunk.conversation_id) {
            conversationIdRef.current = chunk.conversation_id;
            setConversationId(chunk.conversation_id);
          }
          setMessages((prev) => {
            const newMessages = [...prev];
            const last = newMessages[newMessages.length - 1];
            if (last && last.role === 'assistant') {
              last.tokenUsage = chunk.tokenUsage;
              last.suggestions = chunk.suggestions;
            }
            return newMessages;
          });
          void loadConversations({ reset: true, offset: 0 });
        } else if (chunk.type === 'error') {
          throw new Error(chunk.content);
        }
      }
    } catch (err: any) {
      console.error('[AgentPage] Stream error:', err);
      if (err.message === 'AbortError' || err.name === 'AbortError') {
        setMessages((prev) => {
          const newMessages = [...prev];
          const last = newMessages[newMessages.length - 1];
          if (last && last.role === 'assistant') {
             last.content = last.content + '\n\n*(Geração interrompida)*';
          }
          return newMessages;
        });
      } else {
        setMessages((prev) => {
          const newMessages = [...prev];
          const last = newMessages[newMessages.length - 1];
          if (last && last.role === 'assistant') {
            last.content = err.message || 'Erro ao processar mensagem. Tente novamente.';
          }
          return newMessages;
        });
      }
    } finally {
      abortControllerRef.current = null;
      setLoading(false);
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleExecuteAction = async (action: AIAction) => {
    console.log('[AgentPage] Executing action:', action);
    const deepLink = typeof action.payload?.deep_link === 'string' ? action.payload.deep_link : undefined;
    if (deepLink) {
      navigate(deepLink);
      return;
    }

    const routeByAction: Record<AIAction['action'], string> = {
      CREATE_PROMOTION: '/campanhas',
      SEND_CUSTOMER_EMAIL: '/campanhas',
      ADJUST_STOCK_ALERT: '/optimus/sugestoes',
      REVIEW_MARKETPLACE_SETTING: '/benchmarking',
    };

    const mappedRoute = routeByAction[action.action];
    if (mappedRoute) {
      navigate(mappedRoute);
      return;
    }
    const followUp = `Quero executar a ação "${action.action}". ${action.reason}. Me dê mais detalhes sobre como proceder.`;
    handleSend(followUp);
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const prompt = params.get('prompt')?.trim();

    if (!prompt || !hasTenant || loading) return;
    if (autoPromptHandledRef.current === prompt) return;

    autoPromptHandledRef.current = prompt;
    handleSend(prompt);
    navigate('/agente', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search, hasTenant, loading]);

  const handleChartClick = (label: string, value: number, chartTitle?: string) => {
    const prompt = `Me dê mais detalhes sobre "${label}" ${chartTitle ? `no gráfico de "${chartTitle}"` : ''}. O valor é ${value}.`;
    handleSend(prompt);
  };

  const handleNewChat = async () => {
    const result = await agentApi.newConversation();
    if (result.success && result.data) {
      conversationIdRef.current = result.data.id;
      setConversationId(result.data.id);
      setMessages([]);
      setUploadedFiles([]);
      announcedFileIdsRef.current.clear();
      void loadConversations({ reset: true, offset: 0 });
    } else {
      conversationIdRef.current = null;
      setConversationId(null);
      setMessages([]);
      setUploadedFiles([]);
      announcedFileIdsRef.current.clear();
    }
    setHistoryOpen(false);
  };

  const handleSelectConversation = async (conv: Conversation) => {
    try {
      announcedFileIdsRef.current.clear();
      await loadConversationDetails(conv.id);
      setHistoryOpen(false);
    } catch (error) {
      console.error('[AgentPage] Load conversation error:', error);
    }
  };

  const handleDeleteConversation = async (id: string) => {
    await agentApi.clearConversation(id);
    if (id === conversationId) {
      conversationIdRef.current = null;
      setConversationId(null);
      setMessages([]);
      setUploadedFiles([]);
      announcedFileIdsRef.current.clear();
    }
    void loadConversations({ reset: true, autoSelectFirst: id === conversationId, offset: 0 }).catch((error) => {
      console.error('[AgentPage] History reload error:', error);
    });
  };

  const handleLoadMoreHistory = useCallback(async () => {
    if (loadingMoreHistory || !hasMoreHistory) return;
    setLoadingMoreHistory(true);
    try {
      await loadConversations({ offset: conversations.length });
    } finally {
      setLoadingMoreHistory(false);
    }
  }, [conversations.length, hasMoreHistory, loadConversations, loadingMoreHistory]);

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
          hasMore={hasMoreHistory}
          isLoadingMore={loadingMoreHistory}
          onLoadMore={handleLoadMoreHistory}
        />
      </div>

      {/* Main Chat */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Header */}
        <header className="flex h-[56px] shrink-0 items-center gap-3 border-b border-border px-5 max-sm:px-3 max-sm:gap-2">
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
            <div className="mx-auto max-w-[960px] px-4 max-sm:px-2.5 lg:px-8">
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

        {uploadedFiles.length > 0 && (
          <div className="mx-auto w-full max-w-[960px] px-4 max-sm:px-2.5 pb-3 lg:px-8">
            <div className="mb-2 text-[11px] text-muted">
              Arquivos anexados a esta conversa. Quando estiverem prontos, voce pode perguntar sobre o conteudo normalmente.
            </div>
            <div className="flex flex-wrap gap-2">
              {uploadedFiles.map((file) => (
                <div key={file.localId} className="flex max-w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-soft">
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-medium text-primary">{file.name}</p>
                    <p className="text-[10px] text-muted">
                      {file.status === 'processed'
                        ? 'Pronto'
                        : file.status === 'error'
                          ? 'Erro'
                          : `${file.stage || 'processando'} â€¢ ${file.progress}%`}
                    </p>
                    {file.summary && (
                      <p className="max-w-[240px] truncate text-[10px] text-muted">{file.summary}</p>
                    )}
                    {file.error && (
                      <p className="max-w-[240px] truncate text-[10px] text-danger">{file.error}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {file.id && file.status === 'processed' && (
                      <button
                        onClick={() => handleDownloadUploadedFile(file.id!)}
                        className="rounded-lg border border-border px-2 py-1 text-[10px] text-secondary transition-colors hover:text-primary"
                      >
                        Baixar
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveUploadedFile(file.localId)}
                      className="rounded-lg border border-border px-2 py-1 text-[10px] text-secondary transition-colors hover:text-danger"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Input */}
        <AgentInput
          onSend={handleSend}
          disabled={loading || !hasTenant}
          onStop={handleStop}
          uploadedFiles={uploadedFiles}
          onFilesSelected={handleFilesSelected}
          onRemoveFile={handleRemoveUploadedFile}
          onDownloadFile={handleDownloadUploadedFile}
        />
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
        Seu assistente de análise de dados e-commerce. Pergunte sobre pedidos, vendas, faturamento e marketplaces ou anexe arquivos para eu analisar.
      </p>

      <div
        className="mb-6 rounded-2xl border border-border bg-card/70 px-4 py-3 text-center text-[12px] text-secondary max-w-[520px]"
        style={{ animation: 'slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.17s both' }}
      >
        Dica: use o ícone de clipe no campo de mensagem para anexar PNG, PDF, XLS, XLSX ou TXT. Você também pode arrastar o arquivo para a conversa.
      </div>

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
            <span className="shrink-0 mt-0.5 text-muted group-hover:text-primary transition-colors">
              <prompt.Icon size={18} strokeWidth={2} />
            </span>
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

