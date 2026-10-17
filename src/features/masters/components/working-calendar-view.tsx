import React, { useState } from 'react';
import type { Calendar } from '../api';
import { calendarToday, civilDateKey, operatingDay, weeklyIntervals } from '../calendar-presentation';
import { monthDays, sameDay } from '@/features/planning/schedule-presentation';
import { Icon } from '@/components/icons';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { PermissionGate } from '@/components/ui/permission-gate';

interface CalendarViewProps { calendar: Calendar; calendars: Calendar[]; onCalendarChange: (id: string) => void; onException: (date: string) => void }

export function WorkingCalendarView({ calendar, calendars, onCalendarChange, onException }: CalendarViewProps) {
  let today: Date;
  try { today = calendarToday(calendar.timezone); } catch { return <div className="ov-error" role="alert">This calendar has an invalid timezone. Correct its configuration before reviewing shifts.</div>; }
  return <CalendarMonth key={calendar.id} calendar={calendar} calendars={calendars} onCalendarChange={onCalendarChange} today={today} onException={onException} />;
}
function CalendarMonth({ calendar, calendars, onCalendarChange, today, onException }: CalendarViewProps & { today: Date }) {
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(today);
  const gridDays = monthDays(month);
  const lastMonthDay = gridDays.reduce((last, day, index) => day.getMonth() === month.getMonth() ? index : last, 0);
  const days = gridDays.slice(0, Math.ceil((lastMonthDay + 1) / 7) * 7);
  const selection = operatingDay(calendar, selected);
  const daysThisMonth = days.filter(day => day.getMonth() === month.getMonth());
  const exceptions = daysThisMonth.filter(day => operatingDay(calendar, day).exception).length;
  const unavailable = daysThisMonth.filter(day => operatingDay(calendar, day).intervals === null).length;
  const workdays = daysThisMonth.filter(day => (operatingDay(calendar, day).intervals?.length || 0) > 0).length;
  const move = (offset: number) => { const next = new Date(month.getFullYear(), month.getMonth() + offset, 1); setMonth(next); setSelected(next); };
  return <div className="wc-workbench">
    <section className="wc-month-panel"><div className="wc-month-heading"><div className="wc-calendar-identity"><span className="wc-calendar-symbol"><Icon name="calendar" /></span><div>{calendars.length > 1 ? <Select aria-label="Operating calendar" className="wc-calendar-switch" value={calendar.id} onChange={event => onCalendarChange(event.target.value)}>{calendars.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</Select> : <h2>{calendar.name}</h2>}<p>{calendar.code}<span>·</span>{calendar.timezone}</p></div></div><div className="wc-month-counts"><span><strong>{workdays}</strong> working days</span><span><strong>{exceptions}</strong> exceptions</span></div></div>
      {unavailable > 0 && <p className="ov-error" role="alert">Shift configuration is unavailable for {unavailable} dates in this month. These dates are not counted as working days.</p>}
      <div className="wc-month-nav"><h3 aria-live="polite">{month.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h3><div><Button size="small" onClick={() => { setMonth(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}>Today</Button><button type="button" className="icon-btn" aria-label="Previous month" onClick={() => move(-1)}><Icon name="arrow-left" /></button><button type="button" className="icon-btn" aria-label="Next month" onClick={() => move(1)}><Icon name="arrow" /></button></div></div>
      <div className="wc-month-scroll"><div className="wc-month-grid">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => <span className="wc-weekday" key={day}>{day}</span>)}
        {days.map(day => { const state = operatingDay(calendar, day); const working = Boolean(state.intervals?.length); return <button type="button" key={civilDateKey(day)} onClick={() => setSelected(day)} aria-pressed={sameDay(day, selected)} aria-label={`${day.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}: ${state.intervals === null ? 'Configuration unavailable' : working ? 'Working day' : 'Non-working day'}${state.exception ? ', exception' : ''}`} className={`wc-day ${day.getMonth() !== month.getMonth() ? 'outside' : ''} ${working ? 'working' : 'off'} ${sameDay(day, selected) ? 'selected' : ''}`}><span className={`wc-day-date ${sameDay(day, today) ? 'today' : ''}`}><span>{day.getDate()}</span>{state.exception && <Icon name="flag" />}</span>{state.intervals === null ? <small>Unavailable</small> : working ? <span className={`wc-day-shift ${state.exception ? 'exception' : ''}`}>{state.intervals?.map(interval => `${interval.start} – ${interval.end}`).join(' · ')}</span> : <small className="wc-off-label">Non-working</small>}{state.exception && <span className="wc-exception-label">{state.reason || 'Date exception'}</span>}</button>; })}
      </div></div>
      <div className="wc-calendar-legend"><span><i />Regular working day</span><span><Icon name="flag" />Date exception</span><span>Times shown in {calendar.timezone}</span></div>
    </section>
    <aside className="wc-detail" aria-label="Calendar details"><section className="wc-day-inspector"><div className="wc-selected-identity"><span className="wc-selected-symbol"><Icon name="calendar" /></span><div><h2>{selected.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</h2><p>{selection.intervals === null ? 'Unavailable configuration' : selection.exception ? selection.reason || 'Date exception' : selection.intervals.length ? 'Regular working day' : 'Non-working day'}</p></div></div>
      <div className="wc-selected-intervals">{selection.intervals === null ? <span>Shift data could not be read.</span> : selection.intervals.length ? selection.intervals.map((interval, i) => <span key={i}><Icon name="clock" />{interval.start} – {interval.end}</span>) : <span>No working intervals</span>}</div>
      <PermissionGate permission="resource.manage"><Button variant="soft" icon="plus" onClick={() => onException(civilDateKey(selected))}>{selection.exception ? 'Update exception' : 'Add exception'}</Button></PermissionGate>
    </section><details className="wc-weekly-details"><summary><Icon name="clock" /><strong>Weekly shift pattern</strong><span>Regular hours before date exceptions</span><Icon name="down" /></summary><div className="wc-week-pattern">{[1, 2, 3, 4, 5, 6, 0].map((day, index) => { const shifts = weeklyIntervals(calendar.weeklyJson, day); return <div key={day}><span>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][index]}</span><strong>{shifts === null ? 'Unavailable' : shifts.length ? shifts.map(interval => `${interval.start}–${interval.end}`).join(', ') : 'Off'}</strong></div>; })}</div></details></aside>
  </div>;
}
