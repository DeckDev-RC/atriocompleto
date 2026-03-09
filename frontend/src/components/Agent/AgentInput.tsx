import { useState, useRef, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { SendHorizontal, Mic, MicOff } from 'lucide-react';
import { useBrandPrimaryColor } from '../../hooks/useBrandPrimaryColor';

// ── Web Speech API types ────────────────────────────────
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}
interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognition;
    webkitSpeechRecognition?: new () => SpeechRecognition;
  }
}

interface AgentInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  onStop?: () => void;
}

const MAX_CHARS = 1000;
const SLASH_COMMANDS = [
  { command: '/clear', description: 'Limpar a conversa atual e iniciar uma nova' },
  { command: '/help', description: 'Aprender o que eu posso perguntar' },
  { command: '/feedback', description: 'Enviar um feedback ou reportar um erro' }
];

export function AgentInput({ onSend, disabled, onStop }: AgentInputProps) {
  const [message, setMessage] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [showSlashCommands, setShowSlashCommands] = useState(false);
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const streamRef = useRef<MediaStream | null>(null);
  const brandPrimaryColor = useBrandPrimaryColor();

  const speechSupported =
    typeof window !== 'undefined' &&
    (!!window.SpeechRecognition || !!window.webkitSpeechRecognition);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current = null;
      }
    };
  }, []);

  const correctTranscript = useCallback((text: string): string => {
    const corrections: [RegExp, string][] = [
      [/\bbagui\b/gi, 'Bagy'], [/\bbague\b/gi, 'Bagy'], [/\bbag\b/gi, 'Bagy'], [/\bbaggy\b/gi, 'Bagy'],
      [/\bchopee\b/gi, 'Shopee'], [/\bshop\s*e\b/gi, 'Shopee'], [/\bxopi\b/gi, 'Shopee'], [/\bshopei\b/gi, 'Shopee'],
      [/\bmercado\s*livro\b/gi, 'Mercado Livre'], [/\bxein\b/gi, 'Shein'], [/\bchein\b/gi, 'Shein'],
      [/\bfaturanento\b/gi, 'faturamento'], [/\btiquete?\s*médio\b/gi, 'ticket médio'],
      [/\bmarketi?\s*place\b/gi, 'marketplace'], [/\bmarket\s*places\b/gi, 'marketplaces'],
      [/\búltimos\s*trinta\s*dias\b/gi, 'últimos 30 dias'],
      [/\búltimos\s*noventa\s*dias\b/gi, 'últimos 90 dias'],
    ];
    let corrected = text;
    for (const [pattern, replacement] of corrections) {
      corrected = corrected.replace(pattern, replacement);
    }
    return corrected;
  }, []);

  const toggleVoice = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setInterimText('');
      return;
    }

    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionClass) return;

    const recognition = new SpeechRecognitionClass();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setIsListening(true);
      setInterimText('');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalTranscript = '';
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalTranscript += result[0].transcript;
        else interim += result[0].transcript;
      }
      if (finalTranscript) {
        const corrected = correctTranscript(finalTranscript);
        setMessage((prev) => {
          const separator = prev && !prev.endsWith(' ') ? ' ' : '';
          return prev + separator + corrected;
        });
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimText('');
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isListening, correctTranscript]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || disabled || message.length > MAX_CHARS) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      setInterimText('');
    }
    onSend(trimmed);
    setMessage('');
    setShowSlashCommands(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (showSlashCommands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev + 1) % SLASH_COMMANDS.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCommandIndex((prev) => (prev - 1 + SLASH_COMMANDS.length) % SLASH_COMMANDS.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        executeCommand(SLASH_COMMANDS[selectedCommandIndex]);
        return;
      }
      if (e.key === 'Escape') {
        setShowSlashCommands(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const executeCommand = (cmd: { command: string, description: string }) => {
    onSend(cmd.command);
    setMessage('');
    setShowSlashCommands(false);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setMessage(val);
    setInterimText('');
    if (val === '/') {
      setShowSlashCommands(true);
      setSelectedCommandIndex(0);
    } else {
      setShowSlashCommands(false);
    }
  };

  const handleInput = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
    }
  };

  // ── Audio Visualizer ──
  const startVisualizer = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const audioCtx = new AudioContext();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.7;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const draw = () => {
        animFrameRef.current = requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);

        const W = rect.width;
        const H = rect.height;
        ctx.clearRect(0, 0, W, H);

        const barCount = Math.max(16, Math.min(40, Math.floor(W / 12)));
        const gap = W < 300 ? 2 : 3;
        const barWidth = (W - gap * (barCount - 1)) / barCount;
        const centerY = H / 2;

        for (let i = 0; i < barCount; i++) {
          const dataIdx = Math.floor((i / barCount) * bufferLength * 0.7);
          const value = dataArray[dataIdx] / 255;
          const barHeight = Math.max(4, value * (H * 0.8));
          const halfBar = barHeight / 2;
          const x = i * (barWidth + gap);

          // Gradient usando a cor primária da marca
          const t = i / barCount;
          let r = 56, g = 182, b = 255; // Fallback
          
          if (brandPrimaryColor) {
            const rgb = brandPrimaryColor.match(/\d+/g);
            if (rgb && rgb.length >= 3) {
              r = parseInt(rgb[0]);
              g = parseInt(rgb[1]);
              b = parseInt(rgb[2]);
            } else if (brandPrimaryColor.startsWith('#')) {
              const hex = brandPrimaryColor.replace('#', '');
              r = parseInt(hex.substring(0, 2), 16);
              g = parseInt(hex.substring(2, 4), 16);
              b = parseInt(hex.substring(4, 6), 16);
            }
          } else {
            // Ler da variável CSS se não tiver no estado
            const cssColor = getComputedStyle(document.documentElement).getPropertyValue('--color-brand-primary').trim();
            if (cssColor) {
              const rgb = cssColor.match(/\d+/g);
              if (rgb && rgb.length >= 3) {
                r = parseInt(rgb[0]);
                g = parseInt(rgb[1]);
                b = parseInt(rgb[2]);
              } else if (cssColor.startsWith('#')) {
                const hex = cssColor.replace('#', '');
                r = parseInt(hex.substring(0, 2), 16);
                g = parseInt(hex.substring(2, 4), 16);
                b = parseInt(hex.substring(4, 6), 16);
              }
            }
          }
          
          // Criar gradiente mais escuro para o final
          const rEnd = Math.max(0, r - 20);
          const gEnd = Math.max(0, g - 30);
          const bEnd = Math.max(0, b - 30);
          
          const rFinal = Math.round(r + (rEnd - r) * t);
          const gFinal = Math.round(g + (gEnd - g) * t);
          const bFinal = Math.round(b + (bEnd - b) * t);
          const alpha = 0.6 + value * 0.4;

          ctx.fillStyle = `rgba(${rFinal}, ${gFinal}, ${bFinal}, ${alpha})`;
          ctx.beginPath();
          ctx.roundRect(x, centerY - halfBar, barWidth, barHeight, barWidth / 2);
          ctx.fill();
        }
      };
      draw();
    } catch (err) {
      console.warn('[Voice] Audio visualizer error:', err);
    }
  }, []);

  const stopVisualizer = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioContextRef.current) audioContextRef.current.close();
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    audioContextRef.current = null;
    analyserRef.current = null;
    streamRef.current = null;
    animFrameRef.current = 0;
  }, []);

  useEffect(() => {
    if (isListening) startVisualizer();
    else stopVisualizer();
    return () => stopVisualizer();
  }, [isListening, startVisualizer, stopVisualizer]);

  const displayValue = message + (interimText ? (message && !message.endsWith(' ') ? ' ' : '') + interimText : '');

  return (
    <form onSubmit={handleSubmit} className="shrink-0 border-t border-border p-4 max-sm:p-3">
      <div className="mx-auto max-w-[960px] lg:px-4">
        <div
          className={`relative flex items-end gap-2 rounded-2xl border p-3 transition-all duration-300 ${isListening
              ? 'border-danger/40 shadow-[0_0_20px_rgba(255,69,58,0.1)] bg-card'
              : 'border-border bg-card shadow-soft hover:shadow-soft-hover dark:shadow-dark-card dark:hover:shadow-dark-hover'
            }`}
          onFocus={(e) => {
            if (!isListening && brandPrimaryColor) {
              const rgb = brandPrimaryColor.match(/\d+/g);
              if (rgb && rgb.length >= 3) {
                e.currentTarget.style.borderColor = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.3)`;
                e.currentTarget.style.boxShadow = `0 0 20px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.06)`;
              } else if (brandPrimaryColor.startsWith('#')) {
                const hex = brandPrimaryColor.replace('#', '');
                const r = parseInt(hex.substring(0, 2), 16);
                const g = parseInt(hex.substring(2, 4), 16);
                const b = parseInt(hex.substring(4, 6), 16);
                e.currentTarget.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.3)`;
                e.currentTarget.style.boxShadow = `0 0 20px rgba(${r}, ${g}, ${b}, 0.06)`;
              }
            }
          }}
          onBlur={(e) => {
            if (!isListening) {
              e.currentTarget.style.borderColor = '';
              e.currentTarget.style.boxShadow = '';
            }
          }}
        >
          {isListening ? (
            <div className="flex-1 flex items-center min-h-[40px] relative">
              <canvas
                ref={canvasRef}
                className="w-full rounded-lg"
                style={{ height: '40px' }}
              />
              {(interimText || message) && (
                <div className="absolute bottom-0 left-0 right-0 text-center text-[10px] text-muted truncate px-2">
                  {interimText ? `"${interimText}"` : message ? `✓ ${message.slice(-50)}` : ''}
                </div>
              )}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              value={displayValue}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onInput={handleInput}
              placeholder="Pergunte ao Optimus..."
              disabled={disabled}
              rows={1}
              className="flex-1 resize-none bg-transparent text-[14px] text-primary leading-relaxed placeholder:text-muted outline-none max-sm:text-[16px]"
              style={{ maxHeight: 150 }}
            />
          )}

          {/* Slash Commands Dropdown */}
          {showSlashCommands && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border bg-card p-2 shadow-lg z-50 animate-in slide-in-from-bottom-2 fade-in">
              <div className="mb-1 px-2 text-[11px] font-semibold text-muted uppercase tracking-wider">Comandos</div>
              {SLASH_COMMANDS.map((cmd, i) => (
                <button
                  key={cmd.command}
                  type="button"
                  onClick={() => executeCommand(cmd)}
                  className={`w-full flex flex-col items-start rounded-lg px-3 py-2 text-left transition-colors ${
                    i === selectedCommandIndex ? 'bg-muted/10' : 'hover:bg-muted/5'
                  }`}
                  onMouseEnter={() => setSelectedCommandIndex(i)}
                >
                  <span className="text-[13px] font-medium text-primary">{cmd.command}</span>
                  <span className="text-[11px] text-muted">{cmd.description}</span>
                </button>
              ))}
            </div>
          )}

          {/* Voice button */}
          {speechSupported && !onStop && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={disabled}
              title={isListening ? 'Parar gravação' : 'Falar'}
              className={`flex h-9 w-9 shrink-0 items-center justify-center transition-all duration-300 ${isListening
                  ? 'rounded-full bg-danger text-white'
                  : 'rounded-xl bg-border/50 dark:bg-[rgba(255,255,255,0.06)] text-secondary'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-90'}`}
              style={isListening 
                ? { animation: 'glow-pulse 1.5s ease-in-out infinite' } 
                : {
                    ['--hover-color' as any]: brandPrimaryColor || 'var(--color-brand-primary)',
                    ['--hover-bg' as any]: brandPrimaryColor ? `color-mix(in srgb, ${brandPrimaryColor} 10%, transparent)` : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)',
                  }}
              onMouseEnter={(e) => {
                if (!isListening && !disabled) {
                  e.currentTarget.style.color = brandPrimaryColor || 'var(--color-brand-primary)';
                  e.currentTarget.style.backgroundColor = brandPrimaryColor 
                    ? `color-mix(in srgb, ${brandPrimaryColor} 10%, transparent)` 
                    : 'color-mix(in srgb, var(--color-brand-primary) 10%, transparent)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isListening) {
                  e.currentTarget.style.color = '';
                  e.currentTarget.style.backgroundColor = '';
                }
              }}
            >
              {isListening ? <MicOff size={16} strokeWidth={2.2} /> : <Mic size={16} strokeWidth={2} />}
            </button>
          )}

          {/* Stop / Send button */}
          {onStop && disabled ? (
            <button
               type="button"
               onClick={onStop}
               title="Parar geração"
               className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger text-white hover:bg-danger/80 transition-colors active:scale-90"
            >
               <div className="h-3 w-3 rounded-[2px] bg-white" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!message.trim() || disabled || message.length > MAX_CHARS}
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${message.trim() && !disabled && message.length <= MAX_CHARS
                  ? 'text-white shadow-sm hover:shadow-md active:scale-90'
                  : 'bg-border/50 dark:bg-[rgba(255,255,255,0.05)] text-muted cursor-not-allowed'
                }`}
              style={message.trim() && !disabled && message.length <= MAX_CHARS ? {
                backgroundColor: brandPrimaryColor || 'var(--color-brand-primary)',
              } : undefined}
            >
              <SendHorizontal size={16} strokeWidth={2.2} />
            </button>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between px-1">
          <p className="text-[10px] text-muted">
            Optimus pode cometer erros. Verifique informações importantes.
          </p>
          <p className={`text-[10px] font-medium ${message.length > MAX_CHARS ? 'text-danger' : 'text-muted/60'}`}>
            {message.length} / {MAX_CHARS}
          </p>
        </div>
      </div>
    </form>
  );
}
