import { useState, type FormEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import logoLight from '../assets/logo-whitemode.png';
// import logoDark from '../assets/logo-darkmode.png';
import logotipoAtrio from '../assets/logotipo-atrio.png';
import loginBackground from '../assets/loginpage-background.jpg';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);
    if (!result.success) {
      setError(result.error || 'Erro ao fazer login');
    }
    setLoading(false);
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

      <div className="w-full max-w-4xl mx-auto" style={{ animation: 'fade-in 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        {/* Main Card - Divided Layout */}
        <div className="rounded-3xl bg-white shadow-2xl overflow-hidden border-3 border-white">
          <div className="grid md:grid-cols-[45%_55%] min-h-[600px]">
            {/* Left Section - Promotional */}
            <div 
              className="relative px-12 pt-12 pb-4 flex flex-col justify-between rounded-l-3xl md:rounded-r-3xl"
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
              <div className="absolute inset-0 bg-black/5 z-[10]" />
              
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

            {/* Right Section - Login Form */}
            <div className="px-12 pt-16 pb-12 flex flex-col bg-white">
              <form onSubmit={handleSubmit} className="w-full max-w-md mx-auto">
                <div className="mb-8">
                  <h2 className="text-4xl font-bold text-[#0a0b0f] mb-2">
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
                  disabled={loading}
                  className={`flex w-full items-center justify-center gap-2.5 rounded-xl py-3.5 text-sm font-semibold text-white transition-all duration-300 ${loading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-[#0404a6] shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98]'
                    }`}
                >
                  {loading && <Loader2 size={17} style={{ animation: 'spin 1s linear infinite' }} />}
                  {loading ? 'Entrando...' : 'Entrar'}
                </button>
              </form>

              {/* Divider */}
              <div className="mt-6 mb-6 flex items-center gap-4">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-sm text-gray-500">Ou continue com</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* Google Login Button */}
              <button
                type="button"
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-sm font-medium text-[#0a0b0f] transition-all duration-300 hover:bg-gray-50 hover:shadow-md active:scale-[0.98]"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>Continuar com Google</span>
              </button>

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
