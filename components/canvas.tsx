"use client";

import { useAnalytics } from "@/hooks/use-analytics";
import { isValidSourceTarget } from "@/lib/xyflow";
import { NodeDropzoneProvider } from "@/providers/node-dropzone";
import { NodeOperationsProvider } from "@/providers/node-operations";
import { useProject } from "@/providers/project";
import {
  Background,
  type FinalConnectionState,
  ReactFlow,
  ReactFlowProvider,
  type ReactFlowProps,
  getOutgoers,
  useReactFlow,
} from "@xyflow/react";
import {
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type Position,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { BoxSelectIcon, PlusIcon } from "lucide-react";
import { nanoid } from "nanoid";
import type { MouseEventHandler } from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useHotkeys } from "react-hotkeys-hook";
import * as Y from "yjs";
import YPartyKitProvider from "y-partykit/provider";
import { ConnectionLine } from "./connection-line";
import { CursorOverlay } from "./cursor-overlay";
import { edgeTypes } from "./edges";
import { nodeTypes } from "./nodes";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";

// Create a context for sharing the Y.Doc and awareness with text nodes
interface YjsContextType {
  ydoc: Y.Doc | null;
  awareness: any | null;
}

interface UserData {
  id: string;
  name: string;
  email: string;
}

export const YjsContext = createContext<YjsContextType>({
  ydoc: null,
  awareness: null,
});

export const UserContext = createContext<UserData | null>(null);

export const useYjsDoc = () => {
  const context = useContext(YjsContext);
  return context.ydoc;
};

export const useYjsAwareness = () => {
  const context = useContext(YjsContext);
  if (!context) {
    throw new Error("useYjsAwareness must be used within a YjsProvider");
  }
  return context.awareness;
};

export const useCurrentUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useCurrentUser must be used within a UserProvider");
  }
  return context;
};

// New hook to get current collaborative users
export const useCollaborativeUsers = () => {
  const awareness = useYjsAwareness();
  const currentUser = useCurrentUser();
  const [users, setUsers] = useState<
    Array<{
      id: string;
      name: string;
      color: string;
      clientId: number;
    }>
  >([]);

  useEffect(() => {
    if (!awareness) return;

    const handleAwarenessChange = () => {
      const states = awareness.getStates();
      const collaborativeUsers: Array<{
        id: string;
        name: string;
        color: string;
        clientId: number;
      }> = [];

      states.forEach((state: any, clientId: number) => {
        if (state.user) {
          collaborativeUsers.push({
            id: state.user.id,
            name: state.user.name,
            color: state.user.color,
            clientId,
          });
        }
      });

      setUsers(collaborativeUsers);
    };

    awareness.on("change", handleAwarenessChange);
    // Call once to get initial state
    handleAwarenessChange();

    return () => {
      awareness.off("change", handleAwarenessChange);
    };
  }, [awareness]);

  return users;
};

