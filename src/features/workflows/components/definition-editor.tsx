"use client";

import "./workflow-editor.css";
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
import { Dialog } from "@/components/ui/dialog";
import { NodeInspector } from "./node-inspector";
import { WorkflowCanvasLayout } from "../canvas-adapter";
import { connectWorkflowSteps } from "../canvas-state";
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

  const [selectedNodeKey, setSelectedNodeKey] = useState<string | null>(null);
  const selectedNode = definition.nodes.find(node => node.key === selectedNodeKey) ?? null;
  const setSelectedNode = (node: WorkflowNodeDefinition | null) => setSelectedNodeKey(node?.key ?? null);
  const [editorDialog, setEditorDialog] = useState<'node' | 'dependencies' | null>(null);
  const [editorError, setEditorError] = useState('');
  const openAddStep = () => {
    let index = 10;
    while (definition.nodes.some(node => node.key === `OP-${index}`)) index += 10;
    setNewNodeKey(`OP-${index}`);
    setNewNodeName('');
    setNewNodeType('OPERATION');
    setNewNodeDuration(60);
    setNewNodeDept('');
    setEditorError('');
    setEditorDialog('node');
  };
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
    if (isReadOnly) return;
    if (!newNodeKey.trim() || !newNodeName.trim()) return;
    if (definition.nodes.some((n) => n.key === newNodeKey.trim().toUpperCase())) {
      setEditorError('This step key already exists. Choose a unique key.');
      return;
    }
    if (!Number.isFinite(newNodeDuration) || newNodeDuration < 1) {
      setEditorError('Enter a duration of at least one minute.');
      return;
    }

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

    setSelectedNodeKey(newNodeKey.trim().toUpperCase());
    setEditorDialog(null);
    setEditorError('');
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
    if (isReadOnly) return;
    const result = connectWorkflowSteps(definition, fromNode, toNode);
    if (!result.definition) {
      setEditorError(result.error ?? 'Unable to connect these steps.');
      return;
    }
    setDefinition(result.definition);
    setEditorError('');
    setFromNode('');
    setToNode('');
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
    <div className="workflow-editor">
      {/* Header bar */}
      <div className="wf-header">
        <div>
          <div className="flex items-center gap-3">
            <h1>{template.name}</h1>
            <Badge
              variant={version.status === "PUBLISHED" ? "success" : "default"}
            >
              v{version.versionNumber} · {version.status}
            </Badge>
          </div>
          <p className="text-sm text-muted">
            {template.orderType?.name || "No order type assigned"} · {template.code}
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
                variant="primary"
                icon="plus"
                onClick={() => handleAction("fork")}
                disabled={actionMutation.isPending}
              >
                Fork new version
              </Button>
              <Button
                variant="ghost"
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
        <div className="wf-version-notice">
          <Icon name="lock" />
          <div><strong>{version.status === 'PUBLISHED' ? 'Published version' : 'Retired version'} · read only</strong><p>Inspect the routing and step properties. Fork a new version to make changes.</p></div>
          <span>v{version.versionNumber}</span>
        </div>
      )}

      {(saveMutation.error || actionMutation.error) && <div role="alert" className="wf-error">{(saveMutation.error || actionMutation.error)?.message || 'Unable to update this workflow. Please try again.'}</div>}

      {/* AI Builder Assistant */}
      {!isReadOnly && (
        <details className="wf-ai-panel" open={aiProposal ? true : undefined}>
          <summary><Icon name="spark" /><span>Build with AI</span><span>Generate and review a routing proposal</span><Icon name="down" /></summary>
          <div className="wf-ai-content">
          {!aiProposal ? (
            <GenerationPanel
              target="WORKFLOW"
              targetDraftId={version.id}
              baseRevision={version.version}
              onGenerated={(prop) => setAiProposal(prop)}
            />
          ) : (
            <ProposalReview
              proposal={aiProposal}
              expectedTargetRevision={version.version}
              currentDefinition={definition}
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
        </details>
      )}

      {/* Interactive Workflow Canvas & Inspector */}
      <div className="wf-workbench">
        <section className="wf-canvas-panel" aria-label="Workflow routing">
          <div className="wf-canvas-toolbar">
            <div><Icon name="graph" /><h2>Routing canvas</h2></div>
            <div className="wf-canvas-stats"><span>{definition.nodes.length} {definition.nodes.length === 1 ? 'step' : 'steps'}</span><span>{definition.edges.length} dependencies</span><span className="wf-mode"><Icon name={isReadOnly ? 'lock' : 'edit'} />{isReadOnly ? 'View mode' : 'Edit mode'}</span></div>
          </div>

          {!isReadOnly && <div className="wf-builder-actions"><Button variant="primary" icon="plus" onClick={openAddStep}>Add step</Button><Button onClick={() => { setEditorError(''); setEditorDialog('dependencies'); }}>Manage dependencies</Button><span>Changes stay in this draft until you save.</span></div>}
          <WorkflowCanvas
            definition={definition}
            layout={canvasLayout}
            onChange={(res) => {
              setDefinition(res.definition);
              setCanvasLayout(res.layout);
            }}
            onSelectNode={setSelectedNode}
            readOnly={isReadOnly}
            onAddStep={openAddStep}
            selectedNodeKey={selectedNodeKey}
          />
          <div className="wf-canvas-footer"><span><Icon name="info" />{isReadOnly ? 'Select a step to inspect its configuration' : 'Select a step to edit · drag between handles to connect'}</span><span>Scroll to zoom · drag canvas to pan</span></div>
        </section>

        <aside className="wf-sidebar" aria-label="Workflow configuration">
          <div className="wf-step-outline">
            <div className="wf-sidebar-heading"><h2>Workflow steps</h2><span>{definition.nodes.length}</span></div>
            {definition.nodes.length === 0 ? <p className="wf-outline-empty">Add a step to start building your routing.</p> : <div className="wf-outline-list">{definition.nodes.map((node) => <button type="button" key={node.key} aria-pressed={selectedNode?.key === node.key} onClick={() => setSelectedNode(node)}><Icon name={node.type === 'OPERATION' ? 'work' : node.type === 'INSPECTION' ? 'shield' : 'check'} /><span><strong>{node.name}</strong><small>{node.key} · {node.plannedDurationMinutes} min</small></span><Icon name="chevron" /></button>)}</div>}
          </div>

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
        </aside>
      </div>

      {/* Node and Edge Config (only editable in DRAFT) */}
      {!isReadOnly && (
        <Dialog isOpen={editorDialog !== null} onClose={() => setEditorDialog(null)} title={editorDialog === 'node' ? 'Add workflow step' : 'Manage dependencies'} subtitle={editorDialog === 'node' ? 'Create a step, then connect it on the routing canvas.' : 'Connect a predecessor to its next step. All predecessors must finish before the successor starts.'} size="md">
          {editorError && <div role="alert" className="wf-error">{editorError}</div>}
          {editorDialog === 'node' && (
          <div className="wf-dialog-form">
            <h4 className="font-semibold text-sm mb-3">
              Step details
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
                Add step to canvas
              </Button>
            </form>
          </div>

          )}
          {editorDialog === 'dependencies' && <div className="wf-dialog-form">
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
          </div>}
        </Dialog>
      )}
    </div>
  );
}
