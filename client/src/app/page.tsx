"use client";

import { useEffect, useState, useCallback } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { useSSE } from "../hooks/useSSE";
import { generateKeyBetween } from "../utils/fractionalIndexing";
import {
  Plus,
  Trash2,
  LayoutGrid,
  RefreshCw,
  AlertCircle,
  Users,
  Search,
  CheckSquare,
  X,
  Clipboard,
  Check,
  LogOut,
  Sparkles,
  ArrowRight,
  User,
  ExternalLink,
} from "lucide-react";

interface Card {
  id: string;
  title: string;
  description?: string | null;
  labels?: string | null; // Comma-separated tags
  assignee?: string | null; // Assignee initials
  positionRank: string;
  columnId: string;
  createdAt: string;
  updatedAt: string;
}

interface Column {
  id: string;
  title: string;
  boardId: string;
  createdAt: string;
  updatedAt: string;
  cards: Card[];
}

interface ActiveUser {
  id: string;
  name: string;
  email: string;
  initials: string;
}

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active Session State
  const [boardId, setBoardId] = useState<string | null>(null);
  const [boardPurpose, setBoardPurpose] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Active Members State
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);

  // Form Inputs State (Pre-filled from session if available)
  const [activeForm, setActiveForm] = useState<"join" | "create">("create");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formBoardId, setFormBoardId] = useState("");
  const [formPurpose, setFormPurpose] = useState("");

  // Board View State
  const [columns, setColumns] = useState<Column[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(false);

  // Edit card modal state
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editLabels, setEditLabels] = useState("");
  const [editAssignee, setEditAssignee] = useState("");

  // Column creation state
  const [newColumnTitle, setNewColumnTitle] = useState("");
  const [isAddingColumn, setIsAddingColumn] = useState(false);

  // Card creation state
  const [newCardTitles, setNewCardTitles] = useState<{ [columnId: string]: string }>({});
  const [addingCardColId, setAddingCardColId] = useState<string | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

  // Prevent Next.js hydration issues with hello-pangea/dnd
  useEffect(() => {
    setMounted(true);

    const savedBoardId = sessionStorage.getItem("syncboard_board_id");
    const savedBoardPurpose = sessionStorage.getItem("syncboard_board_purpose");
    const savedName = sessionStorage.getItem("syncboard_user_name");
    const savedEmail = sessionStorage.getItem("syncboard_user_email");

    // Pre-fill profile info if they previously logged in or left a board
    if (savedName) setFormName(savedName);
    if (savedEmail) setFormEmail(savedEmail);

    if (savedBoardId && savedName && savedEmail) {
      setBoardId(savedBoardId);
      setBoardPurpose(savedBoardPurpose || "Collaborative Project");
      setUserName(savedName);
      setUserEmail(savedEmail);
    }
  }, []);

  // Fetch board data when board ID becomes active
  const fetchBoard = useCallback(async () => {
    if (!boardId) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/columns?boardId=${boardId}`);
      if (!res.ok) throw new Error("Failed to load board columns.");
      const data = await res.json();
      setColumns(data);
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError("Could not retrieve board data. Please verify the backend server is running.");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, boardId]);

  useEffect(() => {
    if (boardId) {
      fetchBoard();
    }
  }, [boardId, fetchBoard]);

  // Handle SSE broadcasts
  const handleRealTimeEvent = useCallback((event: string, data: any) => {
    console.log(`SSE Event [${event}]:`, data);

    if (event === "PRESENCE_UPDATED") {
      setActiveUsers(data);
      return;
    }

    setColumns((prevColumns) => {
      const updated = JSON.parse(JSON.stringify(prevColumns)) as Column[];

      switch (event) {
        case "COLUMN_CREATED": {
          if (!updated.some((c) => c.id === data.id)) {
            updated.push({ ...data, cards: [] });
            updated.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          }
          break;
        }

        case "CARD_CREATED": {
          const col = updated.find((c) => c.id === data.columnId);
          if (col) {
            if (!col.cards.some((card) => card.id === data.id)) {
              col.cards.push(data);
              col.cards.sort((a, b) => a.positionRank.localeCompare(b.positionRank));
            }
          }
          break;
        }

        case "CARD_MOVED": {
          const { cardId, toColumnId, positionRank } = data;

          let movedCard: Card | null = null;
          for (const col of updated) {
            const index = col.cards.findIndex((c) => c.id === cardId);
            if (index !== -1) {
              movedCard = col.cards[index];
              col.cards.splice(index, 1);
              break;
            }
          }

          if (movedCard) {
            movedCard.columnId = toColumnId;
            movedCard.positionRank = positionRank;

            const targetCol = updated.find((c) => c.id === toColumnId);
            if (targetCol) {
              targetCol.cards.push(movedCard);
              targetCol.cards.sort((a, b) => a.positionRank.localeCompare(b.positionRank));
            }
          }
          break;
        }

        case "CARD_UPDATED": {
          const cardData = data as Card;
          const col = updated.find((c) => c.id === cardData.columnId);
          if (col) {
            const index = col.cards.findIndex((c) => c.id === cardData.id);
            if (index !== -1) {
              col.cards[index] = cardData;
              col.cards.sort((a, b) => a.positionRank.localeCompare(b.positionRank));
            }
          }
          break;
        }

        case "CARD_DELETED": {
          const { cardId, columnId } = data;
          const col = updated.find((c) => c.id === columnId);
          if (col) {
            col.cards = col.cards.filter((c) => c.id !== cardId);
          }
          break;
        }

        default:
          break;
      }
      return updated;
    });
  }, []);

  // Connect to SSE stream
  const { connectionState, clientId } = useSSE(
    boardId || "",
    userName || "",
    userEmail || "",
    handleRealTimeEvent
  );

  // Handle Drag & Drop
  const onDragEnd = async (result: any) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;

    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    const sourceCol = columns.find((c) => c.id === source.droppableId);
    const destCol = columns.find((c) => c.id === destination.droppableId);
    if (!sourceCol || !destCol) return;

    const card = sourceCol.cards.find((c) => c.id === draggableId);
    if (!card) return;

    const originalColumns = JSON.parse(JSON.stringify(columns)) as Column[];

    const tempDestCards = source.droppableId === destination.droppableId
      ? [...sourceCol.cards]
      : [...destCol.cards];

    if (source.droppableId === destination.droppableId) {
      tempDestCards.splice(source.index, 1);
    }

    tempDestCards.splice(destination.index, 0, card);

    const prevCard = tempDestCards[destination.index - 1];
    const nextCard = tempDestCards[destination.index + 1];
    const calculatedRank = generateKeyBetween(prevCard?.positionRank, nextCard?.positionRank);

    // Optimistic UI update
    setColumns((prev) => {
      const copy = JSON.parse(JSON.stringify(prev)) as Column[];
      const sCol = copy.find((c) => c.id === source.droppableId)!;
      const dCol = copy.find((c) => c.id === destination.droppableId)!;

      const cIndex = sCol.cards.findIndex((c) => c.id === draggableId);
      const [moved] = sCol.cards.splice(cIndex, 1);

      moved.columnId = destination.droppableId;
      moved.positionRank = calculatedRank;

      dCol.cards.splice(destination.index, 0, moved);
      dCol.cards.sort((a, b) => a.positionRank.localeCompare(b.positionRank));
      return copy;
    });

    // Send PATCH API
    try {
      const res = await fetch(`${apiBaseUrl}/api/cards/${draggableId}/move`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toColumnId: destination.droppableId,
          prevCardId: prevCard?.id || null,
          nextCardId: nextCard?.id || null,
          senderId: clientId,
        }),
      });

      if (!res.ok) throw new Error("Card move rejected by server.");

      const data = await res.json();
      setColumns((prev) => {
        const copy = JSON.parse(JSON.stringify(prev)) as Column[];
        const dCol = copy.find((c) => c.id === destination.droppableId);
        if (dCol) {
          const card = dCol.cards.find((c) => c.id === draggableId);
          if (card) {
            card.positionRank = data.card.positionRank;
            dCol.cards.sort((a, b) => a.positionRank.localeCompare(b.positionRank));
          }
        }
        return copy;
      });
    } catch (err) {
      console.error(err);
      setColumns(originalColumns);
      setError("Failed to sync card reordering. Reverted board state.");
      setTimeout(() => setError(null), 5000);
    }
  };

  // Create Board Action
  const handleCreateBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formPurpose.trim()) {
      setError("All fields (Name, Email, and Purpose) are required.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/boards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ purpose: formPurpose.trim() }),
      });

      if (!res.ok) throw new Error("Failed to create board.");
      const boardData = await res.json();

      // Set session variables
      sessionStorage.setItem("syncboard_board_id", boardData.id);
      sessionStorage.setItem("syncboard_board_purpose", boardData.purpose);
      sessionStorage.setItem("syncboard_user_name", formName.trim());
      sessionStorage.setItem("syncboard_user_email", formEmail.trim());

      setBoardId(boardData.id);
      setBoardPurpose(boardData.purpose);
      setUserName(formName.trim());
      setUserEmail(formEmail.trim());
      setError(null);
    } catch (err) {
      console.error(err);
      setError("Failed to initialize new board. Is the backend running?");
    } finally {
      setLoading(false);
    }
  };

  // Join Board Action
  const handleJoinBoard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formBoardId.trim()) {
      setError("All fields (Name, Email, and Board ID) are required.");
      return;
    }

    const cleanBoardId = formBoardId.trim().toUpperCase();

    setLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/boards/${cleanBoardId}`);
      if (!res.ok) {
        if (res.status === 404) throw new Error("Invalid Board ID. Board not found.");
        throw new Error("Could not check Board ID status.");
      }
      const boardData = await res.json();

      sessionStorage.setItem("syncboard_board_id", boardData.id);
      sessionStorage.setItem("syncboard_board_purpose", boardData.purpose);
      sessionStorage.setItem("syncboard_user_name", formName.trim());
      sessionStorage.setItem("syncboard_user_email", formEmail.trim());

      setBoardId(boardData.id);
      setBoardPurpose(boardData.purpose);
      setUserName(formName.trim());
      setUserEmail(formEmail.trim());
      setError(null);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to join board. Please verify connection and Board ID.");
    } finally {
      setLoading(false);
    }
  };

  // Option 1: Leave Board (Keeps name and email in storage for easy re-entry)
  const handleLeaveBoard = () => {
    sessionStorage.removeItem("syncboard_board_id");
    sessionStorage.removeItem("syncboard_board_purpose");

    setBoardId(null);
    setBoardPurpose(null);
    setColumns([]);
  };

  // Option 2: Logout (Completely wipes name, email, and board data)
  const handleLogout = () => {
    sessionStorage.removeItem("syncboard_board_id");
    sessionStorage.removeItem("syncboard_board_purpose");
    sessionStorage.removeItem("syncboard_user_name");
    sessionStorage.removeItem("syncboard_user_email");

    setBoardId(null);
    setBoardPurpose(null);
    setUserName(null);
    setUserEmail(null);
    setFormName("");
    setFormEmail("");
    setFormBoardId("");
    setFormPurpose("");
    setColumns([]);
  };

  // Create a new column
  const handleCreateColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColumnTitle.trim() || !boardId) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newColumnTitle.trim(), boardId }),
      });

      if (!res.ok) throw new Error("Failed to create column.");

      setNewColumnTitle("");
      setIsAddingColumn(false);
    } catch (err) {
      console.error(err);
      setError("Failed to create column.");
      setTimeout(() => setError(null), 4000);
    }
  };

  // Create a new card
  const handleCreateCard = async (columnId: string) => {
    const title = newCardTitles[columnId];
    if (!title || !title.trim()) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          columnId,
        }),
      });

      if (!res.ok) throw new Error("Failed to create card.");

      setNewCardTitles((prev) => ({ ...prev, [columnId]: "" }));
      setAddingCardColId(null);
    } catch (err) {
      console.error(err);
      setError("Failed to add card.");
      setTimeout(() => setError(null), 4000);
    }
  };

  // Delete a card
  const handleDeleteCard = async (cardId: string) => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/cards/${cardId}?senderId=${clientId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete card.");

      setColumns((prev) => {
        const copy = JSON.parse(JSON.stringify(prev)) as Column[];
        for (const col of copy) {
          const idx = col.cards.findIndex((c) => c.id === cardId);
          if (idx !== -1) {
            col.cards.splice(idx, 1);
            break;
          }
        }
        return copy;
      });
    } catch (err) {
      console.error(err);
      setError("Failed to delete card.");
      setTimeout(() => setError(null), 4000);
    }
  };

  // Open Edit Card Modal
  const openEditModal = (card: Card) => {
    setEditingCard(card);
    setEditTitle(card.title);
    setEditDesc(card.description || "");
    setEditLabels(card.labels || "");
    setEditAssignee(card.assignee || "");
  };

  // Save Card Details
  const handleSaveCardDetails = async () => {
    if (!editingCard) return;

    try {
      const res = await fetch(`${apiBaseUrl}/api/cards/${editingCard.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editTitle.trim(),
          description: editDesc.trim() || null,
          labels: editLabels.trim() || null,
          assignee: editAssignee.trim() || null,
          senderId: clientId,
        }),
      });

      if (!res.ok) throw new Error("Failed to save card updates.");

      const updatedCard = await res.json();

      setColumns((prev) => {
        const copy = JSON.parse(JSON.stringify(prev)) as Column[];
        const col = copy.find((c) => c.id === editingCard.columnId);
        if (col) {
          const idx = col.cards.findIndex((c) => c.id === editingCard.id);
          if (idx !== -1) {
            col.cards[idx] = updatedCard;
            col.cards.sort((a, b) => a.positionRank.localeCompare(b.positionRank));
          }
        }
        return copy;
      });

      setEditingCard(null);
    } catch (err) {
      console.error(err);
      setError("Failed to update card details.");
      setTimeout(() => setError(null), 4000);
    }
  };

  // Copy Board ID
  const handleCopyBoardId = () => {
    if (!boardId) return;
    navigator.clipboard.writeText(boardId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Filter Cards by Search
  const getFilteredCards = (cards: Card[]) => {
    if (!searchQuery.trim()) return cards;
    const query = searchQuery.toLowerCase().trim();
    return cards.filter(
      (c) =>
        c.title.toLowerCase().includes(query) ||
        (c.description && c.description.toLowerCase().includes(query)) ||
        (c.labels && c.labels.toLowerCase().includes(query))
    );
  };

  // Render labels
  const renderLabelBadges = (labelsString?: string | null) => {
    if (!labelsString) return null;
    return labelsString.split(",").map((lbl) => {
      const trimmed = lbl.trim();
      let colorClass = "bg-slate-100 text-slate-700 border-slate-200";

      if (trimmed.toLowerCase().includes("bug")) colorClass = "bg-rose-50 text-rose-700 border-rose-100";
      else if (trimmed.toLowerCase().includes("feature") || trimmed.toLowerCase().includes("pr"))
        colorClass = "bg-emerald-50 text-emerald-700 border-emerald-100";
      else if (trimmed.toLowerCase().includes("high") || trimmed.toLowerCase().includes("priority"))
        colorClass = "bg-amber-50 text-amber-700 border-amber-100";
      else if (trimmed.toLowerCase().includes("design") || trimmed.toLowerCase().includes("ui"))
        colorClass = "bg-violet-50 text-violet-700 border-violet-100";
      else if (trimmed.toLowerCase().includes("database") || trimmed.toLowerCase().includes("backend"))
        colorClass = "bg-orange-50 text-orange-700 border-orange-100";

      return (
        <span
          key={trimmed}
          className={`text-[11px] px-2.5 py-0.5 rounded-md border font-semibold tracking-wide ${colorClass}`}
        >
          {trimmed}
        </span>
      );
    });
  };

  const visibleUsers = activeUsers.slice(0, 4);
  const remainingCount = activeUsers.length > 4 ? activeUsers.length - 4 : 0;

  if (!mounted) return null;

  // --- RENDERING LANDING LOGIN SCREEN ---
  if (!boardId) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#0C0C0E] text-[#E4E4E7] font-sans antialiased px-4 py-12 selection:bg-[#8C6D58]/30">
        
        {/* Warm gold radial glow in the background */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[350px] bg-gradient-to-b from-[#8C6D58]/8 to-transparent pointer-events-none z-0 rounded-full blur-3xl"></div>

        <div className="w-full max-w-lg bg-[#141416] border border-[#232326] rounded-3xl shadow-2xl p-8 sm:p-10 relative z-10">
          
          <div className="flex flex-col items-center text-center gap-2.5 mb-8">
            <img src="/logo.png" alt="Coboard Logo" className="h-16 sm:h-20 object-contain mb-2 select-none pointer-events-none" />
            {error && (
              <div className="mt-4 p-3.5 bg-rose-950/20 border border-rose-900/60 text-rose-200 rounded-xl text-xs font-semibold flex items-center gap-2 animate-slide-in">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <div className="flex p-1 bg-[#1C1C1E] border border-[#27272A] rounded-xl mb-6">
            <button
              onClick={() => {
                setActiveForm("create");
                setError(null);
              }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                activeForm === "create" ? "bg-[#141416] text-[#8C6D58] shadow-sm border border-[#3C322B]" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Create a Board
            </button>
            <button
              onClick={() => {
                setActiveForm("join");
                setError(null);
              }}
              className={`flex-1 py-2.5 rounded-lg text-xs font-extrabold transition-all flex items-center justify-center gap-1.5 ${
                activeForm === "join" ? "bg-[#141416] text-[#8C6D58] shadow-sm border border-[#3C322B]" : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Join Board
            </button>
          </div>

          {activeForm === "create" ? (
            <form onSubmit={handleCreateBoard} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Your Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Krishna Agrawal"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#27272A] hover:border-[#323236] focus:border-[#8C6D58] text-[#E4E4E7] placeholder-zinc-500 transition-colors rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. krishna@coboard.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#27272A] hover:border-[#323236] focus:border-[#8C6D58] text-[#E4E4E7] placeholder-zinc-500 transition-colors rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Purpose of Board</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Willovate Sprint Release"
                  value={formPurpose}
                  onChange={(e) => setFormPurpose(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#27272A] hover:border-[#323236] focus:border-[#8C6D58] text-[#E4E4E7] placeholder-zinc-500 transition-colors rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#8C6D58] hover:bg-[#785C49] disabled:bg-[#3A322C] disabled:text-zinc-500 text-white font-extrabold text-xs py-3 rounded-xl transition-all shadow-md mt-6 flex items-center justify-center gap-1.5 select-none"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Create & Enter Board
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleJoinBoard} className="space-y-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Your Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Krishna Agrawal"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#27272A] hover:border-[#323236] focus:border-[#8C6D58] text-[#E4E4E7] placeholder-zinc-500 transition-colors rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. krishna@coboard.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full bg-[#1C1C1E] border border-[#27272A] hover:border-[#323236] focus:border-[#8C6D58] text-[#E4E4E7] placeholder-zinc-500 transition-colors rounded-xl px-4 py-2.5 text-sm font-semibold focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wider text-zinc-400">5-Character Board Code</label>
                <input
                  type="text"
                  required
                  maxLength={5}
                  placeholder="e.g. A3X9B"
                  value={formBoardId}
                  onChange={(e) => setFormBoardId(e.target.value.toUpperCase())}
                  className="w-full bg-[#1C1C1E] border border-[#27272A] hover:border-[#323236] focus:border-[#8C6D58] text-[#E4E4E7] placeholder-zinc-500 transition-colors rounded-xl px-4 py-2.5 text-sm font-mono tracking-widest focus:outline-none uppercase"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#8C6D58] hover:bg-[#785C49] disabled:bg-[#3A322C] disabled:text-zinc-500 text-white font-extrabold text-xs py-3 rounded-xl transition-all shadow-md mt-6 flex items-center justify-center gap-1.5 select-none"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    Join & Connect Board
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

        </div>
      </div>
    );
  }

  // --- RENDERING KANBAN BOARD VIEW (Coboard) ---
  return (
    <div className="min-h-screen flex flex-col bg-[#FDFCF9] text-[#2C2924] font-sans antialiased">
      
      {/* Dynamic Header (Dark theme to blend logo) */}
      <header className="border-b border-[#232326] bg-[#141416] sticky top-0 z-40 px-6 py-4 flex flex-col lg:flex-row justify-between items-center gap-4 shadow-md">
        
        {/* Board Title & Purpose info */}
        <div className="flex flex-col sm:flex-row items-center gap-4 w-full lg:w-auto">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Coboard Logo" className="h-10 object-contain select-none pointer-events-none mr-1" />
            <div>
              {/* Scaled up board purpose */}
              <h2 className="text-2xl font-extrabold tracking-tight text-white leading-tight select-none">
                {boardPurpose}
              </h2>
              
              {/* Copyable 5-Character Board Code */}
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider select-none">Board Code:</span>
                <span className="font-mono text-sm font-extrabold text-zinc-200 select-all bg-[#1C1C1E] px-2.5 py-0.5 rounded border border-[#27272A] tracking-widest uppercase shadow-inner">
                  {boardId}
                </span>
                <button
                  onClick={handleCopyBoardId}
                  className="p-1 hover:bg-[#1C1C1E] border border-[#27272A] rounded transition-all text-zinc-400 hover:text-[#8C6D58]"
                  title="Copy Board Code"
                >
                  {copiedId ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Clipboard className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto justify-end">
          
          {/* Active Members Avatars & Count */}
          {activeUsers.length > 0 && (
            <div className="flex items-center gap-3">
              {/* Stacked Avatars */}
              <div className="flex items-center -space-x-2.5">
                {visibleUsers.map((user) => {
                  const colors = [
                    "bg-amber-100 text-amber-805 border-amber-200",
                    "bg-emerald-100 text-emerald-800 border-emerald-200",
                    "bg-violet-100 text-violet-800 border-violet-200",
                    "bg-rose-100 text-rose-800 border-rose-200",
                    "bg-sky-100 text-sky-850 border-sky-200",
                    "bg-indigo-100 text-indigo-800 border-indigo-200",
                  ];
                  let hash = 0;
                  const str = user.email || "";
                  for (let i = 0; i < str.length; i++) {
                    hash = str.charCodeAt(i) + ((hash << 5) - hash);
                  }
                  const colorClass = colors[Math.abs(hash) % colors.length];

                  return (
                    <div
                      key={user.id}
                      className={`relative group/avatar w-8 h-8 rounded-full border-2 border-[#FAF8F2] flex items-center justify-center text-xs font-extrabold shadow-sm ${colorClass} cursor-default select-none`}
                    >
                      {user.initials}
                      
                      {/* Premium Tooltip */}
                      <div className="absolute top-10 left-1/2 -translate-x-1/2 hidden group-hover/avatar:flex flex-col bg-[#2C2924] text-white text-[10px] py-1.5 px-3 rounded-lg shadow-lg whitespace-nowrap z-50 border border-slate-700 font-semibold tracking-wide pointer-events-none select-none">
                        <span className="font-bold text-slate-100">{user.name}</span>
                        <span className="text-[9px] text-slate-400 font-medium">{user.email}</span>
                      </div>
                    </div>
                  );
                })}

                {remainingCount > 0 && (
                  <div className="relative w-8 h-8 rounded-full border-2 border-[#FAF8F2] bg-[#FAF4E5] flex items-center justify-center text-[10px] font-extrabold text-[#8C6D58] shadow-sm select-none cursor-default">
                    +{remainingCount}
                  </div>
                )}
              </div>

              {/* Green pulsing indicator with count */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-950/30 border border-emerald-900/50 text-xs font-extrabold text-emerald-400 select-none shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>
                  Online: <span className="font-extrabold text-emerald-250">{activeUsers.length}</span>
                </span>
              </div>
            </div>
          )}

          {/* Member badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2D2A24] border border-[#403B32] shadow-inner text-xs font-extrabold text-[#D9C4B1] select-none">
            <User className="w-4 h-4 text-[#8C6D58]" />
            <span>
              You: <span className="font-bold text-zinc-100">{userName}</span>
            </span>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-60">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search cards, tags..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1C1C1E] border border-[#27272A] hover:border-[#323236] focus:border-[#8C6D58] transition-colors rounded-xl py-2 pl-10 pr-4 text-xs font-semibold text-zinc-200 placeholder-zinc-500 focus:outline-none focus:bg-[#1C1C1E]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="w-4 h-4 flex items-center justify-center rounded-full bg-[#3A393D] hover:bg-[#4B494F] absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Action buttons: Split Exit Options */}
          <div className="flex gap-2 w-full sm:w-auto">
            {/* Leave Board Option (retains name & email in session) */}
            <button
              onClick={handleLeaveBoard}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 border border-rose-900/60 bg-rose-950/15 hover:bg-rose-950/30 hover:text-rose-200 hover:border-rose-800 transition-colors rounded-xl text-xs font-extrabold text-rose-400"
              title="Return to entrance screen but keep your name/email profile saved"
            >
              <ExternalLink className="w-4 h-4" />
              Leave Board
            </button>

            {/* Logout Option (completely wipes session) */}
            <button
              onClick={handleLogout}
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2 border border-rose-900/60 bg-rose-950/15 hover:bg-rose-950/30 hover:text-rose-200 hover:border-rose-800 transition-colors rounded-xl text-xs font-extrabold text-rose-400"
              title="Completely log out and clear your name/email credentials"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>

        </div>
      </header>

      {/* Main Kanban Space */}
      <main className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
        
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-[#8C6D58] animate-spin" />
            <p className="text-sm text-slate-500 font-semibold tracking-wider">Syncing board space...</p>
          </div>
        ) : (
          <div className="flex-1 flex items-start gap-6 overflow-x-auto pb-4 align-top">
            
            <DragDropContext onDragEnd={onDragEnd}>
              {columns.map((column) => (
                <div
                  key={column.id}
                  className="w-96 shrink-0 bg-[#F6F4EE]/90 border border-[#EAE3D5] rounded-2xl flex flex-col max-h-[75vh] shadow-sm"
                >
                  
                  {/* Column Header */}
                  <div className="p-4.5 flex items-center justify-between border-b border-[#EAE3D5]/60 bg-[#FAF8F3] rounded-t-2xl">
                    <h3 className="font-extrabold text-slate-800 tracking-tight text-sm uppercase">
                      {column.title}
                    </h3>
                    <span className="text-xs px-2.5 py-0.5 rounded-md bg-[#ECE6DC] font-extrabold text-slate-600 shadow-inner animate-fade-in">
                      {getFilteredCards(column.cards).length}
                    </span>
                  </div>

                  {/* Cards List Drop Area */}
                  <Droppable droppableId={column.id}>
                    {(provided, snapshot) => (
                      <div
                        {...provided.droppableProps}
                        ref={provided.innerRef}
                        className={`flex-1 p-3.5 overflow-y-auto space-y-3.5 min-h-[140px] transition-colors duration-200 ${
                          snapshot.isDraggingOver ? "bg-[#ECE6DC]/35" : ""
                        }`}
                      >
                        {getFilteredCards(column.cards).map((card, index) => (
                          <Draggable key={card.id} draggableId={card.id} index={index}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                {...provided.dragHandleProps}
                                onClick={() => openEditModal(card)}
                                // Scaled up font, margin, and padding for big readability
                                className={`p-5 bg-white rounded-xl border border-[#ECE6DC] hover:border-[#D9CEBA] transition-all shadow-sm group relative flex flex-col gap-3.5 cursor-pointer hover:shadow-md ${
                                  snapshot.isDragging ? "rotate-1 border-[#8C6D58] shadow-xl scale-[1.01]" : ""
                                }`}
                              >
                                {/* Card Title - Scaled to text-base / font-bold */}
                                <div className="flex items-start justify-between gap-3">
                                  <h4 className="font-extrabold text-base text-slate-800 tracking-tight leading-snug">
                                    {card.title}
                                  </h4>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeleteCard(card.id);
                                    }}
                                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#F6F4EE] rounded-md transition-all text-slate-400 hover:text-rose-500"
                                    title="Delete Card"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>

                                {/* Description - Scaled to text-sm */}
                                {card.description && (
                                  <p className="text-sm text-slate-500 leading-relaxed line-clamp-3">
                                    {card.description}
                                  </p>
                                )}

                                {/* Tags */}
                                {card.labels && (
                                  <div className="flex flex-wrap gap-1.5 mt-0.5 animate-fade-in">
                                    {renderLabelBadges(card.labels)}
                                  </div>
                                )}

                                {/* Card Footer - Scaled */}
                                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-400 font-bold select-none border-t border-slate-50 pt-2.5">
                                  <span className="font-mono text-[9px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                                    Rank: <span className="text-[#8C6D58] font-bold">{card.positionRank}</span>
                                  </span>
                                  {card.assignee && (
                                    <div className="flex items-center gap-1 animate-fade-in">
                                      <div className="w-6 h-6 rounded-full bg-[#8C6D58]/10 text-[#8C6D58] border border-[#8C6D58]/20 flex items-center justify-center text-[10px] font-extrabold shadow-inner">
                                        {card.assignee}
                                      </div>
                                    </div>
                                  )}
                                </div>

                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}

                        {column.cards.length === 0 && (
                          <div className="h-28 border border-dashed border-[#ECE6DC] rounded-xl flex items-center justify-center select-none">
                            <p className="text-xs text-slate-400 font-extrabold">No cards in column</p>
                          </div>
                        )}
                      </div>
                    )}
                  </Droppable>

                  {/* Add Card Footer */}
                  <div className="p-3.5 border-t border-[#EAE3D5]/40 bg-[#FAF8F3] rounded-b-2xl">
                    {addingCardColId === column.id ? (
                      <div className="flex flex-col gap-2 animate-fade-in">
                        <input
                          type="text"
                          autoFocus
                          placeholder="What needs to be done?"
                          value={newCardTitles[column.id] || ""}
                          onChange={(e) =>
                            setNewCardTitles((prev) => ({
                              ...prev,
                              [column.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCreateCard(column.id);
                            if (e.key === "Escape") setAddingCardColId(null);
                          }}
                          className="w-full bg-white border border-[#E2DBCF] rounded-xl px-4.5 py-2.5 text-sm text-[#2C2924] placeholder-slate-400 focus:outline-none focus:border-[#8C6D58]"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCreateCard(column.id)}
                            className="bg-[#8C6D58] hover:bg-[#785C49] text-white font-extrabold text-xs px-4 py-2 rounded-xl transition-colors shadow-sm"
                          >
                            Add Card
                          </button>
                          <button
                            onClick={() => setAddingCardColId(null)}
                            className="text-slate-400 hover:text-slate-650 font-extrabold text-xs px-3 py-2"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingCardColId(column.id)}
                        className="w-full py-2.5 hover:bg-[#ECE6DC]/60 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold text-slate-505 hover:text-slate-700 transition-colors border border-dashed border-[#ECE6DC]"
                      >
                        <Plus className="w-4 h-4" />
                        Create Card
                      </button>
                    )}
                  </div>

                </div>
              ))}
            </DragDropContext>

            {/* Create Column */}
            <div className="w-96 shrink-0">
              {isAddingColumn ? (
                <form
                  onSubmit={handleCreateColumn}
                  className="p-4.5 bg-[#F6F4EE]/90 border border-[#EAE3D5] rounded-2xl flex flex-col gap-3.5 shadow-sm animate-fade-in"
                >
                  <input
                    type="text"
                    autoFocus
                    placeholder="Column title..."
                    value={newColumnTitle}
                    onChange={(e) => setNewColumnTitle(e.target.value)}
                    className="w-full bg-white border border-[#E2DBCF] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#8C6D58] font-semibold"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="bg-[#8C6D58] hover:bg-[#785C49] text-white font-extrabold text-xs px-4 py-2.5 rounded-xl transition-colors shadow-sm"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingColumn(false);
                        setNewColumnTitle("");
                      }}
                      className="text-slate-400 hover:text-slate-650 font-extrabold text-xs px-3 py-2.5"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  onClick={() => setIsAddingColumn(true)}
                  className="w-full p-5 bg-[#F6F4EE]/40 hover:bg-[#F6F4EE]/80 border border-dashed border-[#EAE3D5] hover:border-[#D5CDBD] rounded-2xl flex items-center justify-center gap-2 text-sm font-extrabold text-slate-500 hover:text-slate-700 transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4 text-[#8C6D58]" />
                  Add Column
                </button>
              )}
            </div>

          </div>
        )}
      </main>

      {/* Edit Card Details Modal */}
      {editingCard && (
        <div className="fixed inset-0 z-50 bg-[#2C2924]/30 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#FAF8F3] border border-[#EAE3D5] rounded-2xl w-full max-w-lg shadow-2xl p-7 relative flex flex-col gap-5 animate-scale-up">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[#EAE3D5]/60 pb-3.5">
              <div className="flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-[#8C6D58]" />
                <h3 className="font-extrabold text-sm uppercase text-slate-800 tracking-wider">Edit Card Settings</h3>
              </div>
              <button
                onClick={() => setEditingCard(null)}
                className="p-1.5 hover:bg-[#ECE6DC] rounded-lg transition-colors text-slate-400 hover:text-slate-650"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Fields */}
            <div className="space-y-4.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Card Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full bg-white border border-[#E2DBCF] rounded-xl px-4 py-2.5 text-sm font-bold focus:outline-none focus:border-[#8C6D58]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Description</label>
                <textarea
                  value={editDesc}
                  rows={3}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Provide context for this card..."
                  className="w-full bg-white border border-[#E2DBCF] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#8C6D58]"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Tags / Labels</label>
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Comma-separated</span>
                </div>
                <input
                  type="text"
                  value={editLabels}
                  onChange={(e) => setEditLabels(e.target.value)}
                  placeholder="Bug, Frontend, High Priority"
                  className="w-full bg-white border border-[#E2DBCF] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#8C6D58] font-semibold"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase font-bold tracking-wide text-slate-500">Assignee Initials</label>
                <input
                  type="text"
                  value={editAssignee}
                  maxLength={2}
                  onChange={(e) => setEditAssignee(e.target.value.toUpperCase())}
                  placeholder="e.g. KA"
                  className="w-full bg-white border border-[#E2DBCF] rounded-xl px-4 py-2.5 text-sm font-mono uppercase focus:outline-none focus:border-[#8C6D58] font-bold"
                />
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 border-t border-[#EAE3D5]/60 pt-5 mt-2">
              <button
                onClick={() => setEditingCard(null)}
                className="px-5 py-2.5 text-xs font-extrabold text-slate-500 hover:text-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCardDetails}
                className="bg-[#8C6D58] hover:bg-[#785C49] text-white font-extrabold text-xs px-5 py-2.5 rounded-xl transition-colors shadow-sm"
              >
                Save Updates
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
