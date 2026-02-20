import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { agentApi } from '../services/agentApi';
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react';

export function VerifyEmailPage() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [message, setMessage] = useState('');
    const [invitationLink, setInvitationLink] = useState<string | null>(null);
    const verifying = useRef(false);

    useEffect(() => {
        if (!token || verifying.current) return;
        verifying.current = true;

        const verify = async () => {
            try {
                const result = await agentApi.verifyEmail(token);
                if (result.success) {
                    setStatus('success');
                    setMessage(result.data?.message || 'E-mail verificado com sucesso!');
                    setInvitationLink(result.data?.invitationLink || null);
                } else {
                    setStatus('error');
                    setMessage(result.error || 'Erro ao verificar e-mail.');
                }
            } catch (err) {
                setStatus('error');
                setMessage('Ocorreu um erro inesperado.');
            }
        };

        verify();
    }, [token]);


    return (
        <div className="flex min-h-screen items-center justify-center bg-body p-4">
            <div className="w-full max-w-[440px] animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="card-glass relative overflow-hidden p-8 text-center shadow-2xl">
                    {/* Decorative backdrop */}
                    <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand-primary/10 blur-3xl" />
                    <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-brand-secondary/10 blur-3xl" />

                    <div className="relative z-10">
                        {status === 'loading' && (
                            <div className="flex flex-col items-center gap-6 py-8">
                                <div className="relative">
                                    <div className="absolute inset-0 animate-ping rounded-full bg-brand-primary/20" />
                                    <Loader2 className="relative h-16 w-16 animate-spin text-brand-primary" strokeWidth={1.5} />
                                </div>
                                <div className="space-y-2">
                                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Verificando...</h1>
                                    <p className="text-muted">Aguarde enquanto validamos sua conta.</p>
                                </div>
                            </div>
                        )}

                        {status === 'success' && (
                            <div className="flex flex-col items-center gap-6 py-4">
                                <div className="input-icon-wrapper flex h-20 w-20 items-center justify-center rounded-2xl bg-green-500/10 text-green-500">
                                    <CheckCircle size={40} strokeWidth={1.5} className="animate-in zoom-in duration-500" />
                                </div>
                                <div className="space-y-2">
                                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Tudo Pronto!</h1>
                                    <p className="text-muted leading-relaxed">{message}</p>
                                </div>
                                {invitationLink ? (
                                    <button
                                        onClick={() => window.location.href = invitationLink}
                                        className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-3"
                                    >
                                        Definir Minha Senha
                                        <ArrowRight size={18} />
                                    </button>
                                ) : (
                                    <button
                                        onClick={() => navigate('/')}
                                        className="btn-primary mt-4 flex w-full items-center justify-center gap-2 py-3"
                                    >
                                        Ir para o Login
                                        <ArrowRight size={18} />
                                    </button>
                                )}
                            </div>
                        )}

                        {status === 'error' && (
                            <div className="flex flex-col items-center gap-6 py-4">
                                <div className="input-icon-wrapper flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
                                    <XCircle size={40} strokeWidth={1.5} className="animate-in zoom-in duration-500" />
                                </div>
                                <div className="space-y-2">
                                    <h1 className="text-2xl font-bold tracking-tight text-foreground">Oops! Algo deu errado</h1>
                                    <p className="text-muted leading-relaxed">{message}</p>
                                </div>

                                <div className="mt-4 flex w-full flex-col gap-3">
                                    <button
                                        onClick={() => navigate('/')}
                                        className="btn-secondary flex items-center justify-center gap-2 py-3"
                                    >
                                        Voltar ao Login
                                    </button>
                                    <p className="text-xs text-muted mt-2">
                                        O link pode ter expirado (validade de 24h) ou já foi utilizado.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer info */}
                <p className="mt-8 text-center text-[13px] text-muted-more">
                    &copy; {new Date().getFullYear()} Átrio — Inteligência Integrada.
                </p>
            </div>
        </div>
    );
}
