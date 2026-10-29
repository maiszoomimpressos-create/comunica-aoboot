/** Formato do grafo guardado em Flow.draftGraph/publishedGraph — consumido
 * pelo motor (flow-engine.service.ts) e, numa fase futura, pelo editor
 * visual (React Flow). `position` existe só pro editor; o motor a ignora.
 *
 * Nó/aresta tipados de forma solta (campos extra permitidos) de propósito:
 * o motor só lê o que cada tipo de nó precisa, e nós ainda não suportados
 * (ai/action/human — fase 4) passam pelo grafo sem quebrar a leitura. */

export type FlowNodeType =
  | "start"
  | "message"
  | "menu"
  | "question"
  | "condition"
  | "form"
  | "end"
  | "ai"
  | "action"
  | "human";

export interface FlowMenuOption {
  id: string;
  label: string;
}

// Tipo de validação aplicada à resposta de um campo de nó `form` — ver
// field-validation.ts. "text" aceita qualquer coisa não vazia.
export type FormFieldType = "text" | "phone" | "cpf" | "date" | "email" | "number";

export interface FormFieldDef {
  id: string;
  label: string;
  // Nome da variável onde a resposta validada é salva em FlowSession.variables
  // (mesma convenção do campo `variable` do nó `question`).
  variable: string;
  fieldType: FormFieldType;
}

export interface FlowNode {
  id: string;
  type: FlowNodeType;
  position?: { x: number; y: number };
  data?: {
    text?: string;
    options?: FlowMenuOption[];
    variable?: string;
    operator?: "equals" | "contains";
    value?: string;
    title?: string;
    fields?: FormFieldDef[];
    [key: string]: unknown;
  };
}

export interface FlowEdge {
  id: string;
  source: string;
  // Qual "saída" do nó de origem esta aresta representa — id da opção pra
  // nó `menu`, "true"/"false" pra nó `condition`, ausente pra nós com uma
  // única saída (start/message/question).
  sourceHandle?: string | null;
  target: string;
  // Em qual ponto de conexão do nó de destino a aresta entra — puramente
  // visual (editor), o motor ignora.
  targetHandle?: string | null;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export function isFlowGraph(value: unknown): value is FlowGraph {
  return (
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as FlowGraph).nodes) &&
    Array.isArray((value as FlowGraph).edges)
  );
}
