'use client';
import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { apiRequest } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { resolveRouteMetadata } from '@/lib/route-metadata';
import type { PrincipalJson } from '@/server/auth/principal';
export function useWorkspaceNavigation() {
 const pathname = usePathname();
 const session = useQuery({ queryKey: queryKeys.me(), queryFn: () => apiRequest<{data: PrincipalJson}>('/api/me'), retry:false });
 return { ...session, principal:session.data?.data, pathname, metadata:resolveRouteMetadata(pathname) };
}
