import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createFactoryFixture, type FactoryFixture } from '../fixtures/factory';
import { createBetterAuth } from '@/server/auth/auth';
import { signOutRequest } from '@/lib/auth/sign-out';
import { AccessService } from '@/server/modules/access/service';

describe('authenticated sign out', () => {
  let fixture: FactoryFixture;

  beforeAll(async () => {
    fixture = await createFactoryFixture();
  });

  afterAll(async () => {
    if (fixture) await fixture.close();
  });

  it('sends the JSON request Better Auth requires and revokes the current session', async () => {
    const email = 'sign-out@alpha.test';
    const password = 'Sign-out-password-123';
    await new AccessService(fixture.db).createUser(fixture.alpha.users.admin.principal, {
      name: 'Sign Out Test',
      email,
      password,
      roleCodes: ['OWNER'],
    }, 'auth-signout-test-user');
    const user = await fixture.db.user.findUniqueOrThrow({ where: { email } });
    const auth = createBetterAuth(fixture.db);
    const login = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
    expect(login.status).toBe(200);
    const session = await fixture.db.session.findFirstOrThrow({ where: { userId: user.id } });
    const cookie = login.headers.getSetCookie().map(value => value.split(';', 1)[0]).join('; ');

    await signOutRequest(async (input, init) => {
      const headers = new Headers(init?.headers);
      headers.set('cookie', cookie);
      headers.set('origin', 'http://localhost:3000');
      return auth.handler(new Request(new URL(String(input), 'http://localhost:3000'), { ...init, headers }));
    });

    expect(await fixture.db.session.findUnique({ where: { token: session.token } })).toBeNull();
  });
});
