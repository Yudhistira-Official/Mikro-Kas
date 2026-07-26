# Planning — MikroKas Desktop & Android

Visi: POS offline-first **Desktop (Windows 7–11, Linux AppImage) + Android** setara IPOS 5.0 Ultimate.
Fokus: UMKM Indonesia. Satu codebase, dual-platform. Backend sama, UI beda.

---

## Arsitektur Multi-Platform

```
┌──────────────────────────────────────────────────┐
│                  Frontend UI                       │
│  ┌─────────────────────┐ ┌──────────────────────┐ │
│  │  Desktop Layout      │ │  Android/Mobile      │ │
│  │  (Multi-panel,       │ │  (Tab nav, single-   │ │
│  │   sidebar, F-keys,   │ │   column, bottom-    │ │
│  │   split-screen)      │ │   sheet, FAB)        │ │
│  └──────────┬──────────┘ └──────────┬───────────┘ │
│             │                       │              │
│  ┌──────────┴───────────────────────┴───────────┐ │
│  │          IPC Invoke (tauri::command)          │ │
│  │  ┌─────────────────────────────────────────┐  │ │
│  │  │  Rust Backend (shared 100%)             │  │ │
│  │  │  - produk_cmd / transaksi_cmd / ...     │  │ │
│  │  │  - accounting engine                     │  │ │
│  │  │  - HPP FIFO/LIFO engine                  │  │ │
│  │  │  - konsinyasi engine                     │  │ │
│  │  │  - printing engine (ESC/POS)             │  │ │
│  │  └─────────────────────────────────────────┘  │ │
│  │  ┌─────────────────────────────────────────┐  │ │
│  │  │  SQLite (rusqlite)                       │  │ │
│  │  │  - mikrokas.db shared schema             │  │ │
│  │  │  - path: OS-dependent app data dir       │  │ │
│  │  └─────────────────────────────────────────┘  │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### UI Design Pattern — Desktop vs Mobile

| Aspek | Desktop | Mobile/Android |
|-------|---------|---------------|
| Navigasi | Sidebar kiri + Header | Tab bar bawah 5 item |
| Tabel | Multi-column scrollable + pagination | Single-column card list |
| Input | Form inline / modal | Bottom sheet / full-screen page |
| Aksi | Toolbar + Right-click context menu | FAB + Long-press |
| Keyboard | F1–F12 shortcuts, numpad | N/A |
| Printer | USB/Bluetooth direct | Bluetooth + WiFi + cloud print |
| Display 2nd | Native window support | N/A (mirror via cast) |
| Modal | Dialog center screen | Bottom sheet 80% height |
| Multi-panel | Split pane (daftar + detail side by side) | Push navigation (stack) |

Deteksi platform di `App.jsx`:
```js
// src/layouts/usePlatform.js
import { platform } from '@tauri-apps/plugin-os';
// return "windows" | "linux" | "android"
// render: platform === "android" ? <MobileLayout> : <DesktopLayout>
```

---

## Status Saat Ini — Fitur Sudah Terimplementasi ✅

| Area | Fitur | Keterangan |
|------|-------|------------|
| **Produk** | CRUD + foto + kategori | `produk_cmd.rs` + `001_init.sql` |
| | CSV import produk | `import_produk_csv` |
| | Multi satuan | `satuan_multi` JSON di tabel produk |
| | Diskon promo per item | `harga_diskon` + `diskon_berlaku_sampai` |
| | Barcode SVG generator | `barcode.js` Code128 |
| | Stok adjustment + audit | `adjust_stock` + `list_stock_adjustments` |
| | Inventory valuation report | `get_ringkasan_inventori` |
| **Transaksi** | Kasir/POS full checkout | `buat_transaksi_penjualan` |
| | Diskon nominal + persen | Field diskon di transaksi |
| | Pajak nominal | `pajak` field (sederhana) |
| | Biaya layanan + ongkir | `biaya_layanan`, `ongkir` fields |
| | Customer selection | Link customer_id ke transaksi |
| | Multi satuan pricing | Logic satuan_multi di checkout |
| | Promo (3 tipe) | localStorage: Min Belanja, BxGY, Tebus Murah |
| | Barcode scanner | ZXing native Android camera |
| | Edit/Delete transaksi (48h) | Restock + update penjualan |
| **Pembelian** | Pembelian + DP | `buat_transaksi_pembelian` |
| | Supplier link + harga supplier | `harga_supplier_cmd.rs` + `catatan_harga` |
| | Hutang otomatis dari sisa DP | Auto create hutang_piutang |
| | Retur pembelian | Via retur_penjualan |
| **Pesanan** | Pesanan customer + DP | `pesanan_cmd.rs` |
| | Status workflow (open/selesai/batal) | UPDATE status |
| **Customer** | CRUD + CSV import | `customer_cmd.rs` |
| | Limit kredit | `limit_kredit` column |
| | Loyalty point (1 per Rp10k) | `get_laporan_pelanggan` |
| **Hutang/Piutang** | Cicilan + jatuh tempo | `bayar_hutang_piutang` |
| | Jatuh tempo badges | Status filter |
| | Auto-creation dari pembelian DP | Transactional |
| **Supplier** | Basic CRUD | `supplier_cmd.rs` |
| **QRIS** | Generate dinamis | `generate_qris_dinamis` |
| | Multi profil merchant | `qris_profile_cmd.rs` |
| | Validasi + fee | `qris_util_cmd.rs` |
| | Status tracking + prune | `konfirmasi_bayar_qris` |
| **Keuangan** | Cashflow unified | `kas_cmd.rs` |
| | Manual pengeluaran | `create_kas` |
| | Cashbox + mutasi | `cashbox_cmd.rs` |
| **Dashboard** | Ringkasan harian | `dashboard_cmd.rs` |
| | Produk terlaris | `get_produk_terlaris` |
| | Profit per transaksi | `list_keuntungan_per_transaksi` |
| **Laporan** | 6 tab (penjualan/inventori/pelanggan/pembelian/pengeluaran/margin) | PDF + CSV |
| **Shift** | Buka/tutup + selisih kas | `shift_cmd.rs` |
| **PIN** | Kasir PIN gate | `pin_cmd.rs` (bcrypt hash) |
| **Backup/Restore** | Native picker + base64 | `file_cmd.rs` |
| **Log** | Read/write/copy | `log_cmd.rs` |
| **Stock Opname** | Batch adjust + audit trail | `adjust_stock` |
| **Retur** | Transactional restock + refund | `retur_penjualan` |
| **Toko Setup** | Profil toko + QRIS multi-profile | `toko_cmd.rs` |

**Total: ~40 fitur terimplementasi**

---

## Fitur IPOS 5.0 — Yang Belum Ada 📝

### Kode Status: ✅ Sudah | 🔧 Perlu Enhancement | 📝 Belum Ada

---

## Roadmap 7 Phase

### Phase 0 — Foundation Desktop (HIGHEST PRIORITY)

| # | Fitur | Keterangan |
|---|-------|------------|
| 0.1 | **Desktop Layout** | `DesktopLayout.jsx`: sidebar navigasi, header bar, main area split-pane |
| 0.2 | **Mobile Layout** | `MobileLayout.jsx`: tab bar bawah, single-column, FAB |
| 0.3 | **Platform detection hook** | `usePlatform()` → return `"desktop"` / `"mobile"` → render layout sesuai |
| 0.4 | **Sidebar navigasi** | Kategori menu: Kasir, Stok, Laporan, Pembelian, Hutang, Setting |
| 0.5 | **Keyboard shortcuts** | F1=Kasir, F2=Produk, F3=Pembelian, F4=Customer, F5=Hutang, F6=QRIS, F7=Laporan, F8=Dashboard, F9=Keuangan |
| 0.6 | **Resizeable window** | Min 1024×768, fullscreen toggle |
| 0.7 | **Linux AppImage build** | `cargo tauri build --target x86_64-unknown-linux-gnu` → AppImage |
| 0.8 | **Shared SQLite path** | `app_data_dir()` per OS: Windows `%APPDATA%`, Linux `~/.local/share`, Android private |

**Algoritma Platform Detection:**
```
1. Import: platform() dari @tauri-apps/plugin-os
2. Simpan di zustand/context: platformState = "desktop" | "mobile"
3. Conditional render:
   if platformState === "android" → <MobileLayout>{children}</MobileLayout>
   else → <DesktopLayout>{children}</DesktopLayout>
