# Cash Box Count Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Cashbox tab into a shift-linked Cash Box Count Sheet with logged-in cashier identity, denomination counts, POS reconciliation, and variance.

**Architecture:** Extend the existing `shift` record with cashier/register linkage and add one denomination snapshot table per shift. Keep `shift` summary columns as the compatibility/reporting surface, while `Cashbox.jsx` reads shift/count data and submits opening/closing counts through atomic shift commands. The current codebase has `login_user` but no discovered frontend session provider; implementation must identify and use the actual login/session boundary before wiring the read-only cashier name, not add a parallel identity store.

**Tech Stack:** React/Vite, Tauri 2, Rust, SQLite/rusqlite, existing `RupiahInput`, existing `invoke` IPC helper.

## Global Constraints

- Use the existing login/session identity source; cashier name is automatic and not manually editable.
- Preserve legacy `shift.saldo_awal`, `shift.saldo_akhir`, `shift.total_penjualan`, `shift.total_pengeluaran`, and `shift.selisih`.
- Denomination quantities are integers `>= 0`; empty UI values mean zero.
- Closed shifts are immutable.
- Use SQLite transactions for opening/closing count persistence.
- POS cash sales remain the system-sales source; manual cash mutations do not replace POS reconciliation.
- No new dependency for PDF export; PDF export is out of scope unless an existing utility is directly reusable.
- Add no code comments unless required by existing repository guidelines; follow local naming and formatting.

---

## Task 1: Add denomination schema and calculation tests

**Files:**
- Create: `src-tauri/migrations/038_cashbox_pecahan.sql`
- Modify: `src-tauri/src/commands/shift_cmd.rs` (test module or calculation helpers)
- Test: `src-tauri/src/commands/shift_cmd.rs` unit tests

**Interfaces:**
- Produces table `cashbox_pecahan(shift_id, denom, qty_awal, qty_akhir, is_koin)` with uniqueness per shift/denom/coin flag.
- Produces tested pure calculation helpers for opening total, closing total, actual cash income, and variance.

- [ ] **Step 1: Write failing arithmetic tests**

Add tests covering the supplied example:

```rust
#[test]
fn cash_count_calculates_totals_and_variance() {
    let rows = vec![(100_000_i64, 5_i64, 12_i64), (50_000, 10, 15), (20_000, 10, 8), (10_000, 10, 5), (5_000, 10, 4), (2_000, 10, 5), (1_000, 10, 10)];
    assert_eq!(total_awal(&rows), 1_390_000);
    assert_eq!(total_akhir(&rows), 2_200_000);
    assert_eq!(pendapatan_aktual(2_210_000, 1_390_000), 820_000);
    assert_eq!(variance(820_000, 820_000), 0);
}

#[test]
fn cash_count_rejects_negative_or_fractional_quantities() {
    assert!(validate_qty(-1).is_err());
    assert!(validate_qty(1.5).is_err());
}
```

Use the actual project integer types; split the test data if the coin total is represented as a separate row.

- [ ] **Step 2: Run the focused Rust test and confirm RED**

Run:

```bash
cargo test shift_cmd -- --nocapture
```

Expected: FAIL because the calculation/validation helpers and migration-backed behavior do not yet exist.

- [ ] **Step 3: Add the migration**

Create `033_cashbox_pecahan.sql`:

```sql
-- Migration 033: opening and closing denomination counts for each cashier shift
CREATE TABLE IF NOT EXISTS cashbox_pecahan (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shift_id INTEGER NOT NULL REFERENCES shift(id) ON DELETE CASCADE,
    denom INTEGER NOT NULL CHECK (denom > 0),
    qty_awal INTEGER NOT NULL DEFAULT 0 CHECK (qty_awal >= 0),
    qty_akhir INTEGER NOT NULL DEFAULT 0 CHECK (qty_akhir >= 0),
    is_koin INTEGER NOT NULL DEFAULT 0 CHECK (is_koin IN (0, 1)),
    UNIQUE(shift_id, denom, is_koin)
);
CREATE INDEX IF NOT EXISTS idx_cashbox_pecahan_shift ON cashbox_pecahan(shift_id);
```

Keep the coin total as a configured denomination row (for example `denom=1`, `is_koin=1`) so the arithmetic remains deterministic.

- [ ] **Step 4: Implement minimal pure helpers and make tests GREEN**

Implement helpers with explicit integer validation, preserving row order and using `i64` arithmetic:

