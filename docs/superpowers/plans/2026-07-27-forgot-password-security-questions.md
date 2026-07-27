# Lupa Password via Security Questions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Lupa Password" flow on login screen with user-defined security questions (max 3, admin-set)

**Architecture:** New DB table `security_questions`. Four new Tauri commands. UI added to manage questions in UserManagement edit modal (admin only). New multi-step modal in Login for forgot-password flow.

**Tech Stack:** Rusqlite, bcrypt, React, Tauri

## Global Constraints

- Max 3 questions per user (enforced in Rust)
- Answers stored as lowercase trimmed text; compared case-insensitively
- Password reset always sets to `admin` (default) with `must_change_password` flag
- All security questions commands are admin-only except `get_security_questions_public` and `verify_security_answers`
- Use existing DB init pattern (`conn.execute_batch` / `CREATE TABLE IF NOT EXISTS`)

---

### Task 1: DB migration — add security_questions table

**Files:**
- Modify: `src-tauri/src/db.rs`

**Interfaces:**
- Consumes: `conn: &Connection` in `init_db`
- Produces: `security_questions` table with columns `id`, `user_id`, `pertanyaan`, `jawaban`, `urutan`

- [ ] **Step 1: Read db.rs to locate init_db function**

Read `src-tauri/src/db.rs` around lines 120-145 to find where `CREATE TABLE IF NOT EXISTS retur` is. We'll add our new table right after it.

- [ ] **Step 2: Add `security_questions` table creation**

```rust
    // Tabel pertanyaan keamanan untuk fitur lupa password
    let _ = conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS security_questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            pertanyaan TEXT NOT NULL,
            jawaban TEXT NOT NULL,
            urutan INTEGER NOT NULL DEFAULT 1,
            UNIQUE(user_id, urutan)
        );",
    );
```

Append this after the retur table block (after the `);` on line ~149).

- [ ] **Step 3: Run build to verify**

```bash
cd src-tauri && cargo build 2>&1 | head -10
```

---

### Task 2: Backend — security questions CRUD commands + verify answers

**Files:**
- Modify: `src-tauri/src/commands/user_cmd.rs`

**Interfaces:**
- Produces:
  - `set_security_questions(state, auth, user_id, questions: Vec<SecurityQuestionInput>) -> Result<(), String>`
  - `get_security_questions_admin(state, auth, user_id) -> Result<Vec<SecurityQuestion>, String>`
  - `get_security_questions_public(state, username) -> Result<Vec<PublicQuestion>, String>`
  - `verify_security_answers(state, username, answers: Vec<String>) -> Result<VerifyResult, String>`
  - `SecurityQuestionInput { pertanyaan: String, jawaban: String }`
  - `SecurityQuestion { id: i64, pertanyaan: String, jawaban: String, urutan: i32 }`
  - `PublicQuestion { pertanyaan: String, urutan: i32 }`
  - `VerifyResult { success: bool }`

- [ ] **Step 1: Add structs and helper**

Add after `UpdateUserRequest` or at bottom of struct section:

```rust
#[derive(Debug, Deserialize)]
pub struct SecurityQuestionInput {
    pub pertanyaan: String,
    pub jawaban: String,
}

#[derive(Debug, Serialize)]
pub struct SecurityQuestion {
    pub id: i64,
    pub pertanyaan: String,
    pub jawaban: String,
    pub urutan: i32,
}

#[derive(Debug, Serialize)]
pub struct PublicQuestion {
    pub pertanyaan: String,
    pub urutan: i32,
}

#[derive(Debug, Serialize)]
pub struct VerifyResult {
    pub success: bool,
}
```

- [ ] **Step 2: Add internal functions (for testing)**

