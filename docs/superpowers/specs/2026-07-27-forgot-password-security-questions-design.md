# Forgot Password via Security Questions

## Overview

Add a "Lupa Password" flow on the login screen. Users (admin-set) can define up to 3 security questions with answers. If they answer all correctly, their password resets to `admin` (default) with `must_change_password = true`.

## Data

New table `security_questions`:

```sql
CREATE TABLE IF NOT EXISTS security_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    pertanyaan TEXT NOT NULL,
    jawaban TEXT NOT NULL,
    urutan INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, urutan)
);
```

- `jawaban` stored as lowercase, trimmed
- Max 3 questions per user (enforced in Rust, not DB constraint)
- Questions are optional — user can have 0 to 3

## Backend Commands

All in `user_cmd.rs`:

| Command | Auth | Params | Returns |
|---|---|---|---|
| `set_security_questions` | admin only | `{ user_id, questions: [{ pertanyaan, jawaban }] }` | `()` |
| `get_security_questions_admin` | admin only | `{ user_id }` | `Vec<{ id, pertanyaan, jawaban, urutan }>` |
| `get_security_questions_public` | none | `{ username }` | `Vec<{ pertanyaan, urutan }>` |
| `verify_security_answers` | none | `{ username, answers: [String] }` | `{ success: bool, message: string }` |

### Command Details

**`set_security_questions`** — deletes existing questions for user, inserts new ones (max 3). Transactional.

**`get_security_questions_admin`** — returns questions + answers for admin edit view. Validation: `require_admin`.

**`get_security_questions_public`** — returns questions only (no answers). Used in login flow.

**`verify_security_answers`** — validates all answers exist, compares each (case-insensitive, trimmed). If all correct: reset password to `admin` with `bcrypt::hash("admin", 10)`, return `success: true`. If any wrong: return `success: false`.

## Frontend

### UserManagement.jsx (edit modal)

In edit mode only, add section below role:
- "Pertanyaan Keamanan (opsional, maks. 3)"
- List of rows, each with:
  - Input pertanyaan (text)
  - Input jawaban (text, hidden by default with toggle eye icon)
- On "Tambah Pertanyaan" button (disabled if already 3)
- On submit: `invoke("set_security_questions", { user_id, questions })`
- On load edit: `invoke("get_security_questions_admin", { user_id })` → populate

### Login.jsx

- Add link "Lupa Password?" below login button
- Click → slide in modal with steps:
  1. Input username → `invoke("get_security_questions_public", { username })` → if none, show "User ini tidak memiliki pertanyaan keamanan"
  2. Show questions as labeled text inputs → user fills answers
  3. Submit → `invoke("verify_security_answers", { username, answers })`
  4. If success: toast "Password telah di-reset ke admin" + close modal + user can login with `admin`/`admin`
  5. If fail: toast "Jawaban salah"

## Flow Diagram

```
Login Screen
  ├── Masuk (normal login)
  └── Lupa Password?
       └── Modal Steps:
            Step 1: Masukkan Username
            Step 2: Jawab Pertanyaan (1-3)
            Step 3: Submit → Verify → Reset Password → Toast → Close Modal
```

## Security

- `jawaban` stored hashed? No — answers need to be compared in plaintext per requirement (plain text comparison). But `verify_security_answers` only resets to default password, never reveals the actual password or hash.
- Rate limiting: not needed for MVP (local app)
- `set_security_questions` requires admin auth

## Files Changed

| File | Change |
|---|---|
| `src-tauri/src/commands/user_cmd.rs` | Add 4 new commands + helpers |
| `src-tauri/src/db.rs` | Add `seed_security_questions_table` (if not exists) |
| `src-tauri/src/lib.rs` | Register new commands |
| `src/pages/UserManagement.jsx` | Add questions UI in edit modal |
| `src/pages/Login.jsx` | Add "Lupa Password" flow |
