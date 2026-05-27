import { useEffect, useRef, useState } from "react";

export type SSEConnectionState = "connecting" | "connected" | "disconnected";

export function useSSE(
  boardId: string,
  userName: string,
  userEmail: string,
  onEvent: (event: string, data: any) => void
) {
  const [connectionState, setConnectionState] = useState<SSEConnectionState>("disconnected");
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!boardId) return;

    // Generate a persistent client ID for this session
    let clientId = sessionStorage.getItem("syncboard_client_id");
    if (!clientId) {
      clientId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem("syncboard_client_id", clientId);
    }

    const connect = () => {
      setConnectionState("connecting");
      
      const serverUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
      const nameParam = encodeURIComponent(userName || "");
      const emailParam = encodeURIComponent(userEmail || "");
      // Pass the boardId to isolate real-time event scopes and name/email for presence tracking
      const es = new EventSource(`${serverUrl}/api/events?clientId=${clientId}&boardId=${boardId}&name=${nameParam}&email=${emailParam}`);
      eventSourceRef.current = es;

      es.addEventListener("open", () => {
        setConnectionState("connected");
        console.log(`SSE Connection established for Board: ${boardId}`);
      });

      es.addEventListener("message", (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (parsed && parsed.event && parsed.data) {
            onEvent(parsed.event, parsed.data);
          }
        } catch (err) {
          console.error("Error parsing SSE event data:", err);
        }
      });

      es.addEventListener("error", (err) => {
        console.error("SSE Connection error:", err);
        setConnectionState("disconnected");
        es.close();

        // Attempt reconnection after a delay
        setTimeout(() => {
          connect();
        }, 5000);
      });
    };

    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [boardId, userName, userEmail, onEvent]); // Re-connect if boardId, name, or email changes

  return {
    connectionState,
    clientId: typeof window !== "undefined" ? sessionStorage.getItem("syncboard_client_id") : null,
  };
}