```rust
pub fn set_security_questions_internal(
    conn: &rusqlite::Connection,
    user_id: i64,
    questions: Vec<SecurityQuestionInput>,
) -> Result<(), String> {
    if questions.len() > 3 {
        return Err("Maksimal 3 pertanyaan keamanan".into());
    }
    for q in &questions {
        if q.pertanyaan.trim().is_empty() || q.jawaban.trim().is_empty() {
            return Err("Pertanyaan dan jawaban tidak boleh kosong".into());
        }
    }

    conn.execute(
        "DELETE FROM security_questions WHERE user_id = ?1",
        params![user_id],
    )
    .map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare("INSERT INTO security_questions (user_id, pertanyaan, jawaban, urutan) VALUES (?1, ?2, ?3, ?4)")
        .map_err(|e| e.to_string())?;

    for (i, q) in questions.iter().enumerate() {
        stmt.execute(params![user_id, q.pertanyaan.trim(), q.jawaban.trim().to_lowercase(), (i + 1) as i32])
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn get_security_questions_internal(
    conn: &rusqlite::Connection,
    user_id: i64,
) -> Result<Vec<SecurityQuestion>, String> {
    let mut stmt = conn
        .prepare("SELECT id, pertanyaan, jawaban, urutan FROM security_questions WHERE user_id = ?1 ORDER BY urutan")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![user_id], |row| {
            Ok(SecurityQuestion {
                id: row.get(0)?,
                pertanyaan: row.get(1)?,
                jawaban: row.get(2)?,
                urutan: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn verify_security_answers_internal(
    conn: &rusqlite::Connection,
    user_id: i64,
    answers: Vec<String>,
) -> Result<VerifyResult, String> {
    let mut stmt = conn
        .prepare("SELECT jawaban FROM security_questions WHERE user_id = ?1 ORDER BY urutan")
        .map_err(|e| e.to_string())?;

    let stored: Vec<String> = stmt
        .query_map(params![user_id], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    if stored.len() != answers.len() {
        return Ok(VerifyResult { success: false });
    }

    for (s, a) in stored.iter().zip(answers.iter()) {
        if s != &a.trim().to_lowercase() {
            return Ok(VerifyResult { success: false });
        }
    }

    let hash = bcrypt::hash("admin", 10).map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![hash, user_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(VerifyResult { success: true })
}
```

- [ ] **Step 3: Implement Tauri commands (delegate to internal functions)**

```rust
#[tauri::command]
pub fn set_security_questions(
    state: State<DbState>,
    auth: State<AuthState>,
    user_id: i64,
    questions: Vec<SecurityQuestionInput>,
) -> Result<(), String> {
    require_admin(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    set_security_questions_internal(&conn, user_id, questions)
}

#[tauri::command]
pub fn get_security_questions_admin(
    state: State<DbState>,
    auth: State<AuthState>,
    user_id: i64,
) -> Result<Vec<SecurityQuestion>, String> {
    require_admin(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    get_security_questions_internal(&conn, user_id)
}

#[tauri::command]
pub fn get_security_questions_public(
    state: State<DbState>,
    username: String,
) -> Result<Vec<PublicQuestion>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let user_id: i64 = conn
        .query_row(
            "SELECT id FROM users WHERE username = ?1 AND is_active = 1",
            params![username],
            |row| row.get(0),
        )
        .map_err(|_| "User tidak ditemukan".to_string())?;

    let mut stmt = conn
        .prepare("SELECT pertanyaan, urutan FROM security_questions WHERE user_id = ?1 ORDER BY urutan")
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![user_id], |row| {
            Ok(PublicQuestion {
                pertanyaan: row.get(0)?,
                urutan: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let result: Vec<PublicQuestion> = rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?;

    if result.is_empty() {
        return Err("User ini tidak memiliki pertanyaan keamanan".into());
    }

    Ok(result)
}

#[tauri::command]
pub fn verify_security_answers(
    state: State<DbState>,
    username: String,
    answers: Vec<String>,
) -> Result<VerifyResult, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let user_id: i64 = conn
        .query_row(
            "SELECT id FROM users WHERE username = ?1 AND is_active = 1",
            params![username],
            |row| row.get(0),
        )
        .map_err(|_| "User tidak ditemukan".to_string())?;

    verify_security_answers_internal(&conn, user_id, answers)
}
```

- [ ] **Step 6: Run build to verify**

```bash
cd src-tauri && cargo build 2>&1 | head -10
```

---

### Task 3: Register new commands in lib.rs

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add 4 new command registrations**

Insert after line 172 (`commands::user_cmd::log_user_action,`):

```rust
            // Security questions (lupa password)
            commands::user_cmd::set_security_questions,
            commands::user_cmd::get_security_questions_admin,
            commands::user_cmd::get_security_questions_public,
            commands::user_cmd::verify_security_answers,
```

- [ ] **Step 2: Run build to verify**

```bash
cd src-tauri && cargo build 2>&1 | grep -E "^error" || echo "Build OK"
```

---

### Task 4: Frontend — security questions UI in UserManagement edit modal

**Files:**
- Modify: `src/pages/UserManagement.jsx`

- [ ] **Step 1: Import useEffect (already imported)** — no change needed

- [ ] **Step 2: Add state for security questions**

Add after existing state declarations:
```javascript
const [securityQuestions, setSecurityQuestions] = useState([]);
```

