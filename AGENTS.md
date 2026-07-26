# AGENTS.md — MikroKas Coding Guidelines

## Purpose

This document provides instructions for AI agents and human developers to maintain code quality, readability, and consistency across the MikroKas codebase.

---

## Code Comment Requirements

All code must include clear, concise comments for:

### Functions
- **Purpose**: What does this function do?
- **Parameters**: What inputs does it accept? (types, constraints)
- **Returns**: What does it output? (type, format)
- **Side effects**: Does it modify state, database, or files?
- **Example** (if complex logic)

```rust
/// Generates a unique transaction number based on type and settings.
///
/// Parameters:
/// - `tipe`: Transaction type ("jual", "beli", "retur_jual", etc.)
///
/// Returns:
/// - `String`: Formatted transaction number (e.g., "INV070001")
///
/// Side effects:
/// - Increments `current_number` in `nomor_settings` table
/// - Resets counter if monthly/yearly period has changed
fn generate_nomor(tipe: &str) -> Result<String, Error> {
    // Implementation
}
```

```javascript
/**
 * Calculates multi-tier discount (e.g., 10% + 5% + 2%).
 * 
 * @param {number} harga - Base price
 * @param {number[]} lapisan - Array of discount percentages [10, 5, 2]
 * @returns {number} Final price after all discounts applied
 * 
 * @example
 * hitung_diskon_bertingkat(100000, [10, 5, 2])
 * // Returns: 83790
 */
function hitung_diskon_bertingkat(harga, lapisan) {
    // Implementation
}
```

### Variables (Important Ones)
- State variables
- Configuration constants
- Complex data structures

```rust
// Database path resolver: returns app-specific data directory per OS
// Windows: %APPDATA%/mikrokas
// Linux: ~/.local/share/mikrokas
// Android: private app data
let db_path = app_data_dir();
```

```javascript
// Global platform state: "desktop" | "mobile"
// Used to conditionally render DesktopLayout vs MobileLayout
const [platform, setPlatform] = useState("desktop");
```

### Complex Logic Blocks
- Algorithms (FIFO/LIFO, double-entry accounting, discount calculations)
- Business rules (PPN modes, multi-tier pricing, konsinyasi)
- Edge cases and validations

```rust
// FIFO algorithm: consume oldest stock batches first
// Iterates through batches ordered by tgl_masuk ASC
// Updates qty_terpakai for each batch until qty_jual satisfied
for batch in batches {
    let tersedia = batch.qty_masuk - batch.qty_terpakai;
    let ambil = min(sisa, tersedia);
    total_hpp += ambil * batch.harga_beli;
    batch.qty_terpakai += ambil;
    sisa -= ambil;
}
```

### Database Schema Changes
- Migration files must include comments explaining purpose and impact

```sql
-- Migration 023: COA (Chart of Accounts) for double-entry accounting
-- Creates hierarchical account structure: 1xxx=Aktiva, 2xxx=Kewajiban, 3xxx=Modal, etc.
-- Supports parent-child relationships via induk_id
CREATE TABLE IF NOT EXISTS coa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_akun TEXT UNIQUE NOT NULL,
  nama_akun TEXT NOT NULL,
  tipe TEXT NOT NULL,
  induk_id INTEGER,
  saldo_normal TEXT NOT NULL DEFAULT 'debit',
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (induk_id) REFERENCES coa(id)
);
```

---

## Naming Conventions

### Rust (Backend)
- Files: `snake_case` (e.g., `transaksi_cmd.rs`, `hutang_piutang_cmd.rs`)
- Functions: `snake_case` (e.g., `buat_transaksi_penjualan`, `generate_nomor`)
- Structs: `PascalCase` (e.g., `TransaksiPenjualan`, `PpnResult`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `DEFAULT_PPN_PERSEN`)

### JavaScript/React (Frontend)
- Files: `PascalCase` for components (e.g., `Transaksi.jsx`, `DesktopLayout.jsx`)
- Files: `camelCase` for utilities (e.g., `ipc.js`, `usePlatform.js`)
- Components: `PascalCase` (e.g., `<DesktopLayout>`, `<Sidebar>`)
- Functions: `camelCase` (e.g., `handleShortcuts`, `calculateDiscount`)
- Constants: `SCREAMING_SNAKE_CASE` (e.g., `SHORTCUT_MAP`)

