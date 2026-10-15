'use client';

import { Icon } from '@/components/icons';
import { Input } from '@/components/ui/input';

type ListSearchProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
};

export function ListSearch({ value, onChange, placeholder = 'Search records…', label = 'Search records' }: ListSearchProps) {
  return (
    <label className="list-search">
      <Icon name="search" className="list-search-icon" />
      <Input
        type="search"
        aria-label={label}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
