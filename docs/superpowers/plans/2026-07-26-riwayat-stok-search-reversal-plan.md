# Riwayat Stok Search + Reversal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sidebar search `audit` find Riwayat Stok and add safe delta-based audit reversal with 48-hour rules, Admin PIN override, and immutable audit history.

**Architecture:** Add a nullable `reverse_of_id` relation to `stock_adjustment`. A Rust transaction validates target state, time window, Admin PIN override, and applies `-selisih` to current stock before inserting a reversal row. The React page renders action/status controls and reuses the existing PIN verification pattern. The current frontend has no login page/session producer, so Admin override is implemented through the existing Admin PIN; no speculative login system is added.

**Tech Stack:** React 19, React Router 7, Tauri 2, Rust, SQLite, rusqlite, existing `invoke` wrapper, existing PageKit components.

## Global Constraints

- Preserve original audit rows; never delete them.
- Reversal uses delta math: `reversal_delta = -original.selisih`; never reset stock to `stok_sebelum`.
- Non-Admin reversal requires age `<= 48 hours` and current stock `== stok_sesudah`.
- Valid Admin PIN bypasses the 48-hour and stock-match checks.
- Already reversed audits and reversal rows cannot be reversed.
- Use one SQLite transaction for stock update plus reversal insert.
- Use existing dependencies only; do not add packages.
- Keep user-facing messages in Indonesian.
- Do not modify mobile-specific layout.
- Run `npm run build` and `cargo check` before completion.

---

### Task 1: Add idempotent reversal schema

**Files:**
- Create: `src-tauri/migrations/033_stock_adjustment_reversal.sql`
- Modify: `src-tauri/src/db.rs` near existing migration execution

**Interfaces:**
- Produces nullable `stock_adjustment.reverse_of_id INTEGER` and index `idx_stock_adj_reverse_of`.

- [ ] **Step 1: Add migration SQL**

```sql
-- Migration 033: link reversal audit rows to their original stock adjustment.
-- Original audit rows remain immutable; reverse_of_id prevents duplicate reversal.
ALTER TABLE stock_adjustment ADD COLUMN reverse_of_id INTEGER REFERENCES stock_adjustment(id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_reverse_of ON stock_adjustment(reverse_of_id);
```

- [ ] **Step 2: Register migration in `db.rs`**

Add the migration execution beside migrations 030–032. Follow the existing error-tolerant migration pattern so startup remains idempotent.

- [ ] **Step 3: Verify migration wiring**

Run: `cargo check` from `src-tauri/`
Expected: successful compilation.

- [ ] **Step 4: Review only intended diff**

Run: `git diff -- src-tauri/migrations/033_stock_adjustment_reversal.sql src-tauri/src/db.rs`
Expected: only the new column/index and migration registration.

---

### Task 2: Implement backend reversal command

**Files:**
- Modify: `src-tauri/src/commands/produk_cmd.rs` around `StockAdjustment`, `adjust_stock`, and `list_stock_adjustments`
- Modify: `src-tauri/src/lib.rs` command registration

**Interfaces:**
- `reverse_stock_adjustment(state: State<DbState>, input: ReverseStockAdjustmentInput) -> Result<StockAdjustment, String>`
- Input JSON: `{ adjustmentId: i64, adminPin: Option<String> }`
- `StockAdjustment` gains `reverse_of_id: Option<i64>` and `is_reversed: bool`.

- [ ] **Step 1: Add pure delta self-check before production logic**

Add a small Rust unit test module in `produk_cmd.rs` for the pure calculation helper:

```rust
#[test]
fn reversal_delta_is_the_opposite_of_original_delta() {
    assert_eq!(reversal_delta(-5), 5);
    assert_eq!(reversal_delta(7), -7);
}
```

Add the minimal helper signature:

```rust
fn reversal_delta(selisih: i64) -> i64 { -selisih }
```

- [ ] **Step 2: Run the focused Rust test and confirm it passes**

Run: `cargo test reversal_delta_is_the_opposite_of_original_delta` from `src-tauri/`
Expected: PASS.

- [ ] **Step 3: Extend `StockAdjustment` and list query**

Add:

```rust
pub reverse_of_id: Option<i64>,
pub is_reversed: bool,
```

Update every constructor, including `list_stock_adjustments`, to select `sa.reverse_of_id` and compute `EXISTS (SELECT 1 FROM stock_adjustment rev WHERE rev.reverse_of_id = sa.id)`.

- [ ] **Step 4: Add Admin PIN verification helper usable inside a transaction boundary**

Use the existing `kasir_pin` table directly while holding the same DB connection. Verify an optional `admin_pin` against active `role='admin'`; return `PIN Admin salah` when a supplied PIN is invalid. Do not log the PIN.

