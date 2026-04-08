import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Gauge, Radar, ScanSearch, Sparkles, Workflow, type LucideIcon } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { agentApi } from '../services/agentApi';
import { OptimizedImage } from '../components/OptimizedImage';
import atrioLogo from '../assets/logo-atrio-branca.png';
import atrioLogoWebp from '../assets/logo-atrio-branca.webp';
import agregarLogo from '../assets/logo-whitemode.png';
import agregarLogoWebp from '../assets/logo-whitemode.webp';
import heroBackground from '../assets/loginpage-background.webp';
import magaluLogo from '../assets/channels/magalu.png';
import mercadoLivreLogo from '../assets/channels/mercado-livre.png';
import sheinLogo from '../assets/channels/shein.png';
import shopeeLogo from '../assets/channels/shopee.png';
import tiktokShopLogo from '../assets/channels/tiktok-shop.png';

type Channel = {
  accent: string;
  backgroundClassName?: string;
  logo: string;
  name: string;
};

type Panel = {
  body: string;
  eyebrow: string;
  icon: LucideIcon;
  metric: string;
  title: string;
};

type Step = {
  body: string;
  index: string;
  title: string;
};

type LiveChannelCard = {
  channel: Channel;
  metric: string;
  note: string;
};

type MovementItem = {
  body: string;
  icon: LucideIcon;
  title: string;
};

const channels: Channel[] = [
  { name: 'Shopee', logo: shopeeLogo, accent: 'rgba(238,77,45,0.24)' },
  { name: 'Mercado Livre', logo: mercadoLivreLogo, accent: 'rgba(255,214,10,0.18)', backgroundClassName: 'bg-[#0d1f38]' },
  { name: 'Shein', logo: sheinLogo, accent: 'rgba(255,255,255,0.14)' },
  { name: 'Magalu', logo: magaluLogo, accent: 'rgba(0,134,255,0.2)', backgroundClassName: 'bg-[#0e2345]' },
  { name: 'TikTok Shop', logo: tiktokShopLogo, accent: 'rgba(9,202,255,0.16)' },
];

const heroStats = [
  { value: '5', label: 'canais no mesmo plano' },
  { value: '72 min', label: 'entre leitura e resposta' },
  { value: '4', label: 'camadas operacionais cruzadas' },
];

const productPanels: Panel[] = [
  {
    eyebrow: 'Leitura operacional',
    title: 'O Átrio mostra o que saiu do ritmo antes da discussão começar.',
    body: 'Ele abre o problema pela variação que importa, não pela quantidade de widgets na tela.',
    metric: 'campanha > margem',
    icon: Radar,
  },
  {
    eyebrow: 'Contexto conectado',
    title: 'O Átrio cruza canal, rentabilidade, estoque e comportamento na mesma superfície.',
    body: 'A mesa deixa de comparar prints soltos e passa a discutir uma leitura única.',
    metric: 'canal + campanha + margem + estoque',
    icon: ScanSearch,
  },
  {
    eyebrow: 'Movimento coordenado',
    title: 'O Átrio devolve clareza para growth, comercial e operação responderem juntos.',
    body: 'A saída deixa de ser diagnóstico bonito. Vira priorização, decisão e ajuste de rota.',
    metric: '72 min até ação',
    icon: Workflow,
  },
];

const steps: Step[] = [
  {
    index: '01',
    title: 'O Átrio lê o desvio antes de ele virar ruído institucional.',
    body: 'Margem, mídia, ruptura e canal entram na mesma abertura operacional para o time enxergar cedo.',
  },
  {
    index: '02',
    title: 'O Átrio contextualiza a mudança sem obrigar a mesa a montar o quebra-cabeça.',
    body: 'O problema já chega com relações entre campanha, rentabilidade, estoque e canal.',
  },
  {
    index: '03',
    title: 'O Átrio empurra a decisão para frente com clareza de próximo passo.',
    body: 'Growth, comercial e operação passam a agir sobre a mesma leitura e na mesma janela.',
  },
];

