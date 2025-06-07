import { EditorProvider } from "@/components/ui/kibo-ui/editor";
import { cn } from "@/lib/utils";
import { useProject } from "@/providers/project";
import type { Editor, EditorEvents } from "@tiptap/core";
import Collaboration from "@tiptap/extension-collaboration";
import { useRef, useContext, useEffect } from "react";
import * as Y from "yjs";
import type { TextNodeProps } from ".";
import { NodeLayout } from "../layout";
import { useNodeOperations } from "@/providers/node-operations";
import { useYjsDoc } from "@/components/canvas";

type TextPrimitiveProps = TextNodeProps & {
  title: string;
};

export const TextPrimitive = ({
  data,
  id,
  type,
  title,
}: TextPrimitiveProps) => {
  const { updateNodeData } = useNodeOperations();
  const editor = useRef<Editor | null>(null);
  const project = useProject();
  const ydoc = useYjsDoc();

  const handleUpdate = ({ editor }: { editor: Editor }) => {
    // Only extract plain text for other nodes to consume
    // The rich content is automatically synced via TipTap's collaboration
    const text = editor.getText();
    updateNodeData(id, { text });
  };

  const handleCreate = (props: EditorEvents["create"]) => {
    editor.current = props.editor;

    if (project) {
      props.editor.chain().focus().run();
    }

    // Set initial content if this is a new text node with content but no collaboration data
    if (data.content && ydoc) {
      const yText = ydoc.getText(`text-node-${id}`);
      if (yText.length === 0) {
        // Only set content if the collaborative field is empty
        props.editor.commands.setContent(data.content);
      }
    }
  };

  const collaborationExtensions = ydoc
    ? [
        Collaboration.configure({
          document: ydoc,
          field: `text-node-${id}`, // Unique field name for this text node
        }),
      ]
    : [];

  return (
    <NodeLayout
      id={id}
      data={data}
      title={title}
      type={type}
      className="overflow-hidden p-0"
    >
      <div className="nowheel h-full max-h-[30rem] overflow-auto">
        <EditorProvider
          onCreate={handleCreate}
          immediatelyRender={false}
          placeholder="Start typing..."
          extensions={collaborationExtensions}
          className={cn(
            "prose prose-sm dark:prose-invert size-full p-6",
            "[&_p:first-child]:mt-0",
            "[&_p:last-child]:mb-0"
          )}
          onUpdate={handleUpdate}
        />
      </div>
    </NodeLayout>
  );
};
