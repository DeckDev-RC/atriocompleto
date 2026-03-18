-- Habilita busca por similaridade
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Tabela de Produtos (Caso não exista)
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    category TEXT,
    cost_price DECIMAL(10,2),
    sale_price DECIMAL(10,2),
    min_stock_level INTEGER DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de Estoque
CREATE TABLE IF NOT EXISTS inventory (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- View de Inteligência (O que o Optimus vai ler)
CREATE OR REPLACE VIEW product_insights AS
SELECT 
    p.id,
    p.name,
    p.sku,
    p.category,
    p.sale_price,
    p.cost_price,
    (p.sale_price - p.cost_price) as markup_value,
    CASE 
        WHEN p.sale_price > 0 THEN ROUND(((p.sale_price - p.cost_price) / p.sale_price) * 100, 2)
        ELSE 0 
    END as margin_percent,
    COALESCE(i.quantity, 0) as stock_level,
    p.min_stock_level,
    CASE 
        WHEN COALESCE(i.quantity, 0) <= p.min_stock_level THEN 'CRITICAL'
        WHEN COALESCE(i.quantity, 0) <= p.min_stock_level * 1.5 THEN 'WARNING'
        ELSE 'OK'
    END as stock_status
FROM products p
LEFT JOIN inventory i ON p.id = i.product_id;