4. CSS: base = mobile-first, .desktop-only class = desktop override
```

**Algoritma Sidebar:**
```
1. Sidebar collapsed by default di desktop
2. Toggle icon di header
3. Menu items: [icon] [label] [badge jika ada notifikasi]
4. Submenu expand/collapse (accordion)
5. Active state: highlight background + border kiri
6. Shortcut: keyboard listener global → navigate ke page
```

**Algoritma Keyboard Shortcut:**
```
useEffect(() => {
  window.addEventListener('keydown', handleShortcuts);
  return () => window.removeEventListener('keydown', handleShortcuts);
}, []);

function handleShortcuts(e) {
  // F1-F12 mapped ke route path
  const map = {
    'F1': '/kasir',
    'F2': '/produk',
    'F3': '/pembelian',
    'F4': '/customer',
    'F5': '/hutang-piutang',
    'F6': '/qris',
    'F7': '/laporan',
    'F8': '/dashboard',
    'F9': '/keuangan',
    'F10': '/shift',
    'F11': '/settings',
  };
  if (map[e.key]) {
    e.preventDefault();
    navigate(map[e.key]);
  }
}
```

**Struktur UI baru:**
```
src/
  ├── layouts/
  │   ├── DesktopLayout.jsx      # Sidebar + header + main area
  │   ├── MobileLayout.jsx       # TabBar + single column + FAB
  │   └── usePlatform.js         # Hook returns "desktop" | "mobile"
  ├── components/
  │   ├── desktop/
  │   │   ├── Sidebar.jsx        # Navigasi sidebar collapsible
  │   │   ├── SplitPane.jsx      # Daftar + detail side by side
  │   │   └── ShortcutHint.jsx   # Overlay petunjuk F-keys
  │   ├── mobile/
  │   │   ├── BottomNav.jsx      # Tab bar bawah
  │   │   └── BottomSheet.jsx    # Modal bawah
  │   └── shared/                # Komponen yang sama untuk kedua
  │       ├── Button.jsx
  │       ├── Modal.jsx
  │       ├── Table.jsx
  │       └── FormField.jsx
  ├── styles/
  │   └── global.css             # Mobile-first + .desktop-* overrides
  └── App.jsx                    # Router + platform detection
```

---

### Phase 1 — Printer & Multi User & Pengaturan

| # | Fitur | Algoritma |
|---|-------|-----------|
| 1.1 | **Printer struk thermal (USB/Bluetooth)** | |
| 1.2 | **Multi user & role** | |
| 1.3 | **Pengaturan nomor transaksi** | |
| 1.4 | **PPN include/exclude/non** | |
| 1.5 | **Customer display** | |

#### 1.1 Printer Struk Thermal

**Algoritma:**
```
1. Backend Rust: print_struk(transaksi_id: i64) -> Result
   a. Query: SELECT * FROM transaksi WHERE id = ?
   b. Query: SELECT * FROM transaksi_item WHERE transaksi_id = ?
   c. Build ESC/POS bytes:
      - GS ! 0x10 (double height)
      - Center: "TOKO KU" + newline
      - Center: "Jl. Merdeka No.1" + newline
      - Left: "Tanggal: 2025-07-25 14:30" + newline
      - Left: "Kasir: Admin" + newline
      - Line separator: "======================" + newline
      - For each item: "Nama Barang  2x Rp10.000  Rp20.000"
      - Line separator
      - "Subtotal: Rp20.000"
      - "Diskon: Rp2.000"
      - "PPN: Rp1.980"
      - "TOTAL: Rp19.980"
      - "Bayar: Rp20.000"
      - "Kembali: Rp20"
      - QRIS (if metode = QRIS): generate QR image 2cm x 2cm
      - GS V 0 (feed + cut)
   d. Open serial port (Android: Bluetooth, Desktop: USB/COM)
   e. Write bytes
   f. Close port

2. Template config: Pengaturan > Printer
   - Nama toko, alamat, footer teks
   - Lebar kertas: 58mm / 80mm (auto-align)
   - Logo: optional base64 image
   - Auto-print: on/off

3. Frontend:
   - Tombol "Cetak Struk" di halaman Transaksi setelah bayar
   - Preview struk sebelum cetak
   - Error handling: "Printer tidak terdeteksi"
```

**Dependency:** `serialport` Rust crate atau `bluetooth-serial-port`

#### 1.2 Multi User & Role

**Database:**
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nama_lengkap TEXT,
  role TEXT NOT NULL DEFAULT 'kasir', -- admin, kasir, supervisor
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  aksi TEXT NOT NULL,
  detail TEXT,
  timestamp TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Algoritma:**
```
1. Register: hash password (bcrypt), INSERT ke users
2. Login: SELECT user WHERE username = ? AND password_hash = ?
   → set session: currentUser = { id, username, role }
   → INSERT INTO user_logs (user_id, aksi='login')
3. Logout: clear session
4. Authorization: setiap command cek currentUser.role:
   - admin: full access
   - supervisor: semua kecuali user management
   - kasir: transaksi, penjualan, lihat produk, QRIS
5. Session timeout: 8 jam idle → auto logout
6. User management (admin only):
   - CRUD users
   - Reset password
   - Deactivate user
```

**Frontend:**
- Login screen pertama kali buka app
- User badge di header (nama + role)
- Menu management: admin bisa akses, kasir terbatas

#### 1.3 Pengaturan Nomor Transaksi

**Database:**
```sql
CREATE TABLE IF NOT EXISTS nomor_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipe TEXT NOT NULL, -- 'jual', 'beli', 'retur_jual', 'retur_beli', 'pesanan'
  prefix TEXT NOT NULL DEFAULT '',
  digit_run INTEGER NOT NULL DEFAULT 4,
  current_number INTEGER NOT NULL DEFAULT 0,
  reset_period TEXT NOT NULL DEFAULT 'none', -- 'none', 'monthly', 'yearly'
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Algoritma:**
```
generate_nomor(tipe: &str) -> String:
  1. SELECT * FROM nomor_settings WHERE tipe = ?
  2. If reset_period == 'monthly':
     - If current month != last reset month → current_number = 0
  3. If reset_period == 'yearly':
     - If current year != last reset year → current_number = 0
  4. current_number += 1
  5. UPDATE nomor_settings SET current_number = ? WHERE tipe = ?
  6. Format: "{prefix}{bulan}{pad(current_number, digit_run)}"
     Contoh: "INV070001" atau "BELI2025-0001"

Default settings:
  - jual: prefix="INV", digit_run=4, monthly reset
  - beli: prefix="BELI", digit_run=4, monthly reset
  - retur_jual: prefix="RET", digit_run=4, monthly reset
```

#### 1.4 PPN Include/Exclude/Non

**Database:**
```sql
CREATE TABLE IF NOT EXISTS pajak_setting (
  id INTEGER PRIMARY KEY DEFAULT 1,
  ppn_mode TEXT NOT NULL DEFAULT 'exclude', -- 'include', 'exclude', 'non'
  ppn_persen REAL NOT NULL DEFAULT 11.0,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Tambahan di tabel produk:
ALTER TABLE produk ADD COLUMN kena_pajak INTEGER DEFAULT 1;
```

**Algoritma:**
```
hitung_ppn(subtotal: f64, items: &[Item]) -> PpnResult:
  mode = SELECT ppn_mode FROM pajak_setting

  match mode:
    'non':
      ppn = 0

    'exclude':
      // PPN ditambahkan di atas harga
      taxable = SUM(item.harga * item.qty WHERE kena_pajak=1)
      ppn = taxable * (ppn_persen / 100)

    'include':
      // Harga sudah termasuk PPN
      taxable = SUM(item.harga * item.qty WHERE kena_pajak=1)
      ppn = taxable - (taxable / (1 + ppn_persen/100))

  return PpnResult { ppn_amount: ppn, taxable_amount: taxable }

Laporan:
  - CSV Faktur Pajak Keluaran: kolom [DPP, PPN, Total]
  - DPP = taxable amount
  - PPN = ppn amount
```

