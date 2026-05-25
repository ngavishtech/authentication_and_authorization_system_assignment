/**
 * Base class for all domain errors in the auth system.
 * Using typed errors allows callers to distinguish between different
 * failure modes without parsing error messages.
 */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    // Restore prototype chain (required when extending built-in classes in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when attempting to register with a username that already exists. */
export class DuplicateUsernameError extends AuthError {}

/** Thrown when attempting to register with an email that already exists. */
export class DuplicateEmailError extends AuthError {}

/** Thrown when an unsupported role is provided during registration. */
export class InvalidRoleError extends AuthError {}

/** Thrown when login credentials do not match any account. */
export class InvalidCredentialsError extends AuthError {}

/** Thrown when attempting to log in to a locked account. */
export class AccountLockedError extends AuthError {}

/** Thrown when a token is missing, invalid, or has expired due to inactivity. */
export class InvalidTokenError extends AuthError {}
