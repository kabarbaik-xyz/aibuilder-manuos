'use client';

import React, { useState } from 'react';
import { useGraphStore } from '../../store/graph-store';
import { Icon } from '../../components/icons';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { formatDateEn } from '../../engines/calendar';

export function OrchestratorView() {
  const store = useGraphStore();
  const {
    tasks,
    disruption,
    activeRecovery,
    openModal,
    setScreen,
    assignTechnician,
  } = store;

  const [activeTab, setActiveTab] = useState<'graph' | 'gantt' | 'kanban'>('graph');
  const [assignedBudi, setAssignedBudi] = useState(false);

  const isDelayed = disruption.isDelayed;
  const isApproved = activeRecovery?.status === 'APPLIED';
  const heroOrder = store.orders.find((o) => o.id === '1042')!;

  const getTaskStatus = (id: string) => {
    if (['T1', 'T2', 'T4', 'T5', 'T6', 'T7', 'T8'].includes(id)) return 'Complete';
    if (['T12', 'T13', 'T14'].includes(id)) return isDelayed ? 'Blocked' : 'Ready';
    if (id === 'T9') return assignedBudi ? 'Assigned' : 'Ready';
    return 'In progress';
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Production orchestrator</h1>
          <p>See what can move. Resolve what cannot.</p>
        </div>
        <div className="actions">
          <Button icon="bolt" onClick={() => openModal('event')}>
            Simulate event
          </Button>
          <Button
            variant="primary"
            iconRight="arrow"
            onClick={() => openModal('recovery')}
          >
            Review recovery
          </Button>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented" role="tablist" aria-label="Production view">
          <button
            type="button"
            className={activeTab === 'graph' ? 'active' : ''}
            onClick={() => setActiveTab('graph')}
            role="tab"
            aria-selected={activeTab === 'graph'}
          >
            <Icon name="graph" /> Graph
          </button>
          <button
            type="button"
            className={activeTab === 'gantt' ? 'active' : ''}
            onClick={() => setActiveTab('gantt')}
            role="tab"
            aria-selected={activeTab === 'gantt'}
          >
            <Icon name="calendar" /> Timeline
          </button>
          <button
            type="button"
            className={activeTab === 'kanban' ? 'active' : ''}
            onClick={() => setActiveTab('kanban')}
            role="tab"
            aria-selected={activeTab === 'kanban'}
          >
            <Icon name="grid" /> Board
          </button>
        </div>
        <span className="select flex">
          #CO-2026-1042 · Control panels <Badge variant="default">120 units</Badge>
        </span>
      </div>

      <section className="panel graph-panel">
        <div className="panel-head">
          <div>
            <h2>
              {activeTab === 'graph'
                ? 'Order dependency graph'
                : activeTab === 'gantt'
                ? 'Production timeline'
                : 'Task board'}
            </h2>
          </div>
          <div className="legend">
            <span>
              <span className="dot" /> Complete
            </span>
            <span>
              <span className="dot blue" /> In progress
            </span>
            <span>
              <span className="dot warning" /> Blocked
            </span>
          </div>
        </div>

        {activeTab === 'graph' && (
          <div className="graph-scroll">
            <svg
              className="manufacturing-graph"
              viewBox="0 0 905 305"
              role="img"
              aria-labelledby="graph-title"
            >
              <title id="graph-title">
                Fourteen tasks with machining, panel and assembly branches.
                Terminal blocks affect wiring and final QC.
              </title>
              <defs>
                <marker
                  id="arrowhead"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="m0 0 10 5-10 5Z" fill="#c2cde0" />
                </marker>
              </defs>

              <text x="35" y="30" className="graph-label">
                CHASSIS · MO-01
              </text>
              <text x="35" y="119" className="graph-label">
                PANELS · MO-01
              </text>
              <text x="35" y="204" className="graph-label">
                ASSEMBLY · MO-02
              </text>

              {/* Edge connections between tasks */}
              {(
                [
                  [35, 58, 180, 58, false], // T1 -> T2
                  [180, 58, 325, 58, false], // T2 -> T3
                  [325, 58, 470, 58, false], // T3 -> T4
                  [35, 143, 180, 143, false], // T5 -> T6
                  [180, 143, 325, 143, false], // T6 -> T7
                  [325, 143, 470, 143, false], // T7 -> T10
                  [470, 58, 470, 143, false], // T4 -> T10
                  [35, 228, 180, 228, false], // T8 -> T9
                  [180, 228, 470, 143, false], // T9 -> T10
                  [470, 143, 615, 143, true], // T10 -> T11
                  [615, 143, 760, 143, isDelayed], // T11 -> T12 (critical/blocked)
                  [760, 143, 760, 228, isDelayed], // T12 -> T13 (critical/blocked)
                  [760, 228, 615, 228, isDelayed], // T13 -> T14 (critical/blocked)
                ] as [number, number, number, number, boolean][]
              ).map(([x1, y1, x2, y2, isCrit], idx) => {
                let d = `M${x1 + 120} ${y1 + 26} L${x2} ${y2 + 26}`;
                if (x1 === x2) {
                  d = `M${x1 + 60} ${y1 + 52} V${y2}`;
                } else if (y1 !== y2) {
                  d = `M${x1 + 120} ${y1 + 26} C${x1 + 140} ${y1 + 26},${
                    x2 - 20
                  } ${y2 + 26},${x2} ${y2 + 26}`;
                }
                return (
                  <path
                    key={idx}
                    className={`graph-edge ${isCrit ? 'critical' : ''}`}
                    d={d}
                    markerEnd="url(#arrowhead)"
                  />
                );
              })}

              {/* Material requirement indicator */}
              <path
                d="M820 95v48"
                stroke="#d59840"
                strokeDasharray="3 3"
              />
              <text
                x="762"
                y="83"
                className="graph-label"
                style={{ fill: '#985715', fontWeight: 600 }}
              >
                TB-24 · {isDelayed ? 'delayed +2d' : 'available'}
              </text>

              {/* 14 Tasks nodes */}
              {[
                ['T1', 'Cut stock', 'Machining', 35, 58],
                ['T2', 'Press bend', 'Machining', 180, 58],
                ['T3', 'CNC finish', 'CNC-02', 325, 58],
                ['T4', 'Chassis QC', 'Inspection', 470, 58],
                ['T5', 'Drill panels', 'CNC-01', 35, 143],
                ['T6', 'Deburr', 'Finishing', 180, 143],
                ['T7', 'Panel QC', 'Inspection', 325, 143],
                ['T8', 'Prepare harness', 'Assembly', 35, 228],
                ['T9', 'Structural weld', 'WABO cert', 180, 228],
                ['T10', 'Fit enclosure', 'Assembly', 470, 143],
                ['T11', 'Mount internals', 'Assembly', 615, 143],
                ['T12', 'Wire & terminate', 'TB-24 block', 760, 143],
                ['T13', 'Electrical QC', 'Final QC', 760, 228],
                ['T14', 'Final release', 'Delivery', 615, 228],
              ].map(([id, name, sub, x, y]) => {
                const status = getTaskStatus(id as string);
                const statusCls =
                  status === 'Complete'
                    ? 'done'
                    : status === 'Blocked'
                    ? 'blocked'
                    : status === 'In progress'
                    ? 'running'
                    : 'ready';

                return (
                  <g
                    key={id as string}
                    className={`graph-node ${statusCls}`}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${id}: ${name}`}
                    onClick={() => openModal('task', { id, name })}
                    transform={`translate(${x},${y})`}
                  >
                    <rect width="120" height="52" rx="8" />
                    <text x="10" y="18">
                      {name}
                    </text>
                    <text x="10" y="36" className="node-sub">
                      {id} · {sub}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        {activeTab === 'gantt' && (
          <div className="gantt">
            <div className="gantt-row">
              <span>OPERATION</span>
              {[24, 25, 26, 27, 28, 29, 30].map((d) => (
                <span key={d}>Nov {d}</span>
              ))}
            </div>
            {[
              ['CNC finish', 2, 3, 'success'],
              ['Fit enclosure', 3, 4, ''],
              ['Mount internals', 4, 5, ''],
              ['Wire & terminate', 5, 7, isDelayed ? 'warning' : ''],
              ['Electrical QC', 6, 7, isDelayed ? 'warning' : ''],
              ['Final release', 6, 7, isDelayed ? 'warning' : ''],
            ].map(([name, start, end, cls]) => (
              <div key={name as string} className="gantt-row">
                <strong>{name}</strong>
                <div
                  className={`gantt-block ${cls}`}
                  style={{ gridColumn: `${start}/${end}` }}
                >
                  {name}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'kanban' && (
          <div className="panel-body kanban">
            {['Ready', 'In progress', 'Blocked', 'Complete'].map((col) => {
              const colTasks = tasks.filter((t) => {
                const s = getTaskStatus(t.id);
                if (col === 'Ready') return s === 'Ready' || s === 'Assigned';
                if (col === 'In progress') return s === 'In progress';
                if (col === 'Blocked') return s === 'Blocked';
                if (col === 'Complete') return s === 'Complete';
                return false;
              });

              return (
                <div key={col} className="kanban-col">
                  <h3>
                    {col} <span className="muted">{colTasks.length}</span>
                  </h3>
                  {colTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="task-card full"
                      onClick={() => openModal('task', t)}
                    >
                      <span className="small muted">{t.id}</span>
                      <strong>{t.name}</strong>
                      <p>{t.machineClass || t.department}</p>
                    </button>
                  ))}
                  {colTasks.length === 0 && (
                    <p className="small muted">No tasks here</p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="graph-footer">
          <span>
            <Icon name="info" />{' '}
            {isDelayed
              ? '3 blocked tasks · 11 tasks can continue'
              : 'All dependencies clear · 14 tasks'}
          </span>
          <span>
            Promised Nov 25{' '}
            <strong className={isDelayed ? 'warning-text' : 'success-text'}>
              → Expected {heroOrder.expectedDate ? formatDateEn(heroOrder.expectedDate) : 'Nov 25'}
            </strong>
          </span>
        </div>
      </section>

      <div className="impact-grid">
        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Material impact</h2>
            </div>
            <Badge variant={isDelayed ? 'warning' : 'success'}>
              {isDelayed ? 'Action needed' : 'Resolved'}
            </Badge>
          </div>
          <div className="panel-body">
            <div className="need-highlight">
              <strong>Terminal blocks · TB-24</strong>
              <p>
                {isDelayed
                  ? 'Supplier ETA Nov 27 · 2 days late'
                  : 'Materials available for assembly'}
              </p>
            </div>
            {[
              ['T12', 'Wire & terminate', 'Assembly'],
              ['T13', 'Electrical inspection', 'QC'],
              ['T14', 'Final release', 'QC'],
            ].map(([id, name]) => (
              <div key={id} className="impact-task">
                <span>
                  <span className="task-ref">{id}</span>
                  {name}
                </span>
                <Badge variant={isDelayed ? 'warning' : 'success'}>
                  {isDelayed ? 'Blocked' : 'Ready'}
                </Badge>
              </div>
            ))}
            <div className="between mt">
              <span className="small muted">Order #1045 also affected</span>
              <Button
                variant="text"
                iconRight="arrow"
                onClick={() => setScreen('network')}
              >
                Source materials
              </Button>
            </div>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <div>
              <h2>Assign the right person</h2>
            </div>
            <Badge variant="blue">Structural weld</Badge>
          </div>
          <div className="panel-body">
            {/* Candidate 1: Budi Santoso (Best Fit) */}
            <div className="dispatch-row">
              <span className="avatar">BS</span>
              <div className="dispatch-person">
                <strong>
                  Budi Santoso <Badge variant="success">Best fit</Badge>
                </strong>
                <p>WABO certified · Level 4 · QC pass 95%</p>
              </div>
              <span className="score">94</span>
              <Button
                variant={assignedBudi ? 'soft' : 'default'}
                size="small"
                onClick={() => {
                  if (!assignedBudi) {
                    assignTechnician('T9', 'tech-budi');
                    setAssignedBudi(true);
                  }
                }}
              >
                {assignedBudi ? 'Assigned' : 'Assign'}
              </Button>
            </div>

            {/* Candidate 2: Rina Putri */}
            <div className="dispatch-row">
              <span className="avatar">RP</span>
              <div className="dispatch-person">
                <strong>Rina Putri</strong>
                <p>WABO certified · Level 3 · QC pass 91%</p>
              </div>
              <span className="score muted">82</span>
              <Button
                variant="text"
                iconRight="arrow"
                onClick={() => openModal('dispatch-compare')}
              >
                Compare
              </Button>
            </div>

            {/* Candidate 3: Adi Pratama (Hard cert exclusion) */}
            <div className="dispatch-row excluded">
              <span className="avatar">AD</span>
              <div className="dispatch-person">
                <strong>Adi Pratama</strong>
                <p>Available · WABO certification missing</p>
              </div>
              <Badge variant="default">Not eligible</Badge>
            </div>

            <div className="recommendation mt">
              <Icon name="shield" />
              <div>
                <strong>Certification is required.</strong>
                <p>
                  WABO-certified welders only. Availability alone is not
                  enough.
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
