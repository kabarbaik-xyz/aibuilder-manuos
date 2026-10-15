'use client';
import type { ReactNode } from 'react';
import { useWorkspaceNavigation } from '../workspace-navigation-context';
export function PermissionGate({permission,children}:{permission:string | readonly string[];children:ReactNode}) {
 const {principal}=useWorkspaceNavigation();
 return (typeof permission === 'string' ? [permission] : permission).some(value => principal?.permissions.includes(value))?children:null;
}
