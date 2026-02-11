import { MessageSquare, Trash2, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../../hooks/useBrandPrimaryColor';

interface Conversation {
  id: string;
  messages: Array<{ role: string; content: string; timestamp: string }>;
  created_at: string;
  updated_at: string;
}

interface AgentHistoryProps {
  conversations: Conversation[];
  currentId: string | null;
  onSelect: (conversation: Conversation) => void;
  onDelete: (id: string) => void;
  onNewChat: () => void;
}

export function AgentHistory({
  conversations,
  currentId,
  onSelect,
  onDelete,
  onNewChat,
}: AgentHistoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const brandPrimaryColor = useBrandPrimaryColor();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return 'Hoje';
    if (diffDays === 1) return 'Ontem';
    if (diffDays < 7) return `${diffDays}d atrás`;
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  };

  const getPreview = (conv: Conversation) => {
    const firstUserMsg = conv.messages.find((m) => m.role === 'user');
    if (!firstUserMsg) return 'Nova conversa';
    const text = firstUserMsg.content;
    return text.length > 40 ? text.slice(0, 40) + '...' : text;
  };

  const filtered = conversations.filter((c) => {
    if (!searchQuery) return true;
    const preview = getPreview(c).toLowerCase();
    return preview.includes(searchQuery.toLowerCase());
  });

  return (
    <div className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-card/50 dark:bg-[rgba(255,255,255,0.01)] backdrop-blur-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-3">
        <h2 className="text-[13px] font-semibold text-primary tracking-[-0.01em]">
          Conversas
        </h2>
        <button
          onClick={onNewChat}
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-all duration-200 active:scale-90"
          style={{
            backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1) : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
            color: brandPrimaryColor || 'var(--color-brand-primary)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = brandPrimaryColor 
              ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.2)
              : 'color-mix(in srgb, var(--color-brand-primary) 20%, transparent)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = brandPrimaryColor 
              ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1)
              : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)';
          }}
          title="Nova conversa"
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-border bg-body/40 dark:bg-[rgba(255,255,255,0.03)] py-2 pl-8 pr-3 text-[12px] text-primary placeholder:text-muted outline-none transition-all duration-200"
            onFocus={(e) => {
              if (brandPrimaryColor) {
                e.currentTarget.style.borderColor = getBrandPrimaryWithOpacity(brandPrimaryColor, 0.3);
                e.currentTarget.style.boxShadow = `0 0 0 2px ${getBrandPrimaryWithOpacity(brandPrimaryColor, 0.08)}`;
              } else {
                e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--color-brand-primary) 30%, transparent)';
                e.currentTarget.style.boxShadow = '0 0 0 2px color-mix(in srgb, var(--color-brand-primary) 8%, transparent)';
              }
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = '';
              e.currentTarget.style.boxShadow = '';
            }}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare size={24} className="text-muted mb-2" strokeWidth={1.5} />
            <p className="text-[12px] text-muted">Nenhuma conversa</p>
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {filtered.map((conv) => {
              const isActive = conv.id === currentId;
              return (
                <div
                  key={conv.id}
                  className={`group flex cursor-pointer items-start gap-2.5 rounded-xl px-3 py-2.5 transition-all duration-200 ${
                    isActive
                      ? ''
                      : 'hover:bg-border/40 dark:hover:bg-[rgba(255,255,255,0.03)] text-primary'
                  }`}
                  style={isActive ? {
                    backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1) : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
                    color: brandPrimaryColor || 'var(--color-brand-primary)',
                  } : undefined}
                  onClick={() => onSelect(conv)}
                >
                  <MessageSquare
                    size={14}
                    className={`mt-0.5 shrink-0 ${isActive ? '' : 'text-muted'}`}
                    style={isActive ? { color: brandPrimaryColor || 'var(--color-brand-primary)' } : undefined}
                    strokeWidth={1.8}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12px] font-medium tracking-[-0.01em]">
                      {getPreview(conv)}
                    </p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {formatDate(conv.updated_at || conv.created_at)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(conv.id); }}
                    className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted transition-all duration-200 hover:bg-danger/10 hover:text-danger group-hover:flex"
                    title="Excluir"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
