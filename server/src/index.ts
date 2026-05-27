import fastify from "fastify";
import cors from "@fastify/cors";
import { PrismaClient, Prisma } from "@prisma/client";
import { broadcaster } from "./utils/sse.js";
import { generateKeyBetween } from "./utils/fractionalIndexing.js";
import { v4 as uuidv4 } from "uuid";

const prisma = new PrismaClient();
const server = fastify({ logger: true });

// Setup CORS
await server.register(cors, {
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
});

// Helper: Generates a random 5-character alphanumeric ID
function generateShortId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Helper: Generates a unique 5-character alphanumeric Board ID by checking database collision
async function generateUniqueBoardId(): Promise<string> {
  while (true) {
    const code = generateShortId();
    const existing = await prisma.board.findUnique({
      where: { id: code },
    });
    if (!existing) return code;
  }
}

// SSE Events Stream Route (Scoped by client ID & board ID)
server.get("/api/events", async (request, reply) => {
  const query = request.query as { clientId?: string; boardId?: string; name?: string; email?: string };
  const clientId = query.clientId || uuidv4();
  const boardId = query.boardId;
  const name = query.name || "Anonymous";
  const email = query.email || "anonymous@coboard.com";

  if (!boardId) {
    return reply.status(400).send({ error: "boardId query parameter is required." });
  }

  console.log(`SSE Connection opened for Client: ${clientId} (${name}) on Board: ${boardId}`);
  broadcaster.addClient(clientId, boardId, name, email, reply);

  // Keep connection open; reply will be managed by broadcaster raw write stream
  await reply;
});

// Create a new board (auto-generates standard To Do, In Progress, Done columns and uses unique 5-char ID)
server.post("/api/boards", async (request, reply) => {
  const { purpose } = request.body as { purpose: string };

  if (!purpose || !purpose.trim()) {
    return reply.status(400).send({ error: "Purpose of the board is required." });
  }

  try {
    const board = await prisma.$transaction(async (tx) => {
      // 1. Generate unique 5-char short board ID
      const boardId = await generateUniqueBoardId();

      // 2. Create the board
      const createdBoard = await tx.board.create({
        data: {
          id: boardId,
          purpose: purpose.trim(),
        },
      });

      // 3. Auto-create default columns for this board
      await tx.column.create({
        data: { title: "To Do", boardId: createdBoard.id },
      });
      await tx.column.create({
        data: { title: "In Progress", boardId: createdBoard.id },
      });
      await tx.column.create({
        data: { title: "Done", boardId: createdBoard.id },
      });

      return createdBoard;
    });

    return reply.status(201).send(board);
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: "Failed to create board." });
  }
});

// Check if a board exists and get its metadata
server.get("/api/boards/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const cleanId = id.trim().toUpperCase(); // Short IDs are case-insensitive and uppercase

  try {
    const board = await prisma.board.findUnique({
      where: { id: cleanId },
    });

    if (!board) {
      return reply.status(404).send({ error: "Board not found." });
    }

    return reply.send(board);
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: "Failed to validate board ID." });
  }
});

// Fetch all columns and cards for a specific board
server.get("/api/columns", async (request, reply) => {
  const query = request.query as { boardId?: string };
  const boardId = query.boardId;

  if (!boardId) {
    return reply.status(400).send({ error: "boardId query parameter is required." });
  }

  const cleanBoardId = boardId.trim().toUpperCase();

  try {
    const columns = await prisma.column.findMany({
      where: { boardId: cleanBoardId },
      include: {
        cards: {
          orderBy: {
            positionRank: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "asc",
      },
    });
    return reply.send(columns);
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: "Failed to retrieve columns and cards." });
  }
});

// Create a new column scoped by boardId
server.post("/api/columns", async (request, reply) => {
  const { title, boardId } = request.body as { title: string; boardId: string };

  if (!title || !boardId) {
    return reply.status(400).send({ error: "Title and boardId are required." });
  }

  const cleanBoardId = boardId.trim().toUpperCase();

  try {
    const column = await prisma.column.create({
      data: {
        title,
        boardId: cleanBoardId,
      },
      include: { cards: true },
    });

    // Broadcast the event ONLY to clients on the same board
    broadcaster.broadcast(cleanBoardId, "COLUMN_CREATED", column);
    return reply.status(201).send(column);
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: "Failed to create column." });
  }
});

// Create a new card (scoped by the column's boardId)
server.post("/api/cards", async (request, reply) => {
  const { title, description, columnId, labels, assignee } = request.body as {
    title: string;
    description?: string;
    columnId: string;
    labels?: string; // Comma separated tags
    assignee?: string;
  };

  if (!title || !columnId) {
    return reply.status(400).send({ error: "Title and columnId are required." });
  }

  try {
    // 1. Fetch column to identify the boardId scope
    const column = await prisma.column.findUnique({
      where: { id: columnId },
    });

    if (!column) {
      return reply.status(404).send({ error: "Target column not found." });
    }

    // 2. Append card at bottom inside database transaction
    const card = await prisma.$transaction(async (tx) => {
      const lastCard = await tx.card.findFirst({
        where: { columnId },
        orderBy: { positionRank: "desc" },
      });

      const newRank = generateKeyBetween(lastCard?.positionRank, null);

      return tx.card.create({
        data: {
          title,
          description,
          columnId,
          positionRank: newRank,
          labels,
          assignee,
        },
      });
    });

    // 3. Broadcast to the board
    broadcaster.broadcast(column.boardId, "CARD_CREATED", card);
    return reply.status(201).send(card);
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: "Failed to create card." });
  }
});

