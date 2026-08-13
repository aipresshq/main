export const R2_WARNING_BYTES = 8 * 1024 * 1024 * 1024;
export const R2_BLOCK_BYTES = 9 * 1024 * 1024 * 1024;

interface StorageDatabase {
  prepare(sql: string): {
    first<T>(): Promise<T | null>;
  };
}

export async function storageStatus(db: StorageDatabase, projectedBytes = 0) {
  const row = await db
    .prepare(
      "SELECT COALESCE(SUM(byte_count), 0) AS used_bytes FROM storage_ledger WHERE lifecycle_status = 'active'",
    )
    .first<{ used_bytes: number }>();
  const usedBytes = Number(row?.used_bytes ?? 0);
  const projectedTotal = usedBytes + Math.max(0, projectedBytes);
  return {
    usedBytes,
    projectedTotal,
    warning: projectedTotal >= R2_WARNING_BYTES,
    blocked: projectedTotal >= R2_BLOCK_BYTES,
  };
}
