'use client';

import { DayPicker } from 'react-day-picker';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import { Icon } from '@/components/icons';

export interface DatePickerProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  placeholder?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

function parseDate(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
  return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3])
    ? date
    : undefined;
}

function formatValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatLabel(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function DatePicker({
  id,
  value,
  onChange,
  required = false,
  disabled = false,
  clearable = false,
  placeholder = 'Choose a date',
  'aria-invalid': invalid,
  'aria-describedby': describedBy,
}: DatePickerProps) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const popoverId = `${controlId}-calendar`;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 12, left: 12 });
  const selected = parseDate(value);
  const [month, setMonth] = useState(selected || new Date());

  useEffect(() => {
    if (selected) setMonth(selected);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node) && !popoverRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function togglePicker(event: MouseEvent<HTMLButtonElement>) {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 24);
    const height = 360;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const top = window.innerHeight - rect.bottom >= height + 12
      ? rect.bottom + 8
      : Math.max(12, rect.top - height - 8);
    setPosition({ top, left });
    setOpen(true);
  }

  return (
    <div className="date-picker" ref={wrapperRef}>
      <button
        id={controlId}
        type="button"
        className={`date-picker-trigger${invalid ? ' is-invalid' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popoverId}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={togglePicker}
      >
        <span className={selected ? '' : 'date-picker-placeholder'}>{selected ? formatLabel(selected) : placeholder}</span>
        <Icon name="calendar" />
      </button>
      {open && !disabled && (
        <div className="date-picker-popover" ref={popoverRef} style={{ top: position.top, left: position.left }} id={popoverId} role="dialog" aria-label="Choose date">
          <DayPicker
            mode="single"
            month={month}
            onMonthChange={setMonth}
            selected={selected}
            onSelect={date => {
              if (!date) return;
              onChange(formatValue(date));
              setOpen(false);
            }}
            autoFocus
            showOutsideDays
            fixedWeeks
          />
          {clearable && selected && (
            <div className="date-picker-footer">
              <button type="button" className="text-btn" onClick={() => { onChange(''); setOpen(false); }}>Clear date</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
