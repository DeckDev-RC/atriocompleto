import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle } from 'lucide-react';
import { agentApi } from '../services/agentApi';
import { OptimizedImage } from '../components/OptimizedImage';
import logotipoAtrio from '../assets/logotipo-atrio.png';
import logotipoAtrioWebp from '../assets/logotipo-atrio.webp';

export function VerifyEmailPage() {
  const navigate = useNavigate();
  const [publicBranding, setPublicBranding] = useState<{
    partner_name: string | null;
    primary_color: string | null;
    login_logo_url: string | null;
  } | null>(null);

  useEffect(() => {
    let mounted = true;

    agentApi.getPublicSignupConfig().then((result) => {
      if (!mounted) return;
      setPublicBranding(result.success && result.data?.resolved_branding ? {
        partner_name: result.data.resolved_branding.partner_name,
        primary_color: result.data.resolved_branding.primary_color,
        login_logo_url: result.data.resolved_branding.login_logo_url,
      } : null);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!publicBranding?.primary_color) return;
    document.documentElement.style.setProperty('--color-brand-primary', publicBranding.primary_color);
  }, [publicBranding?.primary_color]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-body p-4">
      <div className="w-full max-w-[440px] animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="card-glass relative overflow-hidden p-8 text-center shadow-2xl">
          <div className="relative z-10 mb-6 flex justify-center">
            <OptimizedImage
              fallbackSrc={publicBranding?.login_logo_url || logotipoAtrio}
              webpSrc={publicBranding?.login_logo_url ? undefined : logotipoAtrioWebp}
              alt={publicBranding?.partner_name || 'Átrio'}
              className="h-12 w-auto object-contain"
              width={384}
              height={410}
              loading="eager"
              decoding="async"
            />
          </div>

          <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-brand-primary/10 blur-3xl" />
          <div className="absolute -bottom-20 -left-20 h-40 w-40 rounded-full bg-brand-primary/10 blur-3xl" />

          <div className="relative z-10 flex flex-col items-center gap-6 py-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-green-500/10 text-green-500">
              <CheckCircle size={40} strokeWidth={1.5} />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Tudo pronto</h1>
              <p className="text-muted leading-relaxed">
                A verificacao de email esta desabilitada nesta plataforma. Voce ja pode entrar normalmente.
              </p>
            </div>

            <button
              onClick={() => navigate('/login')}
              className="btn-primary mt-2 flex w-full items-center justify-center gap-2 py-3"
            >
              Ir para o login
              <ArrowRight size={18} />
            </button>
          </div>
        </div>

        <p className="mt-8 text-center text-[13px] text-muted-more">
          &copy; {new Date().getFullYear()} {publicBranding?.partner_name || 'Átrio'}.
        </p>
      </div>
    </div>
  );
}
