-- Migration 033: link reversal audit rows to their original stock adjustment.
-- Original audit rows remain immutable; reverse_of_id prevents duplicate reversal.
ALTER TABLE stock_adjustment ADD COLUMN reverse_of_id INTEGER REFERENCES stock_adjustment(id);
CREATE INDEX IF NOT EXISTS idx_stock_adj_reverse_of ON stock_adjustment(reverse_of_id);
