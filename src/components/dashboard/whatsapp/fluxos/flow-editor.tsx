"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  ConnectionMode,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  type OnReconnect,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  ArrowLeft,
  MessageSquare,
  ListChecks,
  CircleHelp,
  GitBranch,
  Square,
  Rocket,
  Undo2,
  FileText,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FLOW_NODE_TYPES } from "./flow-nodes";
import { FlowNodePanel } from "./flow-node-panel";
import { updateFlowAction } from "@/actions/whatsapp/update-flow";
import { publishFlowAction } from "@/actions/whatsapp/publish-flow";
import { unpublishFlowAction } from "@/actions/whatsapp/unpublish-flow";
import type { FlowGraph, FlowNodeType } from "@/lib/flow/types";

const STATUS_LABEL: Record<string, string> = { DRAFT: "Rascunho", PUBLISHED: "Publicado", ARCHIVED: "Arquivado" };

const PALETTE: { type: FlowNodeType; label: string; icon: React.ReactNode; defaultData: Record<string, unknown> }[] = [
  { type: "message", label: "Mensagem", icon: <MessageSquare className="size-4" />, defaultData: { text: "" } },
  { type: "menu", label: "Menu", icon: <ListChecks className="size-4" />, defaultData: { text: "", options: [] } },
  { type: "question", label: "Pergunta", icon: <CircleHelp className="size-4" />, defaultData: { text: "", variable: "" } },
  {
    type: "condition",
    label: "Condição",
    icon: <GitBranch className="size-4" />,
    defaultData: { variable: "", operator: "equals", value: "" },
  },
  { type: "form", label: "Formulário", icon: <FileText className="size-4" />, defaultData: { title: "", fields: [] } },
  { type: "end", label: "Fim", icon: <Square className="size-4" />, defaultData: { text: "" } },
];

function toFlowNodes(graph: FlowGraph): Node[] {
  return graph.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position ?? { x: 100, y: 100 },
    data: (n.data ?? {}) as Node["data"],
    deletable: n.type !== "start",
  }));
}

function toFlowEdges(graph: FlowGraph): Edge[] {
  return graph.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
    targetHandle: e.targetHandle ?? null,
  }));
}

function newId() {
  return crypto.randomUUID().slice(0, 8);
}