#### 1.5 Customer Display

**Algoritma:**
```
1. Buat Tauri secondary window (native OS window):
   - Size: 800×480 (resolusi layar ke-2)
   - Content: minimal display
     - Nama item, qty, harga
     - Total belanja (besar)
     - Animasi: item baru geser ke atas

2. Communication:
   - Event: emit('customer-display-update', data) dari window utama
   - Listener: window kedua listen event → update DOM

3. Setup:
   - Pengaturan > Customer Display: pilih mode
     - Off
     - Secondary window
     - HDMI output (same content)
   - Deteksi monitor ke-2 via Tauri window API
```

---

### Phase 2 — Pricing, Data, Export

| # | Fitur | Algoritma |
|---|-------|-----------|
| 2.1 | **Multi harga jual** | |
| 2.2 | **Diskon bertingkat** | |
| 2.3 | **Export/import lengkap** | |
| 2.4 | **Data pengiriman + resi** | |
| 2.5 | **Master bank, merek, jenis, ekspedisi** | |

#### 2.1 Multi Harga Jual

**Database:**
```sql
CREATE TABLE IF NOT EXISTS harga_jual (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produk_id INTEGER NOT NULL,
  tipe TEXT NOT NULL, -- 'quantity', 'level', 'satuan'
  qty_min REAL,
  qty_max REAL,
  level_id INTEGER, -- referensi level pelanggan
  satuan TEXT,
  harga REAL NOT NULL,
  FOREIGN KEY (produk_id) REFERENCES produk(id)
);

CREATE TABLE IF NOT EXISTS level_pelanggan (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL, -- 'Grosir', 'Reseller', 'VIP'
  diskon_persen REAL DEFAULT 0,
  harga_override INTEGER DEFAULT 0
);
```

**Algoritma lookup harga saat kasir:**
```
get_harga(produk_id, qty, customer_level, satuan) -> f64:
  1. Cari harga_jual WHERE tipe='quantity' AND qty BETWEEN qty_min AND qty_max
     → jika ketemu, return harga itu

  2. Cari harga_jual WHERE tipe='level' AND level_id = customer_level
     → jika ketemu, return harga itu

  3. Cari harga_jual WHERE tipe='satuan' AND satuan = selected_satuan
     → jika ketemu, return harga itu

  4. Fallback: return produk.harga_jual_default
```

#### 2.2 Diskon Bertingkat

**Database:**
```sql
ALTER TABLE produk ADD COLUMN diskon_lapisan TEXT DEFAULT '[]';
-- Format JSON: [{"persen": 10}, {"persen": 5}, {"persen": 2}]
```

**Algoritma:**
```
hitung_diskon_bertingkat(harga: f64, lapisan: Vec<f64>) -> f64:
  hasil = harga
  for lapisan in lapisan_persen:
    hasil = hasil * (1 - lapisan/100)
  return hasil

Contoh: harga 100.000, lapisan [10, 5, 2]
  100.000 × 0.90 = 90.000
  90.000 × 0.95 = 85.500
  85.500 × 0.98 = 83.790
  Total diskon: 16.210 (16.21%)

Cek di kasir:
  - Jika produk punya diskon_lapisan, tampilkan badge "Diskon 10+5+2%"
  - Hitung otomatis saat checkout
```

#### 2.3 Export/Import Lengkap

**Algoritma export:**
```
export_entity(tipe: &str, path: &str) -> Result:
  match tipe:
    'item'     → SELECT * FROM produk → CSV (nama, sku, harga, stok, kategori, ...)
    'customer' → SELECT * FROM customer → CSV
    'supplier' → SELECT * FROM supplier → CSV
    'jual'     → SELECT * FROM transaksi + item → CSV
    'beli'     → SELECT * FROM transaksi WHERE tipe='beli' + item → CSV
    'kas'      → SELECT * FROM kas → CSV
    'hutang'   → SELECT * FROM hutang_piutang → CSV

  Write CSV with BOM (untuk Excel)
  Return: path file
```

**Algoritma import:**
```
import_entity(tipe: &str, path: &str) -> ImportResult:
  1. Read CSV file
  2. Validate header: pastikan kolom sesuai template
  3. Begin transaction
  4. For each row:
     - Skip jika duplicate (berdasarkan key: SKU untuk item, phone untuk customer)
     - INSERT/UPDATE
     - Count: inserted, updated, skipped, errors
  5. Commit atau rollback jika error
  6. Return: { inserted, updated, skipped, errors: Vec<String> }

Template CSV:
  - Download template kosong dari menu Export
  - Format sesuai kolom database
```

#### 2.4 Data Pengiriman + Resi

**Database:**
```sql
CREATE TABLE IF NOT EXISTS pengiriman (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaksi_id INTEGER NOT NULL,
  alamat_kirim TEXT,
  kota TEXT,
  provinsi TEXT,
  kode_pos TEXT,
  ekspedisi TEXT,
  no_resi TEXT,
  tgl_kirim TEXT,
  tgl_diterima TEXT,
  status TEXT DEFAULT 'dikemas', -- dikemas, dikirim, diterima
  catatan TEXT,
  FOREIGN KEY (transaksi_id) REFERENCES transaksi(id)
);
```

**Algoritma:**
```
1. Saat kasir pilih "Kirim":
   - Form alamat kirim (auto-isi dari data customer)
   - Pilih ekspedisi (dropdown master)
   - Input no resi (manual atau scan)
   - Status: 'dikemas'

2. Update status:
   - 'dikemas' → 'dikirim' (input tgl kirim)
   - 'dikirim' → 'diterima' (input tgl terima)

3. Laporan pengiriman:
   - Filter status, ekspedisi, tanggal
   - Export CSV
```

#### 2.5 Master Bank, Merek, Jenis, Ekspedisi

**Database:**
```sql
CREATE TABLE IF NOT EXISTS master_bank (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  kode TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS master_merek (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS master_jenis_barang (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  induk_id INTEGER,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS master_ekspedisi (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
);
```

**Algoritma:**
```
1. CRUD sederhana untuk setiap master
2. Seed data default saat pertama kali:
   - Bank: BCA, Mandiri, BRI, BNI, BSI, CIMB, Danamon, BTN, Permata, Maybank
   - Ekspedisi: JNE, J&T, SiCepat, TIKI, AnterAja, Wahana, Lion, POS, SAP, Ninja
3. Dropdown di form transaksi: pilih dari master
4. Admin bisa tambah/hapus/ubah master
```

---

### Phase 3 — Stok Multi Lokasi

| # | Fitur | Algoritma |
|---|-------|-----------|
| 3.1 | **Multi gudang** | |
| 3.2 | **Transfer stok antar gudang** | |
| 3.3 | **Transfer beda cabang** | |
| 3.4 | **Serial number** | |
| 3.5 | **Saldo awal wizard** | |

#### 3.1 Multi Gudang

**Database:**
```sql
CREATE TABLE IF NOT EXISTS gudang (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  alamat TEXT,
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS stok_gudang (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gudang_id INTEGER NOT NULL,
  produk_id INTEGER NOT NULL,
  qty REAL DEFAULT 0,
  FOREIGN KEY (gudang_id) REFERENCES gudang(id),
  FOREIGN KEY (produk_id) REFERENCES produk(id),
  UNIQUE(gudang_id, produk_id)
);
```

**Algoritma:**
```
1. Default gudang utama (id=1, "Gudang Utama") saat setup awal
2. Stok per gudang: stok_gudang(gudang_id, produk_id, qty)
3. Total stok: SELECT SUM(qty) FROM stok_gudang WHERE produk_id = ?
4. Transaksi kasir: pilih gudang asal → kurangi stok gudang itu
5. Restock pembelian: pilih gudang tujuan → tambah stok
6. Filter produk: tampilkan stok per gudang di halaman Produk
7. Transfer: pindah stok dari gudang A ke gudang B
```

#### 3.2 Transfer Stok Antar Gudang

