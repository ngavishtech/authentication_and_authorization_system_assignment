import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { Store } from '../store';
import { Session, LoginResult } from '../types';
import { AccountLockedError, InvalidCredentialsError, InvalidTokenError } from '../errors';

const MAX_FAILED_ATTEMPTS = 5;
export const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

export async function login(store: Store, email: string, password: string): Promise<LoginResult> {
  const normalisedEmail = email.toLowerCase();
  const userId = store.usersByEmail.get(normalisedEmail);

  if (!userId) {
    // Do not reveal whether the email exists
    throw new InvalidCredentialsError('Invalid email or password');
  }

  const user = store.users.get(userId)!;

  if (user.isLocked) {
    throw new AccountLockedError('Account is locked due to too many failed login attempts');
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);

  if (!passwordMatch) {
    user.failedLoginAttempts += 1;
    if (user.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
      user.isLocked = true;
      throw new AccountLockedError('Account is locked due to too many failed login attempts');
    }
    throw new InvalidCredentialsError('Invalid email or password');
  }

  // Successful login: reset failure counter
  user.failedLoginAttempts = 0;

  // Invalidate any existing session (one session per user)
  const existingToken = store.userActiveSessions.get(userId);
  if (existingToken) {
    store.sessions.delete(existingToken);
  }

  // Issue a new session token
  const token = uuidv4();
  const session: Session = {
    token,
    userId,
    lastActivityAt: Date.now(),
  };

  store.sessions.set(token, session);
  store.userActiveSessions.set(userId, token);

  return { token };
}

export function logout(store: Store, token: string): void {
  const session = store.sessions.get(token);
  if (!session) {
    throw new InvalidTokenError('Token is invalid or already invalidated');
  }

  store.sessions.delete(token);
  store.userActiveSessions.delete(session.userId);
}

/**
 * Looks up the session for a given token, validates it has not timed out,
 * and refreshes its lastActivityAt timestamp on success.
 *
 * Returns null for expired or unknown tokens (caller decides error handling).
 */
export function resolveSession(store: Store, token: string): Session | null {
  const session = store.sessions.get(token);
  if (!session) {
    return null;
  }

  const now = Date.now();
  if (now - session.lastActivityAt > SESSION_TIMEOUT_MS) {
    // Clean up the expired session
    store.sessions.delete(token);
    store.userActiveSessions.delete(session.userId);
    return null;
  }

  // Refresh activity timestamp (sliding expiry window)
  session.lastActivityAt = now;
  return session;
}
