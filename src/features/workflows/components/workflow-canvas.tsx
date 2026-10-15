"use client";

import React, { useCallback, useMemo } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import {
  WorkflowNodeDefinition,
  WorkflowDefinition,
} from "@/domain/workflow-definition";
import {
  toCanvas,
  fromCanvas,
  WorkflowCanvasLayout,
  CanvasNodeData,
} from "../canvas-adapter";
import { CustomWorkflowNode } from "./custom-workflow-node";

const nodeTypes = {
  customWorkflowNode: CustomWorkflowNode,
};

interface WorkflowCanvasProps {
  definition: WorkflowDefinition;
  layout?: WorkflowCanvasLayout;
  onChange: (updated: {
    definition: WorkflowDefinition;
    layout: WorkflowCanvasLayout;
  }) => void;
  onSelectNode: (node: WorkflowNodeDefinition | null) => void;
  readOnly?: boolean;
}

export function WorkflowCanvas({
  definition,
  layout,
  onChange,
  onSelectNode,
  readOnly,
}: WorkflowCanvasProps) {
  const initialCanvas = useMemo(
    () => toCanvas(definition, layout),
    [definition, layout],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<CanvasNodeData>>(
    initialCanvas.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialCanvas.edges);

  const onConnect = useCallback(
    (params: Connection) => {
      if (readOnly) return;
      if (params.source === params.target) return; // Disallow self loops

      setEdges((eds) => {
        const nextEdges = addEdge(
          { ...params, animated: false, data: { joinPolicy: "AND" } },
          eds,
        );
        const res = fromCanvas(nodes, nextEdges, definition.name);
        onChange(res);
        return nextEdges;
      });
    },
    [nodes, definition.name, onChange, readOnly, setEdges],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onSelectNode(node.data as unknown as WorkflowNodeDefinition);
    },
    [onSelectNode],
  );

  const handlePaneClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  return (
    <div className="h-130 w-full rounded-lg border border-line bg-surface relative overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) => {
          if (!readOnly) onNodesChange(changes);
        }}
        onEdgesChange={(changes) => {
          if (!readOnly) onEdgesChange(changes);
        }}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable={true}
      >
        <Controls />
        <MiniMap zoomable pannable nodeStrokeWidth={3} />
        <Background gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}
