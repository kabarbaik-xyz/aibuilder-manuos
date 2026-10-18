'use client';

import React from 'react';
import { useUiStore } from '../store/ui-store';
import { Icon } from './icons';
import { Button } from './ui/button';
import { useWorkspaceNavigation } from './workspace-navigation-context';
import { AccountMenu } from './account-menu';
import { NotificationInbox } from './notification-inbox';

interface TopbarProps {
  accountControl?: React.ReactNode;
  workspaceSessionEnabled?: boolean;
  customBreadcrumb?: React.ReactNode;
  /** Overrides the route-metadata-derived title (used by the demo shell). */
  activeTitle?: string;
  /** Overrides the workspace name segment of the breadcrumb. */
  factoryName?: string;
  /** Hides the notification inbox (used by the demo shell). */
  showNotifications?: boolean;
  /** Live-indicator label; defaults to "Workspace". */
  sessionLabel?: string;
}

/**
 * Shared topbar shell. Production derives identity from the authenticated
 * workspace session; the demo shell passes explicit overrides instead of this
 * component detecting the demo route.
 */
export function Topbar({
  customBreadcrumb,
  activeTitle,
  factoryName,
  showNotifications = true,
  sessionLabel = 'Workspace',
  accountControl,
  workspaceSessionEnabled = true,
}: TopbarProps = {}) {
  const { toggleSidebar, isSidebarCollapsed, isNavMenuOpen, openModal } = useUiStore();
  const { metadata, principal } = useWorkspaceNavigation(workspaceSessionEnabled);

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
          <span className="breadcrumb-factory">{factoryName || principal?.workspaceName || 'Workspace'}</span>
          <span className="breadcrumb-factory">/</span>
          {customBreadcrumb ? (
            customBreadcrumb
          ) : (
            <strong>{activeTitle || metadata.title}</strong>
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
        {showNotifications && <NotificationInbox />}
        <span className="live-indicator">
          <span className="dot" />
          {sessionLabel}
        </span>
        <Button
          className="topbar-assistant"
          aria-label="Ask AI"
          variant="soft"
          icon="spark"
          onClick={() => openModal('brain')}
        >
          <span>Ask AI</span>
        </Button>
        {accountControl ?? <AccountMenu />}
      </div>
    </header>
  );
}
