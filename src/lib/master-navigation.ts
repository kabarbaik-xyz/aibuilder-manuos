export interface MasterNavItem {
  title: string;
  href: string;
  permissions: readonly string[];
}

export const MASTER_NAV_ITEMS: readonly MasterNavItem[] = [
  { title: 'Customers', href: '/settings/customers', permissions: ['customer.read', 'customer.manage'] },
  { title: 'Suppliers', href: '/settings/suppliers', permissions: ['supplier.read', 'supplier.manage'] },
  { title: 'Items & materials', href: '/inventory/items', permissions: ['inventory.read', 'item.manage'] },
  { title: 'Units of measure', href: '/settings/units', permissions: ['item.manage'] },
  { title: 'Locations', href: '/settings/locations', permissions: ['inventory.read', 'location.manage'] },
  { title: 'Departments', href: '/settings/departments', permissions: ['resource.manage'] },
  { title: 'Machines', href: '/settings/machines', permissions: ['planning.read', 'resource.manage'] },
  { title: 'Technicians', href: '/settings/technicians', permissions: ['planning.read', 'resource.manage'] },
  { title: 'Calendars', href: '/settings/calendars', permissions: ['planning.read', 'resource.manage'] },
  { title: 'Skills & certifications', href: '/settings/skills-certifications', permissions: ['resource.manage'] },
  { title: 'Order types', href: '/settings/order-types', permissions: ['order.read', 'workflow.author'] },
  { title: 'QC checklists', href: '/settings/qc-checklists', permissions: ['quality.read', 'quality.configure'] },
];

export const WORKFLOW_NAV_ITEMS: readonly MasterNavItem[] = [
  { title: 'Order Hub', href: '/orders', permissions: ['order.read', 'order.create'] },
  { title: 'Engineering Hub', href: '/engineering', permissions: ['engineering.read', 'engineering.write'] },
  { title: 'Workflow Studio', href: '/workflows', permissions: ['workflow.read', 'workflow.author'] },
  { title: 'Supply Orders', href: '/supply-orders', permissions: ['supply.read', 'supply.create'] },
  { title: 'Inbound Receipts', href: '/inventory/receipts', permissions: ['inventory.read', 'inventory.receive'] },
];

export function getWorkflowNavigation(permissions: readonly string[]) {
  return WORKFLOW_NAV_ITEMS.filter((item) => item.permissions.some((permission) => permissions.includes(permission)));
}

export function getMasterNavigation(permissions: readonly string[]) {
  return MASTER_NAV_ITEMS.filter((item) => item.permissions.some((permission) => permissions.includes(permission)));
}

export function isMasterNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
