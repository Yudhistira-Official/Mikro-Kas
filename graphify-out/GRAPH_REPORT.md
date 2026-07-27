# Graph Report - .  (2026-07-27)

## Corpus Check
- 197 files · ~118,761 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1027 nodes · 3054 edges · 58 communities (52 shown, 6 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.69)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- React Entry and Route Configuration
- Customer Deposit and Balance Management
- Coding Guidelines and Project Rules
- UI Layout and Navigation Components
- Node Package Dependencies
- Core Transaction Operations
- Store Profile Management
- QRIS Dynamic Payment Commands
- QRIS Metadata and QR Generator Engine
- Tauri Application Configurations and Icons
- Customer Data Management
- Dashboard Reports and Sales Summary
- Konsinyasi (Consignment) Operations
- Hutang Piutang (Accounts Payable/Receivable)
- Cash Register/Kas Management
- Customer Purchase Orders
- QRIS Account Profiles
- Tauri App Capabilities Permissions
- Warehouse/Gudang Inventory Management
- Supplier Directory Management
- Double-Entry Accounting and General Journal
- Cashbox Mutasi Operations
- Supplier Price Records
- Sales Commissions and Referrals
- Database Backup and File Utilities
- Thermal Struk Printing (ESC/POS)
- Multi-User Authorization and User Logs
- Product Categories (Kategori)
- Master Reference Data (Banks/Brands/Expeditions)
- Product Assemblies and BOM (Bill of Materials)
- FIFO/LIFO Cost of Goods Sold (HPP) Engine
- Customer Loyalty Points Settings
- QRIS Code Decoders and Native Scanners
- Cashier Shift Logs
- Tukar Tambah (Trade-in) Transactions
- Global UI Error Boundary Capture
- Transaction Serial Numbers Generator
- Product Shipping and Courier Log
- Database Connection and Init Engine
- PPN Taxation Settings and Calculations
- Multi-Tier Price and Discount Formulas
- Page Layouts and Sidebar Navigation
- Tauri Customer Display Integration
- PDF Export and File Open Plugin
- SVG Barcode Code128 Encoder Utility
- CRC16 CCITT Verification Unit Tests
- Database Resolution and Safety Fallbacks
- Application Logo Header
- Tauri SVG Icon Asset
- Vite SVG Icon Asset
- Tauri PNG Icon Package Assets

## God Nodes (most connected - your core abstractions)
1. `DbState` - 216 edges
2. `invoke()` - 103 edges
3. `useToast()` - 86 edges
4. `rupiah()` - 55 edges
5. `useSearchFilter()` - 46 edges
6. `PageShell()` - 42 edges
7. `DataPanel()` - 42 edges
8. `InfoNote()` - 41 edges
9. `DataTable()` - 35 edges
10. `StatusBadge()` - 35 edges

## Surprising Connections (you probably didn't know these)
- `Single SQLite Transaction for Stock Update + Reversal Insert` --semantically_similar_to--> `Idempotent Migration Pattern (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS)`  [INFERRED] [semantically similar]
  docs/superpowers/plans/2026-07-26-riwayat-stok-search-reversal-plan.md → AGENTS.md
- `Violet/Cyan/Amber Design Tokens` --conceptually_related_to--> `DesktopLayout: Sidebar + Header + Split-pane`  [INFERRED]
  README.md → Planning.md
- `Laporan()` --references--> `jspdf`  [EXTRACTED]
  src/pages/Laporan.jsx → package.json
- `~40 Implemented Features Inventory` --conceptually_related_to--> `HPP FIFO/LIFO Engine`  [EXTRACTED]
  Planning.md → README.md
- `Riwayat Stok Reversal: Delta-based Audit Reversal` --conceptually_related_to--> `Sidebar Feature Search`  [EXTRACTED]
  docs/superpowers/specs/2026-07-26-riwayat-stok-search-reversal-design.md → README.md

## Import Cycles
- 2-file cycle: `src-tauri/src/qris/mod.rs -> src-tauri/src/qris/parser.rs -> src-tauri/src/qris/mod.rs`

## Hyperedges (group relationships)
- **Riwayat Stok Reversal Feature (Design + Plan + Schema + Rules)** — docs_design_reversal_feature, docs_plan_implementation_plan, docs_design_reverse_of_id_schema, docs_design_48hour_rule, docs_design_admin_pin_override, docs_design_immutable_audit_trail, docs_design_delta_math_rationale, docs_plan_reversal_unit_test, docs_plan_reversal_atomic_transaction, docs_design_auth_session_ponytail [EXTRACTED 1.00]
- **Multi-Platform Layout System (Desktop + Mobile)** — planning_multiplatform_architecture_diagram, planning_desktop_layout_detail, planning_mobile_layout_detail, planning_platform_detection, planning_sidebar_algorithm_detail, planning_keyboard_shortcuts_map, planning_phase_0_desktop_foundation [EXTRACTED 1.00]
- **MikroKas Version History and Evolution** — changelog_v1_0_0, changelog_v2_0_0, changelog_v3_0_0, readme_mikrokas, planning_40_implemented_features, planning_7_phase_roadmap [EXTRACTED 1.00]