```rust
fn validate_qty(value: f64) -> Result<i64, String>;
fn total_awal(rows: &[(i64, i64, i64)]) -> i64;
fn total_akhir(rows: &[(i64, i64, i64)]) -> i64;
fn pendapatan_aktual(total_akhir: i64, total_awal: i64) -> i64;
fn variance(actual: i64, pos: i64) -> i64;
```

- [ ] **Step 5: Run the focused test and migration/build checks**

Run:

```bash
cargo test shift_cmd -- --nocapture
cargo build
```

Expected: PASS.

---

## Task 2: Extend shift backend with cashier and count persistence

**Files:**
- Modify: `src-tauri/src/commands/shift_cmd.rs:11-184`
- Modify: `src-tauri/src/lib.rs` only if new command names are added
- Inspect/modify: existing auth command/session file containing `login_user`

**Interfaces:**
- `Shift` response adds `kasir_nama: Option<String>`, `cashbox_id: Option<i64>`, and count/total fields needed by the UI.
- `BukaShiftInput` accepts `cashbox_id: Option<i64>` and opening denomination rows.
- `buka_shift` persists the logged-in user identity resolved through the existing session mechanism.
- `tutup_shift` accepts closing denomination rows and atomically updates counts plus shift summaries.
- Add `get_shift_cash_count(shift_id: i64) -> Result<CashCountSheet, String>` if list responses would otherwise duplicate large nested data.

- [ ] **Step 1: Add a failing backend test for opening count persistence**

Use an in-memory SQLite connection with the migration schema. Assert that opening quantities produce `saldo_awal`, are stored under the shift ID, and reject a mismatched opening total.

- [ ] **Step 2: Run the backend test and confirm RED**

Run:

```bash
cargo test shift_cmd -- --nocapture
```

Expected: FAIL because the count table/query/input fields do not exist in the command implementation.

- [ ] **Step 3: Resolve the login identity source before implementation**

Trace `login_user` from `src-tauri/src/lib.rs` into its command implementation and the frontend route/session boundary. Reuse its existing user ID/name. If the current app has no persistent login session, add the smallest session state at that boundary and pass only the authenticated user ID to Rust; do not add a cashier-name text input.

- [ ] **Step 4: Implement row validation and query mapping**