const liveChannelCards: LiveChannelCard[] = [
  { channel: channels[0], metric: '+3,8 p.p.', note: 'Margem comprimida por mídia acima do retorno.' },
  { channel: channels[1], metric: '+18%', note: 'Campanha puxando volume sem sustentar rentabilidade.' },
  { channel: channels[4], metric: '72 min', note: 'Resposta já disparada para growth e operação.' },
];

const movementItems: MovementItem[] = [
  { icon: Gauge, title: 'Leitura', body: 'O Átrio abre o problema pela variação que merece atenção.' },
  { icon: ScanSearch, title: 'Contexto', body: 'A relação entre campanha, margem e canal já vem conectada.' },
  { icon: Workflow, title: 'Movimento', body: 'Growth, comercial e operação entram na mesma resposta.' },
];

const landingDelay = (delay: string): CSSProperties => ({ '--landing-delay': delay } as CSSProperties);

function ChannelBadge({ channel }: { channel: Channel }) {
  return (
    <div className="landing-chip flex items-center gap-3 rounded-full border border-white/10 px-3 py-2">
      <span
        className={[
          'flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.92] p-1.5',
          channel.backgroundClassName ?? '',
        ].join(' ')}
        style={{ boxShadow: `0 0 0 1px ${channel.accent} inset` }}
      >
        <img src={channel.logo} alt={channel.name} className="h-full w-full object-contain" width={32} height={32} loading="lazy" decoding="async" />
      </span>
      <span className="text-sm font-medium text-white/[0.82]">{channel.name}</span>
    </div>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const [checkedHostBranding, setCheckedHostBranding] = useState(false);

  useEffect(() => {
    let mounted = true;

    agentApi.getPublicSignupConfig().then((result) => {
      if (!mounted) return;

      if (result.success && result.data?.resolved_branding?.is_whitelabel) {
        navigate('/login', { replace: true });
        return;
      }

      setCheckedHostBranding(true);
    }).catch(() => {
      if (mounted) setCheckedHostBranding(true);
    });

    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (!checkedHostBranding) {
    return null;
  }
  const scrollToRitmo = () => {
    document.getElementById('ritmo')?.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="landing-shell overflow-x-clip text-white">
      <section className="landing-hero relative isolate min-h-[100svh] overflow-hidden">
        <div className="landing-hero-backdrop absolute inset-0">
          <OptimizedImage
            fallbackSrc={heroBackground}
            alt=""
            className="h-full w-full object-cover"
            width={6000}
            height={4000}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            aria-hidden="true"
          />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle at 50% 0%, rgba(9,202,255,0.16) 0%, rgba(9,202,255,0.08) 14%, transparent 36%), radial-gradient(circle at 12% 24%, rgba(9,202,255,0.1) 0%, transparent 24%), linear-gradient(180deg, rgba(2,6,18,0.24) 0%, rgba(2,6,18,0.8) 48%, rgba(2,6,18,0.98) 100%)',
            }}
          />
        </div>
        <div className="landing-grid absolute inset-0 opacity-22" />

        <header className="absolute inset-x-0 top-0 z-30">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-6 md:px-8 md:py-8">
            <Link to="/" className="landing-rise flex items-center">
              <OptimizedImage
                fallbackSrc={atrioLogo}
                webpSrc={atrioLogoWebp}
                alt="Átrio"
                className="h-11 w-auto object-contain md:h-12"
                width={720}
                height={432}
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
            </Link>
            <div className="landing-rise flex items-center gap-3" style={landingDelay('0.12s')}>
              <Link to="/login" className="landing-chip inline-flex min-h-11 items-center justify-center rounded-full border border-white/[0.12] px-5 text-sm font-medium text-white hover:border-white/[0.22]">
                Entrar
              </Link>
              <Link to="/solicitar-acesso" className="inline-flex min-h-11 items-center justify-center rounded-full bg-brand-primary px-5 text-sm font-semibold text-[#04101b] shadow-[0_10px_22px_rgba(9,202,255,0.18)]">
                Solicitar acesso
              </Link>
            </div>
          </div>
        </header>

        <div className="relative z-20 mx-auto max-w-7xl px-6 pb-16 pt-28 md:px-8 md:pt-32">
          <div className="mx-auto max-w-5xl text-center">
            <p className="landing-rise text-[11px] uppercase tracking-[0.34em] text-brand-primary md:text-xs" style={landingDelay('0.06s')}>
              Inteligência integrada para operação multicanal
            </p>
            <h1 className="landing-rise mt-6 text-[clamp(3.3rem,8vw,6.4rem)] font-semibold leading-[0.84] tracking-[-0.07em] text-white" style={landingDelay('0.14s')}>
              O Átrio organiza a operação antes do ruído virar crise.
            </h1>
            <p className="landing-rise mx-auto mt-7 max-w-3xl text-[1.05rem] leading-8 text-white/[0.7] md:text-[1.1rem]" style={landingDelay('0.22s')}>
              Menos painel para admirar. Mais leitura para decidir. O Átrio cruza margem, campanha, estoque e canal para devolver foco, contexto e próximo movimento.
            </p>
            <div className="landing-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row" style={landingDelay('0.3s')}>
              <Link to="/solicitar-acesso" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-brand-primary px-6 text-sm font-semibold text-[#04101b] shadow-[0_10px_24px_rgba(9,202,255,0.18)]">
                Conhecer o Átrio
                <ArrowRight size={16} />
              </Link>
              <button type="button" onClick={scrollToRitmo} className="landing-chip inline-flex min-h-13 items-center justify-center gap-2 rounded-full border border-white/[0.12] px-6 text-sm font-medium text-white hover:border-white/[0.22]">
                Ver o fluxo
              </button>
            </div>
          </div>

          <div className="landing-rise mt-12 grid gap-3 sm:grid-cols-3" style={landingDelay('0.38s')}>
            {heroStats.map((item) => (
              <div key={item.label} className="landing-surface rounded-[1.4rem] border border-white/[0.1] px-4 py-4 text-center">
                <p className="text-[1.15rem] font-semibold tracking-[-0.04em] text-white">{item.value}</p>
                <p className="mt-2 text-[11px] uppercase leading-5 tracking-[0.24em] text-white/[0.42]">{item.label}</p>
              </div>
            ))}
          </div>

          <div className="landing-rise mt-10 overflow-hidden rounded-[2.3rem] border border-white/[0.12] shadow-[0_22px_64px_rgba(0,0,0,0.28)]" style={landingDelay('0.46s')}>
            <div className="landing-surface border-b border-white/10 px-5 py-4 md:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-brand-primary/[0.78]">Sala operacional</p>
                  <p className="mt-2 text-lg font-semibold tracking-[-0.03em] text-white">O Átrio lê primeiro. O time responde depois.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {channels.slice(0, 3).map((channel) => (
                    <ChannelBadge key={channel.name} channel={channel} />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-px bg-white/10 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.9fr)_minmax(0,0.9fr)]">
              <div className="bg-[#08111d]/88 p-5 md:p-6">
                <div className="flex items-center gap-3 text-brand-primary">
                  <Radar size={16} />
                  <p className="text-[10px] uppercase tracking-[0.3em] text-white/[0.42]">Leitura principal</p>
                </div>
                <h2 className="mt-4 max-w-[24rem] text-[1.6rem] font-semibold leading-[1.08] tracking-[-0.05em] text-white">
                  Campanha acima do ritmo puxou a margem para baixo em Mercado Livre.
                </h2>
                <p className="mt-4 max-w-[26rem] text-sm leading-7 text-white/[0.62]">
                  O Átrio já conectou mídia, rentabilidade, ruptura e canal na mesma abertura operacional.
                </p>
                <div className="mt-6 space-y-4">
                  {[
                    ['campanha acima do ritmo', '+18%', 'w-[84%] bg-brand-primary shadow-[0_0_18px_rgba(9,202,255,0.34)]'],
                    ['margem pressionada', '-3,8 p.p.', 'w-[62%] bg-[#ff9e85]'],
                    ['estoque desalinhado', '41 SKU', 'w-[48%] bg-white/[0.36]'],
                  ].map(([label, value, bar]) => (
                    <div key={label} className="landing-card rounded-[1.05rem] border border-white/[0.08] px-3.5 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-white/[0.76]">{label}</p>
                        <span className="text-[11px] uppercase tracking-[0.22em] text-white/[0.38]">{value}</span>
                      </div>
                      <div className="mt-3 h-2 rounded-full bg-white/[0.06]">
                        <span className={['block h-full rounded-full', bar].join(' ')} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#07111b]/82 p-5 md:p-6">
                <p className="text-[10px] uppercase tracking-[0.28em] text-white/[0.4]">Canais na mesma leitura</p>
                <div className="mt-4 space-y-3">
                  {liveChannelCards.map(({ channel, metric, note }) => (
                    <div key={channel.name} className="landing-card rounded-[1.12rem] border border-white/[0.08] px-3 py-3">
                      <div className="flex items-start gap-3">
                        <span className={[
                          'mt-0.5 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.92] p-1.5',
                          channel.backgroundClassName ?? '',
                        ].join(' ')} style={{ boxShadow: `0 0 0 1px ${channel.accent} inset` }}>
                          <img src={channel.logo} alt={channel.name} className="h-full w-full object-contain" width={32} height={32} loading="lazy" decoding="async" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-white">{channel.name}</p>
                            <span className="text-xs font-semibold text-brand-primary">{metric}</span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-white/[0.48]">{note}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#07111b]/74 p-5 md:p-6">
                <p className="text-[10px] uppercase tracking-[0.28em] text-white/[0.4]">Próximo movimento</p>
                <div className="mt-4 space-y-3">
                  {movementItems.map(({ body, icon: Icon, title }) => (
                    <div key={title} className="landing-card rounded-[1.12rem] border border-white/[0.08] p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-brand-primary/[0.18] bg-brand-primary/10 text-brand-primary">
                          <Icon size={16} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{title}</p>
                          <p className="mt-2 text-sm leading-6 text-white/[0.6]">{body}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-5 md:px-8">
          <div className="landing-surface overflow-hidden rounded-full border border-white/10">
            <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-3">
              {channels.map((channel, index) => (
                <div key={`${channel.name}-${index}`} className="landing-chip flex items-center gap-3 rounded-full border border-white/10 px-4 py-2.5 text-sm text-white/[0.72]">
                  <span className={['flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.92] p-1.5', channel.backgroundClassName ?? ''].join(' ')} style={{ boxShadow: `0 0 0 1px ${channel.accent} inset` }}>
                    <img src={channel.logo} alt={channel.name} className="h-full w-full object-contain" width={32} height={32} loading="lazy" decoding="async" />
                  </span>
                  <span className="whitespace-nowrap font-medium">{channel.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="ritmo" className="landing-section scroll-mt-24 border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-16">
            <div className="landing-rise lg:sticky lg:top-28 lg:self-start" style={landingDelay('0.06s')}>
              <p className="text-[11px] uppercase tracking-[0.32em] text-brand-primary/90">Ritmo operacional</p>
              <h2 className="mt-5 max-w-md text-[clamp(2.2rem,5vw,4.3rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-white">
                O Átrio organiza leitura, contexto e resposta numa mesma mesa.
              </h2>
              <p className="mt-6 max-w-lg text-base leading-7 text-white/[0.62]">
                A estrutura deixa de ser uma landing de módulos para virar uma apresentação editorial do produto e do impacto operacional que ele entrega.
              </p>
            </div>

            <div className="space-y-5">
              {productPanels.map(({ body, eyebrow, icon: Icon, metric, title }, index) => (
                <div key={title} className="landing-rise landing-card rounded-[1.85rem] border border-white/[0.1] p-5 md:p-6" style={landingDelay(`${0.14 + index * 0.1}s`)}>
                  <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-brand-primary/[0.18] bg-brand-primary/10 text-brand-primary">
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.28em] text-brand-primary/[0.82]">{eyebrow}</p>
                        <h3 className="mt-3 max-w-2xl text-[1.5rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white">{title}</h3>
                        <p className="mt-4 max-w-2xl text-base leading-7 text-white/[0.64]">{body}</p>
                      </div>
                    </div>
                    <div className="landing-card rounded-[1.18rem] border border-white/10 px-4 py-3 md:min-w-[13rem]">
                      <p className="text-[10px] uppercase tracking-[0.24em] text-white/[0.4]">sinal dominante</p>
                      <p className="mt-2 text-sm font-semibold text-white">{metric}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section border-t border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-24 md:px-8 md:py-32">
          <div className="landing-rise mb-14" style={landingDelay('0.06s')}>
            <p className="text-[11px] uppercase tracking-[0.32em] text-brand-primary/90">Sequência operacional</p>
            <h2 className="mt-5 max-w-3xl text-[clamp(2.15rem,5vw,4rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-white">
              O Átrio encurta a distância entre perceber, entender e agir.
            </h2>
          </div>
          <div className="grid gap-8 lg:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.index} className="landing-rise landing-card rounded-[1.85rem] border border-white/[0.1] p-6" style={landingDelay(`${0.14 + index * 0.08}s`)}>
                <div className="landing-chip flex h-14 w-14 items-center justify-center rounded-full border border-white/[0.12] text-lg font-semibold tracking-[0.18em] text-brand-primary">
                  {step.index}
                </div>
                <h3 className="mt-6 text-[1.45rem] font-semibold leading-[1.08] tracking-[-0.04em] text-white">{step.title}</h3>
                <p className="mt-5 text-base leading-7 text-white/[0.64]">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section px-6 pb-16 pt-4 md:px-8 md:pb-20">
        <div className="landing-cta-shell mx-auto max-w-7xl overflow-hidden rounded-[2.35rem] border border-white/10">
          <div className="grid gap-10 px-6 py-8 md:px-10 md:py-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-center">
            <div className="landing-rise" style={landingDelay('0.06s')}>
              <p className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.32em] text-brand-primary/[0.92]">
                <Sparkles size={14} />
                Próximo passo
              </p>
              <h2 className="mt-5 max-w-3xl text-[clamp(2rem,5vw,3.9rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-white">
                Coloque o Átrio no centro da operação.
              </h2>
              <p className="mt-6 max-w-2xl text-base leading-7 text-white/[0.66] md:text-lg">
                Solicite acesso para mostrar o fluxo ao seu time ou entre agora se vocês já operam com a plataforma.
              </p>
            </div>
            <div className="landing-rise flex flex-col gap-3 lg:justify-self-end" style={landingDelay('0.16s')}>
              <Link to="/solicitar-acesso" className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-brand-primary px-6 text-sm font-semibold text-[#04101b] shadow-[0_10px_24px_rgba(9,202,255,0.18)]">
                Solicitar acesso
                <ArrowRight size={16} />
              </Link>
              <Link to="/login" className="landing-chip inline-flex min-h-13 items-center justify-center rounded-full border border-white/[0.12] px-6 text-sm font-medium text-white hover:border-white/[0.22]">
                Entrar na plataforma
              </Link>
            </div>
          </div>

          <div className="border-t border-white/10 px-6 py-4 md:px-10">
            <div className="flex flex-col gap-5 text-sm text-white/[0.62] md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-4">
                <OptimizedImage
                  fallbackSrc={agregarLogo}
                  webpSrc={agregarLogoWebp}
                  alt="Agregar Negócios"
                  className="h-6 w-auto object-contain brightness-0 invert"
                  width={960}
                  height={260}
                  loading="lazy"
                  decoding="async"
                />
                <p>Produto para leitura operacional, contexto e decisão.</p>
              </div>
              <p className="md:text-right">Growth, comercial e operação no mesmo plano.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