function FlowEditorInner({
  tenantSlug,
  connectionId,
  flowId,
  flowName,
  flowStatus,
  initialGraph,
}: {
  tenantSlug: string;
  connectionId: string;
  flowId: string;
  flowName: string;
  flowStatus: string;
  initialGraph: FlowGraph;
}) {
  const router = useRouter();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(toFlowNodes(initialGraph));
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(toFlowEdges(initialGraph));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [name, setName] = useState(flowName);
  const [status, setStatus] = useState(flowStatus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) ?? null, [nodes, selectedNodeId]);

  // Nós de saída única (start/message/question/form) só podem ter UMA aresta
  // saindo, não importa de qual lado do retângulo ela foi puxada — o motor
  // (flow-engine.service.ts) ignora o handle pra esses tipos e sempre segue
  // a primeira aresta encontrada, então uma segunda seria enganosa (criaria
  // a ilusão de uma ramificação que o motor nunca usa). Pra menu/condition,
  // cada opção/branch (handle) é uma saída de verdade e pode ter sua própria
  // aresta. Em ambos os casos, conectar de novo a partir da mesma saída
  // substitui a aresta antiga em vez de empilhar — assim "conectar de novo"
  // já funciona como desconectar + reconectar.
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const sourceNode = nodes.find((n) => n.id === connection.source);
        const isBranchHandle = sourceNode?.type === "menu" || sourceNode?.type === "condition";
        const withoutConflicting = eds.filter((e) => {
          if (e.source !== connection.source) return true;
          if (isBranchHandle) return (e.sourceHandle ?? null) !== (connection.sourceHandle ?? null);
          return false;
        });
        return addEdge(connection, withoutConflicting);
      });
    },
    [setEdges, nodes]
  );
  const isValidConnection = useCallback((conn: Connection | Edge) => conn.source !== conn.target, []);

  const edgeReconnectOk = useRef(true);
  const onReconnectStart = useCallback(() => {
    edgeReconnectOk.current = false;
  }, []);
  const onReconnect: OnReconnect = useCallback(
    (oldEdge, newConnection) => {
      edgeReconnectOk.current = true;
      setEdges((eds) => reconnectEdge(oldEdge, newConnection, eds));
    },
    [setEdges]
  );
  const onReconnectEnd = useCallback((_: unknown, edge: Edge) => {
    if (!edgeReconnectOk.current) {
      setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    }
    edgeReconnectOk.current = true;
  }, [setEdges]);

  function handleAddNode(type: FlowNodeType, defaultData: Record<string, unknown>) {
    const id = newId();
    setNodes((nds) => [
      ...nds,
      { id, type, position: { x: 420 + (nds.length % 4) * 40, y: 80 + nds.length * 90 }, data: defaultData, deletable: true },
    ]);
  }

  function handleNodeDataChange(data: Record<string, unknown> | undefined) {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.map((n) => (n.id === selectedNodeId ? { ...n, data: data ?? {} } : n)));
  }

  function handleDeleteNode() {
    if (!selectedNodeId) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNodeId));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNodeId && e.target !== selectedNodeId));
    setSelectedNodeId(null);
  }

  function handleAddOption() {
    if (!selectedNode) return;
    const options = (selectedNode.data as { options?: { id: string; label: string }[] }).options ?? [];
    handleNodeDataChange({ ...selectedNode.data, options: [...options, { id: newId(), label: "Nova opção" }] });
  }

  function handleRemoveOption(optionId: string) {
    if (!selectedNode) return;
    const options = (selectedNode.data as { options?: { id: string; label: string }[] }).options ?? [];
    handleNodeDataChange({ ...selectedNode.data, options: options.filter((o) => o.id !== optionId) });
    setEdges((eds) => eds.filter((e) => !(e.source === selectedNode.id && e.sourceHandle === optionId)));
  }

  function serializeGraph(): FlowGraph {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as FlowNodeType,
        position: n.position,
        data: n.data as FlowGraph["nodes"][number]["data"],
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? null,
        targetHandle: e.targetHandle ?? null,
      })),
    };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await updateFlowAction(tenantSlug, { flowId, name, graph: serializeGraph() });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    router.refresh();
  }

  async function handlePublish() {
    setSaving(true);
    setError(null);
    const saveResult = await updateFlowAction(tenantSlug, { flowId, name, graph: serializeGraph() });
    if (!saveResult.success) {
      setSaving(false);
      setError(saveResult.error.message);
      return;
    }
    const result = await publishFlowAction(tenantSlug, { flowId });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setStatus("PUBLISHED");
    router.refresh();
  }

  async function handleUnpublish() {
    setSaving(true);
    setError(null);
    const result = await unpublishFlowAction(tenantSlug, { flowId });
    setSaving(false);
    if (!result.success) {
      setError(result.error.message);
      return;
    }
    setStatus("ARCHIVED");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Link
          href={`/app/${tenantSlug}/modulos/whatsapp/fluxos/${connectionId}`}
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-56" />
        <Badge variant={status === "PUBLISHED" ? "default" : "secondary"}>{STATUS_LABEL[status] ?? status}</Badge>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div className="ml-auto flex items-center gap-2">
          <Link
            href={`/app/${tenantSlug}/modulos/whatsapp/fluxos/${connectionId}/${flowId}/respostas`}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ClipboardList className="size-4" />
            Respostas
          </Link>
          <Button variant="outline" size="sm" disabled={saving} onClick={handleSave}>
            {saving ? "Salvando..." : "Salvar rascunho"}
          </Button>
          {status === "PUBLISHED" ? (
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="outline" size="sm" disabled={saving} />}>
                <Undo2 className="size-4" />
                Despublicar
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Despublicar este fluxo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A conexão volta a ser atendida pelo Atendente de IA (se estiver configurado) a partir da
                    próxima mensagem.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handleUnpublish}>Despublicar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger render={<Button size="sm" disabled={saving} />}>
                <Rocket className="size-4" />
                Publicar
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Publicar este fluxo?</AlertDialogTitle>
                  <AlertDialogDescription>
                    A partir de agora, este fluxo passa a responder quem mandar mensagem pra esta conexão — e o
                    Atendente de IA desta conexão é desativado automaticamente enquanto o fluxo estiver publicado.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={handlePublish}>Publicar</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="relative flex flex-1 overflow-hidden">
        <div className="absolute top-3 left-3 z-10 flex flex-col gap-1 rounded-lg border border-border bg-card/95 p-2 shadow-sm">
          {PALETTE.map((item) => (
            <Button
              key={item.type}
              variant="ghost"
              size="sm"
              className="justify-start"
              onClick={() => handleAddNode(item.type, item.defaultData)}
            >
              {item.icon}
              {item.label}
            </Button>
          ))}
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onReconnectStart={onReconnectStart}
          onReconnect={onReconnect}
          onReconnectEnd={onReconnectEnd}
          connectionMode={ConnectionMode.Loose}
          nodeTypes={FLOW_NODE_TYPES}
          onNodeClick={(_, node) => setSelectedNodeId(node.id)}
          onPaneClick={() => setSelectedNodeId(null)}
          fitView
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
          <Controls />
        </ReactFlow>

        {selectedNode && (
          <FlowNodePanel
            node={{ id: selectedNode.id, type: selectedNode.type as FlowNodeType, data: selectedNode.data }}
            onChange={handleNodeDataChange}
            onDelete={handleDeleteNode}
            onAddOption={handleAddOption}
            onRemoveOption={handleRemoveOption}
          />
        )}
      </div>
    </div>
  );
}

export function FlowEditor(props: {
  tenantSlug: string;
  connectionId: string;
  flowId: string;
  flowName: string;
  flowStatus: string;
  initialGraph: FlowGraph;
}) {
  return (
    <ReactFlowProvider>
      <FlowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
