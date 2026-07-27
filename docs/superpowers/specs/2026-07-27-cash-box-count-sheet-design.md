# Cash Box Count Sheet per Shift

## Scope

Adapt the Cashbox tab into a cash-count sheet tied to the existing cashier shift. The sheet records the logged-in cashier, shift metadata, opening cash denomination counts, closing physical denomination counts, POS cash sales, and variance. Existing cashbox and shift data remain compatible.

## Data model

Add migration `033_cashbox_pecahan.sql` with `cashbox_pecahan` keyed by `shift_id`, denomination, and coin flag. Store opening and closing quantities for denominations Rp100,000, Rp50,000, Rp20,000, Rp10,000, Rp5,000, Rp2,000, Rp1,000, plus a coin total row. Preserve `shift.saldo_awal`, `shift.saldo_akhir`, `shift.total_penjualan`, and `shift.selisih` as summary fields.

The logged-in user supplies the cashier name automatically; no manual cashier-name field is required. Use the existing authentication/session identity source. The register/box label comes from the selected cashbox.

## Backend

Extend shift/cashbox commands to load shift metadata and denomination rows. Opening counts are stored when a shift opens; closing counts are stored atomically when it closes. Backend calculates:

- opening total: sum of denomination times opening quantity;
- closing physical total: sum of denomination times closing quantity;
- actual cash income: closing total minus opening total;
- POS cash sales for the shift period;
- variance: actual cash income minus POS cash sales.

Reject negative quantities, non-integer quantities, invalid denominations, and opening totals that disagree with the shift opening balance. A closed shift is immutable. Keep fallback display for legacy shifts without denomination rows using existing summary balances. Use a database transaction for count persistence and shift closure.

## Cashbox UI

Replace the generic cashbox mutation-first view with a Cash Box Count Sheet. Select an active or historical shift. Show:

1. Informasi Shift: date, logged-in cashier, cashbox/register, shift name/time.
2. Rincian Modal Awal & Fisik Kas Akhir: denomination, opening quantity, opening subtotal, closing quantity, closing subtotal, and totals.
3. Rekonsiliasi: physical closing total, opening cash, actual cash income, POS cash sales, and variance.
4. Shift active: closing quantity inputs are editable and save through the shift-close flow; opening quantity inputs are editable only while opening the shift. Closed shifts are readonly.

Update totals live. Display variance as Seimbang, Surplus, or Minus. Preserve a compact history selector and refresh behavior. PDF export is out of scope unless an existing export utility can be reused without new dependencies.

## Shift UI

Extend the existing buka/tutup shift forms with denomination entry for opening cash and closing physical count. Continue to show existing shift history columns. Cashier identity is read-only and sourced from login.

## Validation and compatibility

All quantity inputs are integers greater than or equal to zero. Empty values mean zero. Legacy shifts remain viewable. Existing POS sales remain the source of system sales; manual cash mutations do not replace POS reconciliation. Verify denomination arithmetic and variance with runnable tests, then run `cargo test`, `cargo build`, and `npm run build`.
