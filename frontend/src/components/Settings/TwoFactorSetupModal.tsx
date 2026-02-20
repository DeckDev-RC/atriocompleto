import { useState, useEffect } from 'react';
import { X, ShieldCheck, Loader2, AlertCircle, Copy, Check, Download, AlertTriangle } from 'lucide-react';
import { agentApi } from '../../services/agentApi';
import { useToast } from '../Toast';

interface TwoFactorSetupModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function TwoFactorSetupModal({ isOpen, onClose, onSuccess }: TwoFactorSetupModalProps) {
    const { showToast } = useToast();
    const [step, setStep] = useState<'loading' | 'qrcode' | 'recovery'>('loading');
    const [data, setData] = useState<{ qrCode: string; secret: string; recoveryCodes: string[] } | null>(null);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            loadSetupData();
        } else {
            setStep('loading');
            setData(null);
            setCode('');
            setError('');
        }
    }, [isOpen]);

    const loadSetupData = async () => {
        try {
            setStep('loading');
            const result = await agentApi.enable2FA();
            if (result.success && result.data) {
                setData(result.data);
                setStep('qrcode');
            } else {
                setError(result.error || 'Erro ao carregar configuração 2FA');
                showToast(result.error || 'Erro ao carregar configuração 2FA', 'error');
            }
        } catch (err) {
            setError('Erro de conexão');
        }
    };

    const handleVerifyToken = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length !== 6) return;

        setLoading(true);
        setError('');

        try {
            const result = await agentApi.verifyTOTP(code);
            if (result.success) {
                showToast('2FA Validado! Salve seus códigos de recuperação.', 'success');
                setStep('recovery');
            } else {
                setError(result.error || 'Código inválido. Tente novamente.');
            }
        } catch (err) {
            setError('Erro de conexão');
        } finally {
            setLoading(false);
        }
    };

    const copySecret = () => {
        if (!data?.secret) return;
        navigator.clipboard.writeText(data.secret);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}>
            <div
                className="w-full max-w-md bg-card rounded-2xl border border-border shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-5 border-b border-border">
                    <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary/10">
                            <ShieldCheck size={18} className="text-brand-primary" />
                        </div>
                        <h3 className="font-semibold text-primary">Configurar 2FA</h3>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted/50 hover:text-primary transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    {step === 'loading' ? (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 size={32} className="animate-spin text-brand-primary" />
                            <p className="text-sm text-muted">Gerando configuração segura...</p>
                        </div>
                    ) : step === 'qrcode' ? (
                        <div className="flex flex-col gap-6">
                            <div className="space-y-3">
                                <p className="text-sm text-muted text-center leading-relaxed">
                                    Escaneie o QR Code abaixo usando o <strong>Google Authenticator</strong> ou seu aplicativo de preferência.
                                </p>

                                <div className="flex justify-center p-6 bg-white/5 dark:bg-white/5 rounded-3xl border border-border mx-auto w-fit backdrop-blur-xl shadow-inner shadow-brand-primary/10">
                                    {data?.qrCode ? (
                                        <div className="relative group">
                                            <div className="absolute -inset-2 bg-brand-primary/20 blur-xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                            <img
                                                src={data.qrCode}
                                                alt="2FA QR Code"
                                                className="w-48 h-48 rounded-xl relative z-10 brightness-[1.1] contrast-[1.1]"
                                            />
                                        </div>
                                    ) : (
                                        <div className="w-48 h-48 flex items-center justify-center bg-muted/5">
                                            <Loader2 className="animate-spin text-muted/30" />
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-1.5">
                                    <label className="text-[11px] font-semibold text-muted uppercase tracking-wider">
                                        Ou insira o código manualmente
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 px-3 py-2 rounded-lg bg-muted/10 border border-border text-[13px] font-mono text-primary break-all">
                                            {data?.secret}
                                        </code>
                                        <button
                                            onClick={copySecret}
                                            className="p-2.5 rounded-lg border border-border hover:bg-muted/5 transition-colors"
                                            title="Copiar segredo"
                                        >
                                            {copied ? <Check size={16} className="text-success" /> : <Copy size={16} className="text-muted" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="h-px bg-border w-full" />

                            <form onSubmit={handleVerifyToken} className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-primary">
                                        Código de verificação
                                    </label>
                                    <p className="text-[12px] text-muted">
                                        Digite o código de 6 dígitos gerado pelo seu aplicativo para confirmar.
                                    </p>
                                    <input
                                        type="text"
                                        value={code}
                                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        placeholder="000 000"
                                        maxLength={6}
                                        required
                                        className="w-full h-14 rounded-2xl border-2 border-border bg-black/40 dark:bg-black/40 px-4 text-center text-2xl font-mono tracking-[0.2em] text-primary placeholder:text-muted/20 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10 transition-all outline-none backdrop-blur-md shadow-inner"
                                        autoFocus
                                    />
                                    {error && (
                                        <p className="text-[11px] text-danger mt-1.5 flex items-center gap-1">
                                            <AlertCircle size={12} />
                                            {error}
                                        </p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || code.length !== 6}
                                    className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-brand-primary text-white font-medium hover:opacity-90 transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {loading ? <Loader2 size={18} className="animate-spin" /> : <ShieldCheck size={18} />}
                                    {loading ? 'Verificando...' : 'Confirmar e Ativar'}
                                </button>
                            </form>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-6 animate-in slide-in-from-right-4 duration-300">
                            <div className="rounded-xl border border-warning/20 bg-warning/5 p-4 flex items-start gap-3">
                                <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-[13px] font-semibold text-warning-dark">Salve seus códigos de recuperação!</p>
                                    <p className="text-[12px] text-warning-dark/80 leading-relaxed">
                                        Se você perder o acesso ao seu celular, esses códigos serão a <strong>única forma</strong> de acessar sua conta. Guarde-os em um local seguro.
                                    </p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                {data?.recoveryCodes.map((code, idx) => (
                                    <div key={idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/10 border border-border font-mono text-[12px] text-primary transition-all hover:border-brand-primary/30">
                                        <span>{code}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="flex items-center gap-3 mt-2">
                                <button
                                    onClick={() => {
                                        const blob = new Blob([data?.recoveryCodes.join('\n') || ''], { type: 'text/plain' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = 'atrio-recovery-codes.txt';
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        showToast('Arquivo baixado!', 'success');
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-border text-[12.5px] font-medium text-primary hover:bg-muted/5 transition-all active:scale-95"
                                >
                                    <Download size={14} /> Baixar TXT
                                </button>
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(data?.recoveryCodes.join(' ') || '');
                                        showToast('Códigos copiados!', 'success');
                                    }}
                                    className="flex-1 flex items-center justify-center gap-2 h-10 rounded-xl border border-border text-[12.5px] font-medium text-primary hover:bg-muted/5 transition-all active:scale-95"
                                >
                                    <Copy size={14} /> Copiar todos
                                </button>
                            </div>

                            <button
                                onClick={() => {
                                    onSuccess();
                                    onClose();
                                }}
                                className="w-full flex items-center justify-center h-11 rounded-xl bg-brand-primary text-white font-medium hover:opacity-90 transition-all active:scale-[0.98]"
                            >
                                Já salvei, concluir ativação
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
