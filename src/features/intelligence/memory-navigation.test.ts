import { describe, expect, it } from 'vitest';
import { memoryHrefForItem } from './memory-navigation';

describe('factory memory navigation', () => {
  it('builds an encoded item filter link', () => {
    const href = memoryHrefForItem('item / special');
    expect(href).toBe('/ai/memory?itemId=item+%2F+special');
  });

  it('does not create a contextual link for a missing item', () => {
    expect(memoryHrefForItem('  ')).toBeNull();
  });
});