- [ ] **Step 5: Add `ReverseStockAdjustmentInput`**

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReverseStockAdjustmentInput {
    pub adjustment_id: i64,
    pub admin_pin: Option<String>,
}
```

- [ ] **Step 6: Implement atomic reversal**

Inside one transaction:

```rust
1. Load target audit and current product stock.
2. Reject missing target, target.reverse_of_id != NULL, or existing child reverse_of_id.
3. If admin PIN supplied, validate it; valid PIN enables override.
4. Without override, reject created_at older than 48 hours.
5. Without override, reject current stock != target.stok_sesudah.
6. delta = reversal_delta(target.selisih).
7. new_stock = current_stock + delta; reject new_stock < 0.
8. Update produk.stok.
9. Insert stock_adjustment with reverse_of_id=target.id,
   selisih=delta, snapshots, alasan="Reversal audit #<id>".
10. Commit and return the inserted reversal row.
```

Use SQLite datetime parsing compatible with existing `YYYY-MM-DD HH:MM:SS` values. Compare against UTC `now - Duration::hours(48)`; reject malformed timestamps with a clear error rather than bypassing the rule.

- [ ] **Step 7: Register command**

Add `commands::produk_cmd::reverse_stock_adjustment` to `tauri::generate_handler!` beside the other product commands.

- [ ] **Step 8: Run backend checks**

Run: `cargo test reversal_delta_is_the_opposite_of_original_delta`  
Expected: PASS.

Run: `cargo check`  
Expected: successful compilation; pre-existing dead-code warnings may remain.

---

### Task 3: Make sidebar keyword `audit` find Riwayat Stok

**Files:**
- Modify: `src/components/desktop/Sidebar.jsx:80`

**Interfaces:**
- Existing sidebar filtering remains unchanged; only menu metadata changes.

- [ ] **Step 1: Update description**

Change the Riwayat Stok description to include `audit`, for example:

```jsx
{ path: "/riwayat-stok", label: "Riwayat Stok", icon: "history", desc: "Rekam jejak audit penyesuaian stok masuk dan keluar" }
```

- [ ] **Step 2: Verify search behavior**

Run: `npm run build`  
Expected: successful Vite build.

Manual smoke check: open desktop sidebar, enter `audit`, confirm `Riwayat Stok` remains visible.

---

### Task 4: Add Riwayat Stok reversal UI

**Files:**
- Modify: `src/pages/RiwayatStok.jsx`
- Reuse: `src/components/PinGate.jsx` pattern or implement a local minimal Admin PIN modal in the page

**Interfaces:**
- Consumes `StockAdjustment.reverse_of_id` and `StockAdjustment.is_reversed`.
- Calls `invoke("reverse_stock_adjustment", { input: { adjustmentId, adminPin } })`.

- [ ] **Step 1: Add action state**

Add state for the selected item, confirmation modal, PIN modal, PIN input, and submitting status. Keep PIN in component state only; clear it after every attempt.

- [ ] **Step 2: Add confirmation handler**

Before invoking, show product name, original signed delta, and the reversal delta (`-selisih`). Use `window.confirm` if no existing modal primitive fits; avoid adding a new component abstraction for one action.

- [ ] **Step 3: Add Admin PIN flow**

Call `list_kasir_pins` once when needed. If an Admin PIN is configured and the audit is outside normal policy, show a password input modal. Submit only the PIN to the command. If no Admin PIN is configured, use normal policy; do not invent an unauthenticated Admin bypass in the UI.

- [ ] **Step 4: Invoke and reload**

On success:

```jsx
await invoke("reverse_stock_adjustment", {
  input: { adjustmentId: selected.id, adminPin: adminPin || null },
});
addToast("Audit stok berhasil dikembalikan", "success");
setSelected(null);
setAdminPin("");
await load();
```

On failure, show the backend message through the existing error toast. Never expose the PIN in an error/log message.

- [ ] **Step 5: Add action column and status**

Add an `Aksi` column:

- `is_reversed === true`: show `Dikembalikan`, no button.
- `reverse_of_id != null`: show `Reversal`, no button.
- Otherwise: show `Kembalikan` button.

Do not allow a second click while saving.

- [ ] **Step 6: Keep in-page search behavior**

Leave existing product/alasan search intact. The keyword `audit` requirement applies to sidebar tab discovery, not row filtering.

- [ ] **Step 7: Run frontend verification**

Run: `npm run build`  
Expected: successful build.

Manual smoke checks:

1. Sidebar `audit` shows Riwayat Stok.
2. Recent audit with unchanged stock reverses using opposite delta.
3. Reversal row appears and original row shows `Dikembalikan`.
4. Clicking either row again is unavailable.
5. Backend errors display Indonesian messages.

---

### Task 5: Final verification and review

**Files:**
- No new files.

- [ ] **Step 1: Run Rust tests**

Run: `cargo test` from `src-tauri/`  
Expected: all tests pass.

- [ ] **Step 2: Run frontend build**

Run: `npm run build` from repository root  
Expected: exit code 0; Vite chunk-size warning is acceptable if no errors.

- [ ] **Step 3: Run backend type/build check**

Run: `cargo check` from `src-tauri/`  
Expected: exit code 0.

- [ ] **Step 4: Inspect final diff**

Run: `git diff --check && git status --short && git diff --stat`
Expected: no whitespace errors; only files listed by the tasks changed.

- [ ] **Step 5: Report actual verification**

Report commands and exit status. Do not claim Admin session support unless a real frontend login flow exists; this plan intentionally ships Admin PIN override because the current app has no login screen/session producer.
