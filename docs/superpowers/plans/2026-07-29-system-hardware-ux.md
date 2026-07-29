# Simplify System Settings and Hardware POS UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hapus UI tema aplikasi dan ubah Hardware POS menjadi konfigurasi bertahap dengan auto-detect hybrid yang mengisi draft, bukan menyimpan otomatis.

**Architecture:** Pertahankan command hardware yang ada. Refactor presentasi dan state di `Sistem.jsx`: deteksi awal/re-detect mengisi draft, printer menentukan lebar kertas jika tersedia, lalu satu aksi simpan mengirim draft. Fullscreen/windowed tetap menggunakan utilitas per-user yang sudah ada.

**Tech Stack:** React hooks, Tauri IPC existing, CSS variables, Vite.

## Global Constraints

- Hapus kartu Tema Aplikasi dan state/event tema dari `Sistem.jsx`.
- Deteksi hardware mengisi form; tidak menyimpan otomatis.
- Lebar kertas mengikuti printer terdeteksi, fallback 48 karakter.
- Tidak menambah dependency atau mengubah command backend.
- Pertahankan fullscreen/windowed per user.

---

### Task 1: Remove theme UI and theme runtime wiring

**Files:**
- Modify: `src/pages/Sistem.jsx:1-85` — remove theme state, effect, handler, and card.
- Modify: `src/App.jsx:198-205` — remove per-user theme application.
- Modify: `src/styles/global.css:51-90` — remove dark theme overrides if no longer used.

**Interfaces:**
- Consumes: existing window preference and system settings page.
- Produces: Sistem page without theme controls and no theme persistence/runtime wiring.

- [ ] Remove `theme` state, `chooseTheme`, `dataset.theme` effect, and Theme card markup.
- [ ] Remove `dataset.theme` assignment from `App.jsx`.
- [ ] Remove only theme-specific CSS selectors; retain base tokens and window mode styles.
- [ ] Verify no source references `mikrokas_theme`, `theme-changed`, or `data-theme`.

---

### Task 2: Build hardware draft and detection model

**Files:**
- Modify: `src/pages/Sistem.jsx:14-37, 98-134`.

**Interfaces:**
- Consumes: `get_hardware_settings`, `list_printer_candidates`, `list_serial_scanner_ports`, `set_hardware_settings`, `test_print_struk`.
- Produces: `detectHardware()` that updates only draft state and a single save action.

- [ ] Add `detectingHardware` and `hardwareStatus` state.
- [ ] Create `detectHardware` that loads current hardware plus printer candidates and serial ports, updates draft state, and derives paper width from detected printer when a numeric width is available; use 48 otherwise.
- [ ] Call `detectHardware()` on mount; keep loading/error state user-readable.
- [ ] Ensure detection never calls `set_hardware_settings`.
- [ ] Save draft through one `saveHardware` handler; show success/error toast and retain draft on failure.

---

### Task 3: Refactor Hardware POS UI for conditional, understandable controls

**Files:**
- Modify: `src/pages/Sistem.jsx:98-134`.
- Modify: `src/styles/global.css:1550-1620`.

**Interfaces:**
- Consumes: draft state and handlers from Task 2.
- Produces: three clear cards: Printer, Scanner, Customer Display.

- [ ] Render a status row with `hardwareStatus` and `Deteksi Ulang`.
- [ ] Printer card: paper width, detected/manual printer path, and concise explanation.
- [ ] Scanner card: HID toggle, minimum barcode, serial port and baud controls; show serial controls only when a serial port is selected.
- [ ] Customer display card: mode selector; show mode-specific fields only when applicable.
- [ ] Render one `Simpan Pengaturan Hardware` button and separate `Test Print` action after save/draft validation.
- [ ] Keep labels accessible and avoid raw backend errors in visible UI.

---

### Task 4: Verify behavior

**Files:**
- Test: existing build/test commands and manual runtime smoke test.

- [ ] Run `npm run build`; expect exit 0.
- [ ] Run `cargo test --lib`; expect all existing tests pass.
- [ ] Run `cargo build`; expect exit 0.
- [ ] Run `git diff --check`.
- [ ] Smoke test: no theme card; fullscreen/windowed still work; initial detection fills draft; re-detect changes draft only; width follows detected printer or 48 fallback; conditional scanner/display fields work; save persists; test print works.
