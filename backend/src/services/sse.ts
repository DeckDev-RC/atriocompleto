import { Response } from "express";

type SSEClient = {
  userId: string;
  res: Response;
  closed: boolean;
  pendingTimers: Set<NodeJS.Timeout>;
};

const clients = new Set<SSEClient>();

function removeSSEClient(client: SSEClient) {
  if (client.closed) return;
  client.closed = true;

  for (const timer of client.pendingTimers) {
    clearTimeout(timer);
  }
  client.pendingTimers.clear();
  clients.delete(client);
}

function canWrite(res: Response) {
  return !res.writableEnded && !res.destroyed;
}

function flushResponse(res: Response) {
  try {
    (res as { flush?: () => void }).flush?.();
  } catch {
    // Ignore flush errors on already-closing sockets.
  }
}

function writeEvent(client: SSEClient, eventName: string, payload: Record<string, unknown>) {
  if (client.closed || !canWrite(client.res)) {
    removeSSEClient(client);
    return;
  }

  client.res.write(`event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`);
  flushResponse(client.res);
}

export function addSSEClient(userId: string, res: Response) {
  const client: SSEClient = {
    userId,
    res,
    closed: false,
    pendingTimers: new Set(),
  };

  clients.add(client);
  flushResponse(res);

  const cleanup = () => removeSSEClient(client);
  res.once("close", cleanup);
  res.once("finish", cleanup);
  res.once("error", cleanup);
}

export function notifyPermissionsChanged(userId: string) {
  for (const client of clients) {
    if (client.userId !== userId || client.closed) continue;

    const timer = setTimeout(() => {
      client.pendingTimers.delete(timer);
      writeEvent(client, "permissions:changed", { timestamp: Date.now() });
    }, 200);

    timer.unref?.();
    client.pendingTimers.add(timer);
  }
}

export function notifyAllPermissionsChanged() {
  for (const client of clients) {
    writeEvent(client, "permissions:changed", { timestamp: Date.now() });
  }
  console.log(`[SSE] Broadcast permissions:changed to ${clients.size} client(s)`);
}

export async function shutdownSSEClients() {
  for (const client of [...clients]) {
    writeEvent(client, "server:shutdown", { timestamp: Date.now() });
    client.res.end();
    removeSSEClient(client);
  }
}
