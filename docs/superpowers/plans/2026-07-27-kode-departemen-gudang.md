# Kode Departemen/Gudang Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan identitas departemen/gudang lengkap dengan kode otomatis `YYYYMMDDNNN`, nomor global tiga digit yang tidak memakai ulang nomor saat gudang dinonaktifkan, dan reset alami saat database baru dibuat.

**Architecture:** Kolom identitas baru disimpan langsung di tabel `gudang`. Migrasi menambahkan kolom tanpa menghapus data lama. Backend membuat kode di dalam transaksi database dengan mengambil nomor terbesar yang pernah dipakai, termasuk baris nonaktif; `id` database tetap dipertahankan sebagai primary key internal. Frontend menampilkan kode otomatis dan menyediakan nama, alamat/cabang, jenis, status aktif, serta catatan.

**Tech Stack:** Rust 2021, Tauri 2, rusqlite 0.31, SQLite, React 19, Vite.

## Global Constraints

- Format kode wajib `YYYYMMDDNNN`, tanpa garis miring.
- `NNN` wajib tiga digit zero-padding (`001`, `002`, `010`).
- Nomor urut global berdasarkan urutan pembuatan dan tidak boleh dipakai ulang setelah soft-delete.
- Menghapus database menghapus counter karena counter tersimpan di database yang sama.
- Kode dibuat backend, bukan dipercaya dari input frontend.
- `is_active` menentukan apakah gudang muncul sebagai pilihan operasional/transaksi.
- Jangan mengubah `id` internal atau merusak foreign key gudang yang sudah ada.
- Verifikasi wajib: `cargo test`, `cargo build`, `npm run build`.

---

### Task 1: Schema and migration

**Files:**
- Create: `src-tauri/migrations/034_gudang_departemen_identity.sql`
- Modify: `src-tauri/src/db.rs:239-243`
- Modify: `src-tauri/src/commands/gudang_cmd.rs:6-68`

**Interfaces:**
- Produces columns `gudang.kode`, `gudang.jenis`, `gudang.catatan`, and `gudang.created_at`.
- `gudang.kode` is unique and nullable only during compatibility migration; newly created rows must always receive a code.

- [ ] **Step 1: Write migration SQL**

Add idempotent migration statements with purpose comments:

```sql
-- Migration 034: Identitas departemen/gudang dan timestamp pembuatan.
ALTER TABLE gudang ADD COLUMN kode TEXT;
ALTER TABLE gudang ADD COLUMN jenis TEXT NOT NULL DEFAULT 'gudang';
ALTER TABLE gudang ADD COLUMN catatan TEXT;
ALTER TABLE gudang ADD COLUMN created_at TEXT NOT NULL DEFAULT (datetime('now'));
CREATE UNIQUE INDEX IF NOT EXISTS idx_gudang_kode ON gudang(kode);
UPDATE gudang
SET kode = strftime('%Y%m%d', created_at) || printf('%03d', id)
WHERE kode IS NULL OR kode = '';
```

The implementation must tolerate already-added columns because `db.rs` executes migrations on every startup; use the repository's existing `ensure_column` pattern where raw `ALTER TABLE` would fail on an existing database. Keep the migration file idempotent in the supported startup path.

- [ ] **Step 2: Register migration after migration 033**

Call `include_str!("../migrations/034_gudang_departemen_identity.sql")` in `init_db` after migration 033, or perform the four `ensure_column` calls followed by the unique index and backfill. Existing rows receive deterministic codes based on their creation timestamp and old internal ID; new rows use the backend sequence.

- [ ] **Step 3: Run migration-focused Rust checks**

Run:

```bash
cargo test
```

Expected: existing tests pass; if no tests exist, command exits successfully.

---

### Task 2: Backend code generation and CRUD payloads

**Files:**
- Modify: `src-tauri/src/commands/gudang_cmd.rs:6-110`
- Modify: `src-tauri/src/commands/mod.rs` only if command signatures require registration changes
- Test: `src-tauri/src/commands/gudang_cmd.rs` test module or an existing Rust test location

**Interfaces:**
- `Gudang` serializes `id`, `kode`, `nama`, `alamat`, `jenis`, `catatan`, `created_at`, `is_active`, and `is_default`.
- `create_gudang(state, nama, alamat, jenis, catatan)` returns the internal `i64` ID for existing undo behavior.
- `update_gudang(state, id, nama, alamat, jenis, catatan, is_active)` preserves code and updates editable fields only.
- `delete_gudang` remains a soft delete and never removes the historical code.

- [ ] **Step 1: Add a failing unit test for code formatting and monotonic numbering**

