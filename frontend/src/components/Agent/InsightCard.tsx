import React from 'react';
import { Rocket, Mail, RefreshCw, Settings, AlertTriangle, CheckCircle2 } from 'lucide-react';

export interface AIAction {
    action: 'CREATE_PROMOTION' | 'SEND_CUSTOMER_EMAIL' | 'ADJUST_STOCK_ALERT' | 'REVIEW_MARKETPLACE_SETTING';
    payload: any;
    reason: string;
}

interface InsightCardProps {
    action: AIAction;
    onExecute: (action: AIAction) => void;
}

const ACTION_MAP = {
    CREATE_PROMOTION: {
        label: 'Criar Promoção',
        icon: Rocket,
        color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        buttonColor: 'bg-indigo-600 hover:bg-indigo-700'
    },
    SEND_CUSTOMER_EMAIL: {
        label: 'Enviar E-mail',
        icon: Mail,
        color: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        buttonColor: 'bg-blue-600 hover:bg-blue-700'
    },
    ADJUST_STOCK_ALERT: {
        label: 'Ajustar Estoque',
        icon: RefreshCw,
        color: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        buttonColor: 'bg-amber-600 hover:bg-amber-700'
    },
    REVIEW_MARKETPLACE_SETTING: {
        label: 'Revisar Configurações',
        icon: Settings,
        color: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        buttonColor: 'bg-purple-600 hover:bg-purple-700'
    }
};

export const InsightCard: React.FC<InsightCardProps> = ({ action, onExecute }) => {
    const config = ACTION_MAP[action.action] || ACTION_MAP.REVIEW_MARKETPLACE_SETTING;
    const Icon = config.icon;

    return (
        <div className={`mt-4 p-4 rounded-xl border ${config.color} backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-500`}>
            <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${config.color} border`}>
                    <Icon size={20} />
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold uppercase tracking-wider">Sugestão de Ação</span>
                        <AlertTriangle size={14} className="opacity-50" />
                    </div>
                    <p className="text-sm text-gray-200 leading-relaxed mb-4">
                        {action.reason}
                    </p>
                    <button
                        onClick={() => onExecute(action)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all shadow-lg active:scale-95 ${config.buttonColor}`}
                    >
                        <CheckCircle2 size={16} />
                        {config.label}
                    </button>
                </div>
            </div>
        </div>
    );
};
