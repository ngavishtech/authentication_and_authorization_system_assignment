import { createAuthSystem } from '../src';
import { createStore } from '../src/store';
import { register } from '../src/services/userService';
import { DuplicateEmailError, DuplicateUsernameError, InvalidRoleError } from '../src/errors';

describe('User Management', () => {
  let auth: ReturnType<typeof createAuthSystem>;

  beforeEach(() => {
    auth = createAuthSystem();
  });

  describe('register()', () => {
    it('registers a new user with role admin', async () => {
      await expect(
        auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass123', role: 'admin' })
      ).resolves.toBeUndefined();
    });

    it('registers a new user with role editor', async () => {
      await expect(
        auth.register({ username: 'bob', email: 'bob@example.com', password: 'pass123', role: 'editor' })
      ).resolves.toBeUndefined();
    });

    it('registers a new user with role viewer', async () => {
      await expect(
        auth.register({ username: 'carol', email: 'carol@example.com', password: 'pass123', role: 'viewer' })
      ).resolves.toBeUndefined();
    });

    it('allows multiple distinct users to register', async () => {
      await auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'viewer' });
      await auth.register({ username: 'bob',   email: 'bob@example.com',   password: 'pass', role: 'editor' });
      await auth.register({ username: 'carol', email: 'carol@example.com', password: 'pass', role: 'admin' });

      // All three should be able to log in
      await expect(auth.login('alice@example.com', 'pass')).resolves.toHaveProperty('token');
      await expect(auth.login('bob@example.com',   'pass')).resolves.toHaveProperty('token');
      await expect(auth.login('carol@example.com', 'pass')).resolves.toHaveProperty('token');
    });

    it('throws DuplicateUsernameError when username is already taken', async () => {
      await auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'viewer' });

      await expect(
        auth.register({ username: 'alice', email: 'other@example.com', password: 'pass', role: 'viewer' })
      ).rejects.toThrow(DuplicateUsernameError);
    });

    it('throws DuplicateEmailError when email is already registered', async () => {
      await auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'viewer' });

      await expect(
        auth.register({ username: 'bob', email: 'alice@example.com', password: 'pass', role: 'viewer' })
      ).rejects.toThrow(DuplicateEmailError);
    });

    it('enforces email uniqueness case-insensitively', async () => {
      await auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'viewer' });

      await expect(
        auth.register({ username: 'bob', email: 'ALICE@EXAMPLE.COM', password: 'pass', role: 'viewer' })
      ).rejects.toThrow(DuplicateEmailError);
    });

    it('throws InvalidRoleError for an unsupported role', async () => {
      await expect(
        auth.register({ username: 'alice', email: 'alice@example.com', password: 'pass', role: 'superadmin' as any })
      ).rejects.toThrow(InvalidRoleError);
    });

    it('stores the password as a bcrypt hash, not as plaintext', async () => {
      const store = createStore();
      const password = 'mySecretPassword';

      await register(store, { username: 'alice', email: 'alice@example.com', password, role: 'viewer' });

      const userId = store.usersByEmail.get('alice@example.com')!;
      const user = store.users.get(userId)!;

      expect(user.passwordHash).not.toBe(password);
      // bcrypt hashes always start with $2b$ (or $2a$/$2y$)
      expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
    });

    it('each registered user receives a unique id', async () => {
      const store = createStore();
      await register(store, { username: 'alice', email: 'a@example.com', password: 'pass', role: 'viewer' });
      await register(store, { username: 'bob',   email: 'b@example.com', password: 'pass', role: 'viewer' });

      const ids = [...store.users.keys()];
      expect(ids[0]).not.toBe(ids[1]);
    });
  });
});