Define a serializable row shape:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CashCountRow {
    pub denom: i64,
    pub is_koin: bool,
    pub qty_awal: i64,
    pub qty_akhir: i64,
}
```

Validate allowed denominations and nonnegative integer quantities at the command boundary. Return zero-filled rows for known denominations when a legacy shift has no snapshot.

- [ ] **Step 5: Implement atomic `buka_shift` persistence**

Within one transaction:

1. Close any prior open shift according to existing behavior.
2. Validate the requested opening rows.
3. Calculate opening total.
4. Insert the shift with cashier/user and cashbox linkage.
5. Insert opening rows with `qty_akhir=0`.
6. Commit and return the complete shift response.

Reject if calculated opening total differs from the submitted/derived `saldo_awal`.

- [ ] **Step 6: Implement atomic `tutup_shift` persistence**

Within one transaction:

1. Load the open shift and its opening rows.
2. Validate closing rows.
3. Calculate physical closing total.
4. Calculate POS cash sales for the shift interval using the existing transaction/kas source.
5. Calculate actual income and variance.
6. Update legacy shift summary columns.
7. Update `cashbox_pecahan.qty_akhir`.
8. Commit only after every query succeeds.

Return a closed shift containing all reconciliation totals.

- [ ] **Step 7: Run backend tests and compile**

Run:

```bash
cargo test
cargo build
```

Expected: PASS; no new command registration errors.

---

## Task 3: Build Cash Box Count Sheet UI

**Files:**
- Modify: `src/pages/Cashbox.jsx`
- Reuse: `src/components/RupiahInput.jsx`, `src/components/SearchSelect.jsx`, `src/components/PageKit.jsx`

**Interfaces:**
- Consumes `list_shift`, `get_shift_cash_count`/nested shift response, `buka_shift`, and `tutup_shift` IPC shapes from Task 2.
- Produces a read-only cashier identity display and editable closing-count form for the active shift.

- [ ] **Step 1: Add a focused UI calculation self-check**

Because the repo has no frontend test runner, keep calculation logic in a pure local helper and add a small runnable assertion script only if the existing Node setup supports it. The helper must verify:

```js
const rows = [{ denom: 100000, qtyAwal: 5, qtyAkhir: 12 }];
console.assert(totalAwal(rows) === 500000);
console.assert(totalAkhir(rows) === 1200000);
console.assert(variance(700000, 700000) === 0);
```

Do not add a test framework dependency.

- [ ] **Step 2: Replace the mutation-first Cashbox layout**

Keep the Cashbox route and page shell, but render:

- shift selector/history list;
- INFORMASI SHIFT cards for date, cashier, register/box, and shift period;
- denomination table with columns `Pecahan`, `Awal`, `Subtotal Awal`, `Akhir`, `Subtotal Akhir`;
- totals row;
- reconciliation block;
- active-shift save/close action and refresh.

Do not expose a manual cashier-name input.

- [ ] **Step 3: Implement live denomination arithmetic**

Use controlled numeric inputs for closing quantities. Convert blank input to zero for calculations while preserving user editing. Recompute subtotals, totals, actual income, POS sales, and variance with `useMemo`.

Use `rupiah()` for all monetary values and existing CSS classes for tables, panels, status badges, and responsive overflow.

- [ ] **Step 4: Enforce UI editability rules**

- Active shift: opening rows display stored values; closing quantities are editable.
- Closed shift: all quantities and summaries are readonly.
- No active shift: show the historical selector and an instruction to open a shift from the Shift page.
- Invalid quantity: show an inline error and disable submission.

- [ ] **Step 5: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS.

---

## Task 4: Extend Shift page forms and preserve history

**Files:**
- Modify: `src/pages/Shift.jsx`
- Modify: `src/pages/Cashbox.jsx` if shared form state is necessary

**Interfaces:**
- Opening shift form sends denomination rows and selected cashbox ID to `buka_shift`.
- Closing shift action delegates to the count sheet or sends closing rows to `tutup_shift`.
- Existing history table continues displaying saldo awal/akhir, POS sales, and variance.

- [ ] **Step 1: Add opening denomination inputs to the buka-shift form**

Render the standard denominations plus coin row. Use integer quantity inputs and calculate the opening total live. Display a validation error when the total is zero only if the existing business rule disallows zero; otherwise allow zero explicitly.

- [ ] **Step 2: Add cashbox/register selection**

Load `list_cashbox` and use `SearchSelect` to choose the register/box. Pass the selected ID to `buka_shift`. If only one cashbox exists, select it by default; never invent a second register.

- [ ] **Step 3: Route closing count to the count sheet**

Keep the existing Shift page close action usable, but link it to the Cashbox count sheet or embed the same closing denomination editor. Ensure only one path can close a shift and both paths call the same atomic backend command.

- [ ] **Step 4: Verify history compatibility**

Load old and new shifts. Confirm old rows without `cashbox_pecahan` render fallback totals and new rows show cashier/variance correctly.

- [ ] **Step 5: Run frontend build**

Run:

```bash
npm run build
```

Expected: PASS.

---

## Task 5: End-to-end verification and review

**Files:**
- Modify only files required by failing verification.

- [ ] **Step 1: Run Rust tests and build**

```bash
cargo test
cargo build
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 3: Manual smoke test the supplied example**

1. Login as Andi.
2. Select cashbox/register 01.
3. Open a morning shift with the supplied opening quantities totaling Rp1.390.000.
4. Add/confirm POS cash sales totaling Rp820.000.
5. Close the shift with final quantities totaling Rp2.210.000.
6. Confirm actual cash income is Rp820.000 and variance is Rp0.
7. Refresh and reopen the closed shift; confirm all rows are readonly and values persist.
8. Enter a mismatched total once; confirm backend rejects it and leaves the shift open.

- [ ] **Step 4: Inspect diff and status**

```bash
git diff --check
git status --short
git diff --stat
```

Expected: only intended Cashbox/Shift/migration/backend files and tests are changed; no secrets or generated artifacts are staged.

- [ ] **Step 5: Commit each independently verified task**

Use concise present-tense commits matching repository style, for example:

```bash
git add src-tauri/migrations/038_cashbox_pecahan.sql src-tauri/src/commands/shift_cmd.rs
git commit -m "Add cash denomination tracking"
```

Do not commit until the user explicitly requests committing; if executing in the current session, leave changes uncommitted under repository policy.

## Coverage Audit

- Logged-in cashier identity: Task 2, Task 3, Task 4.
- Date, cashier, register, shift: Task 3 and Task 4.
- Opening/closing denomination quantities and subtotals: Tasks 1-4.
- Total physical ending cash: Tasks 1-3.
- POS sales: Task 2.
- Actual income and variance: Tasks 1-3.
- Readonly closed shifts: Task 3.
- Legacy compatibility: Task 2 and Task 4.
- Validation and atomicity: Tasks 1-2.
- Required verification commands: Task 5.