**Database:**
```sql
CREATE TABLE IF NOT EXISTS transfer_stok (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gudang_asal_id INTEGER NOT NULL,
  gudang_tujuan_id INTEGER NOT NULL,
  tgl_transfer TEXT DEFAULT (datetime('now')),
  status TEXT DEFAULT 'selesai', -- pending, selesai, batal
  catatan TEXT,
  user_id INTEGER,
  FOREIGN KEY (gudang_asal_id) REFERENCES gudang(id),
  FOREIGN KEY (gudang_tujuan_id) REFERENCES gudang(id)
);

CREATE TABLE IF NOT EXISTS transfer_stok_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transfer_id INTEGER NOT NULL,
  produk_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  FOREIGN KEY (transfer_id) REFERENCES transfer_stok(id),
  FOREIGN KEY (produk_id) REFERENCES produk(id)
);
```

**Algoritma:**
```
proses_transfer(transfer_id: i64):
  1. BEGIN TRANSACTION
  2. SELECT * FROM transfer_stok WHERE id = ?
  3. SELECT * FROM transfer_stok_item WHERE transfer_id = ?
  4. For each item:
     a. UPDATE stok_gudang SET qty = qty - item.qty
        WHERE gudang_id = gudang_asal AND produk_id = item.produk_id
     b. UPDATE stok_gudang SET qty = qty + item.qty
        WHERE gudang_id = gudang_tujuan AND produk_id = item.produk_id
     c. INSERT INTO mutasi_stok (produk_id, gudang_id, qty, jenis='transfer_out', ref_id)
     d. INSERT INTO mutasi_stok (produk_id, gudang_id, qty, jenis='transfer_in', ref_id)
  5. UPDATE transfer_stok SET status = 'selesai'
  6. COMMIT

Validasi:
  - Stok asal >= qty yang ditransfer
  - Gudang asal ≠ gudang tujuan
```

#### 3.3 Transfer Beda Cabang

**Algoritma:**
```
Export:
  1. Pilih transfer → serialize ke JSON
  2. JSON structure:
     {
       "type": "mikrokas_transfer",
       "version": "1.0",
       "timestamp": "2025-07-25T14:30:00",
       "items": [
         {"sku": "PRD001", "nama": "Produk A", "qty": 10, "harga_beli": 50000}
       ]
     }
  3. Simpan ke file: mikrokas_transfer_20250725.mk

Import:
  1. Buka file .mk
  2. Validate type + version
  3. For each item:
     - Cari produk by SKU
     - Jika tidak ada → log warning, skip
     - Jika ada → tambah stok di gudang default
  4. INSERT INTO transfer_stok (status='imported', catatan='Import dari cabang X')
  5. Return: jumlah berhasil, jumlah gagal
```

#### 3.4 Serial Number

**Database:**
```sql
CREATE TABLE IF NOT EXISTS serial (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produk_id INTEGER NOT NULL,
  serial_number TEXT NOT NULL,
  gudang_id INTEGER NOT NULL,
  status TEXT DEFAULT 'ready', -- ready, terjual, retur, rusak
  transaksi_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (produk_id) REFERENCES produk(id),
  FOREIGN KEY (gudang_id) REFERENCES gudang(id),
  UNIQUE(produk_id, serial_number)
);
```

**Algoritma:**
```
1. Input serial: tambah produk dengan serial_number
   - Form: pilih produk → input SN (atau scan barcode) → pilih gudang
   - Validasi: SN unik per produk

2. Jual serial:
   - Kasir pilih produk yang pakai serial
   - Pilih SN dari list yang status='ready'
   - UPDATE serial SET status='terjual', transaksi_id=?
   - SN dikurangi dari stok

3. Retur serial:
   - UPDATE serial SET status='retur', transaksi_id=NULL
   - Stok bertambah

4. History serial:
   - Query: SELECT * FROM serial WHERE produk_id=? ORDER BY created_at
   - Tampilkan: SN, status, tanggal, transaksi ref

5. Laporan serial:
   - Filter: produk, status, gudang, tanggal
```

#### 3.5 Saldo Awal Wizard

**Database:**
```sql
CREATE TABLE IF NOT EXISTS saldo_awal_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipe TEXT NOT NULL, -- 'item', 'hutang', 'piutang', 'kas'
  ref_id INTEGER,
  nominal REAL NOT NULL,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

**Algoritma:**
```
Wizard 4 step:

Step 1: Saldo Awal Item
  - Download template CSV: [SKU, Qty, Harga Beli Rata]
  - Upload CSV atau input manual
  - For each item:
    INSERT INTO stok_gudang (gudang_id=1, produk_id, qty)
    INSERT INTO saldo_awal_log (tipe='item', ref_id, nominal=qty*harga)

Step 2: Saldo Awal Hutang
  - Input: [Supplier, Jumlah, Keterangan]
  - INSERT INTO hutang_piutang (tipe='hutang', ...)

Step 3: Saldo Awal Piutang
  - Input: [Customer, Jumlah, Keterangan]
  - INSERT INTO hutang_piutang (tipe='piutang', ...)

Step 4: Saldo Awal Kas
  - Input: jumlah kas awal
  - INSERT INTO kas (tipe='saldo_awal', nominal)

Konfirmasi:
  - Tampilkan ringkasan: total item, total hutang, total piutang, total kas
  - User konfirmasi → COMMIT semua
  - Flag: setup_saldo_awal = true (sekali saja)
```

---

### Phase 4 — Akuntansi & Sales & Point & Deposit

| # | Fitur | Algoritma |
|---|-------|-----------|
| 4.1 | **COA / daftar akun** | |
| 4.2 | **Jurnal umum (double-entry)** | |
| 4.3 | **Buku besar** | |
| 4.4 | **Neraca saldo + lajur** | |
| 4.5 | **Neraca perusahaan** | |
| 4.6 | **Laba rugi + YTD** | |
| 4.7 | **Tutup tahun** | |
| 4.8 | **Sales & komisi** | |
| 4.9 | **Point pelanggan (redemption)** | |
| 4.10 | **Deposit pelanggan/supplier** | |
| 4.11 | **Tukar tambah** | |
| 4.12 | **Jurnal tidak seimbang** | |

#### 4.1 COA / Daftar Akun

**Database:**
```sql
CREATE TABLE IF NOT EXISTS coa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kode_akun TEXT UNIQUE NOT NULL,
  nama_akun TEXT NOT NULL,
  tipe TEXT NOT NULL, -- aktiva, kewajiban, modal, pendapatan, hpp, biaya
  induk_id INTEGER,
  saldo_normal TEXT NOT NULL DEFAULT 'debit', -- debit, kredit
  is_active INTEGER DEFAULT 1,
  FOREIGN KEY (induk_id) REFERENCES coa(id)
);
```

**Algoritma:**
```
1. Seed default COA (Standar Akuntansi Indonesia):
   1xxx = Aktiva (Kas, Bank, Piutang, Persediaan, Tetap)
   2xxx = Kewajiban (Hutang Usaha, Hutang Bank)
   3xxx = Modal (Modal Disetor, Laba Ditahan)
   4xxx = Pendapatan (Penjualan, Pendapatan Lain)
   5xxx = HPP (Harga Pokok Penjualan)
   6xxx = Biaya (Biaya Gaji, Sewa, Listrik, dll)

2. Hierarki: kode_akun induk → child
   Contoh: 1100 "Kas" → 1101 "Kas Tunai", 1102 "Kas Bank"

3. CRUD admin only
```

#### 4.2 Jurnal Umum

**Database:**
```sql
CREATE TABLE IF NOT EXISTS jurnal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tgl TEXT NOT NULL,
  ref_tipe TEXT NOT NULL, -- 'penjualan', 'pembelian', 'retur', 'manual', 'penutup'
  ref_id INTEGER NOT NULL,
  akun_id INTEGER NOT NULL,
  debit REAL DEFAULT 0,
  kredit REAL DEFAULT 0,
  keterangan TEXT,
  user_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (akun_id) REFERENCES coa(id)
);
```

**Algoritma generate_jurnal otomatis:**
```
generate_jurnal_penjualan(transaksi):
  kas_akun = coa.kode_akun WHERE nama = 'Kas'
  pendapatan_akun = coa.kode_akun WHERE nama = 'Penjualan'
  ppn_keluaran_akun = coa.kode_akun WHERE nama = 'PPN Keluaran'

  INSERT INTO jurnal:
    { debit: transaksi.total, akun: kas_akun }
    { kredit: transaksi.subtotal, akun: pendapatan_akun }
    { kredit: transaksi.pajak, akun: ppn_keluaran_akun }

  Validasi: sum(debit) == sum(kredit), jika ≠ → REJECT + log error

