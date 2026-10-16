'use client';

import React from 'react';
import { useGraphStore } from '../store/graph-store';
import { SCREENS } from '../lib/navigation';
import { Icon } from './icons';
import { Button } from './ui/button';
import { useWorkspaceNavigation } from './workspace-navigation-context';
import { AccountMenu } from './account-menu';
import { NotificationInbox } from './notification-inbox';

interface TopbarProps {
  customBreadcrumb?: React.ReactNode;
  activeTitle?: string;
}

export function Topbar({ customBreadcrumb, activeTitle }: TopbarProps = {}) {
  const { currentScreen, toggleSidebar, isSidebarCollapsed, isNavMenuOpen, openModal } = useGraphStore();
  const { metadata, principal, isDemo } = useWorkspaceNavigation();
  const screen = SCREENS.find((s) => s.id === currentScreen) || SCREENS[0];

  return (
    <header className="topbar" id="topbar">
      <div className="topbar-leading">
        <button
          type="button"
          className={`icon-btn menu-toggle ${isSidebarCollapsed || isNavMenuOpen ? 'collapsed' : ''}`}
          onClick={toggleSidebar}
          aria-label="Toggle navigation"
          aria-expanded={isNavMenuOpen}
          aria-controls="sidebar"
          title="Toggle navigation"
        >
          <Icon name="menu" />
        </button>
        <div className="breadcrumb">
          <span className="breadcrumb-factory">{isDemo ? 'Precision Works' : principal?.workspaceName || 'Workspace'}</span>
          <span className="breadcrumb-factory">/</span>
          {customBreadcrumb ? (
            customBreadcrumb
          ) : (
            <strong>{activeTitle || (isDemo ? screen.title : metadata.title)}</strong>
          )}
        </div>
      </div>

      <div className="topbar-tools">
        <button
          type="button"
          className="topbar-search"
          onClick={() => openModal('search')}
          aria-label="Search workspace"
        >
          <Icon name="search" />
          <span>Search anything</span>
          <kbd>⌘ K</kbd>
        </button>
        <span className="topbar-rule" />
        {!isDemo && <NotificationInbox />}
        <span className="live-indicator">
          <span className="dot" />
          {isDemo ? 'Demo session' : 'Workspace'}
        </span>
        <Button
          className="topbar-assistant"
          aria-label="Ask ManuOS"
          variant="soft"
          icon="spark"
          onClick={() => openModal('brain')}
        >
          <span>Ask ManuOS</span>
        </Button>
        <AccountMenu />
      </div>
    </header>
  );
}