const yMapToReactFlowNode = (yNodeMap: Y.Map<any>): Node => {
  const nodeJSON = yNodeMap.toJSON();
  return {
    id:
      nodeJSON.id || `generated-id-${Math.random().toString(36).substr(2, 9)}`,
    type: nodeJSON.type,
    data: nodeJSON.data || {},
    position: {
      x: nodeJSON.position?.x || 0,
      y: nodeJSON.position?.y || 0,
    },
    style: nodeJSON.style,
    className: nodeJSON.className,
    sourcePosition: nodeJSON.sourcePosition as Position | undefined,
    targetPosition: nodeJSON.targetPosition as Position | undefined,
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
};

const yMapToReactFlowEdge = (yEdgeMap: Y.Map<any>): Edge => {
  const edgeJSON = yEdgeMap.toJSON();
  return {
    id:
      edgeJSON.id ||
      `generated-edge-id-${Math.random().toString(36).substr(2, 9)}`,
    source: edgeJSON.source,
    target: edgeJSON.target,
    type: edgeJSON.type,
    style: edgeJSON.style,
    animated: edgeJSON.animated,
    label: edgeJSON.label,
    ...edgeJSON,
  };
};

const reactFlowNodeToYMap = (node: Node) => {
  const yNodeMap = new Y.Map();
  Object.entries(node).forEach(([key, value]) => {
    if ((key === "data" || key === "position") && typeof value === "object") {
      const nestedMap = new Y.Map();
      if (value) {
        Object.entries(value as object).forEach(([k, v]) =>
          nestedMap.set(k, v)
        );
      }
      yNodeMap.set(key, nestedMap);
    } else {
      yNodeMap.set(key, value);
    }
  });
  return yNodeMap;
};

const reactFlowEdgeToYMap = (edge: Edge) => {
  const yEdgeMap = new Y.Map();
  Object.entries(edge).forEach(([key, value]) => {
    yEdgeMap.set(key, value);
  });
  return yEdgeMap;
};

interface CanvasProps extends ReactFlowProps {
  userData?: UserData;
}

export const Canvas = ({ userData, ...props }: CanvasProps) => {
  return (
    <ReactFlowProvider>
      <ProjectCanvas userData={userData} {...props} />
    </ReactFlowProvider>
  );
};

const ProjectCanvas = ({ children, userData, ...props }: CanvasProps) => {
  const project = useProject();
  const {
    onConnect,
    onConnectStart,
    onConnectEnd,
    onEdgesChange,
    onNodesChange,
    nodes: initialNodes,
    edges: initialEdges,
    ...rest
  } = props ?? {};
  const content = project?.content as { nodes: Node[]; edges: Edge[] };

  const [nodes, setNodes] = useState<Node[]>(content?.nodes ?? []);
  const [edges, setEdges] = useState<Edge[]>(content?.edges ?? []);
  const [copiedNodes, setCopiedNodes] = useState<Node[]>([]);
  const {
    getEdges,
    toObject,
    screenToFlowPosition,
    getNodes,
    getNode,
    updateNode,
  } = useReactFlow();
  const analytics = useAnalytics();

  const ydocRef = useRef<Y.Doc | null>(null);
  const yNodesRef = useRef<Y.Array<Y.Map<any>> | null>(null);
  const yEdgesRef = useRef<Y.Array<Y.Map<any>> | null>(null);
  const providerRef = useRef<YPartyKitProvider | null>(null);
  const awarenessRef = useRef<any>(null);
  const isUpdatingFromYjs = useRef(false);
  const contentRef = useRef(content);
  const hasInitialized = useRef(false);
  const lastKnownNodesLength = useRef(0);
  const lastKnownEdgesLength = useRef(0);
  contentRef.current = content;

  // Removed save function - PartyKit server now handles all database writes

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    yNodesRef.current = ydoc.getArray<Y.Map<any>>("nodes");
    yEdgesRef.current = ydoc.getArray<Y.Map<any>>("edges");

    if (!project) return;
    const ROOM_NAME = `tersa-project-${project.id}`;

    // Configure PartyKit provider for reliable real-time collaboration
    const PARTYKIT_HOST =
      process.env.NODE_ENV === "development"
        ? "127.0.0.1:1999" // Local development server
        : "tersa-collaboration.matserdkamp.partykit.dev"; // Deployed PartyKit server

    providerRef.current = new YPartyKitProvider(
      PARTYKIT_HOST,
      ROOM_NAME,
      ydoc,
      {
        connect: true,
      }
    );
    const provider = providerRef.current;
    awarenessRef.current = provider.awareness;

    // Debug logging
    // console.log(`🚀 Joining PartyKit room: ${ROOM_NAME}`);
    // console.log(`🌐 PartyKit Host: ${PARTYKIT_HOST} (${process.env.NODE_ENV})`);
    // console.log(`👤 Client ID: ${ydoc.clientID}`);
    // console.log(`🏠 Project Owner: ${project?.userId}`);
    // console.log(`📋 Project Members:`, project?.members);

    // provider.on("status", (event: any) => {
    //   console.log(`📡 PartyKit Status:`, event);
    // });

    // provider.on("sync", (isSynced: boolean) => {
    //   console.log(`🔄 PartyKit synced:`, isSynced);
    // });

    // provider.on("connection-error", (error: any) => {
    //   console.error(`❌ PartyKit Connection Error:`, error);
    // });

    // provider.on("connection-close", (event: any) => {
    //   console.warn(`🔌 PartyKit Connection Closed:`, event);
    // });

    // console.log(`🔌 PartyKit provider connecting...`);

    const yjsNodesObserver = (
      events: Y.YEvent<any>[],
      transaction: Y.Transaction
    ) => {
      // console.log(
      //   `🔄 Nodes update received from client: ${transaction.origin}, my client: ${ydocRef.current?.clientID}`
      // );

      if (
        !yNodesRef.current ||
        transaction.origin === ydocRef.current?.clientID
      )
        return;

      // Prevent wiping canvas if YJS suddenly becomes empty and we had content before
      const newLength = yNodesRef.current.length;
      const hadContent = lastKnownNodesLength.current > 0;
      const becomingEmpty = newLength === 0;

      if (becomingEmpty && hadContent && hasInitialized.current) {
        console.warn(
          "YJS nodes array became empty, ignoring update to prevent data loss"
        );
        return;
      }

      isUpdatingFromYjs.current = true;
      setNodes(yNodesRef.current.toArray().map(yMapToReactFlowNode));
      lastKnownNodesLength.current = newLength;
      requestAnimationFrame(() => {
        isUpdatingFromYjs.current = false;
      });
    };

    const yjsEdgesObserver = (
      events: Y.YEvent<any>[],
      transaction: Y.Transaction
    ) => {
      // console.log(
      //   `🔗 Edges update received from client: ${transaction.origin}, my client: ${ydocRef.current?.clientID}`
      // );

      if (
        !yEdgesRef.current ||
        transaction.origin === ydocRef.current?.clientID
      )
        return;

      // Prevent wiping canvas if YJS suddenly becomes empty and we had content before
      const newLength = yEdgesRef.current.length;
      const hadContent = lastKnownEdgesLength.current > 0;
      const becomingEmpty = newLength === 0;

      if (becomingEmpty && hadContent && hasInitialized.current) {
        console.warn(
          "YJS edges array became empty, ignoring update to prevent data loss"
        );
        return;
      }

      isUpdatingFromYjs.current = true;
      setEdges(yEdgesRef.current.toArray().map(yMapToReactFlowEdge));
      lastKnownEdgesLength.current = newLength;
      requestAnimationFrame(() => {
        isUpdatingFromYjs.current = false;
      });
    };

    yNodesRef.current.observeDeep(yjsNodesObserver);
    yEdgesRef.current.observeDeep(yjsEdgesObserver);

    provider.on("synced", (event: { synced: boolean }) => {
      if (event.synced && yNodesRef.current && yEdgesRef.current) {
        if (
          yNodesRef.current.length === 0 &&
          yEdgesRef.current.length === 0 &&
          !hasInitialized.current
        ) {
          const currentContent = contentRef.current;
          const initialContentNodes =
            initialNodes ?? currentContent?.nodes ?? [];
          const initialContentEdges =
            initialEdges ?? currentContent?.edges ?? [];

          if (
            initialContentNodes.length > 0 ||
            initialContentEdges.length > 0
          ) {
            ydoc.transact(() => {
              initialContentNodes.forEach((node) => {
                yNodesRef.current!.push([reactFlowNodeToYMap(node)]);
              });
              initialContentEdges.forEach((edge) => {
                yEdgesRef.current!.push([reactFlowEdgeToYMap(edge)]);
              });
            }, ydocRef.current?.clientID);
          }
        }

        // Only set state if arrays are not null and we're not preventing a wipe
        if (yNodesRef.current && yEdgesRef.current) {
          const nodesLength = yNodesRef.current.length;
          const edgesLength = yEdgesRef.current.length;

          // Don't update if YJS is empty but we have content and are already initialized
          const shouldPreventNodesUpdate =
            nodesLength === 0 &&
            lastKnownNodesLength.current > 0 &&
            hasInitialized.current;
          const shouldPreventEdgesUpdate =
            edgesLength === 0 &&
            lastKnownEdgesLength.current > 0 &&
            hasInitialized.current;

          if (!shouldPreventNodesUpdate) {
            setNodes(yNodesRef.current.toArray().map(yMapToReactFlowNode));
            lastKnownNodesLength.current = nodesLength;
          }

          if (!shouldPreventEdgesUpdate) {
            setEdges(yEdgesRef.current.toArray().map(yMapToReactFlowEdge));
            lastKnownEdgesLength.current = edgesLength;
          }
        }

        hasInitialized.current = true;
      }
    });

    return () => {
      provider.disconnect();
      if (yNodesRef.current) yNodesRef.current.unobserveDeep(yjsNodesObserver);
      if (yEdgesRef.current) yEdgesRef.current.unobserveDeep(yjsEdgesObserver);
      ydoc.destroy();
    };
  }, [project, initialNodes, initialEdges]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      if (isUpdatingFromYjs.current) {
        setNodes((nds) => applyNodeChanges(changes, nds));
        return;
      }

      setNodes((current) => applyNodeChanges(changes, current));
      onNodesChange?.(changes);

      if (ydocRef.current && yNodesRef.current) {
        // console.log(
        //   `📤 Sending nodes change from client: ${ydocRef.current.clientID}`
        // );
        ydocRef.current.transact(() => {
          changes.forEach((change) => {
            if (change.type === "position" && change.position) {
              const yNode = yNodesRef.current
                ?.toArray()
                .find((n) => n.get("id") === change.id);
              if (yNode) {
                const posMap = yNode.get("position") as Y.Map<number>;
                posMap.set("x", change.position!.x);
                posMap.set("y", change.position!.y);
                if (change.dragging !== undefined) {
                  yNode.set("dragging", change.dragging);
                }
              }
            } else if (change.type === "remove") {
              const nodeIndex = yNodesRef.current
                ?.toArray()
                .findIndex((n) => n.get("id") === change.id);
              if (
                typeof nodeIndex === "number" &&
                nodeIndex !== -1 &&
                yNodesRef.current
              ) {
                yNodesRef.current.delete(nodeIndex, 1);
              }
            } else if (change.type === "add") {
              yNodesRef.current?.push([reactFlowNodeToYMap(change.item)]);
            } else if (change.type === "select") {
              const yNode = yNodesRef.current
                ?.toArray()
                .find((n) => n.get("id") === change.id);
              if (yNode) {
                yNode.set("selected", change.selected);
              }
            } else if (change.type === "replace") {
              // Handle replace type changes
              const yNode = yNodesRef.current
                ?.toArray()
                .find((n) => n.get("id") === change.id);
              if (yNode && change.item) {
                // Replace the entire node
                const nodeIndex = yNodesRef.current
                  ?.toArray()
                  .findIndex((n) => n.get("id") === change.id);
                if (
                  typeof nodeIndex === "number" &&
                  nodeIndex !== -1 &&
                  yNodesRef.current
                ) {
                  yNodesRef.current.delete(nodeIndex, 1);
                  yNodesRef.current.insert(nodeIndex, [
                    reactFlowNodeToYMap(change.item),
                  ]);
                }
              }
            }
          });

          // Update our tracking of nodes length
          lastKnownNodesLength.current = yNodesRef.current!.length;
        }, ydocRef.current.clientID);
      }
    },
    [onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      if (isUpdatingFromYjs.current) {
        setEdges((eds) => applyEdgeChanges(changes, eds));
        return;
      }
      setEdges((current) => applyEdgeChanges(changes, current));
      onEdgesChange?.(changes);

      if (ydocRef.current && yEdgesRef.current) {
        ydocRef.current.transact(() => {
          changes.forEach((change) => {
            if (change.type === "remove") {
              const edgeIndex = yEdgesRef.current
                ?.toArray()
                .findIndex((e) => e.get("id") === change.id);
              if (
                typeof edgeIndex === "number" &&
                edgeIndex !== -1 &&
                yEdgesRef.current
              ) {
                yEdgesRef.current.delete(edgeIndex, 1);
              }
            } else if (change.type === "add") {
              yEdgesRef.current?.push([reactFlowEdgeToYMap(change.item)]);
            }
          });

          // Update our tracking of edges length
          lastKnownEdgesLength.current = yEdgesRef.current!.length;
        }, ydocRef.current.clientID);
      }
    },
    [onEdgesChange]
  );

  const handleConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: nanoid(),
        type: "animated",
        ...connection,
      };

      setEdges((eds) => eds.concat(newEdge));

      if (ydocRef.current && yEdgesRef.current) {
        const yEdgeMap = reactFlowEdgeToYMap(newEdge);
        ydocRef.current.transact(() => {
          yEdgesRef.current?.push([yEdgeMap]);
        }, ydocRef.current.clientID);
      }
      onConnect?.(connection);
    },
    [onConnect, setEdges]
  );

  const updateNodeData = useCallback(
    (nodeId: string, data: any) => {
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id === nodeId) {
            return { ...n, data: { ...n.data, ...data } };
          }
          return n;
        })
      );

      if (ydocRef.current && yNodesRef.current) {
        ydocRef.current.transact(() => {
          const yNode = yNodesRef.current
            ?.toArray()
            .find((n) => n.get("id") === nodeId);
          if (yNode) {
            const dataMap = yNode.get("data") as Y.Map<any>;
            if (dataMap) {
              Object.entries(data).forEach(([key, value]) => {
                dataMap.set(key, value);
              });
            }
          }
        }, ydocRef.current.clientID);
      }
    },
    [setNodes]
  );

  const addNode = useCallback(
    (type: string, options?: Record<string, unknown>) => {
      const { data: nodeData, ...rest } = options ?? {};
      const newNode: Node = {
        id: nanoid(),
        type,
        data: {
          ...(nodeData ? nodeData : {}),
        },
        position: { x: 0, y: 0 },
        origin: [0, 0.5],
        ...rest,
      };

      setNodes((nds) => nds.concat(newNode));

      if (ydocRef.current && yNodesRef.current) {
        const yNodeMap = reactFlowNodeToYMap(newNode);
        ydocRef.current.transact(() => {
          yNodesRef.current?.push([yNodeMap]);
        }, ydocRef.current.clientID);
      }

      analytics.track("toolbar", "node", "added", {
        type,
      });

      return newNode.id;
    },
    [analytics, setNodes]
  );

  const duplicateNode = useCallback(
    (id: string) => {
      const node = getNode(id);

      if (!node || !node.type) {
        return;
      }

      const { id: oldId, ...rest } = node;

      const newId = addNode(node.type, {
        ...rest,
        position: {
          x: node.position.x + 200,
          y: node.position.y + 200,
        },
        selected: true,
      });

      setTimeout(() => {
        updateNode(id, { selected: false });
        updateNode(newId, { selected: true });
      }, 0);

      if (ydocRef.current && yEdgesRef.current) {
        const newEdge: Edge = {
          id: nanoid(),
          source: oldId,
          target: newId,
          type: "temporary",
        };

        setEdges((eds) => eds.concat(newEdge));

        ydocRef.current.transact(() => {
          yEdgesRef.current?.push([reactFlowEdgeToYMap(newEdge)]);
        }, ydocRef.current.clientID);
      }
    },
    [addNode, getNode, updateNode, setEdges]
  );

  const handleConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, connectionState: FinalConnectionState) => {
      // when a connection is dropped on the pane it's not valid

      if (!connectionState.isValid) {
        // we need to remove the wrapper bounds, in order to get the correct position
        const { clientX, clientY } =
          "changedTouches" in event ? event.changedTouches[0] : event;

        const sourceId = connectionState.fromNode?.id;
        const isSourceHandle = connectionState.fromHandle?.type === "source";

        if (!sourceId) {
          return;
        }

        const newNodeId = addNode("drop", {
          position: screenToFlowPosition({ x: clientX, y: clientY }),
          data: {
            isSource: !isSourceHandle,
          },
        });

        const newEdge: Edge = {
          id: nanoid(),
          source: isSourceHandle ? sourceId : newNodeId,
          target: isSourceHandle ? newNodeId : sourceId,
          type: "temporary",
        };

        setEdges((eds) => eds.concat(newEdge));

        if (ydocRef.current && yEdgesRef.current) {
          ydocRef.current.transact(() => {
            yEdgesRef.current?.push([reactFlowEdgeToYMap(newEdge)]);
          }, ydocRef.current.clientID);
        }
      }
    },
    [addNode, screenToFlowPosition, setEdges]
  );

  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      // we are using getNodes and getEdges helpers here
      // to make sure we create isValidConnection function only once
      const nodes = getNodes();
      const edges = getEdges();
      const target = nodes.find((node) => node.id === connection.target);

      // Prevent connecting audio nodes to anything except transcribe nodes
      if (connection.source) {
        const source = nodes.find((node) => node.id === connection.source);

        if (!source || !target) {
          return false;
        }

        const valid = isValidSourceTarget(source, target);

        if (!valid) {
          return false;
        }
      }

      // Prevent cycles
      const hasCycle = (node: Node, visited = new Set<string>()) => {
        if (visited.has(node.id)) {
          return false;
        }

        visited.add(node.id);

        for (const outgoer of getOutgoers(node, nodes, edges)) {
          if (outgoer.id === connection.source || hasCycle(outgoer, visited)) {
            return true;
          }
        }
      };

      if (!target || target.id === connection.source) {
        return false;
      }

      return !hasCycle(target);
    },
    [getNodes, getEdges]
  );

  const handleConnectStart = useCallback(() => {
    setNodes((nds) => nds.filter((n) => n.type !== "drop"));
    setEdges((eds) => eds.filter((e) => e.type !== "temporary"));
    if (ydocRef.current && yNodesRef.current && yEdgesRef.current) {
      ydocRef.current.transact(() => {
        const nodesToDelete = yNodesRef
          .current!.toArray()
          .map((n, i) => (n.get("type") === "drop" ? i : -1))
          .filter((i) => i !== -1)
          .reverse();

        nodesToDelete.forEach((i) => {
          if (i !== -1) yNodesRef.current?.delete(i, 1);
        });

        const edgesToDelete = yEdgesRef
          .current!.toArray()
          .map((e, i) => (e.get("type") === "temporary" ? i : -1))
          .filter((i) => i !== -1)
          .reverse();

        edgesToDelete.forEach((i) => {
          if (i !== -1) yEdgesRef.current?.delete(i, 1);
        });
      }, ydocRef.current.clientID);
    }
  }, [setNodes, setEdges]);

  const addDropNode = useCallback<MouseEventHandler<HTMLDivElement>>(
    (event) => {
      if (!(event.target instanceof HTMLElement)) {
        return;
      }

      const { x, y } = screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addNode("drop", {
        position: { x, y },
      });
    },
    [addNode, screenToFlowPosition]
  );

  const handleSelectAll = useCallback(() => {
    setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
    if (ydocRef.current && yNodesRef.current) {
      ydocRef.current.transact(() => {
        yNodesRef.current?.forEach((node) => {
          node.set("selected", true);
        });
      }, ydocRef.current.clientID);
    }
  }, [setNodes]);

  const handleCopy = useCallback(() => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    if (selectedNodes.length > 0) {
      setCopiedNodes(selectedNodes);
    }
  }, [getNodes]);

  const handlePaste = useCallback(() => {
    if (copiedNodes.length === 0) {
      return;
    }

    const newNodes = copiedNodes.map((node) => ({
      ...node,
      id: nanoid(),
      position: {
        x: node.position.x + 200,
        y: node.position.y + 200,
      },
      selected: true,
    }));

    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      ...newNodes,
    ]);

    if (ydocRef.current && yNodesRef.current) {
      ydocRef.current.transact(() => {
        newNodes.forEach((node) => {
          yNodesRef.current?.push([reactFlowNodeToYMap(node)]);
        });
      }, ydocRef.current.clientID);
    }
  }, [copiedNodes, setNodes]);

  const handleDuplicateAll = useCallback(() => {
    const selected = getNodes().filter((node) => node.selected);

    for (const node of selected) {
      duplicateNode(node.id);
    }
  }, [getNodes, duplicateNode]);

  useHotkeys("meta+a", handleSelectAll, {
    enableOnContentEditable: false,
    preventDefault: true,
  });

  useHotkeys("meta+d", handleDuplicateAll, {
    enableOnContentEditable: false,
    preventDefault: true,
  });

  useHotkeys("meta+c", handleCopy, {
    enableOnContentEditable: false,
    preventDefault: true,
  });

  useHotkeys("meta+v", handlePaste, {
    enableOnContentEditable: false,
    preventDefault: true,
  });

  return (
    <NodeOperationsProvider
      addNode={addNode}
      duplicateNode={duplicateNode}
      updateNodeData={updateNodeData}
    >
      <YjsContext.Provider
        value={{ ydoc: ydocRef.current, awareness: awarenessRef.current }}
      >
        <UserContext.Provider value={userData || null}>
          <NodeDropzoneProvider>
            <ContextMenu>
              <ContextMenuTrigger>
                <ReactFlow
                  deleteKeyCode={["Backspace", "Delete"]}
                  nodes={nodes}
                  onNodesChange={handleNodesChange}
                  edges={edges}
                  onEdgesChange={handleEdgesChange}
                  onConnectStart={handleConnectStart}
                  onConnect={handleConnect}
                  onConnectEnd={handleConnectEnd}
                  nodeTypes={nodeTypes}
                  edgeTypes={edgeTypes}
                  isValidConnection={isValidConnection}
                  connectionLineComponent={ConnectionLine}
                  panOnScroll
                  fitView
                  zoomOnDoubleClick={false}
                  panOnDrag={false}
                  selectionOnDrag={true}
                  onDoubleClick={addDropNode}
                  {...rest}
                >
                  <div
                    style={{
                      position: "absolute",
                      bottom: 10,
                      left: 10,
                      zIndex: 100,
                      background: "rgba(255, 255, 255, 0.8)",
                      padding: "5px",
                      border: "1px solid black",
                      borderRadius: "5px",
                      fontSize: "10px",
                    }}
                  >
                    Yjs Client ID: {ydocRef.current?.clientID}
                  </div>
                  <Background />
                  <CursorOverlay />
                  {children}
                </ReactFlow>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={addDropNode}>
                  <PlusIcon size={12} />
                  <span>Add a new node</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={handleSelectAll}>
                  <BoxSelectIcon size={12} />
                  <span>Select all</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </NodeDropzoneProvider>
        </UserContext.Provider>
      </YjsContext.Provider>
    </NodeOperationsProvider>
  );
};
