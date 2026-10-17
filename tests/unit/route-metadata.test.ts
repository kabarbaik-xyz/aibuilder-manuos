import { describe, expect, it } from 'vitest';
import { resolveRouteMetadata } from '@/lib/route-metadata';

describe('CoreAI route metadata', () => {
  it.each([
    ['/ai/promise', 'Check a delivery date'],
    ['/ai/schedule', 'Build a production schedule'],
  ])('uses the task title for %s', (pathname, title) => {
    expect(resolveRouteMetadata(pathname).title).toBe(title);
  });
});
