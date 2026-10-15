"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { WorkflowVersionDto, WorkflowTemplateDto } from "../api";
import {
  useSaveWorkflowVersionDraft,
  useWorkflowVersionAction,
} from "../hooks";
import {
  WorkflowDefinition,
  validateWorkflowDefinition,
} from "@/domain/workflow-definition";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/icons";

interface DefinitionEditorProps {
  template: WorkflowTemplateDto;
  version: WorkflowVersionDto;
  catalog?: {
    departments?: Array<{ id: string; name: string }>;
    qcChecklists?: Array<{ id: string; name: string }>;
  };
}

export function DefinitionEditor({
  template,
  version,
  catalog,
}: DefinitionEditorProps) {
  const router = useRouter();
  const [definition, setDefinition] = useState<WorkflowDefinition>(() => {
    try {
      return JSON.parse(version.definitionJson);
    } catch {
      return { schemaVersion: 1, name: template.name, nodes: [], edges: [] };
    }
  });

  const [newNodeKey, setNewNodeKey] = useState("");
  const [newNodeName, setNewNodeName] = useState("");
  const [newNodeType, setNewNodeType] = useState<
    "OPERATION" | "INSPECTION" | "APPROVAL"
  >("OPERATION");
  const [newNodeDuration, setNewNodeDuration] = useState(60);
  const [newNodeDept, setNewNodeDept] = useState("");

  const [fromNode, setFromNode] = useState("");
  const [toNode, setToNode] = useState("");

  const saveMutation = useSaveWorkflowVersionDraft(template.id, version.id);
  const actionMutation = useWorkflowVersionAction(template.id, version.id);

  const isReadOnly =
    version.status === "PUBLISHED" || version.status === "RETIRED";

  // Live client validation
  const validationResult = validateWorkflowDefinition(definition);

  const handleAddNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNodeKey.trim() || !newNodeName.trim()) return;
    if (definition.nodes.some((n) => n.key === newNodeKey.trim())) return;

    setDefinition((prev) => ({
      ...prev,
      nodes: [
        ...prev.nodes,
        {
          key: newNodeKey.trim().toUpperCase(),
          name: newNodeName.trim(),
          type: newNodeType,
          plannedDurationMinutes: Number(newNodeDuration) || 60,
          departmentId: newNodeDept || undefined,
        },
      ],
    }));

    setNewNodeKey("");
    setNewNodeName("");
  };

  const handleRemoveNode = (key: string) => {
    if (isReadOnly) return;
    setDefinition((prev) => ({
      ...prev,
      nodes: prev.nodes.filter((n) => n.key !== key),
      edges: prev.edges.filter(
        (e) => e.fromNodeKey !== key && e.toNodeKey !== key,
      ),
    }));
  };

  const handleAddEdge = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromNode || !toNode || fromNode === toNode) return;
    if (
      definition.edges.some(
        (e) => e.fromNodeKey === fromNode && e.toNodeKey === toNode,
      )
    )
      return;

    setDefinition((prev) => ({
      ...prev,
      edges: [
        ...prev.edges,
        {
          fromNodeKey: fromNode,
          toNodeKey: toNode,
          joinPolicy: "AND",
        },
      ],
    }));
  };

  const handleRemoveEdge = (from: string, to: string) => {
    if (isReadOnly) return;
    setDefinition((prev) => ({
      ...prev,
      edges: prev.edges.filter(
        (e) => !(e.fromNodeKey === from && e.toNodeKey === to),
      ),
    }));
  };

  const handleSave = () => {
    saveMutation.mutate({
      expectedVersion: version.version,
      definition,
    });
  };

  const handleAction = (
    action: "submit_review" | "publish" | "retire" | "fork",
  ) => {
    actionMutation.mutate(action, {
      onSuccess: (res: any) => {
        if (action === "fork" && res.data?.id) {
          router.push(`/workflows/${template.id}/versions/${res.data.id}`);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{template.name}</h2>
            <Badge
              variant={version.status === "PUBLISHED" ? "success" : "default"}
            >
              v{version.versionNumber} · {version.status}
            </Badge>
          </div>
          <p className="text-sm text-slate-500">
            Order Type: {template.orderType?.name} · Code: {template.code}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {version.status === "DRAFT" && (
            <>
              <Button
                variant="default"
                onClick={handleSave}
                disabled={saveMutation.isPending || !validationResult.isValid}
              >
                {saveMutation.isPending ? "Saving…" : "Save draft"}
              </Button>
              <Button
                variant="soft"
                onClick={() => handleAction("submit_review")}
                disabled={actionMutation.isPending || !validationResult.isValid}
              >
                Submit review
              </Button>
              <Button
                variant="primary"
                onClick={() => handleAction("publish")}
                disabled={actionMutation.isPending || !validationResult.isValid}
              >
                Publish version
              </Button>
            </>
          )}

          {version.status === "REVIEW" && (
            <Button
              variant="primary"
              onClick={() => handleAction("publish")}
              disabled={actionMutation.isPending || !validationResult.isValid}
            >
              Approve & publish
            </Button>
          )}

          {version.status === "PUBLISHED" && (
            <>
              <Button
                variant="default"
                onClick={() => handleAction("fork")}
                disabled={actionMutation.isPending}
              >
                Fork new version
              </Button>
              <Button
                variant="soft"
                onClick={() => handleAction("retire")}
                disabled={actionMutation.isPending}
              >
                Retire version
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Validation Banner */}
      {!validationResult.isValid && (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
          <strong>Workflow validation issues:</strong>
          <ul className="mt-2 list-inside list-disc">
            {validationResult.errors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {isReadOnly && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          This workflow version is <strong>{version.status}</strong> and
          immutable. Fork a new version to modify operations or routing.
        </div>
      )}

      {/* Graph Visual / Flow Preview */}
      <div className="rounded-lg border bg-slate-50 p-6">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-500">
          Execution DAG Topology
        </h3>

        {definition.nodes.length === 0 ? (
          <p className="text-sm text-slate-400">
            No nodes defined in this workflow.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {definition.nodes.map((n, idx) => {
              const outEdges = definition.edges.filter(
                (e) => e.fromNodeKey === n.key,
              );
              return (
                <React.Fragment key={n.key}>
                  <div className="flex flex-col rounded-md border bg-white p-3 shadow-sm min-w-37.5">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-blue-600">
                        {n.key}
                      </span>
                      <span className="text-xs text-slate-400">{n.type}</span>
                    </div>
                    <strong className="text-sm mt-1">{n.name}</strong>
                    <span className="text-xs text-slate-500 mt-1">
                      {n.plannedDurationMinutes} mins
                    </span>
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => handleRemoveNode(n.key)}
                        className="mt-2 text-xs text-rose-500 hover:underline text-left"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {idx < definition.nodes.length - 1 && (
                    <span className="text-slate-400 font-bold">→</span>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>

      {/* Node and Edge Config (only editable in DRAFT) */}
      {!isReadOnly && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Add Node Card */}
          <div className="rounded-lg border bg-white p-5">
            <h4 className="font-semibold text-sm mb-3">
              Add Operation / Inspection Node
            </h4>
            <form onSubmit={handleAddNode} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Key (e.g. OP-10)
                  </label>
                  <input
                    type="text"
                    value={newNodeKey}
                    onChange={(e) => setNewNodeKey(e.target.value)}
                    className="w-full rounded border px-3 py-1.5 text-sm"
                    placeholder="OP-10"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Type
                  </label>
                  <select
                    value={newNodeType}
                    onChange={(e) => setNewNodeType(e.target.value as any)}
                    className="w-full rounded border px-3 py-1.5 text-sm"
                  >
                    <option value="OPERATION">Operation</option>
                    <option value="INSPECTION">Inspection</option>
                    <option value="APPROVAL">Approval</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">
                  Operation Name
                </label>
                <input
                  type="text"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  className="w-full rounded border px-3 py-1.5 text-sm"
                  placeholder="CNC Milling Pass 1"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Planned Duration (mins)
                  </label>
                  <input
                    type="number"
                    value={newNodeDuration}
                    onChange={(e) => setNewNodeDuration(Number(e.target.value))}
                    className="w-full rounded border px-3 py-1.5 text-sm"
                    min="1"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Department
                  </label>
                  <select
                    value={newNodeDept}
                    onChange={(e) => setNewNodeDept(e.target.value)}
                    className="w-full rounded border px-3 py-1.5 text-sm"
                  >
                    <option value="">None (General)</option>
                    {catalog?.departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Button type="submit" variant="soft" className="w-full">
                Add Node to Routing
              </Button>
            </form>
          </div>

          {/* Add Dependency Edge Card */}
          <div className="rounded-lg border bg-white p-5">
            <h4 className="font-semibold text-sm mb-3">
              Add Dependency Link (AND Join)
            </h4>
            <form onSubmit={handleAddEdge} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600">
                  Predecessor (From)
                </label>
                <select
                  value={fromNode}
                  onChange={(e) => setFromNode(e.target.value)}
                  className="w-full rounded border px-3 py-1.5 text-sm"
                >
                  <option value="">Select node…</option>
                  {definition.nodes.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.key} - {n.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600">
                  Successor (To)
                </label>
                <select
                  value={toNode}
                  onChange={(e) => setToNode(e.target.value)}
                  className="w-full rounded border px-3 py-1.5 text-sm"
                >
                  <option value="">Select node…</option>
                  {definition.nodes.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.key} - {n.name}
                    </option>
                  ))}
                </select>
              </div>

              <Button type="submit" variant="soft" className="w-full">
                Connect Dependency
              </Button>
            </form>

            <div className="mt-4 border-t pt-3">
              <span className="text-xs font-semibold text-slate-500">
                Declared Links:
              </span>
              <ul className="mt-2 space-y-1 text-xs">
                {definition.edges.map((e) => (
                  <li
                    key={`${e.fromNodeKey}->${e.toNodeKey}`}
                    className="flex items-center justify-between text-slate-600"
                  >
                    <span>
                      <strong>{e.fromNodeKey}</strong> →{" "}
                      <strong>{e.toNodeKey}</strong> (AND)
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        handleRemoveEdge(e.fromNodeKey, e.toNodeKey)
                      }
                      className="text-rose-500 hover:underline"
                    >
                      Delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