## Communities (58 total, 6 thin omitted)

### Community 0 - "React Entry and Route Configuration"
Cohesion: 0.07
Nodes (120): App(), getEarlyErrors(), installErrorDiagnostics(), jslog(), NOTE: Setiap halaman dimuat secara LAZY agar modul berat, RouteTracker(), AdvancedCrudPage(), DateField() (+112 more)

### Community 1 - "Customer Deposit and Balance Management"
Cohesion: 0.06
Nodes (86): Deposit, DepositLog, get_or_create_deposit(), gunakan_deposit(), list_deposit_log(), Option, Result, State (+78 more)

### Community 2 - "Coding Guidelines and Project Rules"
Cohesion: 0.06
Nodes (45): bcrypt Password Hashing for Multi-User, AGENTS.md: Coding Standards and AI Agent Instructions, Idempotent Migration Pattern (IF NOT EXISTS, ADD COLUMN IF NOT EXISTS), JS/React: PascalCase components, camelCase functions/utilities, No unwrap() in Production Rust Code, Rust: snake_case, PascalCase structs, SCREAMING_SNAKE constants, SQL: snake_case tables/columns, NNN_nama_fitur.sql migrations, v1.0.0: Initial Setup (Tauri v2, React, Vite, Rust, SQLite) (+37 more)

### Community 3 - "UI Layout and Navigation Components"
Cohesion: 0.10
Nodes (31): BarcodeScanner(), writeLog(), menuSections, SECTION_ICONS, Sidebar(), PinGate(), useHardwareScanner(), DesktopLayout() (+23 more)

### Community 4 - "Node Package Dependencies"
Cohesion: 0.05
Nodes (39): jspdf, jsqr, dependencies, jspdf, jsqr, react, react-dom, react-router-dom (+31 more)

### Community 5 - "Core Transaction Operations"
Cohesion: 0.19
Nodes (36): apply_retur_forward(), buat_transaksi_pembelian(), buat_transaksi_penjualan(), delete_transaksi_penjualan(), edit_transaksi_penjualan(), get_retur_detail(), get_transaksi_detail(), insert_retur_items() (+28 more)

### Community 6 - "Store Profile Management"
Cohesion: 0.14
Nodes (25): get_toko(), AppHandle, Option, Result, State, String, save_toko(), save_toko_foto() (+17 more)

### Community 7 - "QRIS Dynamic Payment Commands"
Cohesion: 0.18
Nodes (23): cek_status_qris(), expire_qris(), generate_qris_dinamis(), konfirmasi_bayar_qris(), list_qris_log(), prune_old_qris_logs(), QrisLogEntry, QrisResult (+15 more)

### Community 8 - "QRIS Metadata and QR Generator Engine"
Cohesion: 0.20
Nodes (22): generate_qr_image_base64(), konversi_ke_dinamis(), konversi_ke_dinamis_dengan_fee(), parse_metadata(), QrisError, QrisMetadata, Option, Result (+14 more)

### Community 9 - "Tauri Application Configurations and Icons"
Cohesion: 0.09
Nodes (22): icons/128x128@2x.png, icons/128x128.png, icons/32x32.png, icons/icon.icns, icons/icon.ico, app, security, windows (+14 more)

### Community 10 - "Customer Data Management"
Cohesion: 0.24
Nodes (21): create_customer(), delete_customer(), get_customer(), get_laporan_pelanggan(), import_customer_csv(), ImportCustomerResult, LaporanPelangganRow, list_customer() (+13 more)

### Community 11 - "Dashboard Reports and Sales Summary"
Cohesion: 0.27
Nodes (20): get_keuntungan_penjualan(), get_penjualan_harian(), get_produk_terlaris(), get_recent_transactions(), get_ringkasan(), get_total_retur(), get_transaksi_count(), KeuntunganPenjualan (+12 more)

### Community 12 - "Konsinyasi (Consignment) Operations"
Cohesion: 0.37
Nodes (18): create_konsinyasi_keluar(), create_konsinyasi_masuk(), KonsinyasiItem, KonsinyasiItemInput, KonsinyasiKeluar, KonsinyasiKeluarInput, KonsinyasiMasuk, KonsinyasiMasukInput (+10 more)

### Community 13 - "Hutang Piutang (Accounts Payable/Receivable)"
Cohesion: 0.23
Nodes (16): bayar_hutang_piutang(), create_hutang_piutang(), delete_hutang_piutang(), list_hutang_piutang(), map_row(), Option, Result, Row (+8 more)

