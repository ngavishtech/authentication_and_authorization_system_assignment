import { User, Session } from './types';

/**
 * In-memory data store.
 *
 * Keeps secondary lookup maps (by email, by username, by userId→token) so that
 * every query is O(1) without needing a database.
 *
 * A new store is created per AuthSystem instance, which means each test
 * suite gets a completely isolated, zero-state environment.
 */
export interface Store {
  /** Primary user records keyed by userId */
  users: Map<string, User>;

  /** Secondary index: normalised email → userId */
  usersByEmail: Map<string, string>;

  /** Secondary index: username → userId */
  usersByUsername: Map<string, string>;

  /** Active sessions keyed by session token */
  sessions: Map<string, Session>;

  /** Tracks the one active session token per user: userId → token */
  userActiveSessions: Map<string, string>;
}

export function createStore(): Store {
  return {
    users: new Map(),
    usersByEmail: new Map(),
    usersByUsername: new Map(),
    sessions: new Map(),
    userActiveSessions: new Map(),
  };
}
