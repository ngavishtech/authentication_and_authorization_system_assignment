import { createAuthSystem } from '../src';
import { AccountLockedError, InvalidTokenError } from '../src/errors';
import { SESSION_TIMEOUT_MS } from '../src/services/authService';

/**
 * End-to-end integration tests that exercise full user journeys
 * across multiple features working together.
 */
describe('Integration', () => {
  let auth: ReturnType<typeof createAuthSystem>;

  beforeEach(() => {
    auth = createAuthSystem();
  });

  it('happy path: register → login → use session → logout → session invalid', async () => {
    await auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'editor' });

    const { token } = await auth.login('alice@example.com', 'pass');

    // Session is usable
    expect(auth.checkPermission(token, 'read')).toBe(true);
    expect(auth.checkPermission(token, 'write')).toBe(true);
    expect(auth.checkPermission(token, 'delete')).toBe(false);

    auth.logout(token);

    // Session is no longer usable after logout
    expect(() => auth.checkPermission(token, 'read')).toThrow(InvalidTokenError);
  });

  it('lockout flow: 5 failed logins → account locked → correct password rejected', async () => {
    await auth.register({ username: 'alice', email: 'alice@example.com', password: 'correct', role: 'viewer' });

    for (let i = 0; i < 4; i++) {
      await auth.login('alice@example.com', 'wrong').catch(() => {});
    }

    // 5th failure triggers lock
    await expect(
      auth.login('alice@example.com', 'wrong')
    ).rejects.toThrow(AccountLockedError);

    // Correct password is now also rejected
    await expect(
      auth.login('alice@example.com', 'correct')
    ).rejects.toThrow(AccountLockedError);
  });

  it('session expiry flow: login → wait 30min → all actions throw', async () => {
    let mockNow = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockNow);

    try {
      await auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'admin' });
      const { token } = await auth.login('alice@example.com', 'pass');

      // All actions work before expiry
      expect(auth.checkPermission(token, 'read')).toBe(true);
      expect(auth.checkPermission(token, 'manage_users')).toBe(true);

      // Advance clock past inactivity threshold
      mockNow += SESSION_TIMEOUT_MS + 1;

      // All actions now throw
      expect(() => auth.checkPermission(token, 'read')).toThrow(InvalidTokenError);
      expect(() => auth.checkPermission(token, 'manage_users')).toThrow(InvalidTokenError);
    } finally {
      dateSpy.mockRestore();
    }
  });

  it('role isolation: only admin can manage_users', async () => {
    const users = [
      { username: 'admin1', email: 'admin@example.com',  password: 'pass', role: 'admin'  as const },
      { username: 'editor1', email: 'editor@example.com', password: 'pass', role: 'editor' as const },
      { username: 'viewer1', email: 'viewer@example.com', password: 'pass', role: 'viewer' as const },
    ];

    for (const u of users) await auth.register(u);

    const tokens: Record<string, string> = {};
    for (const u of users) {
      const { token } = await auth.login(u.email, 'pass');
      tokens[u.role] = token;
    }

    expect(auth.checkPermission(tokens['admin'],  'manage_users')).toBe(true);
    expect(auth.checkPermission(tokens['editor'], 'manage_users')).toBe(false);
    expect(auth.checkPermission(tokens['viewer'], 'manage_users')).toBe(false);
  });

  it('multi-user isolation: one user locking out does not affect other users', async () => {
    await auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'viewer' });
    await auth.register({ username: 'bob',   email: 'bob@example.com',   password: 'pass', role: 'viewer' });

    // Lock alice's account
    for (let i = 0; i < 5; i++) {
      await auth.login('alice@example.com', 'wrong').catch(() => {});
    }

    // Bob should be unaffected
    await expect(auth.login('bob@example.com', 'pass')).resolves.toHaveProperty('token');
  });

  it('re-login after session expiry issues a fresh token', async () => {
    let mockNow = Date.now();
    const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockNow);

    try {
      await auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'viewer' });

      const { token: oldToken } = await auth.login('alice@example.com', 'pass');

      // Let the session expire
      mockNow += SESSION_TIMEOUT_MS + 1;

      // Re-login should succeed
      const { token: newToken } = await auth.login('alice@example.com', 'pass');

      expect(newToken).not.toBe(oldToken);
      expect(auth.checkPermission(newToken, 'read')).toBe(true);
      expect(() => auth.checkPermission(oldToken, 'read')).toThrow(InvalidTokenError);
    } finally {
      dateSpy.mockRestore();
    }
  });
});
