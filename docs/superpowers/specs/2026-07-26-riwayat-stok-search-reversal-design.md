# Riwayat Stok: Sidebar Search "audit" + Reversal Delta

**Date:** 2026-07-26  
**Status:** Approved  
**Scope:** Desktop Riwayat Stok + stock adjustment backend

## Problem

1. Sidebar search for keyword **audit** does not surface **Riwayat Stok** (label/desc lack the word).
2. Stock audit adjustments cannot be undone after a mistaken opname/manual adjust.

## Goals

- Searching sidebar for `audit` finds the Riwayat Stok tab.
- Users can reverse a stock audit with **delta** math (not absolute reset to `stok_sebelum`).
- Non-Admin: reverse only within **48 hours** and only if current stock still equals the audit's `stok_sesudah`.
- Admin (session) or Admin PIN override: reverse anytime, skip 48h and stock-match checks.
- Full audit trail: original row kept; new reversal row written.
- Already-reversed audits cannot be reversed again.

## Non-goals

- Full multi-user session/RBAC overhaul across all pages.
- Deleting audit rows.
- Reversing purchase/sale stock mutations (only `stock_adjustment` rows).
- Mobile-specific UX changes beyond shared page if already shared.

## Current state

- Table `stock_adjustment`: `id, produk_id, selisih, stok_sebelum, stok_sesudah, alasan, created_at`.
- Commands: `adjust_stock`, `list_stock_adjustments`.
- UI: `src/pages/RiwayatStok.jsx` — list + search on produk/alasan only.
- Sidebar item: label `Riwayat Stok`, desc without "audit".
- Auth: `login_user` returns role; frontend does not yet hold a durable active-user session for stock reverse.
- PIN: `verify_kasir_pin` supports `role` (e.g. `admin`).

## Design

### 1. Sidebar search keyword

**File:** `src/components/desktop/Sidebar.jsx`

Update Persediaan → Riwayat Stok `desc` to include the word **audit**, e.g.:

> Rekam jejak audit penyesuaian stok masuk dan keluar

Existing filter already matches `label + desc` case-insensitively; no filter logic change required.

### 2. Schema: mark reversals

**Migration** (next free number under `src-tauri/migrations/`):

```sql
-- stock_adjustment: link reversal to original audit
ALTER TABLE stock_adjustment ADD COLUMN reverse_of_id INTEGER REFERENCES stock_adjustment(id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_reverse_of ON stock_adjustment(reverse_of_id);
```

- `reverse_of_id IS NULL` → original (or non-reversal) adjustment.
- `reverse_of_id = N` → this row is the reversal of audit `N`.
- Original row is never deleted.
- Anti-double-reverse: if any row exists with `reverse_of_id = target_id`, reject.

Idempotent migration style already used in project (`ensure_column` / `ADD COLUMN` patterns in `db.rs`).

### 3. List response enrichment

Extend `StockAdjustment` (serialize for frontend):

| Field | Meaning |
|-------|---------|
| existing fields | unchanged |
| `reverse_of_id` | optional; set on reversal rows |
| `is_reversed` | true if any later row has `reverse_of_id = this.id` |

`list_stock_adjustments` should LEFT JOIN or subquery to set `is_reversed` so UI can disable the button without a second round-trip.

### 4. Command: `reverse_stock_adjustment`

**Input (camelCase):**

```json
{
  "adjustmentId": 12,
  "adminPin": null,
  "confirmAdmin": false
}
```

- `adminPin`: optional. Valid PIN for role `admin` → full override.
- `confirmAdmin`: true only when frontend has Admin session (UX flag; see §5).

**Algorithm (single DB transaction):**

1. Load target adjustment by id; missing → `Audit tidak ditemukan`.
2. If row has `reverse_of_id IS NOT NULL` → `Baris reversal tidak bisa dibalik`.
3. If exists child with `reverse_of_id = id` → `Audit sudah dikembalikan`.
4. Resolve `is_admin_override` (§5 privilege table).
5. If **not** override:
   - Parse `created_at`; age > **48 hours** → `Melebihi batas 48 jam. Minta Admin atau masukkan PIN Admin.`
   - Read current `produk.stok`; if `stok != stok_sesudah` → `Stok sudah berubah setelah audit. Minta Admin atau masukkan PIN Admin.`
