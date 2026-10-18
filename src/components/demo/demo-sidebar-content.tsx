'use client';

import React from 'react';
import { useGraphStore } from '../../store/graph-store';
import { useUiStore } from '../../store/ui-store';
import { SCREENS } from '../../lib/navigation';
import { Icon } from '../icons';

/** Demo navigation uses explicit groups with consistent vertical rhythm. */
export function DemoSidebarNav() {
  const currentScreen = useGraphStore((s) => s.currentScreen);
  const setScreen = useGraphStore((s) => s.setScreen);
  const openModal = useUiStore((s) => s.openModal);
  const closeNavMenu = useUiStore((s) => s.closeNavMenu);

  return (
    <>
      {[
        { title: 'Overview', ids: ['command', 'coreai', 'risks'] },
        { title: 'Operations', ids: ['orders', 'orchestrator', 'workstation', 'inventory'] },
        { title: 'Resources & delivery', ids: ['resources', 'customer'] },
      ].map(group => <div key={group.title} className="demo-nav-group"><div className="nav-group-label">{group.title}</div><nav className="nav-list" aria-label={group.title}>
        {group.ids.map(id => SCREENS.find(screen => screen.id === id)!).map(item => <button key={item.id} type="button" className={`nav-item ${currentScreen === item.id ? 'active' : ''}`} aria-current={currentScreen === item.id ? 'page' : undefined} onClick={() => { setScreen(item.id); closeNavMenu(); }}><Icon name={item.icon} /><span>{item.title}</span></button>)}
      </nav></div>)}
      <div className="nav-divider" />
      <nav className="nav-list" aria-label="Demo knowledge">
        <button type="button" className="nav-item" onClick={() => openModal('memory')}>
          <Icon name="book" />
          Factory memory
        </button>
        <button type="button" className="nav-item" onClick={() => openModal('audit')}>
          <Icon name="clock" />
          Activity log
        </button>
      </nav>
    </>
  );
}

/** Demo sidebar footer: scenario controls for the material-delay simulation. */
export function DemoSidebarControls() {
  const disruption = useGraphStore((s) => s.disruption);
  const injectDisruption = useGraphStore((s) => s.injectDisruption);
  const resetScenario = useGraphStore((s) => s.resetScenario);

  return (
    <div className="sidebar-bottom">
      <div className="demo-control">
        <strong>Demo controls</strong>
        <p>Explore a material delay and its recovery.</p>
        <button
          type="button"
          className="btn full"
          onClick={() => (disruption.isDelayed ? resetScenario() : injectDisruption())}
        >
          <Icon name="bolt" />
          {disruption.isDelayed ? 'Reset scenario' : 'Simulate delay'}
        </button>
      </div>
    </div>
  );
}