### Community 14 - "Cash Register/Kas Management"
Cohesion: 0.22
Nodes (16): create_kas(), delete_kas(), get_ringkasan_kas(), list_kas(), map_kas_row(), Option, Result, Row (+8 more)

### Community 15 - "Customer Purchase Orders"
Cohesion: 0.25
Nodes (16): create_pesanan_customer(), delete_pesanan_customer(), get_pesanan_customer(), list_pesanan_customer(), map_pesanan(), Option, Result, Row (+8 more)

### Community 16 - "QRIS Account Profiles"
Cohesion: 0.25
Nodes (16): delete_qris_profile(), get_active_qris_profile(), list_qris_profile(), row_to_profile(), Option, Result, Row, State (+8 more)

### Community 17 - "Tauri App Capabilities Permissions"
Cohesion: 0.12
Nodes (16): core:default, core:window:allow-is-fullscreen, core:window:allow-set-fullscreen, dialog:allow-open, dialog:allow-save, dialog:default, fs:allow-read, fs:default (+8 more)

### Community 18 - "Warehouse/Gudang Inventory Management"
Cohesion: 0.36
Nodes (16): create_gudang(), delete_gudang(), get_stok_per_gudang(), Gudang, list_gudang(), list_transfer_stok(), Option, Result (+8 more)

### Community 19 - "Supplier Directory Management"
Cohesion: 0.29
Nodes (15): create_supplier(), delete_supplier(), get_supplier(), list_supplier(), map_row(), Result, Row, State (+7 more)

### Community 20 - "Double-Entry Accounting and General Journal"
Cohesion: 0.38
Nodes (15): cek_jurnal_tidak_seimbang(), Coa, CoaInput, create_coa(), create_jurnal_manual(), get_neraca_saldo(), JurnalLine, JurnalTidakSeimbang (+7 more)

### Community 21 - "Cashbox Mutasi Operations"
Cohesion: 0.28
Nodes (14): create_cashbox(), list_cashbox(), list_cashbox_mutasi(), mutasi_cashbox(), Option, Result, State, String (+6 more)

### Community 22 - "Supplier Price Records"
Cohesion: 0.27
Nodes (13): create_catatan_harga_supplier(), delete_catatan_harga_supplier(), list_catatan_harga_supplier(), map_row(), Result, Row, State, String (+5 more)

### Community 23 - "Sales Commissions and Referrals"
Cohesion: 0.38
Nodes (14): bayar_komisi(), create_sales(), delete_sales(), KomisiTerutang, list_komisi_terutang(), list_sales(), Option, Result (+6 more)

### Community 24 - "Database Backup and File Utilities"
Cohesion: 0.48
Nodes (13): backup_database(), backup_database_to(), copy_database_to(), database_path(), export_database_base64(), restore_database(), restore_database_base64(), AppHandle (+5 more)

### Community 25 - "Thermal Struk Printing (ESC/POS)"
Cohesion: 0.35
Nodes (13): build_escpos_payload(), build_struk_text(), default_candidates(), format_rupiah(), list_printer_candidates(), print_struk(), PrinterCandidate, Option (+5 more)

### Community 26 - "Multi-User Authorization and User Logs"
Cohesion: 0.41
Nodes (13): create_user(), CreateUserRequest, deactivate_user(), list_users(), log_user_action(), login_user(), reset_password(), Option (+5 more)

### Community 27 - "Product Categories (Kategori)"
Cohesion: 0.36
Nodes (11): create_kategori(), delete_kategori(), list_kategori(), Result, State, String, Vec, update_kategori() (+3 more)

### Community 28 - "Master Reference Data (Banks/Brands/Expeditions)"
Cohesion: 0.45
Nodes (12): create_master_bank(), create_master_ekspedisi(), create_master_merek(), list_master_bank(), list_master_ekspedisi(), list_master_merek(), MasterItem, Option (+4 more)

### Community 29 - "Product Assemblies and BOM (Bill of Materials)"
Cohesion: 0.37
Nodes (12): Bom, BomInput, create_bom(), list_bom(), Perakitan, PerakitanInput, proses_perakitan(), Option (+4 more)

### Community 30 - "FIFO/LIFO Cost of Goods Sold (HPP) Engine"
Cohesion: 0.39
Nodes (11): add_stok_batch(), hitung_hpp_fifo(), hitung_hpp_lifo(), HppResult, Option, Result, State, String (+3 more)

### Community 31 - "Customer Loyalty Points Settings"
Cohesion: 0.44
Nodes (11): get_point_setting(), get_saldo_point(), PointSetting, PointSettingInput, Option, Result, State, String (+3 more)

### Community 32 - "QRIS Code Decoders and Native Scanners"
Cohesion: 0.44
Nodes (9): QrisScanner(), boundedDimensions(), decodeQrImage(), errorText(), fileSignature(), loadImage(), loadSource(), logDecode() (+1 more)

