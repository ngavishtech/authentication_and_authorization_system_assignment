# Authentication & Authorization System

A TypeScript implementation of a core authentication and authorization system.
No UI, no HTTP layer — pure business logic with a comprehensive test suite.

---

## Table of Contents

1. [Requirements](#requirements)
2. [Assumptions](#assumptions)
3. [Prerequisites](#prerequisites)
4. [Installation](#installation)
5. [Project Structure](#project-structure)
6. [Public API](#public-api)
7. [Running Tests](#running-tests)
8. [Test Reports](#test-reports)
9. [Test Coverage & State](#test-coverage--state)
10. [Design Decisions](#design-decisions)

---

## Requirements

Authentication & Authorization System Assignment

**OVERVIEW**

Building the core logic for an authentication and authorization system. There is no UI. The
focus is entirely on the logic, its correctness, and its reliability.

**WHAT TO BUILD**

The system supports four capabilities:

1. **User Management**
   - Register a new user with a username, email, password, and a role.
   - Supported roles: `admin`, `editor`, `viewer`
   - Passwords must be stored securely.
   - Each username and each email must be unique across the system.

2. **Authentication**
   - A registered user can log in with their email and password.
   - On a successful login the system issues a session token.
   - After 5 consecutive failed login attempts the account is locked.
   - A locked account cannot log in, even with the correct password.
   - Session tokens expire after 30 minutes of inactivity.

3. **Authorization**
   - Implemented a `check_permission(token, action)` interface.
   - Supported actions: `read`, `write`, `delete`, `manage_users`

   | Role   | Permitted actions                     | Denied actions          |
   |--------|---------------------------------------|-------------------------|
   | admin  | read, write, delete, manage_users     |                         |
   | editor | read, write                           | delete, manage_users    |
   | viewer | read                                  | write, delete, manage_users |

   - An expired or invalid token must be rejected for any action.

4. **Session Management**
   - A user can log out, which immediately invalidates their session token.
   - A user may only have one active session at a time. New login invalidates the previous session.

---

## Assumptions

The specification intentionally leaves several areas open. The decisions below reflect the current implementation. Each item is a candidate for discussion and potential change.

---

### A1 — `manage_users` scope is not fully defined

The spec grants `manage_users` as an action in the permission matrix but does not define what operations it covers. The following interpretation was applied:

- `manage_users` gates **editing and deleting existing users** (change username, email, password, or role; remove a user entirely).
- It does **not** gate `register()`. Registration is treated as a public, unauthenticated operation — consistent with how the spec lists it as a separate top-level capability.

> **Open question:** Should user registration require a `manage_users` token (i.e., only an admin can onboard new users)? Or remain open?

---

### A2 — `manage_users` operations and the edit/delete permission matrix

The current system does not yet expose edit or delete operations. When implemented, the expected behaviour is:

| Actor | Target | Edit username | Edit email | Edit password | Edit role | Delete user |
|---|---|---|---|---|---|---|
| `admin` | any other user | allowed | allowed | allowed | allowed | allowed |
| `admin` | themselves | allowed | allowed | allowed | **open question** | **open question** |
| `editor` / `viewer` | any user | denied | denied | denied | denied | denied |
| `editor` / `viewer` | themselves | denied | denied | denied | denied | denied |

**Uniqueness on edit:** attempting to change a username or email to one already held by another user must fail with the same errors as registration (`DuplicateUsernameError`, `DuplicateEmailError`).

**Session invalidation on change:** any modification to a user's `email`, `password`, or `role` must immediately revoke that user's active session token. The rationale: the token was issued under different credentials or permissions and is no longer valid. Deleting a user also revokes their session.

> **Open questions:**
> - Can an admin change their own role (e.g., demote themselves to `editor`)? If the system has only one admin, this would leave no admin at all.
> - Can an admin delete their own account? Same risk applies.
> - Should `username`-only edits also revoke the session, or is that overkill given username is not used for authentication?

---

### A3 — Account lockout is permanent

The spec states that an account locks after 5 consecutive failed login attempts and that a locked account cannot log in. It does not define any unlock mechanism.

**Current behaviour:** the lock is **permanent**. There is no:
- Time-based auto-unlock (e.g., "retry after 15 minutes")
- Admin unlock operation
- Self-service unlock via email/token

A locked user can never recover their account in the current implementation. The only workaround would be for an admin to delete and re-register them (once edit/delete operations are implemented).

> **Open questions:**
> - Should the lock auto-expire after a configurable cooldown period?
> - Should an admin be able to explicitly unlock an account (an `unlock_user` sub-operation of `manage_users`)?
> - Should failed attempts reset after a period of no activity, regardless of a successful login?

---

### A4 — No password complexity requirements

Any non-empty string is accepted as a password. The spec does not specify minimum length, character classes, or entropy requirements.

---

### A5 — No email format validation

Email values are stored as-is (lowercased for uniqueness). The system does not validate that the value is a well-formed email address, nor does it verify ownership via a confirmation flow.

---

### A6 — Sliding 30-minute session window

The spec says tokens expire "after 30 minutes of **inactivity**." This was interpreted as a **sliding window**: each successful `checkPermission` call resets the 30-minute clock. A token only expires if no activity occurs for a full 30 minutes.

> **Alternative interpretation:** fixed expiry from login time (simpler, but contradicts the word "inactivity").

---

### A7 — Logout with an already-invalidated token throws an error

**Current behaviour:** calling `logout(token)` with a token that is no longer active (already logged out, invalidated by a new login, or expired) throws `InvalidTokenError`.

**Alternative:** treat logout as idempotent — silently succeed if the session does not exist, on the grounds that the desired end state (user is logged out) is already satisfied.

Both are valid choices. The current behaviour was chosen because it gives callers explicit feedback when they hold a stale token, which can surface bugs in client code earlier. The downside is that callers must guard against double-logout scenarios.

> **Open question:** Should logout be idempotent (no error on an already-invalid token), or should it strictly signal that the token was not found?

---

### A8 — `checkPermission` returns a plain boolean; denial reasons are not exposed

`checkPermission(token, action)` has two distinct failure paths:

1. **Invalid or expired token** → throws `InvalidTokenError`
2. **Insufficient role for the action** → returns `false`

The return type for path 2 is a plain `boolean`. The caller learns that access is denied but not *why* (e.g., which specific role restriction applies). In the current single-role model this is unambiguous, but a richer model might want to distinguish between "your role never allows this" and "this resource requires a higher role."

> **Open questions:**
> - Should `checkPermission` throw a typed `PermissionDeniedError` instead of returning `false`, so callers always use exceptions for failure and never need to check a return value?
> - Should the return value carry a reason payload (e.g., `{ permitted: false, reason: 'insufficient_role' }`) for audit logging or richer error messages?

---

### A9 — Single-threaded, in-memory implementation

The current implementation carries two related constraints:

**Single-threaded:** Node.js runs on a single-threaded event loop. All store reads and writes are synchronous and atomic within a single request. There are no race conditions to guard against (e.g., two simultaneous logins cannot both read `failedLoginAttempts` and increment it independently).

**In-memory store:** all state lives in plain JavaScript `Map` objects inside the running process. This means:
- State is lost on process restart.
- The system cannot be scaled horizontally (multiple instances would not share state).
- No persistence, no transactions, no external DB dependency.

These constraints are intentional for this assignment — they keep the focus on logic and test quality. A production system would replace the in-memory store with a database (e.g., PostgreSQL, Redis for sessions) and would need concurrency-safe operations (optimistic locking, atomic counters, or database transactions) for things like the failed-login counter.

---

### A10 — Test plan coverage should be revisited after resolving open questions

The current 53 tests cover the implemented behaviour based on the assumptions documented above. Several open questions, once answered, will require additional test scenarios. This assumption is a reminder that the test suite is **not yet complete**.

Areas that will need new or updated tests when resolved:

| Area | Pending decision | Tests needed |
|---|---|---|
| `manage_users` edit / delete | A1, A2 | Full CRUD matrix per role, self-edit edge cases, uniqueness on edit, session invalidation on update/delete |
| Admin self-demotion / self-delete | A2 | Attempt to demote the last admin; attempt to delete own account |
| Account unlock | A3 | Auto-unlock after cooldown; admin-initiated unlock; lockout counter reset |
| Logout idempotency | A7 | Double-logout behaviour (throw vs. silent success) |
| `checkPermission` denial reason | A8 | Assertion on error type / payload shape if changed from `boolean` |
| `register()` access control | A1 | If gated: unauthenticated register fails; admin-token register succeeds |

---

## Prerequisites

- **Node.js** v18 or later
- **npm** v9 or later

---

## Installation

```bash
npm install
```

---

## Project Structure

```
.
├── src/                              # Production source code
│   ├── types.ts                      # Shared types: Role, Action, User, Session, etc.
│   ├── errors.ts                     # Typed domain errors (DuplicateUsernameError, AccountLockedError, …)
│   ├── store.ts                      # In-memory data store factory (createStore)
│   ├── services/
│   │   ├── userService.ts            # register() – user creation and validation
│   │   ├── authService.ts            # login(), logout(), resolveSession() – session lifecycle
│   │   └── authorizationService.ts   # checkPermission() – role-based access control
│   └── index.ts                      # Public API surface – createAuthSystem() factory
│
├── tests/                            # Test suites (Jest + ts-jest)
│   ├── user-management.test.ts       # Registration: validation, uniqueness, password hashing
│   ├── authentication.test.ts        # Login/logout: credentials, lockout, token expiry
│   ├── authorization.test.ts         # Role-permission matrix, invalid/expired token rejection
│   ├── session-management.test.ts    # Session lifecycle: one session per user, logout, invalidation
│   └── integration.test.ts           # End-to-end user journeys combining multiple features
│
├── reports/                          # Generated test reports (git-ignored)
│   ├── test-report.html              # Visual HTML report (jest-html-reporters)
│   ├── results.json                  # Machine-readable JSON results
│   └── coverage/                     # Code coverage report (lcov, html)
│
├── jest.config.ts                    # Jest configuration (ts-jest preset, reporters)
├── tsconfig.json                     # TypeScript compiler configuration
└── package.json
```

---

## Public API

The entire system is exposed through a single factory function:

```typescript
import { createAuthSystem } from './src';

const auth = createAuthSystem();
```

| Method            | Signature                                          | Description                                       |
|-------------------|----------------------------------------------------|---------------------------------------------------|
| `register`        | `(input: RegisterInput) => Promise<void>`          | Create a new user                                 |
| `login`           | `(email, password) => Promise<{ token: string }>`  | Authenticate and receive a session token          |
| `logout`          | `(token) => void`                                  | Invalidate the session immediately                |
| `checkPermission` | `(token, action) => boolean`                       | Check if the token's role permits the action      |

**Supported roles:** `admin` · `editor` · `viewer`

**Supported actions:** `read` · `write` · `delete` · `manage_users`

---

## Running Tests

### Run all tests (HTML report generated automatically)

```bash
npm test
```

### Run with code coverage

```bash
npm run test:coverage
```

Coverage output is written to `reports/coverage/`.
Open `reports/coverage/index.html` in a browser to explore line-by-line coverage.

### Export a JSON results file

```bash
npm run test:report
```

JSON output is written to `reports/results.json`.

### Run everything at once (coverage + JSON + HTML)

```bash
npm run test:all
```

### Watch mode (useful during development)

```bash
npx jest --watch
```

---

## Test Reports

Every `npm test` run automatically generates an HTML report alongside the console output.

| Report       | Location                        | How to produce          | Description                                                                 |
|--------------|---------------------------------|-------------------------|-----------------------------------------------------------------------------|
| **Console**  | Terminal                        | `npm test`              | Real-time pass/fail summary                                                 |
| **HTML**     | `reports/test-report.html`      | `npm test`              | Visual report with test names, durations, and failure messages — open in any browser |
| **JSON**     | `reports/results.json`          | `npm run test:report`   | Machine-readable results for CI pipelines or dashboards                     |
| **Coverage** | `reports/coverage/index.html`   | `npm run test:coverage` | Line-by-line coverage map                                                   |

> `reports/` is git-ignored; all reports are freshly generated on each run.

---

## Test Coverage & State

**53 tests — all passing** as of the current implementation.

### Distribution by suite

| Suite | Tests | What it covers |
|---|---|---|
| `user-management.test.ts` | 10 | Registration success (all 3 roles), duplicate username, duplicate email, case-insensitive email uniqueness, invalid role, bcrypt hash verification, unique user IDs |
| `authentication.test.ts` | 13 | Login success, case-insensitive email on login, wrong password, unknown email, error message parity (no email enumeration), failed-attempt counter, account lock at attempt 5, locked account rejects correct password, sliding 30-min expiry, token still valid at 29 min, activity resets expiry window |
| `authorization.test.ts` | 16 | Full 3 × 4 role-action matrix (12 parametrized cases), unknown token, expired token, logged-out token, token invalidated by re-login |
| `session-management.test.ts` | 8 | Logout invalidates token, double-logout throws, logout does not affect other users, re-login returns new token, new token is valid, old token invalid after re-login, only one session per user in store, concurrent sessions across users are independent |
| `integration.test.ts` | 6 | Happy path (register → login → use → logout → verify invalid), lockout flow, session expiry flow, role isolation (`manage_users`), multi-user lockout isolation, re-login after expiry |
| **Total** | **53** | |

### What is covered

- Every cell of the role × action permission matrix
- All 6 domain error classes triggered by at least one test
- Time-dependent behaviour (expiry, sliding window) via deterministic `Date.now` mocking
- Password stored as bcrypt hash (format assertion + indirect login verification)
- Session store state validated directly via `_store` in key tests

### What is not yet tested

The following areas are pending implementation or assumption resolution (see [A10](#a10--test-plan-coverage-should-be-revisited-after-resolving-open-questions)):

- `manage_users` edit and delete operations (not yet implemented)
- Admin self-edit / self-delete edge cases
- Account unlock mechanism (not yet implemented)
- Logout idempotency behaviour (see A7)
- `checkPermission` denial reason shape (see A8)
- `register()` access control if gated behind a token (see A1)

---

## Design Decisions

### No web framework
The spec requires pure logic with no UI. All interfaces are plain TypeScript functions, making them straightforward to test directly without spinning up a server or mocking HTTP.

### In-memory store with secondary indexes
A lightweight `Map`-based store with secondary lookup maps (email → userId, username → userId, userId → token) gives O(1) reads on every common path. Each `createAuthSystem()` call produces an isolated store, so test suites never share state.

### Factory pattern for isolation
`createAuthSystem()` returns a fresh instance with its own store. Tests call it in `beforeEach` — no teardown, no global state, no test ordering issues.

### Typed domain errors
Each failure mode has its own error class (e.g. `AccountLockedError`, `DuplicateEmailError`). Callers can `instanceof`-check to handle each failure mode distinctly, without parsing error message strings.

### Sliding session expiry
`checkPermission` updates `lastActivityAt` on each successful call. The 30-minute timeout is measured from *last activity*, not from login — matching the spec's "inactivity" wording.

### Time mocking strategy
Tests that verify token expiry use `jest.spyOn(Date, 'now')` to advance a synthetic clock rather than `jest.useFakeTimers()`. This avoids potential interference with `bcrypt`'s async internals while still making the tests fully deterministic.

### Password hashing
`bcrypt` with 10 rounds in production; 1 round when `NODE_ENV=test` (set automatically by Jest). This keeps the test suite fast while still exercising the real hashing and comparison code paths.
