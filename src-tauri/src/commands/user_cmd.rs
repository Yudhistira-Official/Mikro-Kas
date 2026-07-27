use crate::db::DbState;
use rusqlite::params;
/// Multi-user system with role-based access control.
/// Roles: admin (full), supervisor (all except user management), kasir (POS only).
/// Session: process-memory only; restart requires login again.
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::State;

pub struct AuthState(pub Mutex<Option<User>>);

fn bootstrap_password_requires_change(username: &str, password: &str) -> bool {
    username == "admin" && password == "admin"
}

#[cfg(test)]
mod tests {
    use super::{
        bootstrap_password_requires_change, login_user_internal, reset_password_internal,
        deactivate_user_internal, AuthState, create_user_internal, update_user_internal,
        require_admin_internal, set_security_questions_internal,
        get_security_questions_internal, verify_security_answers_internal,
        CreateUserRequest, UpdateUserRequest, User, SecurityQuestionInput,
    };
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                nama_lengkap TEXT,
                role TEXT NOT NULL DEFAULT 'kasir',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT (datetime('now')),
                updated_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE user_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                aksi TEXT NOT NULL,
                detail TEXT,
                created_at TEXT DEFAULT (datetime('now'))
            );
            CREATE TABLE security_questions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                pertanyaan TEXT NOT NULL,
                jawaban TEXT NOT NULL,
                urutan INTEGER NOT NULL,
                created_at TEXT DEFAULT (datetime('now'))
            );",
        )
        .unwrap();
        conn
    }

    #[test]
    fn bootstrap_admin_is_marked_until_password_changes() {
        assert!(bootstrap_password_requires_change("admin", "admin"));
        assert!(!bootstrap_password_requires_change("admin", "adminbaru"));
        assert!(!bootstrap_password_requires_change("operator", "admin"));
    }

    #[test]
    fn test_login_must_change_password_full_cycle() {
        let conn = setup_test_db();
        let auth = AuthState(Mutex::new(None));

        // Seed admin user directly
        let hash = bcrypt::hash("admin", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES ('admin', ?1, 'Administrator', 'admin', 1)",
            rusqlite::params![hash],
        ).unwrap();

        // First login: default password → must_change_password = true
        let u1 = login_user_internal(&conn, &auth, "admin".to_string(), "admin".to_string()).unwrap();
        assert!(u1.must_change_password);
        assert_eq!(u1.username, "admin");
        assert!(auth.0.lock().unwrap().as_ref().unwrap().must_change_password);

        // Change password to 'adminbaru' (passes minimum-six validation)
        reset_password_internal(&conn, u1.id, "adminbaru".to_string()).unwrap();

        // Second login: changed password → must_change_password = false
        let u2 = login_user_internal(&conn, &auth, "admin".to_string(), "adminbaru".to_string()).unwrap();
        assert!(!u2.must_change_password);
        assert!(!auth.0.lock().unwrap().as_ref().unwrap().must_change_password);
    }

    #[test]
    fn get_current_user_reflects_login_marker() {
        let conn = setup_test_db();
        let auth = AuthState(Mutex::new(None));

        let hash = bcrypt::hash("admin", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES ('admin', ?1, 'Admin', 'admin', 1)",
            rusqlite::params![hash],
        ).unwrap();

        let _u = login_user_internal(&conn, &auth, "admin".to_string(), "admin".to_string()).unwrap();
        let current = auth.0.lock().unwrap().clone().unwrap();
        assert!(current.must_change_password, "AuthState must preserve must_change_password for session hydration");

        reset_password_internal(&conn, current.id, "newsecurepassword".to_string()).unwrap();
        let _u2 = login_user_internal(&conn, &auth, "admin".to_string(), "newsecurepassword".to_string()).unwrap();
        let current2 = auth.0.lock().unwrap().clone().unwrap();
        assert!(!current2.must_change_password);
    }

    #[test]
    fn minimum_six_password_validation_preserved() {
        let conn = setup_test_db();
        let short = "12345";
        let result = reset_password_internal(&conn, 1, short.to_string());
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Password min 6 karakter");
    }

    #[test]
    fn cannot_deactivate_last_active_user() {
        let conn = setup_test_db();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES ('admin', 'hash', 'Admin', 'admin', 1)",
            [],
        ).unwrap();
        
        let result = deactivate_user_internal(&conn, 1);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Tidak dapat menonaktifkan user terakhir");
    }

    #[test]
    fn create_user_fails_on_duplicate_username() {
        let conn = setup_test_db();
        
        // Insert a user first
        let req1 = CreateUserRequest {
            username: "koko".into(),
            password: "password123".into(),
            nama_lengkap: Some("Koko".into()),
            role: "kasir".into(),
            questions: None,
        };
        create_user_internal(&conn, req1).unwrap();

        // Try inserting same username again
        let req2 = CreateUserRequest {
            username: "koko".into(),
            password: "anotherpass".into(),
            nama_lengkap: Some("Koko Baru".into()),
            role: "kasir".into(),
            questions: None,
        };
        let res = create_user_internal(&conn, req2);
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "Username sudah terdaftar");
    }

    #[test]
    fn require_admin_checks_permissions_correctly() {
        // Unauthenticated
        let auth = AuthState(Mutex::new(None));
        assert!(require_admin_internal(&auth).is_err());

        // Authenticated as kasir
        let auth_kasir = AuthState(Mutex::new(Some(User {
            id: 2,
            username: "kasir1".into(),
            nama_lengkap: None,
            role: "kasir".into(),
            is_active: true,
            must_change_password: false,
        })));
        assert!(require_admin_internal(&auth_kasir).is_err());

        // Authenticated as admin but inactive
        let auth_inactive_admin = AuthState(Mutex::new(Some(User {
            id: 3,
            username: "admin1".into(),
            nama_lengkap: None,
            role: "admin".into(),
            is_active: false,
            must_change_password: false,
        })));
        assert!(require_admin_internal(&auth_inactive_admin).is_err());

        // Authenticated as active admin
        let auth_admin = AuthState(Mutex::new(Some(User {
            id: 1,
            username: "admin1".into(),
            nama_lengkap: None,
            role: "admin".into(),
            is_active: true,
            must_change_password: false,
        })));
        assert!(require_admin_internal(&auth_admin).is_ok());
    }

    #[test]
    fn update_user_validates_and_saves() {
        let conn = setup_test_db();
        
        // Insert user
        let req_create = CreateUserRequest {
            username: "budi".into(),
            password: "password123".into(),
            nama_lengkap: Some("Budi".into()),
            role: "kasir".into(),
            questions: None,
        };
        let user = create_user_internal(&conn, req_create).unwrap();

        // Update name and role, no password
        let req_update1 = UpdateUserRequest {
            id: user.id,
            nama_lengkap: Some("Budi Utomo".into()),
            role: "supervisor".into(),
            password: None,
        };
        update_user_internal(&conn, req_update1).unwrap();

        // Verify changes
        let (nama, role): (Option<String>, String) = conn
            .query_row(
                "SELECT nama_lengkap, role FROM users WHERE id = ?1",
                rusqlite::params![user.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(nama, Some("Budi Utomo".into()));
        assert_eq!(role, "supervisor");

        // Update password too
        let req_update2 = UpdateUserRequest {
            id: user.id,
            nama_lengkap: Some("Budi Utomo".into()),
            role: "supervisor".into(),
            password: Some("newpassword".into()),
        };
        update_user_internal(&conn, req_update2).unwrap();

        // Verify password hash updated and works
        let pwd_hash: String = conn
            .query_row(
                "SELECT password_hash FROM users WHERE id = ?1",
                rusqlite::params![user.id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(bcrypt::verify("newpassword", &pwd_hash).unwrap());
    }

    #[test]
    fn set_and_get_security_questions_roundtrip() {
        let conn = setup_test_db();
        // Seed a user
        let hash = bcrypt::hash("password", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            rusqlite::params!["testuser", hash, "Test User", "kasir"],
        ).unwrap();
        let user_id = conn.last_insert_rowid();

        // Set 2 questions
        let questions = vec![
            SecurityQuestionInput {
                pertanyaan: "Siapa nama hewan peliharaan pertama?".into(),
                jawaban: "Doggo".into(),
            },
            SecurityQuestionInput {
                pertanyaan: "Apa makanan favorit?".into(),
                jawaban: "Pizza".into(),
            },
        ];
        set_security_questions_internal(&conn, user_id, questions.clone()).unwrap();

        // Retrieve and verify
        let stored = get_security_questions_internal(&conn, user_id).unwrap();
        assert_eq!(stored.len(), 2);
        assert_eq!(stored[0].pertanyaan, "Siapa nama hewan peliharaan pertama?");
        assert_eq!(stored[0].jawaban, "doggo"); // lowercase stored
        assert_eq!(stored[0].urutan, 1);
        assert_eq!(stored[1].pertanyaan, "Apa makanan favorit?");
        assert_eq!(stored[1].jawaban, "pizza");
        assert_eq!(stored[1].urutan, 2);
    }

    #[test]
    fn max_three_security_questions_enforced() {
        let conn = setup_test_db();
        let questions = vec![
            SecurityQuestionInput { pertanyaan: "Q1".into(), jawaban: "A1".into() },
            SecurityQuestionInput { pertanyaan: "Q2".into(), jawaban: "A2".into() },
            SecurityQuestionInput { pertanyaan: "Q3".into(), jawaban: "A3".into() },
            SecurityQuestionInput { pertanyaan: "Q4".into(), jawaban: "A4".into() },
        ];
        let result = set_security_questions_internal(&conn, 1, questions);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Maksimal 3 pertanyaan keamanan");
    }

    #[test]
    fn empty_question_or_answer_rejected() {
        let conn = setup_test_db();
        let result = set_security_questions_internal(&conn, 1, vec![
            SecurityQuestionInput { pertanyaan: "".into(), jawaban: "Answer".into() },
        ]);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Pertanyaan dan jawaban tidak boleh kosong");

        let result2 = set_security_questions_internal(&conn, 1, vec![
            SecurityQuestionInput { pertanyaan: "Question".into(), jawaban: "".into() },
        ]);
        assert!(result2.is_err());
        assert_eq!(result2.unwrap_err(), "Pertanyaan dan jawaban tidak boleh kosong");
    }

    #[test]
    fn verify_security_answers_correct_resets_password() {
        let conn = setup_test_db();
        let hash = bcrypt::hash("password", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            rusqlite::params!["testuser", hash, "Test User", "kasir"],
        ).unwrap();
        let user_id = conn.last_insert_rowid();

        // Set questions
        set_security_questions_internal(&conn, user_id, vec![
            SecurityQuestionInput { pertanyaan: "Pet?".into(), jawaban: "Doggo".into() },
            SecurityQuestionInput { pertanyaan: "Food?".into(), jawaban: "Pizza".into() },
        ]).unwrap();

        // Wrong answers
        let result = verify_security_answers_internal(&conn, user_id, vec!["Wrong".into(), "Answers".into()]).unwrap();
        assert!(!result.success);

        // Verify password still the old one
        let pwd_hash: String = conn.query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |row| row.get(0),
        ).unwrap();
        assert!(bcrypt::verify("password", &pwd_hash).unwrap());

        // Correct answers (case-insensitive)
        let result = verify_security_answers_internal(&conn, user_id, vec!["doggo".into(), "pizza".into()]).unwrap();
        assert!(result.success);

        // Verify password now reset to "admin"
        let pwd_hash2: String = conn.query_row(
            "SELECT password_hash FROM users WHERE id = ?1",
            rusqlite::params![user_id],
            |row| row.get(0),
        ).unwrap();
        assert!(bcrypt::verify("admin", &pwd_hash2).unwrap());
    }

    #[test]
    fn wrong_answer_count_returns_false() {
        let conn = setup_test_db();
        let hash = bcrypt::hash("password", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            rusqlite::params!["testuser", hash, "Test User", "kasir"],
        ).unwrap();
        let user_id = conn.last_insert_rowid();

        set_security_questions_internal(&conn, user_id, vec![
            SecurityQuestionInput { pertanyaan: "Q1".into(), jawaban: "A1".into() },
        ]).unwrap();

        // Provide 2 answers for 1 question → mismatch count
        let result = verify_security_answers_internal(&conn, user_id, vec!["A1".into(), "Extra".into()]).unwrap();
        assert!(!result.success);
    }

    #[test]
    fn replacing_security_questions_clears_old() {
        let conn = setup_test_db();
        let hash = bcrypt::hash("password", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            rusqlite::params!["testuser", hash, "Test User", "kasir"],
        ).unwrap();
        let user_id = conn.last_insert_rowid();

        set_security_questions_internal(&conn, user_id, vec![
            SecurityQuestionInput { pertanyaan: "Old Q".into(), jawaban: "Old A".into() },
        ]).unwrap();

        // Replace with new questions
        set_security_questions_internal(&conn, user_id, vec![
            SecurityQuestionInput { pertanyaan: "New Q".into(), jawaban: "New A".into() },
        ]).unwrap();

        let stored = get_security_questions_internal(&conn, user_id).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].pertanyaan, "New Q");
    }

    #[test]
    fn create_admin_fails_without_security_questions() {
        let conn = setup_test_db();
        let req = CreateUserRequest {
            username: "admin2".into(),
            password: "password123".into(),
            nama_lengkap: Some("Admin 2".into()),
            role: "admin".into(),
            questions: None,
        };
        let result = create_user_internal(&conn, req);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Admin wajib memiliki minimal 1 pertanyaan keamanan");

        // Also test with empty questions vec
        let req2 = CreateUserRequest {
            username: "admin3".into(),
            password: "password123".into(),
            nama_lengkap: Some("Admin 3".into()),
            role: "admin".into(),
            questions: Some(vec![]),
        };
        let result2 = create_user_internal(&conn, req2);
        assert!(result2.is_err());
        assert_eq!(result2.unwrap_err(), "Admin wajib memiliki minimal 1 pertanyaan keamanan");
    }

    #[test]
    fn create_admin_succeeds_with_security_questions() {
        let conn = setup_test_db();
        let req = CreateUserRequest {
            username: "admin2".into(),
            password: "password123".into(),
            nama_lengkap: Some("Admin 2".into()),
            role: "admin".into(),
            questions: Some(vec![
                SecurityQuestionInput {
                    pertanyaan: "Pet?".into(),
                    jawaban: "Doggo".into(),
                },
            ]),
        };
        let user = create_user_internal(&conn, req).unwrap();
        assert_eq!(user.username, "admin2");

        // Verify questions were saved
        let qs = get_security_questions_internal(&conn, user.id).unwrap();
        assert_eq!(qs.len(), 1);
        assert_eq!(qs[0].pertanyaan, "Pet?");
    }

    #[test]
    fn cannot_remove_all_questions_from_admin() {
        let conn = setup_test_db();
        let hash = bcrypt::hash("password", 10).unwrap();
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            rusqlite::params!["admin1", hash, "Admin 1", "admin"],
        ).unwrap();
        let user_id = conn.last_insert_rowid();

        // Set an initial question
        set_security_questions_internal(&conn, user_id, vec![
            SecurityQuestionInput { pertanyaan: "Q1".into(), jawaban: "A1".into() },
        ]).unwrap();

        // Try to remove all questions
        let result = set_security_questions_internal(&conn, user_id, vec![]);
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Admin wajib memiliki minimal 1 pertanyaan keamanan");

        // Verify original question still exists
        let stored = get_security_questions_internal(&conn, user_id).unwrap();
        assert_eq!(stored.len(), 1);

        // Non-admin can still remove questions
        conn.execute(
            "INSERT INTO users (username, password_hash, nama_lengkap, role, is_active) VALUES (?1, ?2, ?3, ?4, 1)",
            rusqlite::params!["kasir1", hash, "Kasir 1", "kasir"],
        ).unwrap();
        let kasir_id = conn.last_insert_rowid();

        set_security_questions_internal(&conn, kasir_id, vec![
            SecurityQuestionInput { pertanyaan: "Q?".into(), jawaban: "A!".into() },
        ]).unwrap();
        set_security_questions_internal(&conn, kasir_id, vec![]).unwrap();
        let stored_kasir = get_security_questions_internal(&conn, kasir_id).unwrap();
        assert!(stored_kasir.is_empty());
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct User {
    pub id: i64,
    pub username: String,
    pub nama_lengkap: Option<String>,
    pub role: String,
    pub is_active: bool,
    pub must_change_password: bool,
}

#[derive(Debug, Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub password: String,
    pub nama_lengkap: Option<String>,
    pub role: String,
    pub questions: Option<Vec<SecurityQuestionInput>>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateUserRequest {
    pub id: i64,
    pub nama_lengkap: Option<String>,
    pub role: String,
    pub password: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
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

fn require_admin_internal(auth: &AuthState) -> Result<(), String> {
    let guard = auth.0.lock().map_err(|e| e.to_string())?;
    match &*guard {
        Some(user) if user.role == "admin" && user.is_active => Ok(()),
        _ => Err("Akses ditolak: Hanya admin yang dapat melakukan tindakan ini".to_string()),
    }
}

fn require_admin(auth: &State<AuthState>) -> Result<(), String> {
    require_admin_internal(auth.inner())
}

/// Register new user with bcrypt password hash (internal logic)
/// For admin users, at least 1 security question is required.
pub fn create_user_internal(
    conn: &rusqlite::Connection,
    req: CreateUserRequest,
) -> Result<User, String> {
    if req.username.len() < 3 {
        return Err("Username min 3 karakter".into());
    }
    if req.password.len() < 6 {
        return Err("Password min 6 karakter".into());
    }

    // Admin users must have at least 1 security question
    if req.role == "admin" {
        match &req.questions {
            Some(qs) if !qs.is_empty() => {},
            _ => return Err("Admin wajib memiliki minimal 1 pertanyaan keamanan".into()),
        }
    }

    // Check duplicate username
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE username = ?1",
            params![req.username],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if count > 0 {
        return Err("Username sudah terdaftar".into());
    }

    let hash = bcrypt::hash(&req.password, 10).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO users (username, password_hash, nama_lengkap, role) VALUES (?1, ?2, ?3, ?4)",
        params![req.username, hash, req.nama_lengkap, req.role],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();

    // Set security questions if provided
    if let Some(qs) = req.questions {
        if !qs.is_empty() {
            set_security_questions_internal(conn, id, qs)?;
        }
    }

    Ok(User {
        id,
        username: req.username,
        nama_lengkap: req.nama_lengkap,
        role: req.role,
        is_active: true,
        must_change_password: false,
    })
}

/// Register new user with bcrypt password hash (Tauri command)
#[tauri::command]
pub fn create_user(
    state: State<DbState>,
    auth: State<AuthState>,
    req: CreateUserRequest,
) -> Result<User, String> {
    require_admin(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    create_user_internal(&conn, req)
}

/// Edit user account (admin only, internal logic)
pub fn update_user_internal(
    conn: &rusqlite::Connection,
    req: UpdateUserRequest,
) -> Result<(), String> {
    if req.role != "admin" && req.role != "supervisor" && req.role != "kasir" {
        return Err("Role tidak valid".into());
    }

    // Check if user exists
    let user_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM users WHERE id = ?1",
            params![req.id],
            |row| row.get::<_, i64>(0).map(|c| c > 0),
        )
        .map_err(|e| e.to_string())?;

    if !user_exists {
        return Err("User tidak ditemukan".into());
    }

    // Check if we are updating password
    if let Some(ref pwd) = req.password {
        if !pwd.is_empty() {
            if pwd.len() < 6 {
                return Err("Password min 6 karakter".into());
            }
            let hash = bcrypt::hash(pwd, 10).map_err(|e| e.to_string())?;
            conn.execute(
                "UPDATE users SET nama_lengkap = ?1, role = ?2, password_hash = ?3, updated_at = datetime('now') WHERE id = ?4",
                params![req.nama_lengkap, req.role, hash, req.id],
            )
            .map_err(|e| e.to_string())?;
            return Ok(());
        }
    }

    conn.execute(
        "UPDATE users SET nama_lengkap = ?1, role = ?2, updated_at = datetime('now') WHERE id = ?3",
        params![req.nama_lengkap, req.role, req.id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Edit user account (admin only, Tauri command).
/// Jika user yang diedit adalah user yang sedang login dan password diubah,
/// clear must_change_password di AuthState.
#[tauri::command]
pub fn update_user(
    state: State<DbState>,
    auth: State<AuthState>,
    req: UpdateUserRequest,
) -> Result<(), String> {
    require_admin(&auth)?;
    let edited_id = req.id;
    let password_changed = matches!(&req.password, Some(p) if !p.is_empty());
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    update_user_internal(&conn, req)?;

    // Jika user yang diedit = user yang sedang login, refresh AuthState
    let mut guard = auth.0.lock().map_err(|e| e.to_string())?;
    if let Some(ref mut current) = *guard {
        if current.id == edited_id {
            if password_changed {
                current.must_change_password = false;
            }
        }
    }
    Ok(())
}

/// Login: verify username + password, return user if valid
#[tauri::command]
pub fn login_user(
    state: State<DbState>,
    auth: State<AuthState>,
    username: String,
    password: String,
) -> Result<User, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    login_user_internal(&conn, &auth, username, password)
}

pub fn login_user_internal(
    conn: &rusqlite::Connection,
    auth: &AuthState,
    username: String,
    password: String,
) -> Result<User, String> {
    let mut stmt = conn.prepare(
        "SELECT id, username, password_hash, nama_lengkap, role, is_active FROM users WHERE username = ?1"
    ).map_err(|e| e.to_string())?;

    let user = stmt
        .query_row(params![username], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, i64>(5)?,
            ))
        })
        .map_err(|_| "User tidak ditemukan".to_string())?;

    let (id, user_username, hash, nama, role, active) = user;

    if active == 0 {
        return Err("User tidak aktif".into());
    }

    if !bcrypt::verify(&password, &hash).map_err(|e| e.to_string())? {
        return Err("Password salah".into());
    }

    conn.execute(
        "INSERT INTO user_logs (user_id, aksi) VALUES (?1, 'login')",
        params![id],
    )
    .map_err(|e| e.to_string())?;
    drop(stmt);

    let result = User {
        id,
        username: user_username,
        nama_lengkap: nama,
        role,
        is_active: true,
        must_change_password: false,
    };
    let must_change_password = bootstrap_password_requires_change(&result.username, &password);
    let result = User { must_change_password, ..result };
    *auth.0.lock().map_err(|e| e.to_string())? = Some(result.clone());
    Ok(result)
}

#[tauri::command]
pub fn get_current_user(auth: State<AuthState>) -> Result<Option<User>, String> {
    auth.0
        .lock()
        .map(|user| user.clone())
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn logout_user(auth: State<AuthState>) -> Result<(), String> {
    *auth.0.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

/// List all users (without password hash)
#[tauri::command]
pub fn list_users(state: State<DbState>) -> Result<Vec<User>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, username, nama_lengkap, role, is_active FROM users ORDER BY created_at DESC"
    ).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                nama_lengkap: row.get(2)?,
                role: row.get(3)?,
                is_active: row.get::<_, i64>(4)? == 1,
                must_change_password: false,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Deactivate user (soft delete) - admin only
#[tauri::command]
pub fn deactivate_user(
    state: State<DbState>,
    auth: State<AuthState>,
    id: i64,
) -> Result<(), String> {
    require_admin(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    deactivate_user_internal(&conn, id)
}

pub fn deactivate_user_internal(conn: &rusqlite::Connection, id: i64) -> Result<(), String> {
    // Check if this is the last active user
    let active_count: i64 = conn.query_row("SELECT COUNT(*) FROM users WHERE is_active = 1", [], |row| row.get(0))
        .map_err(|e| e.to_string())?;
        
    if active_count <= 1 {
        return Err("Tidak dapat menonaktifkan user terakhir".into());
    }
    
    conn.execute("UPDATE users SET is_active = 0 WHERE id = ?1", params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Reset password (admin only)
#[tauri::command]
pub fn reset_password(
    state: State<DbState>,
    auth: State<AuthState>,
    user_id: i64,
    new_password: String,
) -> Result<(), String> {
    require_admin(&auth)?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    reset_password_internal(&conn, user_id, new_password)
}

pub fn reset_password_internal(
    conn: &rusqlite::Connection,
    user_id: i64,
    new_password: String,
) -> Result<(), String> {
    if new_password.len() < 6 {
        return Err("Password min 6 karakter".into());
    }

    let hash = bcrypt::hash(&new_password, 10).map_err(|e| e.to_string())?;

    conn.execute(
        "UPDATE users SET password_hash = ?1, updated_at = datetime('now') WHERE id = ?2",
        params![hash, user_id],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

// ── Security Questions (Forgot Password) ──

/// Set security questions for a user.
/// Admin users must always have at least 1 question.
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

    // Admin users must have at least 1 question
    if questions.is_empty() {
        let role: String = conn
            .query_row(
                "SELECT role FROM users WHERE id = ?1",
                params![user_id],
                |row| row.get(0),
            )
            .map_err(|_| "User tidak ditemukan".to_string())?;
        if role == "admin" {
            return Err("Admin wajib memiliki minimal 1 pertanyaan keamanan".into());
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

/// Log user action
#[tauri::command]
pub fn log_user_action(
    state: State<DbState>,
    user_id: i64,
    aksi: String,
    detail: Option<String>,
) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO user_logs (user_id, aksi, detail) VALUES (?1, ?2, ?3)",
        params![user_id, aksi, detail],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
