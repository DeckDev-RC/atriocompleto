import { supabaseAdmin } from "../config/supabase";

export type CalculatorSnapshotType = "taxes" | "prices";

export interface StoredCalculatorSnapshot {
  id: string;
  tenant_id: string;
  user_id: string;
  calculator_type: CalculatorSnapshotType;
  name: string;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const MAX_SNAPSHOT_SIZE_BYTES = 100_000;

function ensurePayloadSize(payload: Record<string, unknown>) {
  const serialized = JSON.stringify(payload);
  if (serialized.length > MAX_SNAPSHOT_SIZE_BYTES) {
    throw new Error("Snapshot muito grande para salvar.");
  }
}

export class CalculatorSnapshotsService {
  static async listSnapshots(params: {
    tenantId: string;
    userId: string;
    calculatorType: CalculatorSnapshotType;
  }) {
    const { data, error } = await supabaseAdmin
      .from("calculator_snapshots")
      .select("*")
      .eq("tenant_id", params.tenantId)
      .eq("user_id", params.userId)
      .eq("calculator_type", params.calculatorType)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new Error(`Erro ao listar snapshots: ${error.message}`);
    }

    return (data || []) as StoredCalculatorSnapshot[];
  }

  static async createSnapshot(params: {
    tenantId: string;
    userId: string;
    calculatorType: CalculatorSnapshotType;
    name: string;
    payload: Record<string, unknown>;
  }) {
    ensurePayloadSize(params.payload);

    const { data, error } = await supabaseAdmin
      .from("calculator_snapshots")
      .insert({
        tenant_id: params.tenantId,
        user_id: params.userId,
        calculator_type: params.calculatorType,
        name: params.name.trim(),
        payload: params.payload,
      })
      .select("*")
      .single();

    if (error || !data) {
      throw new Error(`Erro ao salvar snapshot: ${error?.message || "desconhecido"}`);
    }

    return data as StoredCalculatorSnapshot;
  }

  static async deleteSnapshot(params: {
    tenantId: string;
    userId: string;
    id: string;
  }) {
    const { error } = await supabaseAdmin
      .from("calculator_snapshots")
      .delete()
      .eq("tenant_id", params.tenantId)
      .eq("user_id", params.userId)
      .eq("id", params.id);

    if (error) {
      throw new Error(`Erro ao excluir snapshot: ${error.message}`);
    }
  }
}