generate_jurnal_pembelian(transaksi):
  persediaan_akun = coa.kode_akun WHERE nama = 'Persediaan'
  hutang_akun = coa.kode_akun WHERE nama = 'Hutang Usaha'
  kas_akun = coa.kode_akun WHERE nama = 'Kas'

  INSERT INTO jurnal:
    { debit: subtotal, akun: persediaan_akun }
    { kredit: dp_dibayar, akun: kas_akun }
    { kredit: sisa_hutang, akun: hutang_akun }

generate_jurnal_retur(transaksi):
  // Reverse dari penjualan
  INSERT INTO jurnal:
    { kredit: retur.total, akun: kas_akun }
    { debit: retur.subtotal, akun: pendapatan_akun }
    { debit: retur.pajak, akun: ppn_keluaran_akun }
```

#### 4.3 Buku Besar

**Algoritma:**
```
get_buku_besar(akun_id: i64, dari: Date, sampai: Date):
  1. SELECT saldo_awal WHERE akun_id = ?
  2. SELECT * FROM jurnal WHERE akun_id = ? AND tgl BETWEEN ? AND ? ORDER BY tgl
  3. Hitung saldo berjalan:
     saldo = saldo_awal
     for each jurnal:
       if akun.saldo_normal == 'debit':
         saldo += jurnal.debit - jurnal.kredit
       else:
         saldo += jurnal.kredit - jurnal.debit
     return list of {tgl, ref, debit, kredit, saldo_berjalan}
```

#### 4.4 Neraca Saldo

**Algoritma:**
```
get_neraca_saldo(dari: Date, sampai: Date):
  SELECT
    coa.kode_akun,
    coa.nama_akun,
    coa.saldo_normal,
    SUM(jurnal.debit) as total_debit,
    SUM(jurnal.kredit) as total_kredit
  FROM jurnal
  JOIN coa ON jurnal.akun_id = coa.id
  WHERE tgl BETWEEN ? AND ?
  GROUP BY coa.id

  // Saldo akhir per akun:
  if saldo_normal == 'debit':
    saldo_akhir = total_debit - total_kredit
  else:
    saldo_akhir = total_kredit - total_debit

  // Balance check:
  if sum(debit_semua) ≠ sum(kredit_semua) → ERROR "Jurnal tidak seimbang"
```

#### 4.5 Neraca Perusahaan

**Algoritma:**
```
get_neraca(tanggal: Date):
  aktiva = SUM(saldo_akhir WHERE kode_akun LIKE '1%')
  kewajiban = SUM(saldo_akhir WHERE kode_akun LIKE '2%')
  modal_awal = SUM(saldo_akhir WHERE kode_akun LIKE '3%')
  laba = get_laba_rugi(tanggal)

  total_aktiva = aktiva
  total_kewajiban_modal = kewajiban + modal_awal + laba

  if total_aktiva ≠ total_kewajiban_modal → WARNING
```

#### 4.6 Laba Rugi + YTD

**Algoritma:**
```
get_laba_rugi(dari: Date, sampai: Date):
  pendapatan = SUM(kredit - debit) WHERE kode_akun LIKE '4%'
  hpp = SUM(debit - kredit) WHERE kode_akun LIKE '5%'
  biaya = SUM(debit - kredit) WHERE kode_akun LIKE '6%'

  laba_kotor = pendapatan - hpp
  laba_bersih = laba_kotor - biaya

  YTD: dari 1 Januari sampai tanggal parameter
```

#### 4.7 Tutup Tahun

**Algoritma:**
```
tutup_tahun(tahun: i64):
  BEGIN TRANSACTION

  1. Hitung laba/rugi tahun ini → laba_bersih

  2. Buat jurnal penutup:
     INSERT INTO jurnal:
       // Tutup semua pendapatan ke Ikhtisar Laba/Rugi
       { debit: pendapatan_total, akun: pendapatan }
       { kredit: pendapatan_total, akun: 'Ikhtisar Laba/Rugi' }

       // Tutup semua biaya ke Ikhtisar Laba/Rugi
       { debit: biaya_total, akun: 'Ikhtisar Laba/Rugi' }
       { kredit: biaya_total, akun: biaya }

       // Tutup Ikhtisal Laba/Rugi ke Modal
       { debit: laba_bersih, akun: 'Ikhtisar Laba/Rugi' }
       { kredit: laba_bersih, akun: 'Modal Disetor' }

  3. Copy saldo akun neraca (1xxx, 2xxx, 3xxx) ke saldo_awal tahun baru
  4. Reset akun 4xxx, 5xxx, 6xxx ke 0

  COMMIT
```

#### 4.8 Sales & Komisi

**Database:**
```sql
CREATE TABLE IF NOT EXISTS sales (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  no_telp TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS komisi_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_id INTEGER NOT NULL,
  produk_id INTEGER NOT NULL,
  komisi_persen REAL,
  komisi_nominal REAL,
  FOREIGN KEY (sales_id) REFERENCES sales(id),
  FOREIGN KEY (produk_id) REFERENCES produk(id)
);

CREATE TABLE IF NOT EXISTS komisi_terutang (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sales_id INTEGER NOT NULL,
  transaksi_id INTEGER NOT NULL,
  produk_id INTEGER NOT NULL,
  qty REAL NOT NULL,
  komisi_total REAL NOT NULL,
  status TEXT DEFAULT 'belum_bayar', -- belum_bayar, dibayar
  tgl_bayar TEXT,
  FOREIGN KEY (sales_id) REFERENCES sales(id)
);
```

**Algoritma:**
```
1. Setup: admin input data sales + komisi per produk
2. Saat kasir pilih sales di transaksi:
   - For each item: hitung komisi (persen × harga × qty)
   - INSERT INTO komisi_terutang
3. Pembayaran komisi:
   - Pilih sales + periode
   - SUM komisi_terutang WHERE status='belum_bayar' AND tgl BETWEEN ?
   - Tampilkan total → bayar → UPDATE status='dibayar'
4. Laporan komisi: per sales, per produk, per periode
```

#### 4.9 Point Pelanggan (Redemption)

**Database:**
```sql
CREATE TABLE IF NOT EXISTS point_setting (
  id INTEGER PRIMARY KEY DEFAULT 1,
  rupiah_per_point REAL DEFAULT 10000,
  masa_berlaku_hari INTEGER DEFAULT 365,
  min_tukar_point INTEGER DEFAULT 100
);

CREATE TABLE IF NOT EXISTS point_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_id INTEGER NOT NULL,
  tipe TEXT NOT NULL, -- 'dapat', 'tukar', 'expired'
  point INTEGER NOT NULL,
  transaksi_id INTEGER,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customer(id)
);
```

**Algoritma:**
```
Saat transaksi selesai:
  setting = SELECT * FROM point_setting
  point = floor(transaksi.total / setting.rupiah_per_point)
  INSERT INTO point_log (customer_id, tipe='dapat', point, transaksi_id)

Tukar point:
  saldopoint = SELECT SUM(point) FROM point_log WHERE customer_id=? GROUP BY customer_id
  if saldopoint >= min_tukar_point:
    Pilih: tukar jadi diskon (1 point = Rp1000) atau tukar barang
    INSERT INTO point_log (customer_id, tukar, -point)
    Apply diskon ke transaksi

Expired:
  Run harian: point_log WHERE created_at < (now - masa_berlaku_hari)
  INSERT INTO point_log (customer_id, expired, -point)
```

#### 4.10 Deposit Pelanggan/Supplier

**Database:**
```sql
CREATE TABLE IF NOT EXISTS deposit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipe TEXT NOT NULL, -- 'customer', 'supplier'
  ref_id INTEGER NOT NULL,
  saldo REAL DEFAULT 0,
  UNIQUE(tipe, ref_id)
);

