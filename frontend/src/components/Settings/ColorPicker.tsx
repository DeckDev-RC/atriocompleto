import { useState, useRef } from 'react';
import { Pipette, Check } from 'lucide-react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
}

const PRESET_COLORS = [
  '#09CAFF', // Azul padrão (Átrio)
  '#3B82F6', // Blue
  '#8B5CF6', // Violet
  '#D946EF', // Fuchsia
  '#EC4899', // Pink
  '#F43F5E', // Rose
  '#EF4444', // Red
  '#F97316', // Orange
  '#EAB308', // Yellow
  '#22C55E', // Green
  '#14B8A6', // Teal
  '#06B6D4', // Cyan
];

/** Verifica se o browser suporta a EyeDropper API */
function supportsEyeDropper(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

export function ColorPicker({ value, onChange }: ColorPickerProps) {
  const [customColor, setCustomColor] = useState(value);
  const [isPickingColor, setIsPickingColor] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);

  const handleEyeDropper = async () => {
    if (!supportsEyeDropper()) return;

    try {
      setIsPickingColor(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eyeDropper = new (window as any).EyeDropper();
      const result = await eyeDropper.open();
      const color = result.sRGBHex;
      setCustomColor(color);
      onChange(color);
    } catch {
      // Usuário cancelou
    } finally {
      setIsPickingColor(false);
    }
  };

  const handleColorInput = (hex: string) => {
    setCustomColor(hex);
    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
      onChange(hex);
    }
  };

  const normalizedValue = value.toUpperCase();

  return (
    <div className="flex flex-col gap-4">
      {/* Cores predefinidas */}
      <div className="flex flex-wrap gap-2.5">
        {PRESET_COLORS.map((color) => {
          const isSelected = normalizedValue === color.toUpperCase();
          return (
            <button
              key={color}
              onClick={() => {
                setCustomColor(color);
                onChange(color);
              }}
              className="relative h-9 w-9 rounded-xl transition-all duration-200 hover:scale-110 active:scale-95 ring-offset-2 ring-offset-card"
              style={{
                backgroundColor: color,
                boxShadow: isSelected
                  ? `0 0 0 2px var(--color-card), 0 0 0 4px ${color}`
                  : `0 1px 3px rgba(0,0,0,0.15)`,
              }}
              title={color}
            >
              {isSelected && (
                <Check
                  size={16}
                  strokeWidth={3}
                  className="absolute inset-0 m-auto text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Cor customizada */}
      <div className="flex items-center gap-3">
        {/* Color input nativo (fallback + complemento ao eyedropper) */}
        <div className="relative">
          <input
            ref={colorInputRef}
            type="color"
            value={customColor}
            onChange={(e) => {
              setCustomColor(e.target.value);
              onChange(e.target.value);
            }}
            className="h-9 w-9 rounded-xl border border-border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0.5 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-none"
          />
        </div>

        {/* Hex input */}
        <input
          type="text"
          value={customColor}
          onChange={(e) => handleColorInput(e.target.value)}
          placeholder="#09CAFF"
          maxLength={7}
          className="h-9 w-28 rounded-xl border border-border bg-card px-3 text-[13px] font-mono text-primary placeholder:text-muted/40 focus:border-[var(--color-brand-primary)] focus:outline-none transition-colors duration-200"
        />

        {/* Preview da cor atual */}
        <div
          className="h-9 w-9 rounded-xl border border-border/60 shrink-0"
          style={{ backgroundColor: value }}
        />

        {/* EyeDropper (apenas Chromium) */}
        {supportsEyeDropper() && (
          <button
            onClick={handleEyeDropper}
            disabled={isPickingColor}
            className="flex h-9 items-center gap-2 rounded-xl border border-border px-3 text-[12.5px] font-medium text-secondary transition-all duration-200 hover:bg-card hover:text-primary hover:border-[var(--color-brand-primary)] disabled:opacity-50 active:scale-95"
          >
            <Pipette size={15} strokeWidth={2} />
            <span className="hidden sm:inline">
              {isPickingColor ? 'Selecionando...' : 'Conta-gotas'}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