// Update/Edit card details (Title, Description, Tags, Assignee)
server.patch("/api/cards/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { title, description, labels, assignee, senderId } = request.body as {
    title?: string;
    description?: string | null;
    labels?: string | null;
    assignee?: string | null;
    senderId?: string;
  };

  try {
    const card = await prisma.card.findUnique({
      where: { id },
      include: { column: true },
    });

    if (!card) {
      return reply.status(404).send({ error: "Card not found." });
    }

    const updatedCard = await prisma.card.update({
      where: { id },
      data: {
        title: title !== undefined ? title : card.title,
        description: description !== undefined ? description : card.description,
        labels: labels !== undefined ? labels : card.labels,
        assignee: assignee !== undefined ? assignee : card.assignee,
      },
    });

    // Broadcast the card update event to the board
    broadcaster.broadcast(card.column.boardId, "CARD_UPDATED", updatedCard, senderId);
    return reply.send(updatedCard);
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: "Failed to update card details." });
  }
});

// Helper for transaction retry logic in case of serialization failures
async function runWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error: any) {
      attempt++;
      const isSerializationError =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034";
      
      if (isSerializationError && attempt < retries) {
        console.warn(`Serialization conflict detected. Retrying transaction (attempt ${attempt}/${retries})...`);
        await new Promise((res) => setTimeout(res, 50 * attempt));
        continue;
      }
      throw error;
    }
  }
}

// Move/reorder a card (Scoped by target column boardId)
server.patch("/api/cards/:id/move", async (request, reply) => {
  const { id } = request.params as { id: string };
  const { toColumnId, prevCardId, nextCardId, senderId } = request.body as {
    toColumnId: string;
    prevCardId: string | null;
    nextCardId: string | null;
    senderId: string;
  };

  if (!toColumnId) {
    return reply.status(400).send({ error: "toColumnId is required." });
  }

  try {
    const targetColumn = await prisma.column.findUnique({
      where: { id: toColumnId },
    });

    if (!targetColumn) {
      return reply.status(404).send({ error: "Target column not found." });
    }

    const result = await runWithRetry(async () => {
      return await prisma.$transaction(async (tx) => {
        let prevRank: string | null = null;
        let nextRank: string | null = null;

        if (prevCardId) {
          const prevCard = await tx.card.findUnique({
            where: { id: prevCardId },
          });
          if (!prevCard) {
            throw new Error(`Previous card with ID ${prevCardId} not found.`);
          }
          prevRank = prevCard.positionRank;
        }

        if (nextCardId) {
          const nextCard = await tx.card.findUnique({
            where: { id: nextCardId },
          });
          if (!nextCard) {
            throw new Error(`Next card with ID ${nextCardId} not found.`);
          }
          nextRank = nextCard.positionRank;
        }

        const newRank = generateKeyBetween(prevRank, nextRank);

        const updatedCard = await tx.card.update({
          where: { id },
          data: {
            columnId: toColumnId,
            positionRank: newRank,
          },
        });

        return { card: updatedCard, newRank };
      });
    });

    // Broadcast update only to the target board
    broadcaster.broadcast(
      targetColumn.boardId,
      "CARD_MOVED",
      {
        cardId: id,
        toColumnId,
        positionRank: result.newRank,
        prevCardId,
        nextCardId,
      },
      senderId
    );

    return reply.send({ success: true, card: result.card });
  } catch (error: any) {
    server.log.error(error);
    return reply.status(500).send({ error: error.message || "Failed to move card." });
  }
});

// Delete a card
server.delete("/api/cards/:id", async (request, reply) => {
  const { id } = request.params as { id: string };
  const query = request.query as { senderId?: string };
  const senderId = query.senderId || "";

  try {
    const card = await prisma.card.findUnique({
      where: { id },
      include: { column: true },
    });

    if (!card) {
      return reply.status(404).send({ error: "Card not found." });
    }

    await prisma.card.delete({
      where: { id },
    });

    // Broadcast the delete event to the board
    broadcaster.broadcast(
      card.column.boardId,
      "CARD_DELETED",
      { cardId: id, columnId: card.columnId },
      senderId
    );
    
    return reply.send({ success: true });
  } catch (error) {
    server.log.error(error);
    return reply.status(500).send({ error: "Failed to delete card." });
  }
});

// Start the server
const start = async () => {
  try {
    const port = Number(process.env.PORT) || 5000;
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`Coboard Fastify Server running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