CREATE TABLE IF NOT EXISTS deposit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  deposit_id INTEGER NOT NULL,
  tipe TEXT NOT NULL, -- 'top_up', 'gunakan', 'refund'
  nominal REAL NOT NULL,
  transaksi_id INTEGER,
  keterangan TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (deposit_id) REFERENCES deposit(id)
);
```

**Algoritma:**
```
top_up(deposit_id, nominal):
  UPDATE deposit SET saldo = saldo + nominal WHERE id = ?
  INSERT INTO deposit_log (deposit_id, top_up, nominal)

gunakan(deposit_id, nominal):
  cek = SELECT saldo FROM deposit WHERE id = ?
  if cek >= nominal:
    UPDATE deposit SET saldo = saldo - nominal WHERE id = ?
    INSERT INTO deposit_log (deposit_id,gunakan, -nominal)
    return true
  else:
    return false "Saldo deposit tidak cukup"

Saat transaksi kasir:
  - Checkbox "Gunakan Deposit" → if checked, kurangi deposit + bayar
  - Atau: top_up deposit dulu, lalu bayar dari deposit
```

#### 4.11 Tukar Tambah

**Database:**
```sql
CREATE TABLE IF NOT EXISTS tukar_tambah (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaksi_id INTEGER NOT NULL,
  produk_lama_id INTEGER NOT NULL,
  qty_lama REAL NOT NULL,
  kondisi TEXT, -- bagus, rusak_ringan, rusak_berat
  nilai_tukar REAL NOT NULL,
  produk_baru_id INTEGER NOT NULL,
  qty_baru REAL NOT NULL,
  selisih_bayar REAL NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (transaksi_id) REFERENCES transaksi(id),
  FOREIGN KEY (produk_lama_id) REFERENCES produk(id),
  FOREIGN KEY (produk_baru_id) REFERENCES produk(id)
);
```

**Algoritma:**
```
tukar_tambah(produk_lama_id, qty_lama, nilai_tukar, produk_baru_id, qty_baru):
  harga_baru = qty_baru × produk_baru.harga_jual
  selisih = harga_baru - nilai_tukar

  BEGIN TRANSACTION
  1. barang_lama masuk stok:
     INSERT INTO stok_gudang (qty += qty_lama)
     (harga beli = nilai_tukar / qty_lama)
  2. barang_baru keluar stok:
     UPDATE stok_gudang SET qty = qty - qty_baru
  3. Buat transaksi penjualan:
     if selisih > 0 → customer bayar selisih
     if selisih < 0 → refund ke customer
     if selisih = 0 → barter, tidak bayar
  4. INSERT INTO tukar_tambah (all fields)
  COMMIT
```

#### 4.12 Analisa Jurnal Tidak Seimbang

**Algoritma:**
```
cek_jurnal_tidak_seimbang():
  SELECT
    ref_tipe,
    ref_id,
    SUM(debit) as total_debit,
    SUM(kredit) as total_kredit,
    SUM(debit) - SUM(kredit) as selisih
  FROM jurnal
  GROUP BY ref_tipe, ref_id
  HAVING selisih != 0

  // Tampilkan daftar + tombol "Buat Jurnal Koreksi"
  // Jurnal Koreksi: INSERT jurnal baru yang menyeimbangkan
```

---

### Phase 5 — Konsinyasi & Perakitan & HPP

| # | Fitur | Algoritma |
|---|-------|-----------|
| 5.1 | **Konsinyasi masuk** | |
| 5.2 | **Konsinyasi keluar** | |
| 5.3 | **Perakitan / BOM** | |
| 5.4 | **HPP FIFO/LIFO** | |
| 5.5 | **Vacuum & reindex DB** | |

#### 5.1 Konsinyasi Masuk

**Database:**
```sql
CREATE TABLE IF NOT EXISTS konsinyasi_masuk (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier_id INTEGER NOT NULL,
  tgl_pesan TEXT,
  tgl_terima TEXT,
  status TEXT DEFAULT 'pesan', -- pesan, terima, retur, lunas
  catatan TEXT,
  FOREIGN KEY (supplier_id) REFERENCES supplier(id)
);

CREATE TABLE IF NOT EXISTS konsinyasi_masuk_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  konsinyasi_id INTEGER NOT NULL,
  produk_id INTEGER NOT NULL,
  qty_titip REAL NOT NULL,
  qty_terjual REAL DEFAULT 0,
  harga_jual REAL NOT NULL,
  komisi_supplier_persen REAL DEFAULT 0,
  FOREIGN KEY (konsinyasi_id) REFERENCES konsinyasi_masuk(id)
);
```

**Algoritma:**
```
1. Pesan: INSERT konsinyasi_masuk (status='pesan') + items
2. Terima: UPDATE status='terima', qty_titip masuk stok (flag titipan)
3. Jual: qty_terjual += 1, stok titipan dikurangi
4. Tagihan: per periode, hitung total barang laku × harga → buat tagihan ke supplier
5. Bayar: kurangi hutang tagihan
6. Retur: qty_kembali masuk stok, hapus dari tagihan
```

#### 5.2 Konsinyasi Keluar

Kebalikan 5.1: titip barang ke agen, agen jual, bayar ke kita.
Tabel mirip, ganti supplier → agen (customer).

#### 5.3 Perakitan / BOM

**Database:**
```sql
CREATE TABLE IF NOT EXISTS bom (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produk_rakitan_id INTEGER NOT NULL,
  sub_produk_id INTEGER NOT NULL,
  qty_dibutuhkan REAL NOT NULL,
  FOREIGN KEY (produk_rakitan_id) REFERENCES produk(id),
  FOREIGN KEY (sub_produk_id) REFERENCES produk(id)
);

CREATE TABLE IF NOT EXISTS bom_biaya (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_id INTEGER NOT NULL,
  nama_biaya TEXT NOT NULL,
  nominal REAL NOT NULL
);
```

**Algoritma:**
```
proses_perakitan(produk_rakitan_id, qty_hasil):
  1. SELECT * FROM bom WHERE produk_rakitan_id = ?
  2. SELECT * FROM bom_biaya WHERE bom_id = ?

  3. Cek ketersediaan stok:
     for each sub_item in bom:
       stok_tersedia = get_stok(sub_item.sub_produk_id)
       stok_dibutuhkan = sub_item.qty_dibutuhkan × qty_hasil
       if stok_tersedia < stok_dibutuhkan → ERROR "Stok {nama} kurang"

  4. BEGIN TRANSACTION
     for each sub_item:
       UPDATE stok_gudang SET qty = qty - stok_dibutuhkan
       INSERT INTO mutasi_stok (jenis='keluar_perakitan')

     // Produk jadi masuk stok
     INSERT INTO stok_gudang (produk_rakitan_id, qty_hasil)

     // Hitung HPP rakitan:
     total_bahan = SUM(sub_item.qty × sub_item.harga_beli)
     total_biaya = SUM(bom_biaya.nominal)
     hpp_per_unit = (total_bahan + total_biaya) / qty_hasil

     UPDATE produk SET harga_beli = hpp_per_unit WHERE id = produk_rakitan_id
     INSERT INTO mutasi_stok (jenis='masuk_perakitan')
  5. COMMIT
```

#### 5.4 HPP FIFO/LIFO

**Database:**
```sql
CREATE TABLE IF NOT EXISTS stok_batch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  produk_id INTEGER NOT NULL,
  gudang_id INTEGER NOT NULL,
  tgl_masuk TEXT NOT NULL,
  qty_masuk REAL NOT NULL,
  qty_terpakai REAL DEFAULT 0,
  harga_beli REAL NOT NULL,
  FOREIGN KEY (produk_id) REFERENCES produk(id)
);

ALTER TABLE produk ADD COLUMN metode_hpp TEXT DEFAULT 'average';
-- 'average', 'fifo', 'lifo'
```

**Algoritma FIFO:**
```
ambil_stok_fifo(produk_id, qty_jual):
  batches = SELECT * FROM stok_batch
            WHERE produk_id = ? AND (qty_masuk - qty_terpakai) > 0
            ORDER BY tgl_masuk ASC

  sisa = qty_jual
  total_hpp = 0

  for batch in batches:
    tersedia = batch.qty_masuk - batch.qty_terpakai
    ambil = min(sisa, tersedia)
    total_hpp += ambil × batch.harga_beli
    batch.qty_terpakai += ambil
    sisa -= ambil
    UPDATE stok_batch SET qty_terpakai = batch.qty_terpakai WHERE id = batch.id

  return total_hpp / qty_jual  // HPP per unit
