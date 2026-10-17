import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { UnauthorizedError } from '@/domain/errors';
import { requirePrincipal } from '@/server/auth/auth';
import { hasPermission } from '@/server/auth/permissions';
import { ErrorState } from '@/components/ui/resource-state';
import { AccessView } from '@/features/access/access-view';
export default async function Page({ searchParams }: { searchParams: Promise<{ technicianId?: string }> }) {
  const requestHeaders = await headers();
  const principal = await requirePrincipal(requestHeaders).catch(error => {
    if (error instanceof UnauthorizedError) redirect('/login');
    throw error;
  });
  if (!hasPermission(principal, 'access.manage')) return <ErrorState message="You need access.manage to administer workspace access." />;
  return <AccessView section="users" initialTechnicianId={(await searchParams).technicianId} />;
}
