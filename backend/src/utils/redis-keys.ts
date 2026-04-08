import type Redis from "ioredis";

const DEFAULT_SCAN_COUNT = 200;
const DEFAULT_DELETE_BATCH_SIZE = 500;

export async function collectRedisKeys(
  client: Redis,
  pattern: string,
  count = DEFAULT_SCAN_COUNT,
): Promise<string[]> {
  let cursor = "0";
  const keys: string[] = [];

  do {
    const [nextCursor, batch] = await client.scan(cursor, "MATCH", pattern, "COUNT", String(count));
    cursor = nextCursor;
    if (batch.length > 0) {
      keys.push(...batch);
    }
  } while (cursor !== "0");

  return keys;
}

export async function deleteRedisKeysByPattern(
  client: Redis,
  pattern: string,
  batchSize = DEFAULT_DELETE_BATCH_SIZE,
): Promise<number> {
  const keys = await collectRedisKeys(client, pattern);

  for (let index = 0; index < keys.length; index += batchSize) {
    const batch = keys.slice(index, index + batchSize);
    if (batch.length > 0) {
      await client.unlink(...batch);
    }
  }

  return keys.length;
}
