import { createAuthSystem } from '../src';
import { Action, Role } from '../src/types';
import { InvalidTokenError } from '../src/errors';
import { SESSION_TIMEOUT_MS } from '../src/services/authService';

/**
 * Role-permission matrix from the specification:
 *
 * Role    | read | write | delete | manage_users
 * --------|------|-------|--------|-------------
 * admin   |  ✓   |  ✓    |  ✓     |  ✓
 * editor  |  ✓   |  ✓    |  ✗     |  ✗
 * viewer  |  ✓   |  ✗    |  ✗     |  ✗
 */
const PERMISSION_MATRIX: Record<Role, Record<Action, boolean>> = {
  admin:  { read: true,  write: true,  delete: true,  manage_users: true },
  editor: { read: true,  write: true,  delete: false, manage_users: false },
  viewer: { read: true,  write: false, delete: false, manage_users: false },
};

async function loginAs(
  auth: ReturnType<typeof createAuthSystem>,
  role: Role,
  suffix = ''
): Promise<string> {
  const email = `${role}${suffix}@example.com`;
  await auth.register({ username: `${role}${suffix}`, email, password: 'pass', role });
  const { token } = await auth.login(email, 'pass');
  return token;
}

describe('Authorization – checkPermission()', () => {
  let auth: ReturnType<typeof createAuthSystem>;

  beforeEach(() => {
    auth = createAuthSystem();
  });

  // ─── Role-permission matrix ──────────────────────────────────────────────────

  describe.each(Object.entries(PERMISSION_MATRIX) as [Role, Record<Action, boolean>][])(
    '%s role',
    (role, permissions) => {
      let token: string;

      beforeEach(async () => {
        token = await loginAs(auth, role);
      });

      it.each(Object.entries(permissions) as [Action, boolean][])(
        `%s → %s`,
        (action, expected) => {
          expect(auth.checkPermission(token, action)).toBe(expected);
        }
      );
    }
  );

  // ─── Token validation ────────────────────────────────────────────────────────

  describe('Token validation', () => {
    it('throws InvalidTokenError for a completely unknown token', () => {
      expect(() => auth.checkPermission('not-a-real-token', 'read')).toThrow(InvalidTokenError);
    });

    it('throws InvalidTokenError for an expired token (past 30-min inactivity)', async () => {
      let mockNow = Date.now();
      const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockNow);

      try {
        const token = await loginAs(auth, 'viewer', '-exp');
        mockNow += SESSION_TIMEOUT_MS + 1;

        expect(() => auth.checkPermission(token, 'read')).toThrow(InvalidTokenError);
      } finally {
        dateSpy.mockRestore();
      }
    });

    it('throws InvalidTokenError for a token that has been logged out', async () => {
      const token = await loginAs(auth, 'viewer', '-out');
      auth.logout(token);

      expect(() => auth.checkPermission(token, 'read')).toThrow(InvalidTokenError);
    });

    it('throws InvalidTokenError for a token invalidated by a new login', async () => {
      const email = 'viewer-relogin@example.com';
      await auth.register({ username: 'viewer-relogin', email, password: 'pass', role: 'viewer' });

      const { token: oldToken } = await auth.login(email, 'pass');
      await auth.login(email, 'pass'); // new login invalidates oldToken

      expect(() => auth.checkPermission(oldToken, 'read')).toThrow(InvalidTokenError);
    });
  });
});
