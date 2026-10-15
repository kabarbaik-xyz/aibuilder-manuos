import { MASTER_NAV_ITEMS, WORKFLOW_NAV_ITEMS, isMasterNavActive } from './master-navigation';
export function resolveRouteMetadata(pathname: string) {
 const item = [...MASTER_NAV_ITEMS, ...WORKFLOW_NAV_ITEMS].sort((a,b) => b.href.length - a.href.length).find((entry) => isMasterNavActive(pathname, entry.href));
 const base = item?.title || (pathname === '/account' ? 'My account' : pathname.startsWith('/passports/') ? 'Manufacturing passport' : 'Workspace');
 const tail = item ? pathname.slice(item.href.length) : '';
 const newTitles: Record<string, string> = { '/supply-orders/new': 'New supply order', '/workflows/new': 'New workflow', '/orders/new': 'New order' };
 const title = newTitles[pathname] || (tail === '/new' ? `New ${base === 'Order Hub' ? 'order' : base.toLowerCase()}` : tail ? `${base} detail` : base);
 return { title, activeHref: item?.href, group: item && MASTER_NAV_ITEMS.some(entry => entry.href === item.href) ? 'Master data' : 'Operations' };
}
