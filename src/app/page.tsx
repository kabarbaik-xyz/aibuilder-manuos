import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requirePrincipal } from '@/server/auth/auth';
import { getAdminNavigation, getWorkflowNavigation, getMasterNavigation } from '@/lib/master-navigation';
export default async function Home(){
 let destination='/login';
 try {const principal=await requirePrincipal(await headers());const permissions=[...principal.permissions];const roles=principal.roles??[];destination=getWorkflowNavigation(permissions, roles, principal.customerId)[0]?.href||getMasterNavigation(permissions, roles)[0]?.href||getAdminNavigation(permissions, roles)[0]?.href||'/account';}catch{}
 redirect(destination);
}
