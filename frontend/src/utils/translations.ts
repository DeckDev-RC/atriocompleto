/**
 * Centralized translations for order statuses, marketplaces, and months.
 * Used by StatusFilter, Charts, and other components to avoid duplication.
 */

export const STATUS_TRANSLATIONS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  processing: "Processando",
  refunded: "Reembolsado",
  failed: "Falhou",
  partially_refunded: "Reembolso Parcial",
  pending_payment: "Pagamento Pendente",
  pending_shipment: "Envio Pendente",
  "pending processing": "Processamento Pendente",
  "pending shipment": "Envio Pendente",
};

export const MARKETPLACE_TRANSLATIONS: Record<string, string> = {
  bagy: "Bagy",
  ml: "Mercado Livre",
  shopee: "Shopee",
  shein: "Shein",
  "physical store": "Loja Física",
  "physical_store": "Loja Física",
  loja_fisica: "Loja Física",
  mercadolivre: "Mercado Livre",
};

export const MONTH_TRANSLATIONS: Record<string, string> = {
  "01": "Jan",
  "02": "Fev",
  "03": "Mar",
  "04": "Abr",
  "05": "Mai",
  "06": "Jun",
  "07": "Jul",
  "08": "Ago",
  "09": "Set",
  "10": "Out",
  "11": "Nov",
  "12": "Dez",
};

/**
 * Translates a status value from DB format to display format.
 */
export function translateStatus(status: string): string {
  return STATUS_TRANSLATIONS[status] || STATUS_TRANSLATIONS[status.toLowerCase()] || status;
}

/**
 * Translates a marketplace value from DB format to display format.
 */
export function translateMarketplace(marketplace: string): string {
  return (
    MARKETPLACE_TRANSLATIONS[marketplace] ||
    MARKETPLACE_TRANSLATIONS[marketplace.toLowerCase()] ||
    marketplace
  );
}

/**
 * Translates a month number (01-12) to abbreviated Portuguese name.
 */
export function translateMonth(monthNum: string): string {
  return MONTH_TRANSLATIONS[monthNum] || monthNum;
}
