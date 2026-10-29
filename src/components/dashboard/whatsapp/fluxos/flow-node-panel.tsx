"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FlowNode, FormFieldDef, FormFieldType } from "@/lib/flow/types";

const TYPE_LABEL: Record<string, string> = {
  start: "Início",
  message: "Mensagem",
  menu: "Menu de opções",
  question: "Pergunta",
  condition: "Condição",
  form: "Formulário",
  end: "Fim",
};

const FIELD_TYPE_LABEL: Record<FormFieldType, string> = {
  text: "Texto",
  phone: "Telefone",
  cpf: "CPF",
  date: "Data",
  email: "E-mail",
  number: "Número",
};

function newFieldId() {
  return crypto.randomUUID().slice(0, 8);
}

/** Painel lateral de propriedades do nó selecionado — cada tipo de nó
 * expõe um formulário diferente, editando `node.data` in-place (o chamador
 * é responsável por persistir via onChange). `onRemoveOption` também some
 * com as arestas que saíam daquela opção (ver flow-editor.tsx), senão fica
 * uma conexão fantasma apontando pra um handle que não existe mais. */
export function FlowNodePanel({
  node,
  onChange,
  onDelete,
  onAddOption,
  onRemoveOption,
}: {
  node: FlowNode;
  onChange: (data: FlowNode["data"]) => void;
  onDelete: () => void;
  onAddOption: () => void;
  onRemoveOption: (optionId: string) => void;
}) {
  const data = node.data ?? {};

  return (
    <div className="flex h-full w-80 shrink-0 flex-col border-l border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <p className="text-sm font-medium">{TYPE_LABEL[node.type] ?? node.type}</p>
        {node.type !== "start" && (
          <Button variant="ghost" size="icon-sm" aria-label="Excluir nó" onClick={onDelete}>
            <X className="size-4" />
          </Button>
        )}
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {node.type === "start" && (
          <p className="text-sm text-muted-foreground">
            Todo fluxo começa aqui, quando o cliente manda qualquer mensagem nova. Este nó não é editável.
          </p>
        )}

        {node.type === "message" && (
          <div className="space-y-1.5">
            <Label>Texto da mensagem</Label>
            <Textarea
              rows={5}
              value={data.text ?? ""}
              onChange={(e) => onChange({ ...data, text: e.target.value })}
              placeholder="O que o cliente vai receber aqui?"
            />
          </div>
        )}

        {node.type === "menu" && (
          <>
            <div className="space-y-1.5">
              <Label>Texto do menu</Label>
              <Textarea
                rows={3}
                value={data.text ?? ""}
                onChange={(e) => onChange({ ...data, text: e.target.value })}
                placeholder="Ex: Como posso ajudar?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Opções</Label>
              <div className="space-y-2">
                {(data.options ?? []).map((opt, i) => (
                  <div key={opt.id} className="flex items-center gap-1.5">
                    <span className="text-sm text-muted-foreground">{i + 1}.</span>
                    <Input
                      value={opt.label}
                      onChange={(e) => {
                        const next = [...(data.options ?? [])];
                        next[i] = { ...opt, label: e.target.value };
                        onChange({ ...data, options: next });
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover opção"
                      onClick={() => onRemoveOption(opt.id)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" onClick={onAddOption}>
                <Plus className="size-3.5" />
                Adicionar opção
              </Button>
            </div>
          </>
        )}

        {node.type === "question" && (
          <>
            <div className="space-y-1.5">
              <Label>Pergunta</Label>
              <Textarea
                rows={3}
                value={data.text ?? ""}
                onChange={(e) => onChange({ ...data, text: e.target.value })}
                placeholder="Ex: Qual seu nome?"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Guardar resposta na variável</Label>
              <Input
                value={data.variable ?? ""}
                onChange={(e) => onChange({ ...data, variable: e.target.value })}
                placeholder="Ex: nome"
              />
            </div>
          </>
        )}

        {node.type === "condition" && (
          <>
            <div className="space-y-1.5">
              <Label>Variável</Label>
              <Input
                value={data.variable ?? ""}
                onChange={(e) => onChange({ ...data, variable: e.target.value })}
                placeholder="Ex: nome"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Condição</Label>
              <Select
                value={data.operator ?? "equals"}
                onValueChange={(v) => onChange({ ...data, operator: v as "equals" | "contains" })}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="equals">É igual a</SelectItem>
                  <SelectItem value="contains">Contém</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Valor</Label>
              <Input
                value={data.value ?? ""}
                onChange={(e) => onChange({ ...data, value: e.target.value })}
                placeholder="Ex: sim"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Conecte as saídas "Verdadeiro" e "Falso" do nó às próximas etapas.
            </p>
          </>
        )}

        {node.type === "form" && (
          <>
            <div className="space-y-1.5">
              <Label>Título do formulário</Label>
              <Input
                value={data.title ?? ""}
                onChange={(e) => onChange({ ...data, title: e.target.value })}
                placeholder="Ex: Currículo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Campos (um por vez, nesta ordem)</Label>
              <div className="space-y-3">
                {(data.fields ?? []).map((field, i) => (
                  <div key={field.id} className="space-y-1.5 rounded border border-border bg-muted/40 p-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">Campo {i + 1}</span>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remover campo"
                        onClick={() => {
                          const next = (data.fields ?? []).filter((f) => f.id !== field.id);
                          onChange({ ...data, fields: next });
                        }}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </div>
                    <Input
                      value={field.label}
                      placeholder="Pergunta — ex: Qual seu telefone?"
                      onChange={(e) => {
                        const next = [...(data.fields ?? [])];
                        next[i] = { ...field, label: e.target.value };
                        onChange({ ...data, fields: next });
                      }}
                    />
                    <div className="flex items-center gap-1.5">
                      <Input
                        className="flex-1"
                        value={field.variable}
                        placeholder="nome da variável (ex: telefone)"
                        onChange={(e) => {
                          const next = [...(data.fields ?? [])];
                          next[i] = { ...field, variable: e.target.value };
                          onChange({ ...data, fields: next });
                        }}
                      />
                      <Select
                        value={field.fieldType}
                        onValueChange={(v) => {
                          const next = [...(data.fields ?? [])];
                          next[i] = { ...field, fieldType: v as FormFieldType };
                          onChange({ ...data, fields: next });
                        }}
                      >
                        <SelectTrigger className="w-28 shrink-0">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(FIELD_TYPE_LABEL).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next: FormFieldDef[] = [
                    ...(data.fields ?? []),
                    { id: newFieldId(), label: "", variable: "", fieldType: "text" },
                  ];
                  onChange({ ...data, fields: next });
                }}
              >
                <Plus className="size-3.5" />
                Adicionar campo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              O bot pergunta um campo por vez, valida o formato e mostra um resumo com confirmação (ENVIAR/CORRIGIR) no final.
            </p>
          </>
        )}

        {node.type === "end" && (
          <div className="space-y-1.5">
            <Label>Mensagem de despedida (opcional)</Label>
            <Textarea
              rows={3}
              value={data.text ?? ""}
              onChange={(e) => onChange({ ...data, text: e.target.value })}
              placeholder="Ex: Obrigado! Qualquer coisa só chamar de novo."
            />
          </div>
        )}
      </div>
    </div>
  );
}
