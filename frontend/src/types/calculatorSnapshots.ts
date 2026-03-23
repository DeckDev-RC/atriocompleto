export type CalculatorSnapshotType = 'taxes' | 'prices';

export interface CalculatorSnapshot<TPayload = Record<string, unknown>> {
  id: string;
  tenant_id: string;
  user_id: string;
  calculator_type: CalculatorSnapshotType;
  name: string;
  payload: TPayload;
  created_at: string;
  updated_at: string;
}
