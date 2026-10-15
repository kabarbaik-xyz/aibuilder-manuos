'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useGraphStore } from '../store/graph-store';
import { SCREENS, ScreenType } from '../lib/navigation';
import { Icon } from './icons';
import { Badge } from './ui/badge';

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();

  const {
    currentScreen,
    isNavMenuOpen,
    disruption,
    activeRecovery,
    setScreen,
    resetScenario,
    injectDisruption,
    openModal,
  } = useGraphStore();

  const hasPendingDecision = disruption.isDelayed && (!activeRecovery || activeRecovery.status === 'PROPOSED');

  const handleNavClick = (screenId: ScreenType) => {
    setScreen(screenId);
    if (pathname !== '/') {
      router.push('/');
    }
  };

  return (
    <aside
      className={`sidebar ${isNavMenuOpen ? 'open' : ''}`}
      id="sidebar"
      aria-label="Main navigation"
    >
      <button
        type="button"
        className="brand text-left"
        onClick={() => {
          setScreen('command');
          if (pathname !== '/') {
            router.push('/');
          }
        }}
        aria-label="ManuOS command center"
      >
        <span className="brand-symbol">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 18V6l8 9 8-9v12"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="brand-name">
          Manu<span>OS</span>
        </span>
      </button>

      <button
        type="button"
        className="factory-switch"
        onClick={() => openModal('factory-info')}
      >
        <span className="factory-mark">
          <Icon name="factory" />
        </span>
        <span>
          <strong>Precision Works</strong>
          <span className="small muted">Demo workspace</span>
        </span>
        <Icon name="down" className="ml-auto w-3" />
      </button>

      <div className="nav-group-label">Workspace</div>
      <nav className="nav-list">
        {SCREENS.map((s) => {
          const isActive = pathname === '/' && currentScreen === s.id;
          return (
            <button
              key={s.id}
              type="button"
              className={`nav-item ${isActive ? 'active' : ''}`}
              onClick={() => handleNavClick(s.id)}
              aria-current={isActive ? 'page' : undefined}
            >
              <Icon name={s.icon} />
              <span>{s.title}</span>
              {s.id === 'command' && hasPendingDecision && (
                <span className="nav-count">2</span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="nav-divider" />

      <div className="nav-group-label">Knowledge</div>
      <nav className="nav-list">
        <button
          type="button"
          className="nav-item"
          onClick={() => openModal('memory')}
        >
          <Icon name="book" />
          <span>Factory memory</span>
        </button>
        <button
          type="button"
          className="nav-item"
          onClick={() => openModal('audit')}
        >
          <Icon name="clock" />
          <span>Activity log</span>
        </button>
      </nav>

      <div className="sidebar-bottom">
        <div className="demo-control">
          <div className="between">
            <strong>Demo controls</strong>
            <Badge variant="default">Prototype</Badge>
          </div>
          <p>Explore a material delay and its recovery.</p>
          <button
            type="button"
            className="btn full"
            onClick={() => {
              if (disruption.isDelayed) {
                resetScenario();
              } else {
                injectDisruption();
              }
            }}
          >
            <Icon name={disruption.isDelayed ? 'reset' : 'bolt'} />
            {disruption.isDelayed ? 'Reset scenario' : 'Simulate delay'}
          </button>
        </div>

      </div>
    </aside>
  );
}
