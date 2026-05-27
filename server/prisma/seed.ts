import { PrismaClient } from "@prisma/client";
import { generateNKeysBetween } from "../src/utils/fractionalIndexing.js";

const prisma = new PrismaClient();
const DEMO_BOARD_ID = "DEMO1";

async function main() {
  console.log("Cleaning database...");
  await prisma.card.deleteMany({});
  await prisma.column.deleteMany({});
  await prisma.board.deleteMany({});

  console.log("Seeding demo board...");
  const board = await prisma.board.create({
    data: {
      id: DEMO_BOARD_ID,
      purpose: "Willovate Hackathon Sprint - Kanban Engine Release",
    },
  });

  console.log("Seeding columns...");
  const columnsData = [
    { title: "To Do", boardId: board.id },
    { title: "In Progress", boardId: board.id },
    { title: "Done", boardId: board.id },
  ];

  const createdCols = [];
  for (const col of columnsData) {
    const created = await prisma.column.create({
      data: col,
    });
    createdCols.push(created);
  }

  const colTodo = createdCols[0];
  const colInProgress = createdCols[1];
  const colDone = createdCols[2];

  console.log("Seeding cards...");
  const todoRanks = generateNKeysBetween(null, null, 3);
  await prisma.card.createMany({
    data: [
      {
        title: "Dynamic Multi-Board Routing",
        description: "Connect frontend Join/Create forms with backend endpoints",
        positionRank: todoRanks[0],
        columnId: colTodo.id,
        labels: "Backend,High Priority",
        assignee: "KA",
      },
      {
        title: "Aesthetic CSS Scaling",
        description: "Enlarge font sizes on tickets and columns for readability",
        positionRank: todoRanks[1],
        columnId: colTodo.id,
        labels: "UI/UX,Font",
        assignee: "SL",
      },
      {
        title: "Board ID Clipboard Copy",
        description: "Add a button to copy Board UUID to share with other members",
        positionRank: todoRanks[2],
        columnId: colTodo.id,
        labels: "Frontend",
        assignee: "JD",
      },
    ],
  });

  const inProgressRanks = generateNKeysBetween(null, null, 1);
  await prisma.card.createMany({
    data: [
      {
        title: "Login Screen Scaffolding",
        description: "Build Join Board and Create Board toggles and session storage",
        positionRank: inProgressRanks[0],
        columnId: colInProgress.id,
        labels: "Frontend,Forms",
        assignee: "KA",
      },
    ],
  });

  const doneRanks = generateNKeysBetween(null, null, 2);
  await prisma.card.createMany({
    data: [
      {
        title: "Fractional Indexing Port",
        description: "TypeScript implementation of Greenspan midpoint algorithm",
        positionRank: doneRanks[0],
        columnId: colDone.id,
        labels: "Core,Math",
        assignee: "JD",
      },
      {
        title: "Initial SSE Broadcast Integration",
        description: "Establish Fastify events pipeline and EventSource hooks",
        positionRank: doneRanks[1],
        columnId: colDone.id,
        labels: "Real-time,SSE",
        assignee: "KA",
      },
    ],
  });

  console.log(`Database seeded! Join the board with ID: ${DEMO_BOARD_ID}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
