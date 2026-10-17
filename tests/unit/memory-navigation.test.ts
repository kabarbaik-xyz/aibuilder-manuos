import { describe, expect, it } from 'vitest';
import { memoryHrefForItem, orderReturnHref } from '@/features/intelligence/memory-navigation';

describe('contextual AI navigation', () => {
  it('keeps the selected item and source order in the Similar jobs URL', () => {
    expect(memoryHrefForItem(' ITEM / 42 ', 'order 17')).toBe(
      '/ai/memory?itemId=ITEM+%2F+42&orderId=order+17',
    );
  });

  it('builds an encoded same-workspace order return path', () => {
    expect(orderReturnHref('order/17')).toBe('/orders/order%2F17');
    expect(orderReturnHref('  ')).toBeNull();
  });
});
