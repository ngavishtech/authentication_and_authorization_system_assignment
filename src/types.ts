export type Role = 'admin' | 'editor' | 'viewer';

export type Action = 'read' | 'write' | 'delete' | 'manage_users';

export const VALID_ROLES: Role[] = ['admin', 'editor', 'viewer'];

export const VALID_ACTIONS: Action[] = ['read', 'write', 'delete', 'manage_users'];

export interface User {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: Role;
  failedLoginAttempts: number;
  isLocked: boolean;
}

export interface Session {
  token: string;
  userId: string;
  lastActivityAt: number;
}

export interface RegisterInput {
  username: string;
  email: string;
  password: string;
  role: Role;
}

export interface LoginResult {
  token: string;
}
