import { getFunctionalNavigation } from './master-navigation';

export const roleLabels: Record<string, string> = { SALES: 'Sales / Marketing', PLANNER: 'PPIC / Planner', TECHNICIAN: 'Technician', QC: 'Quality Control', ENGINEER: 'Engineering', WAREHOUSE: 'Warehouse', BUYER: 'Purchasing', OWNER: 'Owner', ACCESS_ADMIN: 'Access Admin', CUSTOMER: 'Customer' };
const destinations: Array<[string, string]> = [['OWNER', '/dashboard'], ['PLANNER', '/planning'], ['QC', '/quality/inspections'], ['SALES', '/orders'], ['ENGINEER', '/engineering'], ['WAREHOUSE', '/inventory'], ['BUYER', '/supply-orders'], ['TECHNICIAN', '/shop-floor'], ['CUSTOMER', '/portal/orders'], ['ACCESS_ADMIN', '/settings/users']];
export function availablePages(permissions: readonly string[], roles: readonly string[], customerId?: string | null) {
  return getFunctionalNavigation(permissions, roles, customerId).flatMap(group => group.items);
}
export function getLandingPage(permissions: readonly string[], roles: readonly string[], customerId?: string | null, preferred?: string | null): string {
  const pages = availablePages(permissions, roles, customerId);
  const allowed = new Set(pages.map(page => page.href));
  if (preferred && allowed.has(preferred)) return preferred;
  return destinations.find(([role, path]) => roles.includes(role) && allowed.has(path))?.[1] ?? pages[0]?.href ?? '/account';
}
