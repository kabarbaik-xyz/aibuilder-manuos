import { ADMIN_NAV_ITEMS, MASTER_NAV_ITEMS, WORKFLOW_NAV_ITEMS, isMasterNavActive } from './master-navigation';
export function resolveRouteMetadata(pathname: string) {
 const item = [...ADMIN_NAV_ITEMS, ...MASTER_NAV_ITEMS, ...WORKFLOW_NAV_ITEMS].sort((a,b) => b.href.length - a.href.length).find((entry) => isMasterNavActive(pathname, entry.href));
 const base = item?.title || (pathname === '/account' ? 'My account' : pathname.startsWith('/passports/') ? 'Manufacturing passport' : 'Workspace');
 const tail = item ? pathname.slice(item.href.length) : '';
 const newTitles: Record<string, string> = {
  '/supply-orders/new': 'New supply order',
  '/workflows/new': 'New workflow',
  '/orders/new': 'New order',
  '/orders/intake': 'RFQ intake',
  '/ai/assistant': 'Ask AI',
  '/ai/risks': 'Risk inbox',
  '/ai/memory': 'Factory memory',
  '/ai/recovery': 'Recovery proposals',
  '/ai/promise': 'Check a delivery date',
  '/ai/schedule': 'Build a production schedule',
 };
 const title = newTitles[pathname] || (pathname.startsWith('/ai/risks/') ? 'Risk evidence' : pathname.startsWith('/ai/recovery/') ? 'Recovery proposal' : tail === '/new' ? `New ${base === 'Order Hub' ? 'order' : base.toLowerCase()}` : tail ? `${base} detail` : base);
 return { title, activeHref: item?.href, group: item && ADMIN_NAV_ITEMS.some(entry => entry.href === item.href) ? 'Admin' : item && MASTER_NAV_ITEMS.some(entry => entry.href === item.href) ? 'Master data' : 'Operations' };
}
