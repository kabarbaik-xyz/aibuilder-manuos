import { describe, expect, it } from 'vitest';
import { getMasterNavigation, isMasterNavActive } from './master-navigation';

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

  it('highlights detail routes without matching unrelated prefixes', () => {
    expect(isMasterNavActive('/settings/customers/customer-1', '/settings/customers')).toBe(true);
    expect(isMasterNavActive('/settings/customers-other', '/settings/customers')).toBe(false);
  });
});
