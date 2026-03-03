export type InsightCategory = 'vendas' | 'clientes' | 'estoque' | 'financeiro' | 'marketing' | 'operacional';
export type InsightPriority = 'critical' | 'high' | 'medium' | 'low';
export type InsightStatus = 'new' | 'viewed' | 'resolved' | 'ignored';

export interface AutoInsight {
    id: string;
    tenant_id: string;
    category: InsightCategory;
    priority: InsightPriority;
    title: string;
    description: string;
    data_support: any;
    recommended_actions: string[];
    status: InsightStatus;
    importance_score: number;
    created_at: string;
    updated_at: string;
}

export interface RFMAnalysis {
    total_customers: number;
    avg_recency: number;
    avg_frequency: number;
    avg_monetary: number;
    segments: {
        segment: string;
        count: number;
        avg_recency: number;
        avg_frequency: number;
        avg_monetary: number;
    }[];
}
