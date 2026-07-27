# Bootstrap Default Admin User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seed an idempotent `admin`/`admin` administrator only in an empty users table, while preserving secure password changes and warning the user after bootstrap login.

**Architecture:** Add a small Rust bootstrap helper invoked by `init_db()` after migrations, using the existing SQLite connection and bcrypt dependency. Keep the seed conditional and non-destructive. Add a frontend warning based on the authenticated user's bootstrap state without storing or logging plaintext passwords.

**Tech Stack:** Rust, rusqlite, bcrypt, Tauri, React/Vite.

## Global Constraints

- Credentials are exactly `admin` / `admin` for first access.
- Seed only when the database contains no users.
- Seed is idempotent and never overwrites an existing user or password.
- Password remains bcrypt-hashed; plaintext password is never stored or logged.
- The bootstrap exception applies only to the initial seeded password.
- User creation and password changes continue enforcing the existing minimum six-character rule.
- Run `cargo test`, `cargo build`, and `npm run build`.
- Do not commit unless explicitly requested.

---

## Task 1: Implement idempotent database seed

**Files:**
- Modify: `src-tauri/src/db.rs` inside `init_db()` and nearby database helpers
- Modify: `src-tauri/src/commands/user_cmd.rs` only if a shared hash/helper is required
- Test: Rust unit tests in the smallest existing database/user test module

**Interfaces:**
- Produces `seed_default_admin(&Connection) -> Result<(), String>` or an equivalent private helper.
- Seed inserts username `admin`, display name `Administrator`, role `admin`, active status, and bcrypt hash of `admin` only when `SELECT COUNT(*) FROM users` is zero.

- [ ] **Step 1: Write failing tests**

Add tests for empty, repeated, and non-empty databases:

```rust
#[test]
fn seeds_default_admin_only_when_users_table_is_empty() {
    let conn = test_connection_with_users_table();
    seed_default_admin(&conn).unwrap();
    assert_eq!(count_users(&conn), 1);
    assert!(password_matches(&conn, "admin", "admin"));
}

#[test]
fn default_admin_seed_is_idempotent_and_non_destructive() {
    let conn = test_connection_with_users_table();
    seed_default_admin(&conn).unwrap();
    let first_hash = password_hash(&conn, "admin");
    seed_default_admin(&conn).unwrap();
    assert_eq!(count_users(&conn), 1);
    assert_eq!(password_hash(&conn, "admin"), first_hash);
}

#[test]
fn existing_user_prevents_default_admin_seed() {
    let conn = test_connection_with_users_table();
    insert_test_user(&conn, "operator");
    seed_default_admin(&conn).unwrap();
    assert_eq!(count_users(&conn), 1);
    assert_eq!(count_username(&conn, "admin"), 0);
}
```

Use the repository's existing test setup; do not create production fallback credentials in test-only code.

- [ ] **Step 2: Run the focused test and confirm RED**

Run from `src-tauri`:

```bash
cargo test seed_default_admin -- --nocapture
```

Expected: FAIL because the helper and seed behavior do not exist.

- [ ] **Step 3: Implement the minimal seed helper**

Use a parameterized query and bcrypt:

```rust
fn seed_default_admin(conn: &Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM users", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    if count != 0 {
        return Ok(());
    }
    let hash = bcrypt::hash("admin", 10).map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
        rusqlite::params!["admin", hash, "Administrator", "admin"],
    ).map_err(|e| e.to_string())?;
    Ok(())
}
```

Invoke it after migrations have created `users` and before `init_db()` returns. Keep the operation idempotent and avoid logging credentials.

- [ ] **Step 4: Run tests and build**

```bash
cargo test seed_default_admin -- --nocapture
cargo test
cargo build
```

Expected: PASS.

---

## Task 2: Mark bootstrap account and warn after login

**Files:**
- Modify: `src-tauri/src/commands/user_cmd.rs`
- Modify: `src/pages/Login.jsx`
- Modify: `src/App.jsx` only if warning must be rendered at the authenticated shell

**Interfaces:**
- `User` response adds a non-sensitive `must_change_password: bool` computed from the bootstrap account state; it must not include password/hash.
- `login_user` returns `must_change_password=true` only for the initial seeded `admin` account whose password remains `admin`.
- Login UI displays a non-blocking warning after successful bootstrap login.

- [ ] **Step 1: Write a failing backend test**

Test that the seeded admin is marked for change and a changed password is not:

```rust
#[test]
fn bootstrap_admin_is_marked_until_password_changes() {
    let user = login_seeded_admin().unwrap();
    assert!(user.must_change_password);
    change_password_for_test("admin", "adminbaru");
    let user = login_with_password("admin", "adminbaru").unwrap();
    assert!(!user.must_change_password);
}
```

If the existing password-change command requires role/session state, exercise its existing command contract rather than bypassing it.

- [ ] **Step 2: Run test and confirm RED**

```bash
cargo test bootstrap_admin_is_marked_until_password_changes -- --nocapture
```

Expected: FAIL because `must_change_password` is not returned.

- [ ] **Step 3: Implement non-sensitive bootstrap state**

Determine bootstrap state from the verified login input and stored hash: only username `admin` plus successful password `admin` qualifies. Do not compare or expose hash values in the frontend. Extend the serialized `User` shape and all constructors/tests consistently.

Keep minimum six-character validation unchanged for `create_user`, `reset_password`, and any existing password-update command. The seed path is the only exception.

- [ ] **Step 4: Add the warning UI**

After `login_user` succeeds and `user.must_change_password` is true, render a non-blocking message such as:

```text
Password default masih aktif. Segera ubah password melalui Pengaturan > Manajemen User.
```

Do not prevent navigation or reveal the password in the message. Preserve existing login error handling.

- [ ] **Step 5: Run backend and frontend verification**

```bash
cargo test
cargo build
npm run build
```

Expected: PASS.

---

## Task 3: Final audit

**Files:**
- Modify only files required by failed verification.

- [ ] **Step 1: Verify fresh database behavior**

Start with an empty database through the existing initialization path, verify exactly one admin user exists, and log in with `admin`/`admin`. Verify the warning appears.

- [ ] **Step 2: Verify non-destructive behavior**

With an existing user, initialize again and confirm no `admin` user is injected. With an existing `admin` user and changed password, initialize again and confirm the password remains unchanged.

- [ ] **Step 3: Inspect security and diff**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm no plaintext password is logged, stored in frontend state beyond the login input lifecycle, or added to documentation outside the requested default credential behavior.

- [ ] **Step 4: Run final verification**

```bash
cargo test
cargo build
npm run build
```

Expected: all commands exit 0. Existing unrelated warnings must be reported, not silently treated as fixed.
