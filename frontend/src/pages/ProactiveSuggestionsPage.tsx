import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Check, Lightbulb, RefreshCw, X } from 'lucide-react';
import { Header } from '../components/Header';
import { agentApi } from '../services/agentApi';
import { useAuth } from '../contexts/AuthContext';
import { useBrandPrimaryColor, getBrandPrimaryWithOpacity } from '../hooks/useBrandPrimaryColor';

interface SuggestionMetadata {
  action_slug?: string;
  deep_link?: string;
  filters?: Record<string, unknown>;
}

interface Suggestion {
  id: string;
  type: 'immediate' | 'opportunity' | 'risk';
  title: string;
  context: string;
  impact?: string;
  action: string;
  priority: 'alta' | 'media' | 'baixa';
  status: string;
  metadata?: SuggestionMetadata | null;
}

export function ProactiveSuggestionsPage() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useAuth();
  const hasTenant = !!user?.tenant_id;
  const brandPrimaryColor = useBrandPrimaryColor();

  const fetchSuggestions = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await agentApi.getOptimusSuggestions();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Erro ao carregar sugestoes');
      }
      setSuggestions(data.data.suggestions || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar sugestoes');
    } finally {
      setLoading(false);
    }
  };

  const generateSuggestions = async () => {
    try {
      setGenerating(true);
      setError(null);
      const data = await agentApi.generateOptimusSuggestions();
      if (!data.success || !data.data) {
        throw new Error(data.error || 'Erro ao gerar sugestoes');
      }
      setSuggestions(data.data.suggestions || []);
    } catch (err: any) {
      setError(err.message || 'Erro ao gerar novas sugestoes');
    } finally {
      setGenerating(false);
    }
  };

  const dismissSuggestion = async (id: string) => {
    try {
      await agentApi.markOptimusSuggestionStatus(id, 'dismissed');
      setSuggestions((prev) => prev.filter((suggestion) => suggestion.id !== id));
    } catch (err) {
      console.error('Failed to dismiss suggestion:', err);
    }
  };

  const handleActionClick = async (suggestion: Suggestion) => {
    try {
      const result = await agentApi.executeOptimusSuggestionAction(suggestion.id);
      setSuggestions((prev) => prev.filter((item) => item.id !== suggestion.id));

      const deepLink = result.data?.deep_link || suggestion.metadata?.deep_link;
      if (result.success && deepLink) {
        navigate(deepLink);
      }
    } catch (err) {
      console.error('Failed to execute suggestion:', err);
    }
  };

  const handleExportLowStock = () => {
    const url = agentApi.getOptimusExportUrl({ lowStock: true });
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (hasTenant) {
      fetchSuggestions();
    } else {
      setLoading(false);
    }
  }, [hasTenant]);

  const getTypeColor = (type: Suggestion['type']) => {
    switch (type) {
      case 'immediate':
        return 'text-danger bg-danger/10 border-danger/20';
      case 'opportunity':
        return 'text-success bg-success/10 border-success/20';
      case 'risk':
        return 'text-warning bg-warning/10 border-warning/20';
      default:
        return 'text-primary bg-primary/10 border-primary/20';
    }
  };

  const getTypeLabel = (type: Suggestion['type']) => {
    switch (type) {
      case 'immediate':
        return 'Urgente';
      case 'opportunity':
        return 'Oportunidade';
      case 'risk':
        return 'Risco';
      default:
        return type;
    }
  };

  return (
    <div className="p-7 max-md:p-5 max-sm:p-4 min-w-0 overflow-x-hidden">
      <Header>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportLowStock}
            disabled={!hasTenant}
            className="flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium transition-all hover:bg-muted/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Check size={16} />
            Exportar Criticos
          </button>
          <button
            onClick={generateSuggestions}
            disabled={generating || !hasTenant}
            className="flex items-center gap-2 rounded-lg bg-card border border-border px-4 py-2 text-sm font-medium transition-all hover:bg-muted/10 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
            {generating ? 'Analisando...' : 'Gerar Novas Sugestoes'}
          </button>
        </div>
      </Header>

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-primary flex items-center gap-3">
          <div
            className="p-2 rounded-xl"
            style={{
              backgroundColor: brandPrimaryColor ? getBrandPrimaryWithOpacity(brandPrimaryColor, 0.1) : 'var(--color-brand-primary)',
              color: brandPrimaryColor || 'var(--color-brand-primary)',
            }}
          >
            <Lightbulb size={24} />
          </div>
          Sugestoes Proativas Optimus
        </h1>
        <p className="text-muted mt-2 max-w-2xl">
          Analises automaticas geradas pelo Optimus para evitar riscos, melhorar giro e capturar oportunidades no catalogo.
        </p>
      </div>

      {error && (
        <div className="mb-6 flex items-center gap-2 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <AlertCircle size={16} strokeWidth={2} />
          {error}
        </div>
      )}

      {!hasTenant ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl bg-card border border-border border-dashed">
          <AlertCircle size={32} className="text-muted mb-4" />
          <h2 className="text-lg font-semibold text-primary mb-2">Configure sua Empresa</h2>
          <p className="text-muted max-w-md mx-auto">
            Seu perfil ainda nao esta vinculado a nenhuma empresa.
          </p>
        </div>
      ) : loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1, 2, 3].map((index) => (
            <div key={index} className="animate-pulse h-48 bg-card rounded-2xl border border-border" />
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-2xl bg-card border border-border border-dashed">
          <Lightbulb size={40} className="text-muted/30 mb-4" />
          <h2 className="text-lg font-semibold text-primary mb-2">Tudo tranquilo por aqui</h2>
          <p className="text-muted max-w-sm mx-auto mb-6">
            Nenhuma nova sugestao foi gerada no rastreamento atual. Se quiser, force uma nova analise agora.
          </p>
          <button
            onClick={generateSuggestions}
            disabled={generating}
            className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:opacity-90 active:scale-95 disabled:opacity-50 text-white"
            style={{ backgroundColor: brandPrimaryColor || 'var(--color-brand-primary)' }}
          >
            <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
            Escanear Agora
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-6">
          {suggestions.map((suggestion) => (
            <div
              key={suggestion.id}
              className="group flex flex-col rounded-2xl bg-card border border-border shadow-soft hover:shadow-soft-hover transition-all duration-300 relative overflow-hidden"
            >
              <div
                className={`absolute top-0 left-0 w-full h-1 ${suggestion.type === 'risk' || suggestion.type === 'immediate' ? 'bg-danger' : 'bg-success'}`}
              />

              <div className="p-5 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-3">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getTypeColor(suggestion.type)}`}>
                    {getTypeLabel(suggestion.type)}
                  </span>
                  <button
                    onClick={() => dismissSuggestion(suggestion.id)}
                    className="text-muted hover:text-danger hover:bg-danger/10 p-1.5 rounded-lg transition-colors"
                    title="Ignorar sugestao"
                  >
                    <X size={16} />
                  </button>
                </div>

                <h3 className="text-lg font-semibold text-primary leading-tight mb-2 pr-4 tracking-[-0.01em]">
                  {suggestion.title}
                </h3>

                <p className="text-sm text-secondary mb-4 flex-1">
                  {suggestion.context}
                </p>

                {suggestion.impact && (
                  <div className="mt-auto mb-4 bg-muted/5 rounded-lg p-3 border border-border/50">
                    <span className="block text-xs font-medium text-muted mb-1 uppercase tracking-wider">Impacto Projetado</span>
                    <span className="text-sm font-medium text-primary">{suggestion.impact}</span>
                  </div>
                )}

                <button
                  onClick={() => handleActionClick(suggestion)}
                  className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold border transition-all active:scale-[0.98]"
                  style={{
                    borderColor: brandPrimaryColor || 'var(--color-brand-primary)',
                    color: brandPrimaryColor || 'var(--color-brand-primary)',
                    backgroundColor: 'transparent',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.backgroundColor = brandPrimaryColor || 'var(--color-brand-primary)';
                    event.currentTarget.style.color = '#FFFFFF';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = 'transparent';
                    event.currentTarget.style.color = brandPrimaryColor || 'var(--color-brand-primary)';
                  }}
                >
                  <Check size={16} />
                  {suggestion.action}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
