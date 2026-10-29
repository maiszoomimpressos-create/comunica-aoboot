"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Play, MessageSquare, ListChecks, CircleHelp, GitBranch, Square, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowNode as FlowNodeData } from "@/lib/flow/types";

type RFNodeProps = NodeProps & { data: FlowNodeData["data"] & { selected?: boolean } };

const BORDER_ACCENT: Record<string, string> = {
  start: "border-l-success",
  message: "border-l-muted-foreground",
  menu: "border-l-primary",
  question: "border-l-warning",
  condition: "border-l-warning",
  form: "border-l-blue-500",
  end: "border-l-muted-foreground",
};

const ICON_ACCENT: Record<string, string> = {
  start: "text-success",
  message: "text-muted-foreground",
  menu: "text-primary",
  question: "text-warning",
  condition: "text-warning",
  form: "text-blue-500",
  end: "text-muted-foreground",
};

function NodeShell({
  type,
  icon,
  title,
  selected,
  children,
}: {
  type: string;
  icon: React.ReactNode;
  title: string;
  selected?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-56 rounded-lg border-l-4 border-border bg-card px-3 py-2.5 shadow-sm",
        BORDER_ACCENT[type],
        selected && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span className={ICON_ACCENT[type]}>{icon}</span>
        {title}
      </div>
      {children ? <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{children}</div> : null}
    </div>
  );
}

export function StartNode({ selected }: RFNodeProps) {
  return (
    <NodeShell type="start" icon={<Play className="size-3.5" />} title="Início" selected={selected}>
      Mensagem recebida
      <Handle type="source" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} />
    </NodeShell>
  );
}

export function MessageNode({ data, selected }: RFNodeProps) {
  return (
    <NodeShell type="message" icon={<MessageSquare className="size-3.5" />} title="Mensagem" selected={selected}>
      {data?.text || "Sem texto ainda"}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} />
    </NodeShell>
  );
}

export function MenuNode({ data, selected }: RFNodeProps) {
  const options = data?.options ?? [];
  return (
    <div
      className={cn(
        "w-56 rounded-lg border-l-4 border-primary bg-card px-3 py-2.5 shadow-sm",
        selected && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ListChecks className="size-3.5 text-primary" />
        Menu de opções
      </div>
      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{data?.text || "Sem texto ainda"}</p>
      <div className="mt-2 space-y-1">
        {options.length === 0 && <p className="text-xs italic text-muted-foreground">Sem opções</p>}
        {options.map((opt) => (
          <div
            key={opt.id}
            className="relative rounded border border-border bg-muted/40 px-2 py-1 text-xs text-foreground"
          >
            {opt.label || "(sem rótulo)"}
            <Handle
              type="source"
              position={Position.Right}
              id={opt.id}
              style={{ top: "50%" }}
              className="!bg-primary"
            />
          </div>
        ))}
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} id="left" isConnectableStart={false} />
      <Handle type="target" position={Position.Right} id="right" isConnectableStart={false} />
      <Handle type="target" position={Position.Bottom} id="bottom" isConnectableStart={false} />
    </div>
  );
}

export function QuestionNode({ data, selected }: RFNodeProps) {
  return (
    <NodeShell type="question" icon={<CircleHelp className="size-3.5" />} title="Pergunta" selected={selected}>
      {data?.text || "Sem texto ainda"}
      {data?.variable ? ` → {${data.variable}}` : ""}
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} />
    </NodeShell>
  );
}

export function ConditionNode({ data, selected }: RFNodeProps) {
  return (
    <div
      className={cn(
        "w-56 rounded-lg border-l-4 border-warning bg-card px-3 py-2.5 shadow-sm",
        selected && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <GitBranch className="size-3.5 text-warning" />
        Condição
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {data?.variable ? `{${data.variable}}` : "variável"} {data?.operator === "contains" ? "contém" : "é"}{" "}
        "{data?.value || "..."}"
      </p>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span className="relative rounded border border-border bg-muted/40 px-2 py-0.5">
          Verdadeiro
          <Handle type="source" position={Position.Bottom} id="true" className="!bg-success" />
        </span>
        <span className="relative rounded border border-border bg-muted/40 px-2 py-0.5">
          Falso
          <Handle type="source" position={Position.Bottom} id="false" className="!bg-destructive" />
        </span>
      </div>
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} id="left" isConnectableStart={false} />
      <Handle type="target" position={Position.Right} id="right" isConnectableStart={false} />
    </div>
  );
}

export function FormNode({ data, selected }: RFNodeProps) {
  const fields = data?.fields ?? [];
  return (
    <div
      className={cn(
        "w-56 rounded-lg border-l-4 border-blue-500 bg-card px-3 py-2.5 shadow-sm",
        selected && "ring-2 ring-ring"
      )}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <FileText className="size-3.5 text-blue-500" />
        {data?.title || "Formulário"}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {fields.length === 0 ? "Sem campos ainda" : `${fields.length} campo${fields.length > 1 ? "s" : ""}`}
      </p>
      <Handle type="target" position={Position.Top} />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export function EndNode({ data, selected }: RFNodeProps) {
  return (
    <NodeShell type="end" icon={<Square className="size-3.5" />} title="Fim" selected={selected}>
      {data?.text || "Encerra a conversa"}
      <Handle type="target" position={Position.Top} />
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Bottom} id="bottom" />
    </NodeShell>
  );
}

export const FLOW_NODE_TYPES = {
  start: StartNode,
  message: MessageNode,
  menu: MenuNode,
  question: QuestionNode,
  condition: ConditionNode,
  form: FormNode,
  end: EndNode,
};
