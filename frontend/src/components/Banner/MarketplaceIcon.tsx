import { Globe, Store } from 'lucide-react';

export type IconType = 'bagy' | 'globe' | 'shopee' | 'shein' | 'ml' | 'store' | 'default';

const iconBase = 'flex h-8 w-8 shrink-0 items-center justify-center transition-transform duration-200';

export function MarketplaceIcon({ type }: { type: string }) {
  switch (type as IconType) {
    case 'bagy':
    case 'globe':
      return (
        <div className={`${iconBase} rounded-xl bg-gradient-to-br from-accent to-accent-deep`}>
          <Globe size={15} color="#fff" strokeWidth={2.2} />
        </div>
      );
    case 'shopee':
      return (
        <div className={`${iconBase} rounded-xl bg-gradient-to-br from-shopee to-[#FF6F47]`}>
          <span className="text-[13px] font-bold text-white leading-none">S</span>
        </div>
      );
    case 'shein':
      return (
        <div className={`${iconBase} rounded-xl bg-gradient-to-br from-[#363636] to-[#5c5c5c]`}>
          <span className="text-[13px] font-bold text-white leading-none">S</span>
        </div>
      );
    case 'ml':
      return (
        <div className={`${iconBase} rounded-xl bg-gradient-to-br from-[#FFE600] to-ml`}>
          <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
            <path
              d="M5 11C5 11 6.5 7 9 7C11.5 7 13 11 13 11"
              stroke="#2D68C4"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );
    case 'store':
      return (
        <div className={`${iconBase} rounded-xl bg-gradient-to-br from-[#34C759] to-[#30D158]`}>
          <Store size={15} color="#fff" strokeWidth={2.2} />
        </div>
      );
    default:
      return (
        <div className={`${iconBase} rounded-xl bg-gradient-to-br from-[#8B5CF6] to-[#A78BFA]`}>
          <span className="text-[13px] font-bold text-white leading-none">
            {type?.charAt(0)?.toUpperCase() || '?'}
          </span>
        </div>
      );
  }
}
