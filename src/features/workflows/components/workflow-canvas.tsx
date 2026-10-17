"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  ReactFlow, MiniMap, Controls, Background, Panel,
  useNodesState, useEdgesState, useNodesInitialized, useReactFlow,
  type Node, type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { type WorkflowNodeDefinition, type WorkflowDefinition } from "@/domain/workflow-definition";
import { toCanvas, type WorkflowCanvasLayout, type CanvasNodeData } from "../canvas-adapter";
import { connectWorkflowSteps, reconcileWorkflowNodes } from "../canvas-state";
import { CustomWorkflowNode } from "./custom-workflow-node";
import { Button } from "@/components/ui/button";

const nodeTypes = { customWorkflowNode: CustomWorkflowNode };

// Wait for React Flow to measure a newly added step before bringing it into view.
function FocusStep({ nodeKey }: { nodeKey?: string | null }) {
  const initialized = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (initialized && nodeKey) void fitView({ nodes: [{ id: nodeKey }], padding: 0.5, maxZoom: 1, duration: 180 });
  }, [initialized, nodeKey, fitView]);
  return null;
}

interface WorkflowCanvasProps {
  definition: WorkflowDefinition;
  layout?: WorkflowCanvasLayout;
  onChange: (updated: { definition: WorkflowDefinition; layout: WorkflowCanvasLayout }) => void;
  onSelectNode: (node: WorkflowNodeDefinition | null) => void;
  onAddStep?: () => void;
  selectedNodeKey?: string | null;
  readOnly?: boolean;
}

export function WorkflowCanvas({ definition, layout, onChange, onSelectNode, onAddStep, selectedNodeKey, readOnly }: WorkflowCanvasProps) {
  const canvas = useMemo(() => toCanvas(definition, layout), [definition, layout]);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>(canvas.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(canvas.edges);
  const [connectionError, setConnectionError] = useState('');

  // Definition owns step data and membership; local state owns transient canvas measurements.
  useEffect(() => {
    setNodes(current => reconcileWorkflowNodes(canvas.nodes, current, selectedNodeKey));
    setEdges(canvas.edges);
  }, [canvas, selectedNodeKey, setNodes, setEdges]);

  const currentLayout = (): WorkflowCanvasLayout => ({
    ...layout,
    positions: Object.fromEntries(nodes.map(node => [node.id, node.position])),
  });
  const onConnect = (connection: Connection) => {
    if (readOnly) return;
    const result = connectWorkflowSteps(definition, connection.source, connection.target);
    setConnectionError(result.error ?? '');
    if (result.definition) onChange({ definition: result.definition, layout: currentLayout() });
  };

  return <div className="wf-canvas">
    <ReactFlow
      nodes={nodes} edges={edges}
      onNodesChange={changes => onNodesChange(changes.filter(change => change.type !== 'remove' && (!readOnly || change.type === 'select' || change.type === 'dimensions')))}
      onEdgesChange={changes => onEdgesChange(changes.filter(change => change.type !== 'remove'))}
      onDelete={({ nodes: removedNodes, edges: removedEdges }) => {
        if (readOnly) return;
        const removed = new Set(removedNodes.map(node => node.id));
        const removedLinks = new Set(removedEdges.map(edge => edge.id));
        onChange({ definition: { ...definition,
          nodes: definition.nodes.filter(node => !removed.has(node.key)),
          edges: definition.edges.filter(edge => !removed.has(edge.fromNodeKey) && !removed.has(edge.toNodeKey) && !removedLinks.has(`${edge.fromNodeKey}->${edge.toNodeKey}`)),
        }, layout: currentLayout() });
        if (selectedNodeKey && removed.has(selectedNodeKey)) onSelectNode(null);
      }}
      onNodeDragStop={(_, node) => {
        if (!readOnly) onChange({ definition, layout: { ...currentLayout(), positions: { ...currentLayout().positions, [node.id]: node.position } } });
      }}
      onConnect={onConnect}
      onNodeClick={(_, node) => onSelectNode(definition.nodes.find(step => step.key === node.id) ?? null)}
      onPaneClick={() => onSelectNode(null)}
      nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.3, maxZoom: 1 }}
      minZoom={0.25} maxZoom={1.5}
      nodesDraggable={!readOnly} nodesConnectable={!readOnly}
      deleteKeyCode={readOnly ? null : ['Backspace', 'Delete']}
      elementsSelectable
    >
      <FocusStep nodeKey={selectedNodeKey} />
      {!readOnly && onAddStep && <Panel position="top-left"><Button icon="plus" onClick={onAddStep}>Add step</Button></Panel>}
      {connectionError && <Panel position="top-center"><div role="alert" className="wf-error">{connectionError}</div></Panel>}
      <Controls showInteractive={!readOnly} />
      {definition.nodes.length > 3 && <MiniMap zoomable pannable nodeStrokeWidth={3} />}
      <Background gap={24} size={1} color="#d8dfeb" />
    </ReactFlow>
  </div>;
}
