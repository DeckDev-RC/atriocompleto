import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { agentApi } from '../services/agentApi';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    const result = await agentApi.forgotPassword(email);
    setLoading(false);

    if (!result.success) {
      setError(result.error || 'Erro ao solicitar recuperação');
      return;
    }

    setMessage((result.data as { message: string } | undefined)?.message || 'Verifique seu email');
  };

  return (
    <div className="min-h-screen bg-body flex items-center justify-center p-5">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-soft">
        <h1 className="text-2xl font-bold text-primary mb-2">Esqueci minha senha</h1>
        <p className="text-[14px] text-muted mb-6">
          Informe seu email para receber o link de redefinição.
        </p>

        {error && (
          <div className="mb-4 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-xl border border-success/20 bg-success/5 px-4 py-3 text-[13px] text-success">
            {message}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <label className="mb-1.5 block text-[12px] font-medium text-muted uppercase tracking-wide">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-xl border border-border bg-body/60 px-4 py-3 text-[14px] text-primary outline-none focus:border-(--color-brand-primary)"
          />
          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-xl bg-(--color-brand-primary) px-4 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {loading ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/" className="text-sm text-(--color-brand-primary) hover:underline">
            Voltar para login
          </Link>
        </div>
      </div>
    </div>
  );
}
