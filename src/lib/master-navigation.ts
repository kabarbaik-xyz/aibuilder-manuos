import type { IconName } from '@/components/icons';
export interface MasterNavItem {
  title: string;
  href: string;
  icon: IconName;
  permissions: readonly string[];
  requiredPermissions?: readonly string[];
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
  { title: 'Workforce & overtime', href: '/settings/workforce', icon: 'clock', permissions: ['planning.read', 'resource.manage'] },
  { title: 'Skills & certifications', href: '/settings/skills-certifications', icon: 'certificate', permissions: ['resource.manage'] },
  { title: 'Order types', href: '/settings/order-types', icon: 'order-type', permissions: ['order.read', 'workflow.author'] },
  { title: 'QC checklists', href: '/settings/qc-checklists', icon: 'checklist', permissions: ['quality.read', 'quality.configure'] },
  { title: 'Form templates', href: '/settings/forms', icon: 'checklist', permissions: ['forms.create', 'forms.edit_draft', 'forms.submit_review', 'forms.publish', 'forms.retire', 'forms.bind'], requiredPermissions: ['forms.read'] },
];

export const WORKFLOW_NAV_ITEMS: readonly MasterNavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: 'grid', permissions: ['order.read', 'planning.read', 'owner'] },
  { title: 'Order Hub', href: '/orders', icon: 'order', permissions: ['order.read', 'order.create'] },
  { title: 'Engineering Hub', href: '/engineering', icon: 'engineering', permissions: ['engineering.read', 'engineering.write'] },
  { title: 'Workflow Studio', href: '/workflows', icon: 'graph', permissions: ['workflow.author'], requiredPermissions: ['workflow.read'] },
  { title: 'Order lifecycle work', href: '/lifecycle-work', icon: 'work', permissions: ['order.read', 'order.create', 'order.write', 'engineering.approve', 'planning.read', 'planning.write', 'task.assign', 'task.execute_assigned', 'quality.read', 'quality.inspect', 'delivery.read', 'delivery.dispatch', 'workspace.admin'] },
  { title: 'Supply Orders', href: '/supply-orders', icon: 'supply', permissions: ['supply.read', 'supply.create'] },
  { title: 'Inbound Receipts', href: '/inventory/receipts', icon: 'receipt', permissions: ['inventory.read', 'inventory.receive'] },
  { title: 'Inventory', href: '/inventory', icon: 'inventory', permissions: ['inventory.read'] },
  { title: 'Planning', href: '/planning', icon: 'calendar', permissions: ['planning.read', 'task.assign'] },
  { title: 'My Tasks', href: '/shop-floor', icon: 'work', permissions: ['task.read_assigned', 'task.execute_assigned', 'planning.read'] },
  { title: 'Quality Control', href: '/quality/inspections', icon: 'checklist', permissions: ['quality.read', 'quality.inspect'] },
  { title: 'Delivery & Shipping', href: '/delivery/shipments', icon: 'delivery', permissions: ['delivery.read', 'order.read'] },
  { title: 'CoreAI', href: '/ai', icon: 'brain', permissions: ['order.read', 'planning.read', 'inventory.read', 'resource.manage', 'engineering.read', 'quality.read', 'owner'] },
  { title: 'Customer Portal', href: '/portal/orders', icon: 'order', permissions: ['customer_order.read_own'] },
];

export const ADMIN_NAV_ITEMS: readonly MasterNavItem[] = [
  { title: 'People & Access', href: '/settings/users', icon: 'users', permissions: ['access.manage'] },
  { title: 'Roles', href: '/settings/roles', icon: 'shield', permissions: ['access.manage'] },
  { title: 'Permissions', href: '/settings/permissions', icon: 'checklist', permissions: ['access.manage'] },
  { title: 'Integrations', href: '/settings/integrations', icon: 'network', permissions: ['access.manage', 'owner'] },
];

export function getAdminNavigation(permissions: readonly string[], roles: readonly string[] = []) {
  void roles;
  return ADMIN_NAV_ITEMS.filter(item => navigationItemAllowed(item, permissions));
}

export function getWorkflowNavigation(permissions: readonly string[], roles: readonly string[] = [], customerId?: string | null) {
  void roles;
  return WORKFLOW_NAV_ITEMS.filter(item => {
    if (item.href === '/portal/orders') return Boolean(customerId) && permissions.includes('customer_order.read_own');
    return navigationItemAllowed(item, permissions);
  });
}

export function getMasterNavigation(permissions: readonly string[], roles: readonly string[] = []) {
  void roles;
  return MASTER_NAV_ITEMS.filter((item) => navigationItemAllowed(item, permissions));
}

function navigationItemAllowed(item: MasterNavItem, permissions: readonly string[]) {
  return item.permissions.some(permission => permissions.includes(permission))
    && (item.requiredPermissions ?? []).every(permission => permissions.includes(permission));
}

export function isMasterNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export interface FunctionalNavigationGroup {
  id: string;
  title: string;
  items: readonly MasterNavItem[];
}

// References stay beside the workflow they support. Visibility requires the
// item's declared capability; role names alone never grant a menu.
const FUNCTIONAL_NAVIGATION = [
  { id: 'overview', title: 'Overview', paths: ['/dashboard', '/ai'] },
  { id: 'sales', title: 'Sales', paths: ['/orders', '/settings/customers', '/portal/orders'] },
  { id: 'engineering', title: 'Engineering', paths: ['/engineering', '/workflows', '/settings/order-types', '/settings/forms'] },
  { id: 'lifecycle', title: 'Order lifecycle', paths: ['/lifecycle-work'] },
  { id: 'production', title: 'Production', paths: ['/planning', '/shop-floor'] },
  { id: 'procurement', title: 'Procurement', paths: ['/supply-orders', '/settings/suppliers'] },
  { id: 'inventory', title: 'Inventory', paths: ['/inventory', '/inventory/receipts', '/inventory/items', '/settings/locations', '/settings/units'] },
  { id: 'quality', title: 'Quality', paths: ['/quality/inspections', '/settings/qc-checklists'] },
  { id: 'delivery', title: 'Delivery', paths: ['/delivery/shipments'] },
  { id: 'resources', title: 'Resources', paths: ['/settings/departments', '/settings/machines', '/settings/technicians', '/settings/calendars', '/settings/workforce', '/settings/skills-certifications'] },
  { id: 'access', title: 'Access & Integrations', paths: ['/settings/users', '/settings/roles', '/settings/permissions', '/settings/integrations'] },
] as const;

export function getFunctionalNavigation(permissions: readonly string[], roles: readonly string[] = [], customerId?: string | null): FunctionalNavigationGroup[] {
  const available = new Map([
    ...getWorkflowNavigation(permissions, roles, customerId),
    ...getMasterNavigation(permissions, roles),
    ...getAdminNavigation(permissions, roles),
  ].map(item => [item.href, item]));
  return FUNCTIONAL_NAVIGATION.map(group => ({
    id: group.id,
    title: group.title,
    items: group.paths.flatMap(path => { const item = available.get(path); return item ? [item] : []; }),
  })).filter(group => group.items.length > 0);
}
