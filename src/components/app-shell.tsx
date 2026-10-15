'use client';

import React, { useEffect } from 'react';
import { useSidebarAccessibility } from './use-sidebar-accessibility';
import { useGraphStore } from '../store/graph-store';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { Toast } from './ui/toast';
import { ModalManager } from './modal-manager';
import { FloatingCopilot } from './floating-copilot';
import { CommandCenterView } from '../features/command-center/command-center-view';
import { OrchestratorView } from '../features/orchestrator/orchestrator-view';
import { WorkstationView } from '../features/workstation/workstation-view';
import { CustomerPortalView } from '../features/customer-portal/customer-portal-view';
import { NetworkView } from '../features/network/network-view';

export interface AppShellProps {
  children?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  activeTitle?: string;
}

export function AppShell({ children, breadcrumb, activeTitle }: AppShellProps = {}) {
  useSidebarAccessibility();
  const {
    currentScreen,
    toastMessage,
    openModal,
    isSidebarCollapsed,
    isNavMenuOpen,
    toggleSidebar,
    closeNavMenu,
  } = useGraphStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        closeNavMenu();
        openModal('search');
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        closeNavMenu();
        openModal('brain');
      }
      if (e.key === 'Escape' && isNavMenuOpen) {
        closeNavMenu();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openModal, toggleSidebar, isNavMenuOpen, closeNavMenu]);

  return (
    <div className={`app-shell ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar />
      {isNavMenuOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeNavMenu}
          aria-hidden="true"
        />
      )}
      <div className="workspace">
        <Topbar customBreadcrumb={breadcrumb} activeTitle={activeTitle} />
        <main id="main" tabIndex={-1}>
          {children ? (
            children
          ) : (
            <>
              {currentScreen === 'command' && <CommandCenterView />}
              {currentScreen === 'orchestrator' && <OrchestratorView />}
              {currentScreen === 'workstation' && <WorkstationView />}
              {currentScreen === 'customer' && <CustomerPortalView />}
              {currentScreen === 'network' && <NetworkView />}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>ManuOS manufacturing prototype</span>
          <span>Simulated data · 24 Nov 2026</span>
        </footer>
      </div>

      <FloatingCopilot />
      <ModalManager />
      <Toast message={toastMessage} />
    </div>
  );
}
