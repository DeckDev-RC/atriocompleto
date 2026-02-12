import { User, Shield, Palette, Hash, RotateCcw } from 'lucide-react';
import { Header } from '../components/Header';
import { ProfileSection } from '../components/Settings/ProfileSection';
import { SecuritySection } from '../components/Settings/SecuritySection';
import { AppearanceSection } from '../components/Settings/AppearanceSection';
import { FormattingSection } from '../components/Settings/FormattingSection';
import { usePreferences } from '../contexts/UserPreferencesContext';
import { useToast } from '../components/Toast';

interface SettingsCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}

function SettingsCard({ icon: Icon, title, description, children }: SettingsCardProps) {
  return (
    <section className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 transition-all duration-300">
      <div className="flex items-center gap-3 mb-5">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)' }}
        >
          <Icon
            size={18}
            strokeWidth={2}
            style={{ color: 'var(--color-brand-primary)' }}
          />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-primary">{title}</h3>
          <p className="text-[12px] text-muted">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export function SettingsPage() {
  const { resetToDefaults } = usePreferences();
  const { showToast } = useToast();

  const handleReset = async () => {
    await resetToDefaults();
    showToast('Preferências restauradas ao padrão', 'success');
  };

  return (
    <div className="p-7 max-md:p-5 max-sm:p-4">
      <Header
        title="Configurações"
        subtitle="Personalize sua experiência no sistema"
      />

      <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full pb-8" style={{ animation: 'fade-in 0.5s cubic-bezier(0.16,1,0.3,1) both' }}>
        {/* Perfil */}
        <SettingsCard
          icon={User}
          title="Perfil"
          description="Gerencie sua foto e informações pessoais"
        >
          <ProfileSection />
        </SettingsCard>

        {/* Segurança */}
        <SettingsCard
          icon={Shield}
          title="Segurança"
          description="Altere sua senha de acesso"
        >
          <SecuritySection />
        </SettingsCard>

        {/* Aparência */}
        <SettingsCard
          icon={Palette}
          title="Aparência"
          description="Customize cores, tema e fonte do sistema"
        >
          <AppearanceSection />
        </SettingsCard>

        {/* Formatação */}
        <SettingsCard
          icon={Hash}
          title="Formatação numérica"
          description="Configure como números, moedas e percentuais são exibidos"
        >
          <FormattingSection />
        </SettingsCard>

        {/* Restaurar padrões */}
        <div className="flex justify-end">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12.5px] font-medium text-muted/70 border border-border transition-all duration-200 hover:bg-card hover:text-primary hover:border-border-strong active:scale-95"
          >
            <RotateCcw size={14} />
            Restaurar padrões
          </button>
        </div>
      </div>
    </div>
  );
}
