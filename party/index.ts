import type * as Party from "partykit/server";
import { onConnect } from "y-partykit";
import * as Y from "yjs";
import { createClient } from "@supabase/supabase-js";

export default class YjsPartyKitServer implements Party.Server {
  private lastSnapshot: any = null;
  private lastSaveTime = 0;
  private saveTimeoutId: any = null;

  constructor(readonly room: Party.Room) {}

  onRequest(req: Party.Request) {
    console.log(`📡 HTTP request to room ${this.room.id}:`, req.url);
    return new Response("PartyKit YJS Server is running", { status: 200 });
  }

  onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    // A websocket just connected!
    // console.log(
    //   `Connected:`,
    //   conn.id,
    //   "from",
    //   ctx.request.cf?.country,
    //   "in room",
    //   this.room.id
    // );

    // Let y-partykit handle the rest
    return onConnect(conn, this.room, {
      // Add any custom options here
      persist: { mode: "snapshot" }, // Enable persistence for better reliability
      callback: {
        handler: (ydoc: Y.Doc) => {
          // Set up document change listener for database saves
          ydoc.on("update", () => {
            this.scheduleSnapshot(ydoc);
          });
        },
      },
    });
  }

  private scheduleSnapshot(ydoc: Y.Doc) {
    // Debounce saves to avoid too frequent DB writes
    if (this.saveTimeoutId) {
      clearTimeout(this.saveTimeoutId);
    }

    this.saveTimeoutId = setTimeout(async () => {
      await this.saveSnapshot(ydoc);
    }, 2000); // Save 2 seconds after last change
  }

  private async saveSnapshot(ydoc: Y.Doc) {
    // console.log(`🚀 Starting saveSnapshot for room: ${this.room.id}`);
    try {
      const nodes = ydoc
        .getArray("nodes")
        .toArray()
        .map((yNode) => {
          const nodeJSON = (yNode as Y.Map<any>).toJSON();
          return {
            id: nodeJSON.id,
            type: nodeJSON.type,
            data: nodeJSON.data || {},
            position: {
              x: nodeJSON.position?.x || 0,
              y: nodeJSON.position?.y || 0,
            },
            style: nodeJSON.style,
            className: nodeJSON.className,
            sourcePosition: nodeJSON.sourcePosition,
            targetPosition: nodeJSON.targetPosition,
            hidden: nodeJSON.hidden,
            selected: nodeJSON.selected,
            dragging: nodeJSON.dragging,
            draggable: nodeJSON.draggable,
            selectable: nodeJSON.selectable,
            connectable: nodeJSON.connectable,
            deletable: nodeJSON.deletable,
            focusable: nodeJSON.focusable,
            zIndex: nodeJSON.zIndex,
            ...nodeJSON,
          };
        });

      const edges = ydoc
        .getArray("edges")
        .toArray()
        .map((yEdge) => {
          const edgeJSON = (yEdge as Y.Map<any>).toJSON();
          return {
            id: edgeJSON.id,
            source: edgeJSON.source,
            target: edgeJSON.target,
            type: edgeJSON.type,
            style: edgeJSON.style,
            animated: edgeJSON.animated,
            label: edgeJSON.label,
            ...edgeJSON,
          };
        });

      const snapshot = { nodes, edges };

      // Only save if content actually changed
      if (JSON.stringify(snapshot) !== JSON.stringify(this.lastSnapshot)) {
        console.log(`💾 Saving snapshot for room ${this.room.id}:`, {
          nodes: nodes.length,
          edges: edges.length,
        });

        // Extract project ID from room name
        const projectId = this.room.id.replace("tersa-project-", "");

        // console.log(`🔍 Attempting to update project: ${projectId}`);
        // console.log(
        //   `📊 Snapshot size: ${JSON.stringify(snapshot).length} chars`
        // );

        // Use Supabase client (HTTP-based, edge-compatible)
        // console.log("🌐 Saving via Supabase client...");
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_ANON_KEY!
        );

        const { data, error } = await supabase
          .from("project")
          .update({
            content: snapshot,
            updated_at: new Date().toISOString(),
          })
          .eq("id", projectId)
          .select();

        if (error) {
          throw new Error(`Supabase error: ${error.message}`);
        }

        if (!data || data.length === 0) {
          console.error(`❌ No project found with ID: ${projectId}`);
        } else {
          // console.log("✅ Snapshot saved via Supabase:", data);
          this.lastSnapshot = snapshot;
          this.lastSaveTime = Date.now();
        }
      }
    } catch (error) {
      console.error(`❌ Error saving snapshot:`, error);
    }
  }
}
