import { Globe, Store } from 'lucide-react';
import bagyImg from '../../assets/channels/bagy.png';
import shopeeImg from '../../assets/channels/shopee.png';
import sheinImg from '../../assets/channels/shein.png';
import mlImg from '../../assets/channels/mercado-livre.png';
import ambroImg from '../../assets/channels/ambro.png';

export type IconType = 'bagy' | 'globe' | 'shopee' | 'shein' | 'ml' | 'store' | 'ambro' | 'default';

const iconBase = 'flex h-8 w-8 shrink-0 items-center justify-center transition-transform duration-200 overflow-hidden rounded-xl';
const iconBaseLarge = 'flex h-10 w-10 shrink-0 items-center justify-center transition-transform duration-200 overflow-hidden rounded-xl';

export function MarketplaceIcon({ type }: { type: string }) {
  switch (type as IconType) {
    case 'bagy':
      return (
        <div className={iconBase}>
          <img src={bagyImg} alt="Bagy" className="h-full w-full object-cover" />
        </div>
      );
    case 'shopee':
      return (
        <div className={iconBase}>
          <img src={shopeeImg} alt="Shopee" className="h-full w-full object-cover" />
        </div>
      );
    case 'shein':
      return (
        <div className={iconBase}>
          <div className="h-[80%] w-[80%] bg-white rounded-lg overflow-hidden flex items-center justify-center">
            <img src={sheinImg} alt="Shein" className="h-full w-full object-contain" />
          </div>
        </div>
      );
    case 'ml':
      return (
        <div className={iconBaseLarge}>
          <div className="bg-white rounded-lg h-[80%] w-[80%] overflow-hidden flex items-center justify-center">
            <img src={mlImg} alt="Mercado Livre" className="h-full w-full object-contain" />
          </div>
        </div>
      );
    case 'ambro':
      return (
        <div className={iconBase}>
          <img src={ambroImg} alt="Ambro" className="h-full w-full object-cover" />
        </div>
      );
    case 'store':
      return (
        <div className={`${iconBase} bg-linear-to-br from-success to-[#30D158]`}>
          <Store size={18} color="#fff" strokeWidth={2.2} />
        </div>
      );
    case 'globe':
      return (
        <div className={`${iconBase} bg-linear-to-br from-accent to-accent-deep`}>
          <Globe size={18} color="#fff" strokeWidth={2.2} />
        </div>
      );
    default:
      return (
        <div className={`${iconBase} bg-linear-to-br from-[#8B5CF6] to-[#A78BFA]`}>
          <span className="text-[13px] font-bold text-white leading-none">
            {type?.charAt(0)?.toUpperCase() || '?'}
          </span>
        </div>
      );
  }
}