### SQL (Migrations)
- Tables: `snake_case` (e.g., `nomor_settings`, `hutang_piutang`)
- Columns: `snake_case` (e.g., `created_at`, `transaksi_id`)
- Migration files: `NNN_nama_fitur.sql` (e.g., `015_user_role.sql`)

---

## Code Style

### Rust
- Use `Result<T, Error>` for all fallible operations
- Always validate input at command boundaries
- Use transaction (`BEGIN ... COMMIT`) for multi-table operations
- Prefer `&str` over `String` for function parameters
- Use `serde` for serialization

### JavaScript/React
- Use functional components + hooks (no class components)
- State: prefer `useState` for local, context/zustand for global
- Props: destructure at function signature
- Event handlers: prefix with `handle` (e.g., `handleClick`)
- Use `async/await` for Tauri IPC calls

### CSS
- Mobile-first: base styles for mobile, `@media (min-width: 768px)` for desktop
- Class naming: BEM-like (e.g., `.sidebar`, `.sidebar__item`, `.sidebar__item--active`)
- Use CSS variables for colors, spacing, fonts (e.g., `var(--primary-color)`)

---

## Testing & Verification

### Before Commit
1. **Rust**: `cargo test` — all tests must pass
2. **Frontend**: `npm run build` — no errors
3. **Database**: migrations idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)

### Manual Smoke Test
- Launch app: `npm run tauri dev`
- Test critical path: kasir checkout, produk tambah, laporan generate

---

## Error Handling

### Rust
- Never `unwrap()` in production code — use `?` or `.map_err()`
- Log errors: `eprintln!("Error: {:?}", e)`
- Return meaningful error messages to frontend

### JavaScript
- Wrap Tauri IPC calls in `try/catch`
- Display user-friendly error messages (no raw error objects)
- Log to console for debugging: `console.error("Failed to save:", err)`

---

## Security

- **Never log sensitive data**: passwords, tokens, keys
- **Hash passwords**: use bcrypt (`bcrypt::hash`)
- **Validate all inputs**: SQL injection prevention (use parameterized queries)
- **File paths**: validate before file operations (no `../` traversal)

---

## Documentation

- **README.md**: keep updated with new features
- **CHANGELOG.md**: user-facing changes only
- **Planning.md**: high-level roadmap
- **AGENTS.md** (this file): coding standards

---

## Multi-Platform Considerations

### Desktop vs Mobile
- Use `usePlatform()` hook to detect platform
- Conditionally render `<DesktopLayout>` or `<MobileLayout>`
- Desktop: sidebar, keyboard shortcuts, multi-panel
- Mobile: tab bar, single-column, touch-optimized

### Database Path
- Use Tauri `app_data_dir()` — works across Windows, Linux, Android
- Never hardcode paths

---

## Git Workflow

- Branch naming: `feature/phase-0-desktop-layout`, `fix/transaksi-bug`
- Commit messages: concise, present tense (e.g., "Add sidebar navigation", "Fix QRIS fee calculation")
- No commit secrets or API keys

---

## AI Agent Specific Instructions

When working on this codebase:
1. **Read existing code first** — mimic style, use existing patterns
2. **Comment every function, variable, and complex logic**
3. **Test before claiming done** — run `cargo test`, `npm run build`
4. **Check for conflicts** — grep for function names to avoid duplicates
5. **Preserve idempotency** — migrations must be re-runnable
6. **No hallucination** — if a function doesn't exist, create it; don't assume it exists

---

## Phase-Specific Notes

### Phase 0 (Desktop Foundation)
- Create `src/layouts/DesktopLayout.jsx` and `src/layouts/MobileLayout.jsx`
- Implement `usePlatform()` hook in `src/layouts/usePlatform.js`
- Add keyboard shortcuts listener in `App.jsx`
- Sidebar component: collapsible, icon + label, active state

### Phase 1 (Printer & Multi User)
- Printer: ESC/POS byte generation in Rust
- Multi user: bcrypt hash passwords, session management
- PPN: create `pajak_setting` table, implement 3 modes (include/exclude/non)

### Phase 2-5
- Follow Planning.md algorithms exactly
- Create migration files in order (`015_*.sql`, `016_*.sql`, etc.)
- Each new command in `src-tauri/src/commands/`, register in `lib.rs`

---

**Last Updated**: 2026-07-25