- [ ] **Step 3: Load questions when opening edit modal**

In `openEdit`, add after `setEditUserId(user.id)`:
```javascript
    // Load security questions for this user
    invoke("get_security_questions_admin", { user_id: user.id })
      .then((qs) => {
        setSecurityQuestions((qs || []).map((q) => ({
          pertanyaan: q.pertanyaan,
          jawaban: q.jawaban,
        })));
      })
      .catch(() => setSecurityQuestions([]));
```

Also reset `setSecurityQuestions([])` in `openNew`.

- [ ] **Step 4: Add question field helpers**

Add before `validate`:
```javascript
  const addQuestion = () => {
    if (securityQuestions.length >= 3) return;
    setSecurityQuestions((prev) => [...prev, { pertanyaan: "", jawaban: "" }]);
  };

  const removeQuestion = (idx) => {
    setSecurityQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const setQuestion = (idx, field, value) => {
    setSecurityQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q))
    );
  };
```

- [ ] **Step 5: Add questions section in the edit modal FormModal**

In the edit modal, after the Role `<SearchSelect>` block and before closing `</FormModal>`, add:

```jsx
          {editMode && (
            <>
              <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--color-outline-variant, #ddd)" }} />
              <p className="input-label" style={{ marginBottom: 8, fontWeight: 600 }}>
                Pertanyaan Keamanan{" "}
                <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>
                  (opsional, maks. 3)
                </span>
              </p>
              {securityQuestions.map((q, idx) => (
                <div key={idx} style={{ marginBottom: 12, padding: 12, border: "1px solid var(--color-outline-variant, #ddd)", borderRadius: 8, position: "relative" }}>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => removeQuestion(idx)}
                    style={{ position: "absolute", top: 4, right: 4 }}
                    title="Hapus pertanyaan"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#B91C1C" }}>close</span>
                  </button>
                  <label className="input-label">Pertanyaan {idx + 1}</label>
                  <input
                    className="input-field"
                    value={q.pertanyaan}
                    onChange={(e) => setQuestion(idx, "pertanyaan", e.target.value)}
                    placeholder="Contoh: Siapa nama hewan peliharaan pertama Anda?"
                  />
                  <label className="input-label">Jawaban</label>
                  <input
                    className="input-field"
                    value={q.jawaban}
                    onChange={(e) => setQuestion(idx, "jawaban", e.target.value)}
                    placeholder="Jawaban (tidak case-sensitive)"
                  />
                </div>
              ))}
              {securityQuestions.length < 3 && (
                <button type="button" className="btn-secondary" onClick={addQuestion} style={{ width: "100%" }}>
                  + Tambah Pertanyaan
                </button>
              )}
            </>
          )}
```

- [ ] **Step 6: Update save function to also save security questions**

In the `save` function, after the `update_user` invoke, before `addToast`:

```javascript
        await invoke("set_security_questions", {
          user_id: editUserId,
          questions: securityQuestions.map((q) => ({
            pertanyaan: q.pertanyaan.trim(),
            jawaban: q.jawaban.trim(),
          })),
        });
```

- [ ] **Step 7: Run build to verify**

```bash
cd /home/yudhis/CodeProject/MikroKas && npm run build 2>&1 | tail -5
```

---

### Task 5: Frontend — Lupa Password flow in Login.jsx

**Files:**
- Modify: `src/pages/Login.jsx`

- [ ] **Step 1: Add forgot-password state variables**

```javascript
const [showForgot, setShowForgot] = useState(false);
const [forgotStep, setForgotStep] = useState(1); // 1=username, 2=questions, 3=result
const [forgotUsername, setForgotUsername] = useState("");
const [forgotQuestions, setForgotQuestions] = useState([]);
const [forgotAnswers, setForgotAnswers] = useState([]);
const [forgotLoading, setForgotLoading] = useState(false);
const [forgotError, setForgotError] = useState("");
```

- [ ] **Step 2: Add forgot-password handlers**

