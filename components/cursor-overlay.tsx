"use client";

import { useYjsAwareness, UserContext } from "./canvas";
import {
  Cursor,
  CursorPointer,
  CursorBody,
  CursorName,
} from "./ui/kibo-ui/cursor";
import { PerfectCursor } from "perfect-cursors";
import throttle from "lodash.throttle";
import {
  useEffect,
  useState,
  useCallback,
  useRef,
  useLayoutEffect,
  useContext,
} from "react";
import { useReactFlow } from "@xyflow/react";
import * as Y from "yjs";

// Constants for cursor behavior
const THROTTLE_DURATION = 8; // 16ms = ~60fps
const MAX_INTERVAL = 16; // PerfectCursor max interval

interface UserCursor {
  x: number;
  y: number;
  user: {
    name: string;
    id: string;
    color: string;
  };
}

const colors = [
  "#E53E3E",
  "#D53F8C",
  "#9F7AEA",
  "#667EEA",
  "#3182CE",
  "#00A3C4",
  "#00A896",
  "#38A169",
  "#D69E2E",
  "#DD6B20",
];

export const CursorOverlay = () => {
  const awareness = useYjsAwareness();

  // Use useContext directly to avoid throwing an error if user data is not available
  const currentUser = useContext(UserContext);

  // Don't render if user data is not available
  if (!currentUser) {
    return null;
  }
  const { screenToFlowPosition, flowToScreenPosition } = useReactFlow();
  const [cursors, setCursors] = useState<Record<string, UserCursor>>({});

  // Generate color based on user ID for consistency
  const userColor = colors[currentUser.id.charCodeAt(0) % colors.length];

  // Throttled function to update cursor position in awareness
  const updateCursorPosition = useCallback(
    throttle((screenX: number, screenY: number) => {
      if (!awareness) return;

      // Convert screen coordinates to flow coordinates
      const flowPosition = screenToFlowPosition({
        x: screenX,
        y: screenY,
      });

      // Update awareness with new position
      awareness.setLocalStateField("cursor", {
        x: flowPosition.x,
        y: flowPosition.y,
      });
    }, THROTTLE_DURATION),
    [awareness, screenToFlowPosition]
  );

  useEffect(() => {
    if (!awareness || !currentUser) return;

    // Set local user info using real user data
    awareness.setLocalStateField("user", {
      name: currentUser.name,
      id: currentUser.id,
      color: userColor,
    });

    // Listen for awareness changes
    const handleAwarenessChange = () => {
      const states = awareness.getStates();
      const newCursors: Record<string, UserCursor> = {};

      states.forEach((state: any, clientId: number) => {
        if (clientId === awareness.clientID) return; // Skip own cursor

        if (state.cursor && state.user) {
          const clientIdStr = clientId.toString();
          newCursors[clientIdStr] = {
            x: state.cursor.x,
            y: state.cursor.y,
            user: state.user,
          };
        }
      });

      setCursors(newCursors);
    };

    awareness.on("change", handleAwarenessChange);

    return () => {
      awareness.off("change", handleAwarenessChange);
    };
  }, [awareness, currentUser, userColor]);

  // Handle mouse movement with throttling
  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      updateCursorPosition(event.clientX, event.clientY);
    };

    const handleMouseLeave = () => {
      if (awareness) {
        awareness.setLocalStateField("cursor", null);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [updateCursorPosition, awareness]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      {Object.entries(cursors).map(([clientId, cursor]) => {
        // Convert flow coordinates back to screen coordinates for display
        const screenPos = flowToScreenPosition({ x: cursor.x, y: cursor.y });

        return (
          <RemoteCursor
            key={clientId}
            x={screenPos.x}
            y={screenPos.y}
            user={cursor.user}
          />
        );
      })}
    </div>
  );
};

interface RemoteCursorProps {
  x: number;
  y: number;
  user: {
    name: string;
    id: string;
    color: string;
  };
}

const RemoteCursor = ({ x, y, user }: RemoteCursorProps) => {
  const cursorRef = useRef<HTMLDivElement>(null);

  // Animate cursor callback
  const animateCursor = useCallback((point: number[]) => {
    const elm = cursorRef.current;
    if (!elm) return;
    elm.style.setProperty(
      "transform",
      `translate(${point[0]}px, ${point[1]}px)`
    );
  }, []);

  // Create PerfectCursor instance
  const [pc] = useState(() => new PerfectCursor(animateCursor));

  // Set MAX_INTERVAL on mount
  useLayoutEffect(() => {
    PerfectCursor.MAX_INTERVAL = MAX_INTERVAL;
  }, []);

  // Add points when position changes
  useLayoutEffect(() => {
    pc.addPoint([x, y]);
    return () => pc.dispose();
  }, [pc, x, y]);

  return (
    <div
      ref={cursorRef}
      style={{
        position: "absolute",
        top: -2,
        left: -2,
        color: user.color,
        zIndex: 9999,
        pointerEvents: "none",
      }}
    >
      <Cursor>
        <CursorPointer />
        <CursorBody>
          <CursorName>{user.name}</CursorName>
        </CursorBody>
      </Cursor>
    </div>
  );
};
