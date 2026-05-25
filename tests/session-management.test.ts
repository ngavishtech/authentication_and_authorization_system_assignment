import { createAuthSystem } from '../src';
import { InvalidTokenError } from '../src/errors';

const USER_A = { username: 'alice', email: 'alice@example.com', password: 'pass', role: 'viewer' as const };
const USER_B = { username: 'bob',   email: 'bob@example.com',   password: 'pass', role: 'editor' as const };

describe('Session Management', () => {
  let auth: ReturnType<typeof createAuthSystem>;

  beforeEach(async () => {
    auth = createAuthSystem();
    await auth.register(USER_A);
    await auth.register(USER_B);
  });

  // ─── logout() ───────────────────────────────────────────────────────────────

  describe('logout()', () => {
    it('immediately invalidates the session token', async () => {
      const { token } = await auth.login(USER_A.email, USER_A.password);

      auth.logout(token);

      expect(() => auth.checkPermission(token, 'read')).toThrow(InvalidTokenError);
    });

    it('throws InvalidTokenError when logging out with an already-invalidated token', async () => {
      const { token } = await auth.login(USER_A.email, USER_A.password);
      auth.logout(token);

      expect(() => auth.logout(token)).toThrow(InvalidTokenError);
    });

    it('does not affect another user\'s active session', async () => {
      const { token: tokenA } = await auth.login(USER_A.email, USER_A.password);
      const { token: tokenB } = await auth.login(USER_B.email, USER_B.password);

      auth.logout(tokenA);

      // User B should still be active
      expect(auth.checkPermission(tokenB, 'read')).toBe(true);
    });
  });

  // ─── One active session per user ────────────────────────────────────────────

  describe('One active session per user', () => {
    it('a new login returns a new, unique token', async () => {
      const { token: first }  = await auth.login(USER_A.email, USER_A.password);
      const { token: second } = await auth.login(USER_A.email, USER_A.password);

      expect(first).not.toBe(second);
    });

    it('the new token is valid after re-login', async () => {
      await auth.login(USER_A.email, USER_A.password);
      const { token: newToken } = await auth.login(USER_A.email, USER_A.password);

      expect(auth.checkPermission(newToken, 'read')).toBe(true);
    });

    it('the previous token is invalidated when a new login occurs', async () => {
      const { token: oldToken } = await auth.login(USER_A.email, USER_A.password);
      await auth.login(USER_A.email, USER_A.password); // new login

      expect(() => auth.checkPermission(oldToken, 'read')).toThrow(InvalidTokenError);
    });

    it('only one active session exists per user at any time', async () => {
      await auth.login(USER_A.email, USER_A.password);
      await auth.login(USER_A.email, USER_A.password);
      await auth.login(USER_A.email, USER_A.password);

      const userId = auth._store.usersByEmail.get(USER_A.email)!;
      const activeTokens = [...auth._store.sessions.values()].filter(
        (s) => s.userId === userId
      );

      expect(activeTokens).toHaveLength(1);
    });

    it('concurrent logins from two different users do not interfere', async () => {
      const { token: tokenA } = await auth.login(USER_A.email, USER_A.password);
      const { token: tokenB } = await auth.login(USER_B.email, USER_B.password);

      expect(auth.checkPermission(tokenA, 'read')).toBe(true);
      expect(auth.checkPermission(tokenB, 'read')).toBe(true);
    });
  });
});