```javascript
  const handleForgotStart = async () => {
    if (!forgotUsername.trim()) {
      setForgotError("Masukkan username terlebih dahulu");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      const qs = await invoke("get_security_questions_public", { username: forgotUsername.trim() });
      setForgotQuestions(qs);
      setForgotAnswers(new Array(qs.length).fill(""));
      setForgotStep(2);
    } catch (err) {
      setForgotError(String(err));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (forgotAnswers.some((a) => !a.trim())) {
      setForgotError("Semua jawaban wajib diisi");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    try {
      const result = await invoke("verify_security_answers", {
        username: forgotUsername.trim(),
        answers: forgotAnswers.map((a) => a.trim()),
      });
      if (result.success) {
        setForgotStep(3);
      } else {
        setForgotError("Jawaban tidak sesuai. Silakan coba lagi.");
      }
    } catch (err) {
      setForgotError(String(err));
    } finally {
      setForgotLoading(false);
    }
  };

  const resetForgot = () => {
    setShowForgot(false);
    setForgotStep(1);
    setForgotUsername("");
    setForgotQuestions([]);
    setForgotAnswers([]);
    setForgotError("");
  };
```

- [ ] **Step 3: Add "Lupa Password?" link after the login form button**

After the `</form>` closing tag and before `</main>`, add the forgot-password overlay:

```jsx
      <p style={{ textAlign: "center", marginTop: 12 }}>
        <button
          type="button"
          className="btn-text"
          onClick={() => setShowForgot(true)}
          style={{ fontSize: 13, color: "var(--color-primary)", textDecoration: "underline", cursor: "pointer", background: "none", border: "none" }}
        >
          Lupa Password?
        </button>
      </p>

      {showForgot && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100, padding: 16,
          }}
          onClick={(e) => e.target === e.currentTarget && resetForgot()}
        >
          <div
            style={{
              background: "var(--color-surface-container)",
              borderRadius: 16, padding: 28, width: "min(100%, 400px)",
              boxShadow: "0 8px 30px rgba(0,0,0,.15)",
            }}
          >
            {forgotStep === 1 && (
              <>
                <h2 className="text-headline-sm" style={{ marginBottom: 8 }}>Lupa Password</h2>
                <p className="text-body-md" style={{ marginBottom: 16, color: "var(--color-text-secondary)" }}>
                  Masukkan username untuk memverifikasi identitas Anda.
                </p>
                <label className="input-label">Username</label>
                <input
                  className="input-field"
                  value={forgotUsername}
                  onChange={(e) => { setForgotUsername(e.target.value); setForgotError(""); }}
                  placeholder="Masukkan username"
                  autoFocus
                />
                {forgotError && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{forgotError}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn-secondary" onClick={resetForgot} style={{ flex: 1 }}>
                    Batal
                  </button>
                  <button type="button" className="btn-primary" onClick={handleForgotStart} disabled={forgotLoading} style={{ flex: 1 }}>
                    {forgotLoading ? "Memeriksa..." : "Lanjutkan"}
                  </button>
                </div>
              </>
            )}

            {forgotStep === 2 && (
              <>
                <h2 className="text-headline-sm" style={{ marginBottom: 8 }}>Pertanyaan Keamanan</h2>
                <p className="text-body-md" style={{ marginBottom: 16, color: "var(--color-text-secondary)" }}>
                  Jawab pertanyaan di bawah untuk mereset password.
                </p>
                {forgotQuestions.map((q, idx) => (
                  <div key={idx} style={{ marginBottom: 12 }}>
                    <label className="input-label">{q.pertanyaan}</label>
                    <input
                      className="input-field"
                      value={forgotAnswers[idx] || ""}
                      onChange={(e) => {
                        const copy = [...forgotAnswers];
                        copy[idx] = e.target.value;
                        setForgotAnswers(copy);
                        setForgotError("");
                      }}
                      placeholder={`Jawaban ${idx + 1}`}
                      autoFocus={idx === 0}
                    />
                  </div>
                ))}
                {forgotError && <p style={{ color: "var(--color-error)", fontSize: 13, marginTop: 8 }}>{forgotError}</p>}
                <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn-secondary" onClick={resetForgot} style={{ flex: 1 }}>
                    Batal
                  </button>
                  <button type="button" className="btn-primary" onClick={handleForgotSubmit} disabled={forgotLoading} style={{ flex: 1 }}>
                    {forgotLoading ? "Memverifikasi..." : "Reset Password"}
                  </button>
                </div>
              </>
            )}

            {forgotStep === 3 && (
              <>
                <h2 className="text-headline-sm" style={{ marginBottom: 8, color: "var(--color-success, #047857)" }}>Password Direset</h2>
                <p className="text-body-md" style={{ marginBottom: 16 }}>
                  Password telah direset ke <strong>admin</strong>. Silakan login menggunakan username dan password default tersebut.
                </p>
                <button type="button" className="btn-primary" onClick={resetForgot} style={{ width: "100%" }}>
                  Kembali ke Login
                </button>
              </>
            )}
          </div>
        </div>
      )}
```

