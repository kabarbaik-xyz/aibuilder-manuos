'use client';

import React, { useEffect } from 'react';
import { useSidebarAccessibility } from '../use-sidebar-accessibility';
import { useGraphStore } from '../../store/graph-store';
import { useUiStore } from '../../store/ui-store';
import { Sidebar } from '../sidebar';
import { Topbar } from '../topbar';
import { Toast } from '../ui/toast';
import { DemoModalManager } from './demo-modal-manager';
import { FloatingCopilot } from '../floating-copilot';
import { DemoSidebarNav, DemoSidebarControls } from './demo-sidebar-content';
import { SCREENS } from '../../lib/navigation';
import { CommandCenterView } from '../../features/command-center/command-center-view';
import { OrchestratorView } from '../../features/orchestrator/orchestrator-view';
import { WorkstationView } from '../../features/workstation/workstation-view';
import { CustomerPortalView } from '../../features/customer-portal/customer-portal-view';
import { NetworkView } from '../../features/network/network-view';

export interface DemoShellProps {
  children?: React.ReactNode;
  breadcrumb?: React.ReactNode;
  activeTitle?: string;
}

/**
 * Shell for the public simulated demo (`/demo`). Composes the shared Sidebar /
 * Topbar primitives with demo-specific navigation, modals, and views so the
 * production shell never branches on demo state.
 */
export function DemoShell({ children, breadcrumb, activeTitle }: DemoShellProps = {}) {
  useSidebarAccessibility();
  const currentScreen = useGraphStore((s) => s.currentScreen);
  const {
    isSidebarCollapsed,
    isNavMenuOpen,
    toggleSidebar,
    closeNavMenu,
    openModal,
  } = useUiStore();

  const screen = SCREENS.find((s) => s.id === currentScreen) || SCREENS[0];

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
      <Sidebar
        factoryName="Precision Works"
        factoryTagline="Demo workspace"
        brandHref="/demo"
        nav={<DemoSidebarNav />}
        bottom={<DemoSidebarControls />}
      />
      {isNavMenuOpen && (
        <div className="sidebar-backdrop" onClick={closeNavMenu} aria-hidden="true" />
      )}
      <div className="workspace">
        <Topbar
          customBreadcrumb={breadcrumb}
          activeTitle={activeTitle || screen.title}
          factoryName="Precision Works"
          showNotifications={false}
          sessionLabel="Demo session"
        />
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
      <DemoModalManager />
      <ToastWrapper />
    </div>
  );
}

function ToastWrapper() {
  const toastMessage = useUiStore((s) => s.toastMessage);
  return <Toast message={toastMessage} />;
}
