# Daftar Penjualan Sales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `sales_id` to transaksi, optional sales dropdown in POS checkout, and "Daftar Penjualan" tab in SalesKomisi showing daily sales-per-salesperson report.

**Architecture:** 
- DB: `ensure_column transaksi.sales_id` nullable
- Backend: `buat_transaksi_penjualan` accepts `sales_id: Option<i64>`; new `list_penjualan_sales` and `summary_penjualan_sales` commands
- Frontend: `<select>` in Transaksi.jsx checkout; new tab in SalesKomisi.jsx with date/shift/sales filters and item-level table

**Tech Stack:** Rust (rusqlite, tauri), React (hooks, PageKit components)

---

### Task 1: Backend — DB column + modify buat_transaksi_penjualan

**Files:**
- Modify: `src-tauri/src/db.rs` (add ensure_column for sales_id)
- Modify: `src-tauri/src/commands/transaksi_cmd.rs` (add sales_id param)
- Modify: `src-tauri/src/models/transaksi.rs` (add sales_id to Transaksi struct)

- [ ] Add `ensure_column(&conn, "transaksi", "sales_id", "INTEGER REFERENCES sales(id) ON DELETE SET NULL");` to `db.rs` after line 102
- [ ] Add `sales_id: Option<i64>` parameter to `buat_transaksi_penjualan` function signature
- [ ] Modify INSERT to include `sales_id` column when non-None:
  ```rust
  let sales_id_val = sales_id.unwrap_or(0);
  tx.execute(
      "INSERT INTO transaksi (tipe, total, metode_bayar, catatan, pajak_nominal, biaya_layanan, ongkir, sales_id)
       VALUES ('penjualan', ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params![total_final, metode_bayar, catatan_final, pajak, biaya, ongkir_val, 
              sales_id.map_or(Ok(rusqlite::types::Null), |v| Ok(v as i64))],
  )
  ```
  Wait — need to handle Option<i64> properly. Use `?7` with `sales_id` as `Option<i64>` and rusqlite handles it.
  
  Actually, let me think about this more carefully. rusqlite's `params!` macro doesn't handle Option<i64> transparently when the column is INTEGER. Let me use the pattern from other commands. Looking at the existing code... `supplier_id` is used in buat_transaksi_pembelian with `params![total, catatan_final, supplier_id]` where supplier_id is `Option<i64>`. That works because rusqlite handles `Option<i64>` as NULL when None.

  So the INSERT should be:
  ```rust
  tx.execute(
      "INSERT INTO transaksi (tipe, total, metode_bayar, catatan, pajak_nominal, biaya_layanan, ongkir, sales_id)
       VALUES ('penjualan', ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
      params![total_final, metode_bayar, catatan_final, pajak, biaya, ongkir_val, sales_id],
  )
  ```

- [ ] Add `sales_id: Option<i64>` to Transaksi struct in `models/transaksi.rs`
- [ ] Update `list_transaksi` query to include `t.sales_id, sl.nama` via LEFT JOIN sales
- [ ] Update `get_transaksi_detail` similarly
- [ ] Run `cargo build` to verify compilation

### Task 2: Backend — list_penjualan_sales + summary commands

**Files:**
- Modify: `src-tauri/src/commands/transaksi_cmd.rs` (add new commands)
- Modify: `src-tauri/src/lib.rs` (register commands)

- [ ] Add structs:
  ```rust
  #[derive(Debug, Serialize)]
  pub struct PenjualanSalesRow {
      pub no_nota: Option<String>,
      pub pelanggan: Option<String>,
      pub produk_nama: String,
      pub qty: i64,
      pub harga_satuan: i64,
      pub subtotal: i64,
      pub sales_nama: Option<String>,
      pub metode_bayar: String,
  }
  
  #[derive(Debug, Serialize)]
  pub struct SummaryPenjualanSales {
      pub total_tunai: i64,
      pub total_non_tunai: i64,
      pub total_omzet: i64,
  }
  ```

- [ ] Implement `list_penjualan_sales`:
  ```rust
  #[tauri::command]
  pub fn list_penjualan_sales(
      state: State<DbState>,
      tanggal: String,
      sales_id: Option<i64>,
      shift: Option<i64>,
      kasir_id: Option<i64>,
  ) -> Result<Vec<PenjualanSalesRow>, String> {
      let conn = state.0.lock().map_err(|e| e.to_string())?;
      let mut sql = String::from(
          "SELECT r.no_nota, 
                  NULL as pelanggan,
                  p.nama, ti.qty, ti.harga_satuan, ti.subtotal,
                  sl.nama, t.metode_bayar
           FROM transaksi_item ti
           JOIN transaksi t ON t.id = ti.transaksi_id
           JOIN produk p ON p.id = ti.produk_id
           LEFT JOIN sales sl ON sl.id = t.sales_id
           LEFT JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY strftime('%Y-%m', tanggal) ORDER BY id ASC) as no_nota FROM transaksi) r ON r.id = t.id
           WHERE t.tipe = 'penjualan' AND t.tanggal >= ?1 AND t.tanggal <= ?1 || ' 23:59:59'"
      );
      // Add filters dynamically
      ...
  }
  ```

- [ ] Implement `summary_penjualan_sales` with same filters, returning totals
- [ ] Register both commands in `lib.rs`
- [ ] Run `cargo build` to verify

### Task 3: Frontend — Sales dropdown in Kasir checkout

**Files:**
- Modify: `src/pages/Transaksi.jsx`

- [ ] Add `sales` state and load via `invoke("list_sales")` in the `load` function
- [ ] Add sales `<select>` (SearchSelect) next to customer dropdown:
  ```jsx
  <SearchSelect
      value={salesId}
      onChange={setSalesId}
      placeholder="Tanpa sales"
      options={[{ value: "", label: "Tanpa sales" }, ...sales.map(s => ({ value: String(s.id), label: s.nama }))]}
  />
  ```
- [ ] Pass `salesId` in the checkout payload:
  ```jsx
  salesId: salesId ? Number(salesId) : null,
  ```
- [ ] Run `npm run build` to verify

### Task 4: Frontend — Daftar Penjualan tab in SalesKomisi

**Files:**
- Modify: `src/pages/SalesKomisi.jsx`

- [ ] Add tab state: `const [activeTab, setActiveTab] = useState("sales");`
- [ ] Add tab bar with two tabs: "Data Sales" and "Daftar Penjualan"
- [ ] For "Daftar Penjualan" tab:
  - Load sales list via `invoke("list_sales")`
  - Filter form: tanggal (default today), sales dropdown (all), shift dropdown
  - Load `invoke("list_penjualan_sales", { tanggal, salesId, shift: null, kasirId: null })`
  - Load summary: `invoke("summary_penjualan_sales", { ... })`
  - Table: No, No. Nota, Pelanggan, Nama Barang, Qty, Harga Satuan, Total Harga, Sales
  - Footer: Total Tunai, Total Non-Tunai, Total Omzet
- [ ] Run `npm run build` to verify
