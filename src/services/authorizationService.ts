import { Store } from '../store';
import { Action, Role } from '../types';
import { InvalidTokenError } from '../errors';
import { resolveSession } from './authService';

/**
 * Role-permission matrix as defined in the specification.
 *
 * Using a Set per role gives O(1) permission lookups and a single source
 * of truth that is easy to audit and extend.
 */
const ROLE_PERMISSIONS: Record<Role, Set<Action>> = {
  admin:  new Set(['read', 'write', 'delete', 'manage_users']),
  editor: new Set(['read', 'write']),
  viewer: new Set(['read']),
};

/**
 * Checks whether the user associated with `token` is allowed to perform `action`.
 *
 * @throws {InvalidTokenError} if the token is missing, invalid, or expired.
 * @returns `true` if the role permits the action, `false` otherwise.
 */
export function checkPermission(store: Store, token: string, action: Action): boolean {
  const session = resolveSession(store, token);

  if (!session) {
    throw new InvalidTokenError('Token is invalid or has expired');
  }

  const user = store.users.get(session.userId)!;
  return ROLE_PERMISSIONS[user.role].has(action);
}
