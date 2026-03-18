export function buildMemoryRefreshJobId(conversationId: string): string {
  // BullMQ reserves ":" for its own Redis key structure.
  return `refresh-${conversationId}`;
}
