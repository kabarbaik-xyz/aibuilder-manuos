'use client';

import React, { useState } from 'react';
import { useGraphStore } from '../store/graph-store';
import { SCREENS, ScreenType } from '../lib/navigation';
import { Icon } from './icons';

export function SearchDialog() {
  const { setScreen, closeModal } = useGraphStore();
  const [query, setQuery] = useState('');

  const filteredScreens = SCREENS.filter((s) =>
    s.title.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div>
      <label className="sr-only" htmlFor="global-search-input">
        Search screens and workspaces
      </label>
      <input
        id="global-search-input"
        placeholder="Search orders, production, network…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      <div className="search-results">
        {filteredScreens.length > 0 ? (
          filteredScreens.map((s) => (
            <button
              key={s.id}
              type="button"
              className="search-result"
              onClick={() => {
                setScreen(s.id as ScreenType);
                closeModal();
              }}
            >
              <Icon name={s.icon} />
              <span>{s.title}</span>
              <Icon name="arrow" className="ml-auto w-3" />
            </button>
          ))
        ) : (
          <p className="empty-state">
            No workspace found. Try &ldquo;orders&rdquo; or &ldquo;network&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