```

**Algoritma LIFO:**
```
ambil_stok_lifo(produk_id, qty_jual):
  batches = SELECT * FROM stok_batch
            WHERE produk_id = ? AND (qty_masuk - qty_terpakai) > 0
            ORDER BY tgl_masuk DESC  // ← bedanya: DESC bukan ASC

  // Sama seperti FIFO tapi urutan terbalik
```

**Algoritma Average:**
```
ambil_stok_average(produk_id, qty_jual):
  total_qty = SUM(qty_masuk - qty_terpakai) FROM stok_batch
  total_nilai = SUM((qty_masuk - qty_terpakai) × harga_beli)
  avg = total_nilai / total_qty

  Kurangi stok secara proporsional:
  for batch in batches:
    proporsi = (batch.qty_masuk - batch.qty_terpakai) / total_qty
    batch.qty_terpakai += qty_jual × proporsi
    UPDATE stok_batch

  return avg
```

#### 5.5 Vacuum & Reindex

**Algoritma:**
```
maintenance_database():
  1. ukuran_awal = file_size(mikrokas.db)
  2. PRAGMA integrity_check → result
  3. VACUUM
  4. REINDEX
  5. ukuran_akhir = file_size(mikrokas.db)

  return {
    integrity: result,
    ukuran_sebelum: ukuran_awal,
    ukuran_sesudah: ukuran_akhir,
    penghematan: ukuran_awal - ukuran_akhir
  }
```

---

## Fitur Lengkap IPOS 5.0 — Coverage Map

### Master Data

| # | Fitur | Status |
|---|-------|--------|
| 1 | Master Item | ✅ |
| 2 | Master Supplier | ✅ |
| 3 | Master Pelanggan + Grup | ✅ |
| 4 | Master Sales | 📝 Phase 4 |
| 5 | Komisi Sales per Item | 📝 Phase 4 |
| 6 | Master Satuan, Jenis, Bank, Gudang, Merek, Ongkir | 🔧 Satuan ada, lainnya 📝 Phase 2 |
| 7 | Item: Barang/Jasa/Rakitan/Non Inventory | 🔧 Barang done, Rakitan 📝 Phase 5 |
| 8 | Multi Satuan Konversi | ✅ |
| 9 | Multi Harga Jual | 📝 Phase 2 |
| 10 | Item Bergambar | ✅ |
| 11 | Diskon Bertingkat | 📝 Phase 2 |
| 12 | Multi Serial | 📝 Phase 3 |
| 13 | Cetak Barcode | 🔧 SVG generator, perlu print template |
| 14 | Point Pelanggan | 🔧 Poin kumpul ada, redemption 📝 Phase 4 |
| 15 | Periode Promosi | ✅ |
| 16 | HPP FIFO/LIFO/Average | 📝 Phase 5 |

### Pembelian

| # | Fitur | Status |
|---|-------|--------|
| 1 | Pesanan / PO | 🔧 Pesanan customer ada, PO supplier 📝 |
| 2 | DP Pembelian | ✅ |
| 3 | Pembelian | ✅ |
| 4 | Retur Pembelian | ✅ |
| 5 | History Harga Beli | 🔧 Catatan harga supplier ada |
| 6 | Pembayaran Hutang | ✅ |
| 7 | PPN di Pembelian | 📝 Phase 1 |
| 8 | Deposit di Pembelian | 📝 Phase 4 |

### Konsinyasi Masuk — 📝 Phase 5

| # | Fitur |
|---|-------|
| 1 | Pesanan Konsinyasi Masuk |
| 2 | Konsinyasi Masuk (Penerimaan) |
| 3 | Retur Konsinyasi Masuk |
| 4 | Tagihan Barang Laku |
| 5 | Pembayaran Barang Laku |

### Konsinyasi Keluar — 📝 Phase 5

| # | Fitur |
|---|-------|
| 1 | Pesanan Konsinyasi Keluar |
| 2 | Konsinyasi Keluar (Penitipan) |
| 3 | Retur Konsinyasi Keluar |
| 4 | Cek Barang Laku |
| 5 | Tagihan ke Agen |
| 6 | Pembayaran Piutang |

### Penjualan

| # | Fitur | Status |
|---|-------|--------|
| 1 | Pesanan Jual + Cetak Penawaran | 🔧 Ada pesanan |
| 2 | DP Pesanan | ✅ |
| 3 | Penjualan Back Office | ✅ |
| 4 | Kasir (POS) | ✅ |
| 5 | Tukar Tambah | 📝 Phase 4 |
| 6 | History Harga Jual | 📝 Riwayat harga |
| 7 | Retur Jual | ✅ |
| 8 | Pembayaran Piutang | ✅ |
| 9 | Point Penjualan | 📝 Phase 4 |
| 10 | Pembayaran Komisi Sales | 📝 Phase 4 |
| 11 | Data Pengiriman | 📝 Phase 2 |
| 12 | Multi Diskon + Alamat Kirim | 📝 Phase 2 |
| 13 | PPN di Penjualan | 📝 Phase 1 |
| 14 | Deposit di Penjualan | 📝 Phase 4 |

### Perakitan — 📝 Phase 5

| # | Fitur |
|---|-------|
| 1 | Pesanan Perakitan |
| 2 | Proses Perakitan |
| 3 | Proses Jadi |

### Persediaan

| # | Fitur | Status |
|---|-------|--------|
| 1 | Item Masuk | ✅ |
| 2 | Item Keluar | ✅ |
| 3 | Saldo Awal Item | 📝 Phase 3 |
| 4 | Opname Stok | ✅ |
| 5 | Serial Management | 📝 Phase 3 |
| 6 | Proses Perbaikan Saldo | 📝 Phase 3 |
| 7 | Transfer Gudang | 📝 Phase 3 |
| 8 | Transfer Beda Cabang | 📝 Phase 3 |
| 9 | Export/Import | 📝 Phase 2 |

### Akuntansi — 📝 Phase 4

| # | Fitur |
|---|-------|
| 1 | COA / Daftar Akun |
| 2 | Kas Masuk/Keluar/Transfer |
| 3 | Deposit Pelanggan/Supplier |
| 4 | Jurnal (double-entry) |
| 5 | Buku Besar |
| 6 | Saldo Awal Perkiraan |
| 7 | Saldo Awal Hutang Piutang |
| 8 | Setting Perkiraan |
| 9 | Neraca Saldo + Lajur |
| 10 | Neraca Perusahaan |
| 11 | Laba Rugi + YTD |
| 12 | Proses Tutup Tahun |

### Laporan

| # | Fitur | Status |
|---|-------|--------|
| 1 | Master Data (Item, Supplier, Pelanggan, Sales) | 🔧 Sebagian ada |
| 2 | Laporan Pembelian & Retur | 🔧 Sebagian ada |
| 3 | Laporan Konsinyasi Masuk | 📝 Phase 5 |
| 4 | Laporan Penjualan & Retur | ✅ |
| 5 | Laporan Konsinyasi Keluar | 📝 Phase 5 |
| 6 | Penjualan per Supplier | 📝 Laporan baru |
| 7 | Komisi Sales | 📝 Phase 4 |
| 8 | CSV Faktur Pajak | 📝 Phase 1 |
| 9 | Laporan Perakitan | 📝 Phase 5 |
| 10 | Hutang Piutang (Umur, Beredar, Mutasi) | 🔧 Sebagian ada |
| 11 | Laporan Persediaan | 🔧 Sebagian ada |
| 12 | Laporan Akuntansi (COA, Kas, Jurnal, Buku Besar, Neraca, Laba Rugi) | 📝 Phase 4 |
| 13 | Analisa Laba per Item | ✅ |
| 14 | Analisa Jurnal Tidak Seimbang | 📝 Phase 4 |

### Pengaturan

| # | Fitur | Status |
|---|-------|--------|
| 1 | Multi User & Role | 📝 Phase 1 |
| 2 | Data Perusahaan | ✅ |
| 3 | Pengaturan Umum | ✅ |
| 4 | Pengaturan Nomor Transaksi | 📝 Phase 1 |
| 5 | Mini Printer | 📝 Phase 1 |
| 6 | Customer Display | 📝 Phase 1 |
| 7 | Tema Window | ➖ Tidak prioritas |
| 8 | Import Excel | 📝 Phase 2 |
| 9 | Import dari iPos 3.x/4.x | ➖ Tidak relevan |
| 10 | Backup & Restore | ✅ |
| 11 | Pengaturan Database | ➖ Cukup path default |
| 12 | Vacuum & Reindex | 📝 Phase 5 |

---

## Coverage Summary

| Kategori | Total Fitur IPOS | Sudah | Belum | % Done |
|----------|-----------------|-------|-------|--------|
| Master Data | 16 | 9 | 7 | 56% |
| Pembelian | 8 | 5 | 3 | 63% |
| Konsinyasi Masuk | 5 | 0 | 5 | 0% |
| Konsinyasi Keluar | 6 | 0 | 6 | 0% |
| Penjualan | 14 | 7 | 7 | 50% |
| Perakitan | 3 | 0 | 3 | 0% |
| Persediaan | 9 | 5 | 4 | 56% |
| Akuntansi | 12 | 0 | 12 | 0% |
| Laporan | 14 | 5 | 9 | 36% |
| Pengaturan | 12 | 4 | 8 | 33% |
| **TOTAL** | **~99 fitur** | **~40** | **~59** | **~40%** |

---

## Struktur Direktori Baru

```
src/
  ├── layouts/
  │   ├── DesktopLayout.jsx      # Sidebar + multi-panel + shortcut keyboard
  │   ├── MobileLayout.jsx       # Tab bar bawah + single column + FAB
  │   └── usePlatform.js         # Deteksi platform, return layout variant
  ├── pages/
  │   ├── shared/                 # Halaman yang dipakai kedua platform
  │   │   ├── Transaksi.jsx, Produk.jsx, Dashboard.jsx
  │   │   ├── Pembelian.jsx, Customer.jsx, Supplier.jsx
  │   │   ├── HutangPiutang.jsx, Pesanan.jsx, Promo.jsx
  │   │   ├── Laporan.jsx, Keuangan.jsx, Qris.jsx
  │   │   ├── Shift.jsx, StockOpname.jsx, Riwayat.jsx
  │   │   └── BackupRestore.jsx, Log.jsx, Profile.jsx, TokoSetup.jsx
  │   └── desktop/                # Halaman spesifik desktop
  │       ├── UserManagement.jsx  # Phase 1
  │       ├── ImportExport.jsx    # Phase 2
  │       ├── Gudang.jsx          # Phase 3
  │       ├── SerialManagement.jsx# Phase 3
  │       ├── Akuntansi.jsx       # Phase 4
  │       ├── BukuBesar.jsx       # Phase 4
  │       ├── Neraca.jsx          # Phase 4
  │       ├── Sales.jsx           # Phase 4
  │       ├── Deposit.jsx         # Phase 4
  │       ├── TukarTambah.jsx     # Phase 4
  │       ├── Konsinyasi*.jsx     # Phase 5
  │       ├── Perakitan.jsx       # Phase 5
  │       └── DatabaseMaintenance.jsx # Phase 5
  ├── components/
  │   ├── shared/                 # Komponen UI bersama
  │   ├── desktop/                # Komponen spesifik desktop
  │   │   ├── Sidebar.jsx         # Navigasi sidebar
  │   │   ├── SplitPane.jsx       # Daftar + detail
  │   │   ├── ShortcutHint.jsx    # Petunjuk shortcut
  │   │   ├── LoginGate.jsx       # Phase 1
  │   │   └── CustomerDisplay.jsx # Phase 1
  │   └── mobile/                 # Komponen spesifik mobile
  │       ├── BottomNav.jsx
  │       └── BottomSheet.jsx
  └── App.jsx                     # Router + platform detection

