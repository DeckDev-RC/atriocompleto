import { Brain, User, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMemo } from 'react';
import { extractCharts, AgentChart } from './AgentChart';
import type { ChartData } from './AgentChart';

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
}

export function AgentMessage({ role, content, timestamp, isLoading, tokenUsage }: AgentMessageProps) {
  const isUser = role === 'user';

  const { text: textContent, charts } = useMemo(() => extractCharts(content), [content]);

  const renderContent = () => {
    if (charts.length === 0) {
      return <MarkdownBlock text={content} />;
    }

    const parts = textContent.split(/(%%CHART_\d+%%)/);
    return (
      <>
        {parts.map((part, i) => {
          const chartMatch = part.match(/%%CHART_(\d+)%%/);
          if (chartMatch) {
            const chartIndex = parseInt(chartMatch[1]);
            return charts[chartIndex] ? (
              <AgentChart key={`chart-${i}`} data={charts[chartIndex] as ChartData} />
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
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${isUser
          ? 'bg-border/80 dark:bg-[rgba(255,255,255,0.06)]'
          : 'bg-gradient-to-br from-accent to-accent-deep shadow-sm'
          }`}
      >
        {isUser ? (
          <User size={15} className="text-secondary" strokeWidth={2} />
        ) : (
          <Brain size={15} className="text-white" strokeWidth={2} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className={`text-[12px] font-semibold tracking-[-0.01em] ${isUser ? 'text-secondary' : 'text-accent'
              }`}
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
                className="h-2 w-2 rounded-full bg-accent"
                style={{ animation: `bounce-dot 1.2s ease-in-out ${i * 0.15}s infinite` }}
              />
            ))}
          </div>
        ) : (
          <div className="text-[14px] leading-[1.7] text-primary break-words agent-message-content">
            {renderContent()}

            {tokenUsage && !isUser && (
              <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-border text-[10px] text-muted opacity-60">
                <Zap size={9} />
                <span>{tokenUsage.totalTokens.toLocaleString('pt-BR')} tokens</span>
                <span className="opacity-40">·</span>
                <span>
                  ~${tokenUsage.estimatedCostUSD < 0.01
                    ? tokenUsage.estimatedCostUSD.toFixed(4)
                    : tokenUsage.estimatedCostUSD.toFixed(3)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MarkdownBlock({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p>{children}</p>,
        strong: ({ children }) => (
          <strong className="text-accent font-semibold">{children}</strong>
        ),
        code: ({ children }) => (
          <code className="bg-border/40 dark:bg-[rgba(255,255,255,0.06)] px-1.5 py-0.5 rounded-[5px] text-[13px] font-mono text-success">
            {children}
          </code>
        ),
        pre: ({ children }) => (
          <pre className="bg-body/80 dark:bg-[rgba(0,0,0,0.3)] p-4 rounded-xl overflow-auto my-3 text-[13px] font-mono border border-border">
            {children}
          </pre>
        ),
        ul: ({ children }) => <ul>{children}</ul>,
        ol: ({ children }) => <ol>{children}</ol>,
        li: ({ children }) => <li>{children}</li>,
        h1: ({ children }) => <h1 className="text-primary border-b border-border pb-1.5">{children}</h1>,
        h2: ({ children }) => <h2 className="text-primary">{children}</h2>,
        h3: ({ children }) => <h3>{children}</h3>,
        hr: () => <hr />,
        blockquote: ({ children }) => <blockquote className="text-secondary">{children}</blockquote>,
        table: ({ children }) => (
          <div className="overflow-x-auto my-3 rounded-xl border border-border">
            <table>{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-body/60 dark:bg-[rgba(255,255,255,0.03)]">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => <th>{children}</th>,
        td: ({ children }) => <td className="text-primary">{children}</td>,
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
