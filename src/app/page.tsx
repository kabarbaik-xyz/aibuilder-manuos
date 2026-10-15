import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requirePrincipal } from '@/server/auth/auth';
import { getAdminNavigation, getWorkflowNavigation, getMasterNavigation } from '@/lib/master-navigation';
export default async function Home(){
 let destination='/login';
 try {const principal=await requirePrincipal(await headers());const permissions=[...principal.permissions];destination=getWorkflowNavigation(permissions)[0]?.href||getMasterNavigation(permissions)[0]?.href||getAdminNavigation(permissions)[0]?.href||'/account';}catch{}
 redirect(destination);
}
