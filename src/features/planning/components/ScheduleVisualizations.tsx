import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/components/ui/permission-gate';
import { monthDays, sameDay, taskInterval, tasksOnDay, timelineRange, type ScheduledTaskRow } from '../schedule-presentation';

interface Props {
  tasks: ScheduledTaskRow[];
  onAssign: (task: ScheduledTaskRow) => void;
}
const taskName = (task: ScheduledTaskRow) => task.nodeName || task.nodeKey || task.taskId.slice(0, 12);
const shortTime = (date: string | number) => new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fullTime = (date: string) => new Date(date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const taskColor = (task: ScheduledTaskRow) => task.materialWaitMinutes > 0 ? 'has-wait' : task.isCriticalPath ? 'is-critical' : 'is-flexible';

function AssignButton({ task, onAssign }: { task: ScheduledTaskRow; onAssign: Props['onAssign'] }) {
  return <PermissionGate permission={['task.assign', 'planning.write', 'resource.manage']}><button className="icon-btn" type="button" title={`Assign resources: ${taskName(task)}`} aria-label={`Assign resources to ${taskName(task)}`} onClick={() => onAssign(task)}><Icon name="users" /></button></PermissionGate>;
}

export function ScheduleGantt({ tasks, onAssign }: Props) {
  const range = timelineRange(tasks);
  if (!range) return <div className="ps-visual-empty">No valid task intervals to display. Use List to review the available task details.</div>;
  const span = range.end - range.start;
  const label = (timestamp: number) => new Date(timestamp).toLocaleString([], range.hourly ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric' });
  return <>
    <div className="ps-gantt-context"><span><Icon name="calendar" />{new Date(range.start).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}{!range.hourly && ` – ${new Date(range.end - 1).toLocaleDateString([], { day: 'numeric', month: 'short' })}`}</span><span>Read-only timeline · open a bar for task details</span></div>
    <div className="ps-gantt-scroll"><div className="ps-gantt" style={{ minWidth: Math.max(860, range.ticks.length * 95 + 270) }}>
      <div className="ps-gantt-header"><div className="ps-gantt-label">Operation / order</div><div className="ps-gantt-axis">{range.ticks.map((tick) => <span key={tick} style={{ left: `${(tick - range.start) / span * 100}%` }}>{label(tick)}</span>)}</div><div className="ps-gantt-action-head"><Icon name="users" /></div></div>
      {tasks.map((task) => {
        const interval = taskInterval(task);
        return <div className="ps-gantt-row" key={task.taskId}>
          <div className="ps-gantt-label"><Link href={`/planning/tasks/${task.taskId}`}>{taskName(task)}</Link><span>{task.orderNumber || 'No order'} <span>· {task.nodeKey || 'Operation'}</span></span></div>
          <div className="ps-gantt-track">
            {range.ticks.map((tick) => <i className="ps-gantt-gridline" key={tick} style={{ left: `${(tick - range.start) / span * 100}%` }} />)}
            {interval ? <Link href={`/planning/tasks/${task.taskId}`} className={`ps-gantt-bar ${taskColor(task)}`} style={{ left: `${(interval.start - range.start) / span * 100}%`, width: `${(interval.end - interval.start) / span * 100}%` }} title={`${taskName(task)} · ${fullTime(task.startAt)} – ${fullTime(task.endAt)} · ${task.isCriticalPath ? 'Critical path' : `${task.slackMinutes} min slack`}${task.materialWaitMinutes > 0 ? ` · ${task.materialWaitMinutes} min material wait` : ''}`} aria-label={`${taskName(task)}, ${task.orderNumber || ''}, ${fullTime(task.startAt)} to ${fullTime(task.endAt)}`}><span>{task.nodeKey || taskName(task)}</span></Link> : <span className="ps-interval-unavailable">Dates unavailable</span>}
          </div>
          <div className="ps-gantt-action"><AssignButton task={task} onAssign={onAssign} /></div>
        </div>;
      })}
    </div></div>
  </>;
}

export function ScheduleCalendar({ tasks, onAssign }: Props) {
  const firstTask = tasks.find((task) => taskInterval(task));
  const initial = firstTask ? new Date(firstTask.startAt) : new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState(() => initial);
  const days = monthDays(month);
  const agenda = tasksOnDay(tasks, selectedDay);
  const navigate = (offset: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + offset, 1);
    setMonth(next); setSelectedDay(next);
  };
  const jump = (day: Date) => { setMonth(new Date(day.getFullYear(), day.getMonth(), 1)); setSelectedDay(day); };
  return <>
    <div className="ps-calendar-toolbar"><h3 aria-live="polite">{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3><div><Button size="small" onClick={() => jump(new Date())}>Today</Button>{firstTask && <Button size="small" variant="soft" onClick={() => jump(new Date(firstTask.startAt))}>First task</Button>}<button className="icon-btn" type="button" aria-label="Previous month" onClick={() => navigate(-1)}><Icon name="arrow-left" /></button><button className="icon-btn" type="button" aria-label="Next month" onClick={() => navigate(1)}><Icon name="arrow" /></button></div></div>
    <div className="ps-calendar-scroll"><div className="ps-calendar-grid">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <div className="ps-calendar-weekday" key={day}>{day}</div>)}
      {days.map((day) => {
        const events = tasksOnDay(tasks, day);
        return <div key={day.toISOString()} className={`ps-calendar-day ${day.getMonth() !== month.getMonth() ? 'is-outside' : ''} ${sameDay(day, selectedDay) ? 'is-selected' : ''}`}>
          <button type="button" className={`ps-calendar-date ${sameDay(day, new Date()) ? 'is-today' : ''}`} aria-label={`Show tasks for ${day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`} aria-pressed={sameDay(day, selectedDay)} onClick={() => setSelectedDay(day)}>{day.getDate()}</button>
          <div className="ps-calendar-events">{events.slice(0, 3).map((task) => <Link className={`ps-calendar-event ${taskColor(task)}`} key={task.taskId} href={`/planning/tasks/${task.taskId}`} title={`${taskName(task)} · ${task.orderNumber || ''} · ${fullTime(task.startAt)} – ${fullTime(task.endAt)}`}><span>{sameDay(new Date(task.startAt), day) ? shortTime(task.startAt) : 'Continues'}</span><strong>{taskName(task)}</strong></Link>)}{events.length > 3 && <button type="button" className="ps-more-events" onClick={() => setSelectedDay(day)} aria-label={`Show all ${events.length} tasks for ${day.toLocaleDateString()}`}>+{events.length - 3} more</button>}</div>
        </div>;
      })}
    </div></div>
    <div className="ps-agenda"><div className="ps-agenda-heading"><h3>{selectedDay.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</h3><span>{agenda.length} {agenda.length === 1 ? 'task' : 'tasks'} on this page</span></div>
      {!agenda.length ? <p className="ps-agenda-empty">No tasks from the current results overlap this day. Choose another day, change the filter, or go to the next results page.</p> : agenda.map((task) => <div className="ps-agenda-row" key={task.taskId}><span className={`ps-event-marker ${taskColor(task)}`} /><span className="ps-agenda-time">{fullTime(task.startAt)}<small>to {fullTime(task.endAt)}</small></span><Link href={`/planning/tasks/${task.taskId}`}><strong>{taskName(task)}</strong><span>{task.orderNumber || 'No order'} · {task.itemName || task.nodeKey}</span></Link><AssignButton task={task} onAssign={onAssign} /></div>)}
    </div>
  </>;
}
