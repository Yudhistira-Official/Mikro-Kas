# Kasir Enter Search Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Saat pencarian kasir berisi SKU/teks dan user menekan Enter, pilih hasil pertama, tambah ke keranjang, kosongkan pencarian, lalu fokuskan kembali field tanpa mengubah state transaksi lain.

**Architecture:** Perubahan terisolasi di `Transaksi.jsx`. Input pencarian memakai ref untuk fokus, handler Enter memilih `produk[0]` dari hasil query aktif, memanggil handler tambah produk yang sudah ada, lalu mengosongkan pencarian hanya setelah produk ditemukan. Pencarian kosong tidak memicu aksi; hasil kosong memunculkan toast dan mempertahankan teks.

**Tech Stack:** React hooks, Tauri IPC yang sudah ada, Vite.

## Global Constraints

- Pertahankan keranjang.
- Pertahankan form customer, sales, diskon, dan pembayaran.
- Reset hanya field pencarian setelah berhasil.
- Pesan hasil kosong harus `Barang tidak ada`.
- Jangan ubah perilaku klik produk atau scan barcode.
- Jangan menambah dependency.

---

### Task 1: Implement Enter behavior in cashier search

**Files:**
- Modify: `src/pages/Transaksi.jsx:47-73, 500-525` — search state/ref and input event handling.
- Test: manual smoke test via running application; no frontend test runner exists in `package.json`.

**Interfaces:**
- Consumes: existing `produk`, `search`, `setSearch`, `add`, and `addToast` in `Transaksi.jsx`.
- Produces: Enter behavior on the existing cashier search input.

- [x] **Step 1: Add a search input ref beside existing cashier state**

```jsx
const searchInputRef = useRef(null);
```

Keep it next to the existing `gridRef`/search state so the ref remains stable across renders.

- [x] **Step 2: Add an Enter handler using the active product list**

```jsx
const handleSearchKeyDown = (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const query = search.trim();
  if (!query) return;
  const product = produk[0];
  if (!product) {
    addToast("Barang tidak ada", "error");
    return;
  }
  add(product);
  setSearch("");
  requestAnimationFrame(() => searchInputRef.current?.focus());
};
```

Use the same `produk` array already rendered by the cashier so the selected item is the visible top result. Do not reset `customerId`, `salesId`, discount, payment, or cart state.

- [x] **Step 3: Attach the ref and handler to the existing search input**

```jsx
<input
  ref={searchInputRef}
  ...
  onKeyDown={handleSearchKeyDown}
/>
```

Preserve the existing `onChange`, scanner attributes, placeholder, and other props.

- [ ] **Step 4: Verify the implementation manually**

Run the app with:

```bash
npm run tauri dev
```

Check:

1. Empty search + Enter: no toast, no cart change.
2. Valid SKU + Enter: first result added, search cleared, focus returns to search.
3. Valid text + Enter: top visible result added, search cleared.
4. Unknown text + Enter: toast exactly `Barang tidak ada`, search text remains.
5. Customer, sales, discount, payment, and existing cart remain unchanged after successful add.
6. Clicking a product and scanning a barcode retain existing behavior.

- [ ] **Step 5: Run build verification**

```bash
npm run build
```

Expected: exit code 0. Existing chunk-size warning is acceptable if no build error occurs.

---

## Self-review checklist

- Empty input is explicitly ignored.
- Valid input selects `produk[0]`, preserving the existing displayed search ordering.
- Success clears only `search` and restores focus.
- No-result input shows the required toast and preserves text.
- Existing cart and payment/customer/sales/discount state are untouched.
- No backend or dependency changes are required.
