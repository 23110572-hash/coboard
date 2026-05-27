import { FastifyReply } from "fastify";

interface Client {
  id: string;
  boardId: string;
  name: string;
  email: string;
  reply: FastifyReply;
}

class SSEBroadcaster {
  private clients: Map<string, Client> = new Map();

  addClient(id: string, boardId: string, name: string, email: string, reply: FastifyReply) {
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    // Send an initial connection confirmation
    reply.raw.write("event: connected\ndata: {}\n\n");

    this.clients.set(id, { id, boardId, name, email, reply });
    console.log(`SSE Client Registered: ${id} (${name}) [Board: ${boardId}]. Total board clients: ${this.getBoardClientCount(boardId)}`);

    // Send current presence list directly to this new client immediately
    const presencePayload = this.buildPresencePayload(boardId);
    reply.raw.write(`event: message\ndata: ${JSON.stringify({ event: "PRESENCE_UPDATED", data: presencePayload })}\n\n`);

    // Also broadcast updated presence to all OTHER clients on this board
    this.broadcastPresence(boardId, id);

    // Keep-alive interval
    const interval = setInterval(() => {
      reply.raw.write(":\n\n");
    }, 15000);

    reply.raw.on("close", () => {
      clearInterval(interval);
      this.clients.delete(id);
      console.log(`SSE Client Disconnected: ${id} [Board: ${boardId}]. Remaining board clients: ${this.getBoardClientCount(boardId)}`);
      
      // Broadcast updated presence to all remaining clients
      this.broadcastPresence(boardId);
    });
  }

  broadcast(boardId: string, event: string, data: any, excludeClientId?: string) {
    const payload = `event: message\ndata: ${JSON.stringify({ event, data })}\n\n`;
    let count = 0;
    
    for (const [clientId, client] of this.clients.entries()) {
      if (client.boardId === boardId && clientId !== excludeClientId) {
        client.reply.raw.write(payload);
        count++;
      }
    }
    
    console.log(`Broadcasted [${event}] to ${count} clients in Board: ${boardId}`);
  }

  buildPresencePayload(boardId: string): Array<{ id: string; name: string; email: string; initials: string }> {
    const boardClients = Array.from(this.clients.values()).filter(
      (c) => c.boardId.toUpperCase() === boardId.toUpperCase()
    );

    // Deduplicate active users by email
    const uniqueUsersMap = new Map<string, { id: string; name: string; email: string; initials: string }>();

    for (const client of boardClients) {
      const emailLower = client.email.trim().toLowerCase();
      if (!uniqueUsersMap.has(emailLower)) {
        // Calculate initials
        const parts = client.name.trim().split(/\s+/).filter(Boolean);
        let initials = "";
        if (parts.length === 0) {
          initials = "??";
        } else if (parts.length === 1) {
          initials = parts[0].substring(0, 2).toUpperCase();
        } else {
          initials = (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        }

        uniqueUsersMap.set(emailLower, {
          id: client.id,
          name: client.name,
          email: client.email,
          initials,
        });
      }
    }

    return Array.from(uniqueUsersMap.values());
  }

  broadcastPresence(boardId: string, excludeClientId?: string) {
    const uniqueUsers = this.buildPresencePayload(boardId);
    this.broadcast(boardId, "PRESENCE_UPDATED", uniqueUsers, excludeClientId);
  }

  getBoardClientCount(boardId: string): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.boardId === boardId) {
        count++;
      }
    }
    return count;
  }

  getActiveClientCount(): number {
    return this.clients.size;
  }
}

export const broadcaster = new SSEBroadcaster();

