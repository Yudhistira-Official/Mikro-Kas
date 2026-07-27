# Bootstrap Default Admin User

## Scope

Create a default administrator account only when the database contains no users. Credentials are exactly `admin` / `admin` for first access. The seed is idempotent and never overwrites an existing user or password.

## Behavior

Run the bootstrap check during `init_db()` after the users schema exists. Query whether any user exists; if none, generate a bcrypt hash for `admin` and insert the active user with username `admin`, display name `Administrator`, and role `admin`.

If at least one user exists, do nothing. Existing installations therefore keep all existing accounts and passwords unchanged. The seed must run safely on every application start.

## Password management

The bootstrap exception applies only to the initial seeded password. User creation and password changes continue enforcing the existing minimum six-character rule. The existing User Management screen remains the place to change the password; no plaintext password is stored or logged.

After login with the bootstrap credentials, show a non-blocking warning recommending an immediate password change. The warning must not expose the password beyond the login form.

## Validation

Add a backend test proving:

- empty users table creates exactly one active admin user;
- running bootstrap twice does not create a duplicate or change the password;
- an existing user prevents the default seed.

Run `cargo test`, `cargo build`, and `npm run build`.
