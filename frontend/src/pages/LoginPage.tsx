import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck, Send, Loader2, CheckCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { agentApi } from '../services/agentApi';
import logoLight from '../assets/logo-whitemode.png';
import logotipoAtrio from '../assets/logotipo-atrio.png';
import loginBackground from '../assets/loginpage-background.jpg';

const MERGE_ANIMATION_MS = 800;

type LoginStep = 'credentials' | 'two_factor';

export function LoginPage() {
  const { login, verify2FA } = useAuth();

  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [challengeEmail, setChallengeEmail] = useState('');
  const [isTotp, setIsTotp] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [resendStatus, setResendStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [resendMessage, setResendMessage] = useState('');

  const isUnverified = error.includes('verifique seu email');
  const isRateLimited = error.includes('Muitas requisições') || error.includes('Muitas tentativas');
  const isBlocked = error.includes('bloqueado');

  const handleCredentialsSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const result = await Promise.all([login(email, password), delay(MERGE_ANIMATION_MS)]).then(
      ([authResult]) => authResult,
    );

    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Erro ao fazer login');
      return;
    }

    if (result.requires2FA) {
      setChallengeId(result.challengeId);
      setChallengeEmail(result.email);
      setIsTotp(result.is_totp || false);
      setStep('two_factor');
      setCode('');
      return;
    }
  };

  const handleTwoFactorSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const result = await verify2FA(challengeId, code);
    setIsSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Código inválido');
    }
  };

  const handleResendVerification = async () => {
    if (!email) {
      setError('Informe seu email para reenviar o link de verificação.');
      return;
    }

    setResendStatus('loading');
    // We don't clear the error here to keep the button visible while loading

    try {
      const result = await agentApi.resendVerification(email);
      if (result.success) {
        setResendStatus('success');
        setResendMessage(result.data?.message || 'Link de verificação reenviado! Verifique sua caixa de entrada.');
        setError(''); // Clear the error only after success
      } else {
        setResendStatus('error');
        setError(result.error || 'Erro ao reenviar link.');
      }
    } catch (err) {
      setResendStatus('error');
      setError('Erro ao processar solicitação.');
    } finally {
      // Keep success state for a bit longer so user can see it
      setTimeout(() => {
        if (resendStatus === 'success') {
          setResendStatus('idle');
          setResendMessage('');
        }
      }, 8000);
    }
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden px-5 py-8"
      style={{
        backgroundImage: `url(${loginBackground})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed',
      }}
    >
      <div
        className="w-full max-w-4xl mx-auto flex justify-center"
        style={{ animation: 'fade-in 0.5s cubic-bezier(0.16,1,0.3,1) both' }}
      >
        <div className="login-card rounded-3xl bg-card border-2 border-border/50 shadow-2xl overflow-hidden backdrop-blur-xl">
          <div className="login-card-inner min-h-[600px]">
            <div
              className="login-panel-left relative px-6 pt-8 pb-4 md:px-12 md:pt-12 flex flex-col justify-between rounded-l-3xl md:rounded-r-3xl shrink-0"
              style={{ overflow: 'hidden' }}
            >
              <div className="absolute inset-0" style={{ zIndex: 0, overflow: 'hidden' }}>
                <div
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(circle at 0% 0%, #09CAFF22 0%, transparent 55%), radial-gradient(circle at 100% 100%, #0404A633 0%, transparent 60%), linear-gradient(145deg, #040410 0%, #040438 35%, #040471 70%, #040410 100%)',
                    backgroundSize: '140% 140%',
                    animation: 'gradientShift 22s ease-in-out infinite',
                    WebkitAnimation: 'gradientShift 22s ease-in-out infinite',
                  }}
                />
                <div className="login-bubbles">
                  <div className="login-bubble login-bubble-1" />
                  <div className="login-bubble login-bubble-2" />
                  <div className="login-bubble login-bubble-3" />
                  <div className="login-bubble login-bubble-4" />
                  <div className="login-bubble login-bubble-5" />
                  <div className="login-bubble login-bubble-6" />
                  <div className="login-bubble login-bubble-7" />
                  <div className="login-bubble login-bubble-8" />
                </div>
              </div>

              <div className="absolute inset-0 bg-black/5 z-10" />

              <div className="absolute top-4 left-4 md:top-6 md:left-8 z-20">
                <img
                  src={logotipoAtrio}
                  alt="Átrio"
                  className="h-15 w-auto object-contain brightness-0 invert"
                />
              </div>

              <div className="relative z-10 mt-auto">
                <div className="flex items-center gap-2 text-white text-sm mb-6">
                  <div className="h-px flex-1 bg-white/20" />
                  <span>Plataforma de Gestão Inteligente</span>
                  <div className="h-px flex-1 bg-white/20" />
                </div>
                <div className="flex justify-center">
                  <img
                    src={logoLight}
                    alt="Agregar Negócios"
                    className="h-5.5 w-auto object-contain brightness-0 invert"
                  />
                </div>
              </div>
            </div>

            <div className="login-panel-right px-6 pt-10 pb-8 md:px-12 md:pt-16 md:pb-12 flex flex-col bg-card shrink-0 min-w-0 border-l border-border/20">
              {step === 'credentials' ? (
                <form onSubmit={handleCredentialsSubmit} className="w-full max-w-md mx-auto">
                  <div className="mb-6 md:mb-8">
                    <h2 className="text-2xl md:text-3xl font-bold text-primary mb-2">Entrar</h2>
                    <p className="text-secondary text-[14px] leading-relaxed">
                      Faça login com email e senha. Em seguida enviaremos um código no seu email.
                    </p>
                  </div>

                  {error && (
                    <div className={`mb-6 rounded-xl border px-4 py-3 text-[13px] animate-in fade-in slide-in-from-top-2 ${isRateLimited || isBlocked
                        ? 'border-orange-500/20 bg-orange-500/5 text-orange-700'
                        : 'border-danger/20 bg-danger/5 text-danger'
                      }`}>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-start gap-2">
                          {(isRateLimited || isBlocked) && <ShieldCheck size={16} className="shrink-0 mt-0.5" />}
                          <span>
                            {isUnverified
                              ? "Sua conta ainda não foi verificada. Enviamos um link para o seu e-mail quando sua conta foi criada. Não encontrou?"
                              : error}
                          </span>
                        </div>
                        {isUnverified && (
                          <button
                            type="button"
                            disabled={resendStatus === 'loading'}
                            onClick={handleResendVerification}
                            className="flex items-center gap-1.5 font-semibold text-[#0404a6] hover:underline disabled:opacity-50"
                          >
                            {resendStatus === 'loading' ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Enviando...
                              </>
                            ) : (
                              <>
                                <Send size={14} />
                                Enviar link de verificação
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {resendStatus === 'success' && (
                    <div className="mb-6 rounded-xl border border-green-500/20 bg-green-500/5 px-4 py-3 text-[13px] text-green-600 animate-in fade-in slide-in-from-top-2 flex items-center gap-3">
                      <div className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-green-500/10">
                        <CheckCircle size={14} className="text-green-600" />
                      </div>
                      <span>{resendMessage}</span>
                    </div>
                  )}

                  <div className="mb-5">
                    <label className="mb-2 block text-[13px] font-medium text-primary">Email</label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seu@email.com"
                      required
                      autoFocus
                      className="w-full h-12 rounded-2xl border border-border bg-black/5 dark:bg-white/5 px-4 text-[14px] text-primary placeholder:text-muted/40 outline-none transition-all duration-300 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
                    />
                  </div>

                  <div className="mb-4">
                    <label className="mb-2 block text-[13px] font-medium text-primary">Senha</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        className="w-full h-12 rounded-2xl border border-border bg-black/5 dark:bg-white/5 px-4 pr-12 text-[14px] text-primary placeholder:text-muted/40 outline-none transition-all duration-300 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-[#0a0b0f] transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="mb-6 flex items-center justify-between text-[13px]">
                    <Link to="/esqueci-senha" className="text-brand-primary font-medium hover:underline">
                      Esqueci minha senha
                    </Link>
                    <Link to="/solicitar-acesso" className="text-brand-primary font-medium hover:underline">
                      Quero ter uma conta
                    </Link>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`flex w-full items-center justify-center gap-2.5 rounded-2xl py-3.5 text-sm font-semibold text-white transition-all duration-300 ${isSubmitting
                      ? 'bg-brand-primary/50 cursor-wait'
                      : 'bg-brand-primary shadow-lg shadow-brand-primary/20 hover:shadow-brand-primary/40 hover:-translate-y-0.5 active:scale-[0.98]'
                      }`}
                  >
                    {isSubmitting ? 'Validando...' : 'Entrar'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleTwoFactorSubmit} className="w-full max-w-md mx-auto">
                  <div className="mb-6 md:mb-8">
                    <h2 className="text-2xl md:text-3xl font-bold text-primary mb-2">Verificação 2FA</h2>
                    <p className="text-secondary text-[14px] leading-relaxed">
                      {isTotp
                        ? "Digite o código de 6 dígitos do seu app ou um código de recuperação de 8 dígitos."
                        : <>Enviamos um código de 6 dígitos para <strong>{challengeEmail || email}</strong>.</>
                      }
                    </p>
                  </div>

                  {error && (
                    <div className="mb-6 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger">
                      {error}
                    </div>
                  )}

                  <div className="mb-6">
                    <label className="mb-2 block text-[13px] font-medium text-primary">Código</label>
                    <input
                      type="text"
                      value={code}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
                        setCode(val.slice(0, 8));
                      }}
                      placeholder={isTotp ? "000000 ou Código de Recuperação" : "000000"}
                      required
                      autoFocus
                      className="w-full h-12 rounded-2xl border border-border bg-black/5 dark:bg-white/5 px-4 text-[15px] tracking-[0.2em] text-center text-primary placeholder:tracking-normal placeholder:text-muted/40 outline-none transition-all duration-300 focus:border-brand-primary focus:ring-4 focus:ring-brand-primary/10"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting || (code.length !== 6 && code.length !== 8)}
                    className={`flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-semibold text-white transition-all duration-300 ${isSubmitting
                      ? 'bg-[#0404a6] cursor-wait'
                      : 'bg-[#0404a6] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]'
                      }`}
                  >
                    <ShieldCheck size={16} />
                    {isSubmitting ? 'Verificando...' : 'Verificar e entrar'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setStep('credentials');
                      setCode('');
                      setChallengeId('');
                      setError('');
                    }}
                    className="mt-3 w-full rounded-xl border border-gray-200 py-3 text-sm font-medium text-[#0a0b0f] hover:bg-gray-50 transition-colors"
                  >
                    Voltar e reenviar código
                  </button>
                </form>
              )}

              <div className="mt-8 text-center">
                <p className="text-xs text-gray-500">© {new Date().getFullYear()} Agregar Negócios</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
