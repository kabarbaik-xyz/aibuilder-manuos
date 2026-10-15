import type { IconName } from '@/components/icons';
export interface MasterNavItem {
  title: string;
  href: string;
  icon: IconName;
  permissions: readonly string[];
}

export const MASTER_NAV_ITEMS: readonly MasterNavItem[] = [
  { title: 'Customers', href: '/settings/customers', icon: 'customers', permissions: ['customer.read', 'customer.manage'] },
  { title: 'Suppliers', href: '/settings/suppliers', icon: 'supplier', permissions: ['supplier.read', 'supplier.manage'] },
  { title: 'Items & materials', href: '/inventory/items', icon: 'item', permissions: ['inventory.read', 'item.manage'] },
  { title: 'Units of measure', href: '/settings/units', icon: 'ruler', permissions: ['item.manage'] },
  { title: 'Locations', href: '/settings/locations', icon: 'location', permissions: ['inventory.read', 'location.manage'] },
  { title: 'Departments', href: '/settings/departments', icon: 'department', permissions: ['resource.manage'] },
  { title: 'Machines', href: '/settings/machines', icon: 'machine', permissions: ['planning.read', 'resource.manage'] },
  { title: 'Technicians', href: '/settings/technicians', icon: 'technician', permissions: ['planning.read', 'resource.manage'] },
  { title: 'Calendars', href: '/settings/calendars', icon: 'calendar', permissions: ['planning.read', 'resource.manage'] },
  { title: 'Skills & certifications', href: '/settings/skills-certifications', icon: 'certificate', permissions: ['resource.manage'] },
  { title: 'Order types', href: '/settings/order-types', icon: 'order-type', permissions: ['order.read', 'workflow.author'] },
  { title: 'QC checklists', href: '/settings/qc-checklists', icon: 'checklist', permissions: ['quality.read', 'quality.configure'] },
];

export const WORKFLOW_NAV_ITEMS: readonly MasterNavItem[] = [
  { title: 'Order Hub', href: '/orders', icon: 'order', permissions: ['order.read', 'order.create'] },
  { title: 'Engineering Hub', href: '/engineering', icon: 'engineering', permissions: ['engineering.read', 'engineering.write'] },
  { title: 'Workflow Studio', href: '/workflows', icon: 'graph', permissions: ['workflow.read', 'workflow.author'] },
  { title: 'Supply Orders', href: '/supply-orders', icon: 'supply', permissions: ['supply.read', 'supply.create'] },
  { title: 'Inbound Receipts', href: '/inventory/receipts', icon: 'receipt', permissions: ['inventory.read', 'inventory.receive'] },
  { title: 'Inventory', href: '/inventory', icon: 'inventory', permissions: ['inventory.read'] },
  { title: 'Planning', href: '/planning', icon: 'calendar', permissions: ['planning.read', 'task.assign'] },
  { title: 'My Work', href: '/shop-floor', icon: 'work', permissions: ['task.read_assigned', 'task.execute_assigned', 'planning.read'] },
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