src-tauri/src/commands/
  ├── produk_cmd.rs, transaksi_cmd.rs, customer_cmd.rs   (exists)
  ├── supplier_cmd.rs, hutang_piutang_cmd.rs, pesanan_cmd.rs   (exists)
  ├── shift_cmd.rs, pin_cmd.rs, kas_cmd.rs, qris_cmd.rs   (exists)
  ├── dashboard_cmd.rs, file_cmd.rs, log_cmd.rs   (exists)
  ├── kategori_cmd.rs, qris_profile_cmd.rs, qris_util_cmd.rs   (exists)
  ├── harga_supplier_cmd.rs, cashbox_cmd.rs   (exists)
  ├── printer_cmd.rs              # Phase 1
  ├── user_cmd.rs                 # Phase 1
  ├── nomor_cmd.rs                # Phase 1
  ├── pajak_cmd.rs                # Phase 1
  ├── import_export_cmd.rs        # Phase 2
  ├── pengiriman_cmd.rs           # Phase 2
  ├── master_cmd.rs               # Phase 2
  ├── gudang_cmd.rs               # Phase 3
  ├── serial_cmd.rs               # Phase 3
  ├── akuntansi_cmd.rs            # Phase 4
  ├── sales_cmd.rs                # Phase 4
  ├── point_cmd.rs                # Phase 4
  ├── deposit_cmd.rs              # Phase 4
  ├── tukar_tambah_cmd.rs         # Phase 4
  ├── konsinyasi_cmd.rs           # Phase 5
  ├── perakitan_cmd.rs            # Phase 5
  ├── hpp_cmd.rs                  # Phase 5
  └── maintenance_cmd.rs          # Phase 5

src-tauri/migrations/
  ├── 001_init.sql through 014_catatan_harga_supplier.sql  (exists)
  ├── 015_user_role.sql           # Phase 1
  ├── 016_nomor_setting.sql       # Phase 1
  ├── 017_pajak_setting.sql       # Phase 1
  ├── 018_harga_jual_multi.sql    # Phase 2
  ├── 019_pengiriman.sql          # Phase 2
  ├── 020_master_tambahan.sql     # Phase 2
  ├── 021_gudang.sql              # Phase 3
  ├── 022_serial.sql              # Phase 3
  ├── 023_saldo_awal.sql          # Phase 3
  ├── 024_coa.sql                 # Phase 4
  ├── 025_sales_komisi.sql        # Phase 4
  ├── 026_point.sql               # Phase 4
  ├── 027_deposit.sql             # Phase 4
  ├── 028_tukar_tambah.sql        # Phase 4
  ├── 029_konsinyasi_masuk.sql    # Phase 5
  ├── 030_konsinyasi_keluar.sql   # Phase 5
  ├── 031_perakitan_bom.sql       # Phase 5
  ├── 032_stok_batch_hpp.sql      # Phase 5
  └── 033_stok_gudang.sql         # Phase 3
```

---

## Prinsip Pengembangan

1. **Backend Rust first** — Semua logic di Rust, frontend hanya UI + invoke
2. **Layout adapter pattern** — DesktopLayout/MobileLayout bungkus halaman yang sama
3. **Mobile-first CSS** — Global style: mobile default, desktop override via `@media (min-width: 768px)`
4. **Keyboard shortcuts** — Desktop: `useEffect` global `keydown` listener
5. **Test** — `cargo test` untuk Rust, smoke test manual untuk UI
6. **Migration idempotent** — `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS`
7. **Naming** — Rust: snake_case, JSX: PascalCase, Migration: `NNN_nama_fitur.sql`
8. **Desktop target** — Windows 7, 8, 10, 11 (MSVC) + Linux AppImage (x86_64)
9. **Android target** — tetap, APK private app data
10. **JSON columns** — Untuk data fleksibel (satuan_multi, diskon_lapisan), hindari tabel relasi berlebih

## YAGNI — Tidak akan dikerjakan

- Cloud sync / server online
- E-commerce marketplace sync (Tokopedia, Shopee)
- Manufaktur besar / MRP
- Payroll / HR / absensi
- Multi bahasa / i18n
- PWA / web deploy
- Import dari iPos 3.x/4.x
- Tema window / ganti background
- Pembayaran kartu kredit online
