'use client';
import { useWorkspaceNavigation } from '@/components/workspace-navigation-context';
import { PageHeader } from '@/components/ui/page-header';
import { LoadingState, ErrorState } from '@/components/ui/resource-state';
export default function AccountPage(){const {principal,isPending,error,refetch}=useWorkspaceNavigation();return <div className="page-stack"><PageHeader title="My account" description="Your identity and access in this workspace."/>{isPending?<LoadingState/>:error?<ErrorState onRetry={()=>refetch()}/>:<section className="form-section page-stack"><h2>{principal?.name}</h2><p>{principal?.email}</p><div className="spec-row"><span>Workspace</span><strong>{principal?.workspaceName||'Workspace'}</strong></div><div className="spec-row"><span>Roles</span><strong>{principal?.roles.join(', ')}</strong></div><p className="muted">Available navigation follows the permissions assigned by your workspace administrator.</p></section>}</div>;}