6. `delta = -selisih` (e.g. original `-5` → reverse `+5`).
7. `stok_sebelum_rev = current_stok`, `stok_sesudah_rev = current_stok + delta`.
   - If `stok_sesudah_rev < 0` → `Reversal membuat stok negatif`.
8. `UPDATE produk SET stok = stok_sesudah_rev`.
9. `INSERT stock_adjustment` with selisih=`delta`, snapshots, alasan=`Reversal audit #ID`, `reverse_of_id=ID`.
10. Commit; return new row.

**Why delta (not absolute `stok_sebelum`):**  
Later sales/opname must not be wiped. Delta undoes only the audited amount (IPOS-style).

### 5. Privilege + minimal session

**Frontend** `src/utils/authSession.js`:

- After `login_user` success: store `{ id, username, role, nama_lengkap, loginAt }` in `localStorage` key `mikrokas_user_session`.
- Helpers: `getSession()`, `clearSession()`, `isAdminSession()`.
- Wire login + logout. UI only — not a security boundary by itself.

**Backend privilege (ship this, single table):**

| Condition | Full override (skip 48h + stock match)? |
|-----------|------------------------------------------|
| `adminPin` valid for role `admin` | Yes |
| `adminPin` provided but invalid | No — error `PIN Admin salah` |
| No admin PIN configured in DB **and** `confirmAdmin: true` | Yes (PinGate empty-PIN pattern; desktop local trust) |
| Otherwise | No — enforce 48h + stock match |

`ponytail:` server session token when multi-device / shared PC risk rises.

**UI flow:**

- Admin session + no admin PIN in DB → confirm dialog only, send `confirmAdmin: true`.
- Admin session + admin PIN exists → PIN modal, send `adminPin`.
- Non-Admin, within policy → confirm only, no override flags.
- Non-Admin, outside policy → PIN Admin modal required for override.

### 6. UI: RiwayatStok

- Search placeholder can stay produk/alasan (in-page); sidebar handles "audit" tab find.
- Table column **Aksi**: button **Kembalikan**.
  - Disabled if `is_reversed` or row is itself a reversal (`reverse_of_id` set).
  - Show badge "Dikembalikan" / "Reversal".
- On click:
  1. Confirm dialog: show produk, selisih, delta reverse, stok prediksi.
  2. If not Admin session **or** admin PIN exists: open PIN entry (`role="admin"`) reusing PinGate patterns.
  3. `invoke("reverse_stock_adjustment", { input: { adjustmentId, adminPin } })`.
  4. Toast success/error; `load()`.

### 7. Error messages (user-facing, Indonesian)

- `Audit tidak ditemukan`
- `Audit sudah dikembalikan`
- `Baris reversal tidak bisa dibalik`
- `Melebihi batas 48 jam. Minta Admin atau masukkan PIN Admin.`
- `Stok sudah berubah setelah audit. Minta Admin atau masukkan PIN Admin.`
- `PIN Admin salah`
- `Reversal membuat stok negatif`
- `Alasan...` (reuse existing adjust validators only if creating via adjust_stock path; reversal alasan is system-generated and may bypass min-5 diversity rules)

### 8. Testing / verification

- Unit/self-check on delta: `selisih=-5` → reverse `+5`.
- Manual: sidebar search `audit` → Riwayat Stok visible.
- Manual: reverse within 48h with matching stock → OK.
- Manual: change stock after audit → non-Admin blocked; Admin PIN OK → delta applied.
- Manual: reverse twice → second fails.
- `npm run build`, `cargo check`.

## Files touched (expected)

- `src/components/desktop/Sidebar.jsx`
- `src/pages/RiwayatStok.jsx`
- `src/utils/authSession.js` (new, minimal)
- Login entry point(s) that call `login_user` (wire session store)
- `src-tauri/src/commands/produk_cmd.rs` — reverse command + list enrichment
- `src-tauri/src/lib.rs` — register command
- `src-tauri/src/db.rs` + new migration SQL
- Possibly `PinGate` reuse or small admin PIN modal on RiwayatStok

## Open follow-ups (explicitly out of this ship)

- Server-side session token / multi-device auth.
- Soft-delete / void UI for old audits beyond reverse.
- Filter chips (hanya belum dibalik / hanya 48 jam).
