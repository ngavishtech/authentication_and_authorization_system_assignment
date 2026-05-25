import { createAuthSystem } from '../src';
import { AccountLockedError, InvalidCredentialsError, InvalidTokenError } from '../src/errors';
import { SESSION_TIMEOUT_MS } from '../src/services/authService';

const TEST_USER = {
  username: 'alice',
  email: 'alice@example.com',
  password: 'correct-password',
  role: 'viewer' as const,
};

describe('Authentication', () => {
  let auth: ReturnType<typeof createAuthSystem>;

  beforeEach(async () => {
    auth = createAuthSystem();
    await auth.register(TEST_USER);
  });

  // ─── login() ────────────────────────────────────────────────────────────────

  describe('login()', () => {
    it('returns a session token on successful login', async () => {
      const result = await auth.login(TEST_USER.email, TEST_USER.password);

      expect(result).toHaveProperty('token');
      expect(typeof result.token).toBe('string');
      expect(result.token.length).toBeGreaterThan(0);
    });

    it('accepts email in a different case (case-insensitive)', async () => {
      await expect(
        auth.login('ALICE@EXAMPLE.COM', TEST_USER.password)
      ).resolves.toHaveProperty('token');
    });

    it('throws InvalidCredentialsError for a wrong password', async () => {
      await expect(
        auth.login(TEST_USER.email, 'wrong-password')
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('throws InvalidCredentialsError for an unknown email', async () => {
      await expect(
        auth.login('nobody@example.com', TEST_USER.password)
      ).rejects.toThrow(InvalidCredentialsError);
    });

    it('does not reveal whether the email exists (same error class for both failures)', async () => {
      const unknownEmailError = await auth.login('ghost@example.com', 'any').catch(e => e);
      const wrongPasswordError = await auth.login(TEST_USER.email, 'bad').catch(e => e);

      expect(unknownEmailError.constructor.name).toBe(wrongPasswordError.constructor.name);
      expect(unknownEmailError.message).toBe(wrongPasswordError.message);
    });

    it('resets the failed-attempt counter after a successful login', async () => {
      // 3 failed attempts
      for (let i = 0; i < 3; i++) {
        await auth.login(TEST_USER.email, 'wrong').catch(() => {});
      }

      // Successful login should reset the counter (account should not be locked)
      await expect(auth.login(TEST_USER.email, TEST_USER.password)).resolves.toHaveProperty('token');
    });
  });

  // ─── Account lockout ────────────────────────────────────────────────────────

  describe('Account lockout', () => {
    it('increments failed attempts on each wrong password', async () => {
      for (let i = 0; i < 3; i++) {
        await auth.login(TEST_USER.email, 'wrong').catch(() => {});
      }

      const userId = auth._store.usersByEmail.get(TEST_USER.email)!;
      const user = auth._store.users.get(userId)!;
      expect(user.failedLoginAttempts).toBe(3);
    });

    it('locks the account after 5 consecutive failed attempts', async () => {
      for (let i = 0; i < 5; i++) {
        await auth.login(TEST_USER.email, 'wrong').catch(() => {});
      }

      const userId = auth._store.usersByEmail.get(TEST_USER.email)!;
      const user = auth._store.users.get(userId)!;
      expect(user.isLocked).toBe(true);
    });

    it('throws AccountLockedError on the 5th failed attempt', async () => {
      for (let i = 0; i < 4; i++) {
        await auth.login(TEST_USER.email, 'wrong').catch(() => {});
      }

      await expect(
        auth.login(TEST_USER.email, 'wrong')
      ).rejects.toThrow(AccountLockedError);
    });

    it('rejects a correct password once the account is locked', async () => {
      for (let i = 0; i < 5; i++) {
        await auth.login(TEST_USER.email, 'wrong').catch(() => {});
      }

      await expect(
        auth.login(TEST_USER.email, TEST_USER.password)
      ).rejects.toThrow(AccountLockedError);
    });
  });

  // ─── Session token expiry ───────────────────────────────────────────────────

  describe('Session token expiry', () => {
    it('expires a token after 30 minutes of inactivity', async () => {
      let mockNow = Date.now();
      const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockNow);

      try {
        const { token } = await auth.login(TEST_USER.email, TEST_USER.password);

        // Advance clock past the 30-minute inactivity threshold
        mockNow += SESSION_TIMEOUT_MS + 1;

        expect(() => auth.checkPermission(token, 'read')).toThrow(InvalidTokenError);
      } finally {
        dateSpy.mockRestore();
      }
    });

    it('does not expire a token that is used within the 30-minute window', async () => {
      let mockNow = Date.now();
      const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockNow);

      try {
        const { token } = await auth.login(TEST_USER.email, TEST_USER.password);

        // Advance 29 minutes – still valid
        mockNow += 29 * 60 * 1000;
        expect(auth.checkPermission(token, 'read')).toBe(true);
      } finally {
        dateSpy.mockRestore();
      }
    });

    it('resets the expiry window on every successful activity (sliding expiry)', async () => {
      let mockNow = Date.now();
      const dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => mockNow);

      try {
        const { token } = await auth.login(TEST_USER.email, TEST_USER.password);

        // Activity at t=20min → resets timer
        mockNow += 20 * 60 * 1000;
        auth.checkPermission(token, 'read');

        // t=39min (19 min since last activity) → still valid
        mockNow += 19 * 60 * 1000;
        expect(auth.checkPermission(token, 'read')).toBe(true);

        // t=70min (31 min since last activity) → expired
        mockNow += 31 * 60 * 1000;
        expect(() => auth.checkPermission(token, 'read')).toThrow(InvalidTokenError);
      } finally {
        dateSpy.mockRestore();
      }
    });
  });
});