### Community 33 - "Cashier Shift Logs"
Cohesion: 0.45
Nodes (10): buka_shift(), BukaShiftInput, list_shift(), Option, Result, State, String, Vec (+2 more)

### Community 34 - "Tukar Tambah (Trade-in) Transactions"
Cohesion: 0.42
Nodes (10): create_tukar_tambah(), list_tukar_tambah(), Option, Result, State, String, Vec, TukarTambah (+2 more)

### Community 36 - "Transaction Serial Numbers Generator"
Cohesion: 0.44
Nodes (9): generate_nomor(), list_nomor_settings(), NomorSetting, Result, State, String, Vec, update_nomor_setting() (+1 more)

### Community 37 - "Product Shipping and Courier Log"
Cohesion: 0.42
Nodes (9): create_pengiriman(), list_pengiriman(), Pengiriman, Option, Result, State, String, Vec (+1 more)

### Community 38 - "Database Connection and Init Engine"
Cohesion: 0.39
Nodes (8): Connection, ensure_column(), ensure_dir(), init_db(), Mutex, PathBuf, Result, String

### Community 39 - "PPN Taxation Settings and Calculations"
Cohesion: 0.50
Nodes (8): get_pajak_setting(), hitung_ppn(), PajakSetting, PpnResult, Result, State, String, update_pajak_setting()

### Community 40 - "Multi-Tier Price and Discount Formulas"
Cohesion: 0.33
Nodes (8): get_harga_jual(), hitung_diskon_bertingkat(), Option, Result, State, String, Vec, SatuanRule

### Community 41 - "Page Layouts and Sidebar Navigation"
Cohesion: 0.32
Nodes (4): navItems, LogoMark(), MobileLayout(), navItems

### Community 42 - "Tauri Customer Display Integration"
Cohesion: 0.39
Nodes (7): CustomerDisplayData, CustomerDisplayItem, get_customer_display_data(), Result, State, String, Vec

### Community 43 - "PDF Export and File Open Plugin"
Cohesion: 0.40
Nodes (5): PluginHandle, R, init(), PdfOpener, TauriPlugin

### Community 44 - "SVG Barcode Code128 Encoder Utility"
Cohesion: 0.50
Nodes (4): code128Encode(), CODE_B, generateBarcodeSVG(), PATTERNS

### Community 45 - "CRC16 CCITT Verification Unit Tests"
Cohesion: 0.83
Nodes (3): crc16_ccitt(), test_crc16_consistency(), test_crc16_known_value()

## Knowledge Gaps
- **92 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+87 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `DbState` connect `Customer Deposit and Balance Management` to `Core Transaction Operations`, `Store Profile Management`, `QRIS Dynamic Payment Commands`, `Customer Data Management`, `Dashboard Reports and Sales Summary`, `Konsinyasi (Consignment) Operations`, `Hutang Piutang (Accounts Payable/Receivable)`, `Cash Register/Kas Management`, `Customer Purchase Orders`, `QRIS Account Profiles`, `Warehouse/Gudang Inventory Management`, `Supplier Directory Management`, `Double-Entry Accounting and General Journal`, `Cashbox Mutasi Operations`, `Supplier Price Records`, `Sales Commissions and Referrals`, `Database Backup and File Utilities`, `Thermal Struk Printing (ESC/POS)`, `Multi-User Authorization and User Logs`, `Product Categories (Kategori)`, `Master Reference Data (Banks/Brands/Expeditions)`, `Product Assemblies and BOM (Bill of Materials)`, `FIFO/LIFO Cost of Goods Sold (HPP) Engine`, `Customer Loyalty Points Settings`, `Cashier Shift Logs`, `Tukar Tambah (Trade-in) Transactions`, `Transaction Serial Numbers Generator`, `Product Shipping and Courier Log`, `Database Connection and Init Engine`, `PPN Taxation Settings and Calculations`, `Multi-Tier Price and Discount Formulas`, `Tauri Customer Display Integration`?**
  _High betweenness centrality (0.318) - this node is a cross-community bridge._
- **Why does `Laporan()` connect `React Entry and Route Configuration` to `Node Package Dependencies`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _92 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `React Entry and Route Configuration` be split into smaller, more focused modules?**
  _Cohesion score 0.0651559934318555 - nodes in this community are weakly interconnected._
- **Should `Customer Deposit and Balance Management` be split into smaller, more focused modules?**
  _Cohesion score 0.0593505039193729 - nodes in this community are weakly interconnected._
- **Should `Coding Guidelines and Project Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.06161616161616162 - nodes in this community are weakly interconnected._
- **Should `UI Layout and Navigation Components` be split into smaller, more focused modules?**
  _Cohesion score 0.10452961672473868 - nodes in this community are weakly interconnected._