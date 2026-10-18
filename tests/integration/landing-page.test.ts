import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createTestDatabase, TestDatabase } from '../fixtures/database';
import { seedTestAccess } from '../fixtures/access';
import Home from '@/app/page';
import WelcomePage from '@/app/(marketing)/welcome/page';

// Mock next/headers
let mockHeaders = new Headers();
vi.mock('next/headers', () => ({
  headers: async () => mockHeaders,
}));

describe('Landing Page & Route Resolution', () => {
  let testDb: TestDatabase;
  let prevDb: any;

  beforeAll(async () => {
    testDb = await createTestDatabase();
    prevDb = (global as any).__manuos_db;
    (global as any).__manuos_db = testDb.db;
  });

  afterAll(async () => {
    (global as any).__manuos_db = prevDb;
    await testDb.close();
  });

  it('renders landing page component for unauthenticated visitors without redirect error', async () => {
    mockHeaders = new Headers();
    const result = await Home();
    expect(result).toBeDefined();
    // Verify it returns a React element corresponding to LandingPage
    expect(typeof result).toBe('object');
  });

  it('redirects authenticated owner session to /dashboard', async () => {
    const access = await seedTestAccess(testDb.db, {
      name: 'Alex Rahman',
      roles: ['OWNER', 'ACCESS_ADMIN'],
    });
    mockHeaders = access.headers;

    await expect(Home()).rejects.toThrow();
    try {
      await Home();
    } catch (err: any) {
      expect(err.digest).toBe('NEXT_REDIRECT;replace;/dashboard;307;');
    }
  });

  it('redirects authenticated customer session to /portal/orders', async () => {
    const access = await seedTestAccess(testDb.db, {
      name: 'Sarah Chen',
      roles: ['CUSTOMER'],
      customerId: 'CUST-1',
    });
    mockHeaders = access.headers;

    await expect(Home()).rejects.toThrow();
    try {
      await Home();
    } catch (err: any) {
      expect(err.digest).toBe('NEXT_REDIRECT;replace;/portal/orders;307;');
    }
  });

  it('renders landing page via the dedicated /welcome route', () => {
    const result = WelcomePage();
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('renders login page component without errors', async () => {
    const { default: LoginPage } = await import('@/app/(auth)/login/page');
    const result = LoginPage();
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });
});
