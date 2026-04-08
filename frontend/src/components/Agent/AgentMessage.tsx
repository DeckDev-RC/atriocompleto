import { User, Zap } from 'lucide-react';
import optimusSidebarIcon from '../../assets/channels/optimus-sidebar.png';
import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { AgentChart } from './AgentChart';
import { extractCharts, type ChartData } from './chartUtils';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';
import { useFormatting } from '../../hooks/useFormatting';
import { InsightCard } from './InsightCard';
import type { AIAction } from './InsightCard';
import { ErrorBoundary } from '../ErrorBoundary';

marked.setOptions({
  gfm: true,
  breaks: true,
});

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUSD: number;
}

interface AgentMessageProps {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  isLoading?: boolean;
  tokenUsage?: TokenUsage;
  action?: AIAction;
  onExecuteAction?: (action: AIAction) => void;
  onChartClick?: (label: string, value: number, chartTitle?: string) => void;
}

export function AgentMessage({ role, content, timestamp, isLoading, tokenUsage, action, onExecuteAction, onChartClick }: AgentMessageProps) {
  const isUser = role === 'user';
  const brandPrimaryColor = useBrandPrimaryColor();
  const { formatInteger } = useFormatting();
  const repairedContent = useMemo(() => repairTextArtifacts(content), [content]);

  const { text: textContent, charts } = useMemo(() => extractCharts(repairedContent), [repairedContent]);

  const renderContent = () => {
    if (charts.length === 0) {
      return <MarkdownBlock text={repairedContent} />;
    }

    const parts = textContent.split(/(%%CHART_\d+%%)/);
    return (
      <>
        {parts.map((part, i) => {
          const chartMatch = part.match(/%%CHART_(\d+)%%/);
          if (chartMatch) {
            const chartIndex = parseInt(chartMatch[1]);
            return charts[chartIndex] ? (
              <ErrorBoundary
                key={`chart-${i}`}
                name="AgentChart"
                fallback={
                  <div className="rounded-xl border border-border bg-card/50 p-4 text-center text-[13px] text-muted">
                    Erro ao renderizar o grafico.
                  </div>
                }
              >
                <AgentChart
                  data={charts[chartIndex] as ChartData}
                  onElementClick={onChartClick}
                />
              </ErrorBoundary>
            ) : null;
          }
          if (part.trim()) {
            return <MarkdownBlock key={`text-${i}`} text={part} />;
          }
          return null;
        })}
      </>
    );
  };

  return (
    <div
      className={`flex gap-3.5 px-5 py-5 max-md:px-4 max-md:py-3.5 ${isUser ? '' : 'bg-card/40 dark:bg-[rgba(255,255,255,0.015)]'
        }`}
      style={{ animation: 'slide-up 0.3s cubic-bezier(0.16,1,0.3,1) both' }}
    >
      {/* Avatar */}
      {isUser ? (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-border/80 dark:bg-[rgba(255,255,255,0.06)]">
          <User size={15} className="text-secondary" strokeWidth={2} />
        </div>
      ) : (
        <div
          className="h-6 w-6 shrink-0 mt-0.5"
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
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`text-[12px] font-semibold tracking-[-0.01em] ${isUser ? 'text-secondary' : ''}`}
            style={!isUser ? { color: brandPrimaryColor || 'var(--color-brand-primary)' } : undefined}
          >
            {isUser ? 'Você' : 'Optimus'}
          </span>
          {timestamp && (
            <span className="text-[11px] text-muted">
              {new Date(timestamp).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex gap-1.5 py-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-2 w-2 rounded-full"
                style={{
                  backgroundColor: brandPrimaryColor || 'var(--color-brand-primary)',
                  animation: `bounce-dot 1.2s ease-in-out ${i * 0.15}s infinite`,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="text-[14px] leading-[1.7] text-primary wrap-break-word agent-message-content" style={{ wordBreak: 'break-word' }}>
            {renderContent()}

            {!isUser && (
              <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border flex-wrap print:hidden">
                {tokenUsage && (
                  <div className="flex items-center gap-1.5 text-[10px] text-muted opacity-60">
                    <Zap size={9} />
                    <span>{formatInteger(tokenUsage.totalTokens)} tokens</span>
                    <span className="opacity-40">·</span>
                    <span>
                      ~${tokenUsage.estimatedCostUSD < 0.01
                        ? tokenUsage.estimatedCostUSD.toFixed(4)
                        : tokenUsage.estimatedCostUSD.toFixed(3)}
                    </span>
                  </div>
                )}
                <div className="flex-1" />
                <button
                  onClick={() => window.print()}
                  className="text-[11px] text-muted hover:text-primary transition-colors flex items-center gap-1.5 opacity-60 hover:opacity-100"
                  title="Exportar como PDF"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                  Exportar PDF
                </button>
              </div>
            )}

            {!isUser && action && onExecuteAction && (
              <InsightCard action={action} onExecute={onExecuteAction} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function repairTextArtifacts(text: string) {
  if (!/[\u00c3\u00c2\u00e2\u00f0\uFFFD]/.test(text)) {
    return text;
  }

  try {
    const bytes = Uint8Array.from(Array.from(text, (char) => char.charCodeAt(0) & 0xff));
    const decoded = new TextDecoder('utf-8').decode(bytes);
    if (decoded && decoded !== text) {
      return decoded.replace(/\u00c2(?=[!-/:-@[-`{-~])/g, '');
    }
  } catch {
    // Ignore decode failures and fall back to the original text.
  }

  return text
    .replace(/\u00c2\u00b7/g, '·')
    .replace(/\u00c2(?=[!-/:-@[-`{-~])/g, '');
}

function MarkdownBlock({ text }: { text: string }) {
  const brandPrimaryColor = useBrandPrimaryColor();

  const html = useMemo(() => {
    const raw = marked.parse(text) as string;
    const sanitized = DOMPurify.sanitize(raw, {
      USE_PROFILES: { html: true },
    });

    return sanitized
      .replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
      .replace(/<table>/g, '<div class="agent-table-wrap"><table>')
      .replace(/<\/table>/g, '</table></div>');
  }, [text]);

  return (
    <div
      className="agent-markdown"
      style={{ ['--agent-brand-color' as string]: brandPrimaryColor || 'var(--color-brand-primary)' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
