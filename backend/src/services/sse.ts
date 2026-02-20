import { Response } from "express";

/**
 * Simple SSE (Server-Sent Events) manager for real-time permission updates.
 * Clients connect via GET /api/user/events and receive push notifications
 * when their permissions change.
 */

type SSEClient = {
    userId: string;
    res: Response;
};

const clients: SSEClient[] = [];

/** Register a new SSE client connection */
export function addSSEClient(userId: string, res: Response) {
    clients.push({ userId, res });

    // Explicitly flush the initial connection/heartbeat if any
    try {
        (res as any).flush?.();
    } catch (err) { }

    // Remove client on disconnect
    res.on("close", () => {
        const idx = clients.findIndex((c) => c.res === res);
        if (idx !== -1) clients.splice(idx, 1);
    });


}

/** Notify all connected clients of a specific user that their permissions changed */
export function notifyPermissionsChanged(userId: string) {
    const userClients = clients.filter((c) => c.userId === userId);
    for (const client of userClients) {
        // Add a tiny delay (200ms) to ensure DB commit is finalized before client refreshes
        setTimeout(() => {
            client.res.write(`event: permissions:changed\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
            try {
                (client.res as any).flush?.();
            } catch (err) {
                // Ignore if flush fails
            }
        }, 200);
    }

}

/** Notify ALL connected clients that permissions changed (used when we can't target a specific user) */
export function notifyAllPermissionsChanged() {
    for (const client of clients) {
        client.res.write(`event: permissions:changed\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
        try {
            (client.res as any).flush?.();
        } catch (err) { }
    }
    console.log(`[SSE] Broadcast permissions:changed to ${clients.length} client(s)`);
}
