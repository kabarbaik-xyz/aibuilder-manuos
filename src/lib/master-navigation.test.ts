import { describe, expect, it } from 'vitest';
import { getAdminNavigation, getFunctionalNavigation, getMasterNavigation, getWorkflowNavigation, isMasterNavActive } from './master-navigation';

describe('master navigation', () => {
  it('does not grant menus from a role label or absent permissions', () => {
    expect(getMasterNavigation([])).toEqual([]);
    expect(getMasterNavigation(['access.manage'])).toEqual([]);
    expect(getMasterNavigation(['customer_order.read_own'])).toEqual([]);
  });

  it('shows only matching read or management capabilities', () => {
    expect(getMasterNavigation(['customer.read']).map((item) => item.href)).toEqual(['/settings/customers']);
    expect(getMasterNavigation(['quality.configure']).map((item) => item.href)).toEqual(['/settings/qc-checklists']);
  });

  it('hides Workflow Studio from read-only users because the surface is for authoring', () => {
    expect(getWorkflowNavigation(['workflow.read']).some((item) => item.href === '/workflows')).toBe(false);
    expect(getWorkflowNavigation(['workflow.author']).some((item) => item.href === '/workflows')).toBe(false);
    expect(getWorkflowNavigation(['workflow.read', 'workflow.author']).some((item) => item.href === '/workflows')).toBe(true);
  });

  it('hides Form Builder from users who can only read form records', () => {
    expect(getMasterNavigation(['forms.read']).some((item) => item.href === '/settings/forms')).toBe(false);
    expect(getMasterNavigation(['forms.read', 'forms.create']).some((item) => item.href === '/settings/forms')).toBe(true);
  });

  it('does not expose menus from role labels when the principal has no matching permission', () => {
    expect(getMasterNavigation([], ['OWNER'])).toEqual([]);
    expect(getAdminNavigation([], ['ACCESS_ADMIN'])).toEqual([]);
    expect(getFunctionalNavigation([], ['OWNER'])).toEqual([]);
  });

  it('highlights detail routes without matching unrelated prefixes', () => {
    expect(isMasterNavActive('/settings/customers/customer-1', '/settings/customers')).toBe(true);
    expect(isMasterNavActive('/settings/customers-other', '/settings/customers')).toBe(false);
  });
});
