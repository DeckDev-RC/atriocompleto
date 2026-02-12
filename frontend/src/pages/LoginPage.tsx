import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff } from 'lucide-react';
import logoLight from '../assets/logo-whitemode.png';
// import logoDark from '../assets/logo-darkmode.png';
import logotipoAtrio from '../assets/logotipo-atrio.png';
import loginBackground from '../assets/loginpage-background.jpg';

const MERGE_ANIMATION_MS = 2000;

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isMerging, setIsMerging] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsMerging(true);

    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const result = await Promise.all([login(email, password), delay(MERGE_ANIMATION_MS)]).then(
      ([loginResult]) => loginResult as { success: boolean; error?: string }
    );

    setIsMerging(false);
    if (!result.success) {
      setError(result.error || 'Erro ao fazer login');
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
        {/* Main Card - Divided Layout */}
        <div
          className={`login-card rounded-3xl bg-white shadow-2xl overflow-hidden border-3 border-white ${isMerging ? 'login-card--merging' : ''}`}
        >
          <div
            className={`login-card-inner min-h-[600px] ${isMerging ? 'login-card--merging' : ''}`}
          >
            {/* Left Section - Promotional (caixa azul) */}
            <div
              className="login-panel-left relative px-6 pt-8 pb-4 md:px-12 md:pt-12 flex flex-col justify-between rounded-l-3xl md:rounded-r-3xl shrink-0"
              style={{ overflow: 'hidden' }}
            >
              {/* Fundo gradiente + bolhas animadas */}
              <div className="absolute inset-0" style={{ zIndex: 0, overflow: 'hidden' }}>
                {/* Gradiente base suave */}
                <div 
                  className="absolute inset-0"
                  style={{
                    background: 'radial-gradient(circle at 0% 0%, #09CAFF22 0%, transparent 55%), radial-gradient(circle at 100% 100%, #0404A633 0%, transparent 60%), linear-gradient(145deg, #040410 0%, #040438 35%, #040471 70%, #040410 100%)',
                    backgroundSize: '140% 140%',
                    animation: 'gradientShift 22s ease-in-out infinite',
                    WebkitAnimation: 'gradientShift 22s ease-in-out infinite',
                  }}
                />

                {/* Camada de bolhas */}
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
              
              {/* Overlay escuro para melhor legibilidade */}
              <div className="absolute inset-0 bg-black/5 z-10" />
              
              {/* Ícone Átrio no canto superior esquerdo — responsivo: mais próximo da borda no celular, mais folga no desktop */}
              <div className="absolute top-4 left-4 md:top-6 md:left-8 z-20">
                <img
                  src={logotipoAtrio}
                  alt="Átrio"
                  className="h-15 w-auto object-contain brightness-0 invert"
                />
              </div>
              
              {/* <div className="relative z-10 mt-auto mb-auto pt-74">
                <h1 className="text-3xl font-bold text-white mb-6 leading-tight">
                  Gerencie suas vendas de forma inteligente
                </h1>
              </div> */}

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

            {/* Right Section - Login Form (caixa branca) */}
            <div className="login-panel-right px-6 pt-10 pb-8 md:px-12 md:pt-16 md:pb-12 flex flex-col bg-white shrink-0 min-w-0">
              <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
                <div className="mb-6 md:mb-8">
                  <h2 className="text-2xl md:text-4xl font-bold text-[#0a0b0f] mb-2">
                    Entrar
                  </h2>
                  <p className="text-[#545869]">
                    Bem-vindo de volta. Por favor, insira suas credenciais
                  </p>
                </div>

                {error && (
                  <div
                    className="mb-6 rounded-xl border border-danger/20 bg-danger/5 px-4 py-3 text-[13px] text-danger"
                    style={{ animation: 'slide-up 0.2s ease-out' }}
                  >
                    {error}
                  </div>
                )}

                {/* Email */}
                <div className="mb-5">
                  <label className="mb-2 block text-sm font-medium text-[#0a0b0f]">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                    autoFocus
                    className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#0a0b0f] placeholder:text-gray-400 outline-none transition-all duration-300 focus:border-accent focus:ring-2 focus:ring-accent/20"
                  />
                </div>

                {/* Password */}
                <div className="mb-6">
                  <label className="mb-2 block text-sm font-medium text-[#0a0b0f]">
                    Senha
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 pr-12 text-sm text-[#0a0b0f] placeholder:text-gray-400 outline-none transition-all duration-300 focus:border-accent focus:ring-2 focus:ring-accent/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-[#0a0b0f] transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={isMerging}
                  className={`flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-semibold text-white transition-all duration-300 ${isMerging
                    ? 'bg-[#0404a6] cursor-wait'
                    : 'bg-[#0404a6] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]'
                    }`}
                >
                  {isMerging ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              {/* Footer */}
              <div className="mt-8 text-center">
                <p className="text-xs text-gray-500">
                  © {new Date().getFullYear()} Agregar Negócios
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
