-- 009_create_auto_insights_table.sql
-- Tabela para armazenar os insights automáticos gerados diariamente pela IA

CREATE TYPE insight_priority AS ENUM ('critical', 'high', 'medium', 'low');
CREATE TYPE insight_status AS ENUM ('new', 'viewed', 'resolved', 'ignored');

CREATE TABLE IF NOT EXISTS auto_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category TEXT NOT NULL, -- 'vendas', 'clientes', 'estoque', 'financeiro', 'marketing', 'operacional'
    priority insight_priority NOT NULL DEFAULT 'medium',
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    data_support JSONB, -- Dados numéricos, gráficos ou comparações que embasam o insight
    recommended_actions JSONB, -- Lista de 2-3 ações específicas sugeridas pela IA
    status insight_status NOT NULL DEFAULT 'new',
    importance_score INTEGER CHECK (importance_score >= 0 AND importance_score <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_auto_insights_tenant_id ON auto_insights(tenant_id);
CREATE INDEX idx_auto_insights_created_at ON auto_insights(created_at);
CREATE INDEX idx_auto_insights_status ON auto_insights(status);

-- Gatilho para update_at
CREATE OR REPLACE FUNCTION update_auto_insights_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tr_auto_insights_updated_at
BEFORE UPDATE ON auto_insights
FOR EACH ROW
EXECUTE FUNCTION update_auto_insights_updated_at();

-- RLS (Row Level Security)
ALTER TABLE auto_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenants can view their own insights" 
ON auto_insights FOR SELECT 
USING (tenant_id = auth.jwt() ->> 'tenant_id'::UUID);

CREATE POLICY "Tenants can update their own insights status" 
ON auto_insights FOR UPDATE
USING (tenant_id = auth.jwt() ->> 'tenant_id'::UUID)
WITH CHECK (tenant_id = auth.jwt() ->> 'tenant_id'::UUID);

-- Comentários para documentação Supabase
COMMENT ON TABLE auto_insights IS 'Armazena insights automáticos diários gerados por IA para cada tenant.';
