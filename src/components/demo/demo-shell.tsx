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
import { DemoDashboard, DemoOrders, DemoInventory, DemoResources, DemoTasks, DemoCustomerPortal } from './demo-records';
import { DemoCoreAI } from './demo-coreai';
import { Badge } from '../ui/badge';
import { Panel } from '../ui/panel';

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
          workspaceSessionEnabled={false}
          accountControl={<Badge>Demo visitor</Badge>}
        />
        <main id="main" tabIndex={-1} className="workspace-main">
          <div className="demo-session-banner"><span><strong>Interactive demo</strong> · Sample records, isolated from operational data.</span><a href="/login">Open operational workspace →</a></div>
          {children ? (
            children
          ) : (
            <>
              {currentScreen === 'command' && <DemoDashboard />}
              {currentScreen === 'coreai' && <DemoCoreAI />}
              {currentScreen === 'orders' && <DemoOrders />}
              {currentScreen === 'risks' && <DemoOrders risksOnly />}
              {currentScreen === 'inventory' && <DemoInventory />}
              {currentScreen === 'resources' && <DemoResources />}
              {currentScreen === 'orchestrator' && <DemoTasks />}
              {currentScreen === 'workstation' && <DemoTasks shopFloor />}
              {currentScreen === 'customer' && <DemoCustomerPortal />}
              {currentScreen === 'network' && <Panel className="p-6"><h1>Factory network</h1><p className="muted">The older network marketplace simulation is not part of the current operational feature set. Explore CoreAI for supported scheduling and subcontract workflows.</p><button className="btn soft" onClick={() => useGraphStore.getState().setScreen('coreai')}>Open CoreAI</button></Panel>}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>ManuOS · Demo workspace</span>
          <span>Session simulation · no production writes</span>
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
