export function normalizeManageableTenantIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(
    value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim()),
  )];
}

export function hasManageableTenantAccess(
  manageableTenantIds: string[] | undefined,
  tenantId: string,
): boolean {
  return Array.isArray(manageableTenantIds) && manageableTenantIds.includes(tenantId);
}
