"use client";

import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
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
import { WorkflowCanvas } from "./workflow-canvas";
import { NodePalette } from "./node-palette";
import { NodeInspector } from "./node-inspector";
import { WorkflowCanvasLayout } from "../canvas-adapter";
import { WorkflowNodeDefinition } from "@/domain/workflow-definition";
import { GenerationPanel } from "@/features/builder-proposals/components/generation-panel";
import { ProposalReview } from "@/features/builder-proposals/components/proposal-review";
import { BuilderProposalDto } from "@/server/modules/builder-proposals/contracts";

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

  const [selectedNode, setSelectedNode] = useState<WorkflowNodeDefinition | null>(null);
  const [canvasLayout, setCanvasLayout] = useState<WorkflowCanvasLayout | undefined>(undefined);
  const [aiProposal, setAiProposal] = useState<BuilderProposalDto | null>(null);

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
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 border-line">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{template.name}</h2>
            <Badge
              variant={version.status === "PUBLISHED" ? "success" : "default"}
            >
              v{version.versionNumber} · {version.status}
            </Badge>
          </div>
          <p className="text-sm text-muted">
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
        <div className="rounded-md border border-danger/20 bg-danger-soft p-4 text-sm text-danger">
          <strong>Workflow validation issues:</strong>
          <ul className="mt-2 list-inside list-disc">
            {validationResult.errors.map((err, i) => (
              <li key={i}>{err.message}</li>
            ))}
          </ul>
        </div>
      )}

      {isReadOnly && (
        <div className="rounded-md border border-warning/20 bg-warning-soft p-4 text-sm text-warning">
          This workflow version is <strong>{version.status}</strong> and
          immutable. Fork a new version to modify operations or routing.
        </div>
      )}

      {/* AI Builder Assistant */}
      {!isReadOnly && (
        <div className="space-y-4">
          {!aiProposal ? (
            <GenerationPanel
              target="WORKFLOW"
              targetDraftId={version.id}
              baseRevision={version.versionNumber}
              onGenerated={(prop) => setAiProposal(prop)}
            />
          ) : (
            <ProposalReview
              proposal={aiProposal}
              expectedTargetRevision={version.versionNumber}
              onApplied={(ref) => {
                setAiProposal(null);
                try {
                  const candidate = JSON.parse(aiProposal.candidateJson);
                  setDefinition(candidate);
                } catch {
                  // ignore
                }
                router.refresh();
              }}
              onDiscard={() => setAiProposal(null)}
            />
          )}
        </div>
      )}

      {/* Interactive Workflow Canvas & Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-ink">
              Interactive Execution DAG Canvas
            </h3>
            <span className="text-xs text-muted">
              {definition.nodes.length} nodes · {definition.edges.length} dependencies
            </span>
          </div>

          <WorkflowCanvas
            definition={definition}
            layout={canvasLayout}
            onChange={(res) => {
              setDefinition(res.definition);
              setCanvasLayout(res.layout);
            }}
            onSelectNode={setSelectedNode}
            readOnly={isReadOnly}
          />
        </div>

        <div className="lg:col-span-4 space-y-4">
          <NodePalette
            onAddNode={(type) => {
              const count = definition.nodes.length + 1;
              const prefix = type === 'OPERATION' ? 'OP' : type === 'INSPECTION' ? 'QC' : 'AP';
              const key = `${prefix}${count * 10}`;
              setDefinition((prev) => ({
                ...prev,
                nodes: [
                  ...prev.nodes,
                  {
                    key,
                    name: `New ${type.toLowerCase()} step`,
                    type,
                    plannedDurationMinutes: 60,
                  },
                ],
              }));
            }}
            disabled={isReadOnly}
          />

          <NodeInspector
            node={selectedNode}
            onChange={(updated) => {
              setSelectedNode(updated);
              setDefinition((prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) => (n.key === updated.key ? updated : n)),
              }));
            }}
            onDelete={(key) => {
              handleRemoveNode(key);
              setSelectedNode(null);
            }}
            catalog={catalog}
            readOnly={isReadOnly}
          />
        </div>
      </div>

      {/* Node and Edge Config (only editable in DRAFT) */}
      {!isReadOnly && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Add Node Card */}
          <div className="rounded-lg border bg-white p-5 border-line">
            <h4 className="font-semibold text-sm mb-3">
              Add Operation / Inspection Node
            </h4>
            <form onSubmit={handleAddNode} className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted">
                    Key (e.g. OP-10)
                  
                  <Input
                    type="text"
                    value={newNodeKey}
                    onChange={(e) => setNewNodeKey(e.target.value)}
                    className="w-full rounded border px-3 py-1.5 text-sm border-line"
                    placeholder="OP-10"
                    required
                  /></label>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">
                    Type
                  
                  <Select
                    value={newNodeType}
                    onChange={(e) => setNewNodeType(e.target.value as any)}
                    className="w-full rounded border px-3 py-1.5 text-sm border-line"
                  >
                    <option value="OPERATION">Operation</option>
                    <option value="INSPECTION">Inspection</option>
                    <option value="APPROVAL">Approval</option>
                  </Select></label>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted">
                  Operation Name
                
                <Input
                  type="text"
                  value={newNodeName}
                  onChange={(e) => setNewNodeName(e.target.value)}
                  className="w-full rounded border px-3 py-1.5 text-sm border-line"
                  placeholder="CNC Milling Pass 1"
                  required
                /></label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted">
                    Planned Duration (mins)
                  
                  <Input
                    type="number"
                    value={newNodeDuration}
                    onChange={(e) => setNewNodeDuration(Number(e.target.value))}
                    className="w-full rounded border px-3 py-1.5 text-sm border-line"
                    min="1"
                  /></label>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">
                    Department
                  
                  <Select
                    value={newNodeDept}
                    onChange={(e) => setNewNodeDept(e.target.value)}
                    className="w-full rounded border px-3 py-1.5 text-sm border-line"
                  >
                    <option value="">None (General)</option>
                    {catalog?.departments?.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </Select></label>
                </div>
              </div>

              <Button type="submit" variant="soft" className="w-full">
                Add Node to Routing
              </Button>
            </form>
          </div>

          {/* Add Dependency Edge Card */}
          <div className="rounded-lg border bg-white p-5 border-line">
            <h4 className="font-semibold text-sm mb-3">
              Add Dependency Link (AND Join)
            </h4>
            <form onSubmit={handleAddEdge} className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted">
                  Predecessor (From)
                
                <Select
                  value={fromNode}
                  onChange={(e) => setFromNode(e.target.value)}
                  className="w-full rounded border px-3 py-1.5 text-sm border-line"
                >
                  <option value="">Select node…</option>
                  {definition.nodes.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.key} - {n.name}
                    </option>
                  ))}
                </Select></label>
              </div>

              <div>
                <label className="text-xs font-medium text-muted">
                  Successor (To)
                
                <Select
                  value={toNode}
                  onChange={(e) => setToNode(e.target.value)}
                  className="w-full rounded border px-3 py-1.5 text-sm border-line"
                >
                  <option value="">Select node…</option>
                  {definition.nodes.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.key} - {n.name}
                    </option>
                  ))}
                </Select></label>
              </div>

              <Button type="submit" variant="soft" className="w-full">
                Connect Dependency
              </Button>
            </form>

            <div className="mt-4 border-t pt-3 border-line">
              <span className="text-xs font-semibold text-muted">
                Declared Links:
              </span>
              <ul className="mt-2 space-y-1 text-xs">
                {definition.edges.map((e) => (
                  <li
                    key={`${e.fromNodeKey}->${e.toNodeKey}`}
                    className="flex items-center justify-between text-muted"
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
                      className="text-danger hover:underline"
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
