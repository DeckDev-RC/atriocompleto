import { useMemo, useEffect } from 'react';

interface PasswordRequirement {
    label: string;
    met: boolean;
}

interface PasswordStrengthIndicatorProps {
    password: string;
    onValidityChange?: (isValid: boolean) => void;
}

export function PasswordStrengthIndicator({ password, onValidityChange }: PasswordStrengthIndicatorProps) {
    const requirements: PasswordRequirement[] = useMemo(() => [
        { label: '8+ caracteres', met: password.length >= 8 },
        { label: '1 letra maiúscula', met: /[A-Z]/.test(password) },
        { label: '1 número', met: /\d/.test(password) },
    ], [password]);

    const metCount = requirements.filter(r => r.met).length;
    const isValid = metCount === requirements.length;

    useEffect(() => {
        onValidityChange?.(isValid);
    }, [isValid, onValidityChange]);

    if (!password) return null;

    return (
        <div className="mt-3">
            {/* Strength Bar */}
            <div className="grid grid-cols-3 gap-1.5">
                {[1, 2, 3].map((step) => {
                    const isActive = step <= metCount;
                    let colorClass = 'bg-border/30';
                    if (isActive) {
                        if (metCount === 1) colorClass = 'bg-danger';
                        else if (metCount === 2) colorClass = 'bg-warning';
                        else colorClass = 'bg-success';
                    }
                    return (
                        <div
                            key={step}
                            className={`h-1 rounded-full transition-all duration-500 ${colorClass}`}
                        />
                    );
                })}
            </div>

            {/* Checklist */}
            <div className="mt-3 grid gap-1.5">
                {requirements.map((rule, i) => (
                    <div key={i} className="flex items-center gap-2">
                        <div
                            className={`h-1.5 w-1.5 rounded-full transition-colors ${rule.met ? 'bg-success' : 'bg-border'
                                }`}
                        />
                        <span
                            className={`text-[11px] transition-colors ${rule.met ? 'text-primary' : 'text-muted'
                                }`}
                        >
                            {rule.label}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