- [ ] **Step 4: Run build to verify**

```bash
cd /home/yudhis/CodeProject/MikroKas && npm run build 2>&1 | tail -5
```

---

### Task 6: Backend tests for security questions + verification

**Files:**
- Modify: `src-tauri/src/commands/user_cmd.rs` (add tests inside `mod tests`)

**Interfaces:**
- Consumes: `set_security_questions_internal`, `get_security_questions_internal`, `verify_security_answers_internal`,
  `SecurityQuestionInput`, `SecurityQuestion`, `VerifyResult` (already defined in Task 2)

- [ ] **Step 1: Update test imports**

Add to the `use super::{}` line in the test module:
```rust
SecurityQuestionInput, SecurityQuestion, VerifyResult,
set_security_questions_internal, get_security_questions_internal,
verify_security_answers_internal,
```

- [ ] **Step 2: Add test for set + get security questions**

```rust
    #[test]
    fn set_and_get_security_questions() {
        let conn = setup_test_db();
        let hash = bcrypt::hash("admin", 10).unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, nama_lengkap, role, is_active) VALUES (1, 'admin', ?1, 'Admin', 'admin', 1)",
            rusqlite::params![hash],
        ).unwrap();

        let questions = vec![
            SecurityQuestionInput {
                pertanyaan: "Siapa nama hewan peliharaan Anda?".into(),
                jawaban: "kucing".into(),
            },
            SecurityQuestionInput {
                pertanyaan: "Apa makanan favorit Anda?".into(),
                jawaban: "nasi goreng".into(),
            },
        ];

        set_security_questions_internal(&conn, 1, questions).unwrap();

        let stored = get_security_questions_internal(&conn, 1).unwrap();
        assert_eq!(stored.len(), 2);
        assert_eq!(stored[0].pertanyaan, "Siapa nama hewan peliharaan Anda?");
        assert_eq!(stored[0].jawaban, "kucing");
        assert_eq!(stored[0].urutan, 1);
        assert_eq!(stored[1].pertanyaan, "Apa makanan favorit Anda?");
        assert_eq!(stored[1].jawaban, "nasi goreng");
        assert_eq!(stored[1].urutan, 2);
    }
```

- [ ] **Step 3: Add test for verify answers (success + failure)**

```rust
    #[test]
    fn verify_security_answers_success_and_failure() {
        let conn = setup_test_db();
        let hash = bcrypt::hash("old_password", 10).unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, nama_lengkap, role, is_active) VALUES (1, 'admin', ?1, 'Admin', 'admin', 1)",
            rusqlite::params![hash],
        ).unwrap();

        // Insert security questions
        conn.execute(
            "INSERT INTO security_questions (user_id, pertanyaan, jawaban, urutan) VALUES (1, 'Pertanyaan 1', 'jawaban1', 1)",
            [],
        ).unwrap();
        conn.execute(
            "INSERT INTO security_questions (user_id, pertanyaan, jawaban, urutan) VALUES (1, 'Pertanyaan 2', 'jawaban2', 2)",
            [],
        ).unwrap();

        // Wrong answers
        let result = verify_security_answers_internal(&conn, 1, vec!["salah".into(), "salah".into()]).unwrap();
        assert!(!result.success);

        // Verify password was NOT changed
        let pwd: String = conn.query_row(
            "SELECT password_hash FROM users WHERE id = 1", [], |row| row.get(0)
        ).unwrap();
        assert_eq!(pwd, hash);

        // Correct answers
        let result = verify_security_answers_internal(&conn, 1, vec!["jawaban1".into(), "jawaban2".into()]).unwrap();
        assert!(result.success);

        // Verify password was reset to admin
        let new_pwd: String = conn.query_row(
            "SELECT password_hash FROM users WHERE id = 1", [], |row| row.get(0)
        ).unwrap();
        assert_ne!(new_pwd, hash);
        assert!(bcrypt::verify("admin", &new_pwd).unwrap());
    }
```

- [ ] **Step 4: Run tests to verify**

```bash
cd src-tauri && cargo test --package mikrokas --lib -- commands::user_cmd::tests 2>&1 | tail -15
```

Expected: all 10+ tests pass.

---

### Task 7: Final verification

- [ ] **Step 1: Run all backend tests**

```bash
cd src-tauri && cargo test 2>&1 | tail -10
```

- [ ] **Step 2: Build frontend**

```bash
cd /home/yudhis/CodeProject/MikroKas && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: add forgot password via security questions"
```
