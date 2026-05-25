import { createStore, Store } from './store';
import { register as _register } from './services/userService';
import { login as _login, logout as _logout } from './services/authService';
import { checkPermission as _checkPermission } from './services/authorizationService';
import { RegisterInput, LoginResult, Action } from './types';

export interface AuthSystem {
  register(input: RegisterInput): Promise<void>;
  login(email: string, password: string): Promise<LoginResult>;
  logout(token: string): void;
  checkPermission(token: string, action: Action): boolean;
  /** Exposed for advanced testing scenarios that need to inspect internal state. */
  _store: Store;
}

/**
 * Factory that wires up all services around a fresh in-memory store.
 *
 * Each call returns a completely independent instance, which makes
 * it trivial to isolate tests: just call createAuthSystem() in beforeEach.
 */
export function createAuthSystem(): AuthSystem {
  const store = createStore();

  return {
    register: (input: RegisterInput) => _register(store, input),
    login:    (email: string, password: string) => _login(store, email, password),
    logout:   (token: string) => _logout(store, token),
    checkPermission: (token: string, action: Action) => _checkPermission(store, token, action),
    _store: store,
  };
}

// Re-export types and errors for consumers
export * from './types';
export * from './errors';
