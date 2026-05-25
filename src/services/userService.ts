import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Store } from '../store';
import { RegisterInput, VALID_ROLES } from '../types';
import { DuplicateEmailError, DuplicateUsernameError, InvalidRoleError } from '../errors';

/**
 * Lower rounds in test environment to keep the suite fast.
 * Production should use at least 10.
 */
const SALT_ROUNDS = process.env.NODE_ENV === 'test' ? 1 : 10;

export async function register(store: Store, input: RegisterInput): Promise<void> {
  const { username, email, password, role } = input;

  if (!VALID_ROLES.includes(role)) {
    throw new InvalidRoleError(`Invalid role "${role}". Must be one of: ${VALID_ROLES.join(', ')}`);
  }

  if (store.usersByUsername.has(username)) {
    throw new DuplicateUsernameError(`Username "${username}" is already taken`);
  }

  const normalisedEmail = email.toLowerCase();
  if (store.usersByEmail.has(normalisedEmail)) {
    throw new DuplicateEmailError(`Email "${email}" is already registered`);
  }

  const id = uuidv4();
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = {
    id,
    username,
    email: normalisedEmail,
    passwordHash,
    role,
    failedLoginAttempts: 0,
    isLocked: false,
  };

  store.users.set(id, user);
  store.usersByUsername.set(username, id);
  store.usersByEmail.set(normalisedEmail, id);
}