Extract a small pure helper with signature `fn format_gudang_kode(date: &str, sequence: i64) -> Result<String, String>` and test:

```rust
#[test]
fn formats_gudang_code_with_global_three_digit_sequence() {
    assert_eq!(format_gudang_kode("2026-07-27", 1).unwrap(), "20260727001");
    assert_eq!(format_gudang_kode("2026-07-27", 10).unwrap(), "20260727010");
}
```

Run `cargo test formats_gudang_code_with_global_three_digit_sequence`; it must fail before implementation.

- [ ] **Step 2: Implement minimal validated formatter and sequence lookup**

Use `chrono::Local::now().format("%Y%m%d")` for today. Read every existing non-null `kode`, parse its final three digits, select the maximum, and use `max + 1`; include inactive rows. Reject sequence values above `999` with a meaningful error instead of producing malformed codes.

- [ ] **Step 3: Add a failing database test for deleted rows not reusing numbers**

Using an in-memory SQLite connection with the `gudang` schema, create two rows, soft-delete the first, create a third, and assert the suffixes are `001`, `002`, `003`. This test must exercise the same sequence helper/query used by `create_gudang`, not a duplicate test-only algorithm.

- [ ] **Step 4: Implement atomic creation**

Lock the shared connection, begin a transaction, calculate the next sequence and current date, insert `kode`, `nama`, `alamat`, `jenis`, `catatan`, `created_at`, and `is_active=1`, commit, then return `last_insert_rowid()`. Validate non-empty name, supported `jenis` (`gudang`, `retail`, `mobile`), and sequence overflow before insert.

- [ ] **Step 5: Extend list/update queries**

Return all new fields from `list_gudang`, order default first then code ascending, and update only editable fields. Allow active status changes through `update_gudang`; keep the default warehouse protected from deactivation if that is the existing business rule.

- [ ] **Step 6: Run backend tests and build**

Run:

```bash
cargo test
cargo build
```

Expected: formatter test, monotonic soft-delete test, and all existing tests pass; backend compiles without warnings that indicate a broken payload.

---

### Task 3: Complete warehouse form and display

**Files:**
- Modify: `src/pages/Gudang.jsx:1-157`

**Interfaces:**
- New form sends `nama`, `alamat`, `jenis`, and `catatan`; code is displayed read-only after creation and during edit.
- Existing list/edit/delete/undo behavior remains functional.

- [ ] **Step 1: Add initial frontend state and option labels**

Use:

```js
const JENIS_GUDANG = [
  { value: "gudang", label: "Gudang Penyimpanan" },
  { value: "retail", label: "Toko/Kasir Retail" },
  { value: "mobile", label: "Mobile Canvas" },
];
const [form, setForm] = useState({ nama: "", alamat: "", jenis: "gudang", catatan: "", is_active: true });
```

Use existing `SearchSelect` for jenis. On create, show code as `Dibuat otomatis oleh sistem`; on edit, show the existing `kode` read-only.

- [ ] **Step 2: Update create/update/undo payloads**

Pass `jenis`, `catatan`, and `is_active` to `create_gudang`/`update_gudang`. Preserve the returned internal ID for undo, and refresh after each operation. Do not allow editing code.

- [ ] **Step 3: Update table and filtering**

Display `g.kode` as the primary identifier, name below it, type label, active/inactive status, address, and note where useful. Include code, type, and status in the search text. Keep default warehouse action restrictions.

- [ ] **Step 4: Run frontend verification**

Run:

```bash
npm run build
```

Expected: Vite build succeeds and the form has no uncontrolled/undefined value errors.

---

### Task 4: Cross-page compatibility and final audit

**Files:**
- Modify only call sites that invoke `create_gudang` or assume numeric `gudang.id`, if compilation/runtime audit identifies one.
- Do not alter foreign-key fields such as `gudang_id`; those remain internal numeric IDs.

**Interfaces:**
- Display code is human-facing; database relationships continue using numeric `id`.

- [ ] **Step 1: Audit all warehouse call sites**

Search for `create_gudang`, `update_gudang`, `list_gudang`, and `gudang_id`. Confirm only display labels change from numeric ID to `kode`; backend stock and transfer commands continue receiving numeric IDs.

- [ ] **Step 2: Run complete verification**

Run:

```bash
cargo test
cargo build
npm run build
```

Expected: all commands pass. Manually verify: first new warehouse ends in `001`, deleting it and creating another ends in `002`, editing does not change the code, inactive warehouses are excluded from active lists, and a fresh database starts at `001`.

- [ ] **Step 3: Review diff for scope and data safety**

Run `git diff --check` and inspect only intended files. Do not revert unrelated existing worktree changes and do not commit unless explicitly requested.
