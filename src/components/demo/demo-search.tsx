 'use client';
import { useState } from 'react';
import { SCREENS } from '@/lib/navigation';
import { useGraphStore } from '@/store/graph-store';
import { useUiStore } from '@/store/ui-store';
import { Input } from '@/components/ui/input';
import { Icon } from '@/components/icons';
export function DemoSearch() {
  const [query, setQuery] = useState('');
  return <div><label className="sr-only" htmlFor="demo-search">Search demo navigation</label><Input id="demo-search" autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Find CoreAI, orders, inventory…" /><div className="search-results">{SCREENS.filter(s => s.id !== 'network' && s.title.toLowerCase().includes(query.toLowerCase())).map(s => <button type="button" className="search-result" key={s.id} onClick={() => { useGraphStore.getState().setScreen(s.id); useUiStore.getState().closeModal(); }}><Icon name={s.icon} /><span>{s.title}</span><Icon name="arrow" /></button>)}</div></div>;
}
