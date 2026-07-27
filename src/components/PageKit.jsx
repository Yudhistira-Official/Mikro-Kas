import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * PageShell — wrapper standar semua halaman MikroKas.
 *
 * Parameters:
 * - `eyebrow`: label kategori kecil di atas judul (contoh: "MASTER DATA")
 * - `title`: judul halaman
 * - `description`: penjelasan fungsi halaman agar user paham tanpa panduan
 * - `actions`: node tombol aksi utama di kanan header
 * - `stats`: array { label, value, icon, tone, onClick } untuk kartu ringkasan
 *   Jika onClick disediakan, kartu akan memiliki kursor pointer dan bisa diklik.
 * - `children`: konten halaman
 */
export function PageShell({ eyebrow, title, description, actions, stats = [], children }) {
  return (
    <div className="sales-page">
      <header className="sales-page__header">
        <div>
          {eyebrow && <p className="sales-page__eyebrow">{eyebrow}</p>}
          <h1 className="text-headline-lg">{title}</h1>
          {description && <p className="text-body-md sales-page__subtitle">{description}</p>}
        </div>
        {actions && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{actions}</div>}
      </header>

      {stats.length > 0 && (
        <section className="sales-stats">
          {stats.map((stat) => (
            <div
              className="sales-stat-card"
              key={stat.label}
              onClick={stat.onClick}
              style={stat.onClick ? { cursor: "pointer" } : undefined}
            >
              <span className="material-symbols-outlined" style={stat.tone ? { color: stat.tone } : undefined}>
                {stat.icon || "insights"}
              </span>
              <div>
                <span>{stat.label}</span>
                <strong>{stat.value}</strong>
              </div>
            </div>
          ))}
        </section>
      )}

      {children}
    </div>
  );
}

/**
 * DataPanel — panel daftar dengan toolbar pencarian dan tombol refresh.
 *
 * Parameters:
 * - `searchValue` / `onSearch`: kontrol input pencarian
 * - `searchPlaceholder`: petunjuk pencarian
 * - `onRefresh`: callback muat ulang data
 * - `toolbarExtra`: node tambahan pada toolbar
 * - `loading`: tampilkan spinner
 * - `isEmpty`: tampilkan empty state
 * - `emptyIcon` / `emptyTitle` / `emptyHint`: isi empty state
 */
export function DataPanel({
  searchValue,
  onSearch,
  searchPlaceholder = "Cari data...",
  onRefresh,
  toolbarExtra,
  loading = false,
  isEmpty = false,
  emptyIcon = "inbox",
  emptyTitle = "Belum ada data",
  emptyHint,
  children,
}) {
  return (
    <section className="sales-panel">
      {(onSearch || onRefresh || toolbarExtra) && (
        <div className="sales-panel__toolbar">
          {onSearch && (
            <div className="sales-search">
              <span className="material-symbols-outlined">search</span>
              <input value={searchValue} onChange={(event) => onSearch(event.target.value)} placeholder={searchPlaceholder} />
            </div>
          )}
          {toolbarExtra}
          {onRefresh && (
            <button className="btn-secondary" type="button" onClick={onRefresh}>
              <span className="material-symbols-outlined">refresh</span>
              Muat ulang
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="loading-page"><div className="spinner" /></div>
      ) : isEmpty ? (
        <div className="empty-state">
          <span className="material-symbols-outlined">{emptyIcon}</span>
          <p>{emptyTitle}</p>
          {emptyHint && <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>{emptyHint}</p>}
        </div>
      ) : (
        children
      )}
    </section>
  );
}

/**
 * DataTable — tabel data dengan kolom deklaratif.
 *
 * Parameters:
 * - `columns`: array { key, label, align, render }
 * - `rows`: array data
 * - `rowKey`: fungsi penentu key baris
 */
export function DataTable({ columns, rows, rowKey }) {
  return (
    <div className="sales-table-wrap">
      <table className="sales-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} style={column.align ? { textAlign: column.align } : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={rowKey ? rowKey(row, index) : index}>
              {columns.map((column) => (
                <td key={column.key} style={column.align ? { textAlign: column.align } : undefined}>
                  {column.render ? column.render(row, index) : row[column.key] ?? "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * FormModal — modal form standar dengan header penjelas dan aksi simpan.
 */
export function FormModal({ title, description, onClose, onSubmit, submitLabel = "Simpan", submitting = false, children }) {
  // Escape menutup modal hanya saat tidak ada aksi simpan yang sedang berjalan.
  const handleEscape = useCallback((event) => {
    if (event.key === "Escape" && !submitting) {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }, [onClose, submitting]);

  useEffect(() => {
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [handleEscape]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content sales-form-modal" onClick={(event) => event.stopPropagation()}>
        <div className="sales-modal__header">
          <div>
            <h2 className="text-headline-md">{title}</h2>
            {description && <p className="text-body-md">{description}</p>}
          </div>
          <button className="btn-icon" type="button" onClick={onClose} aria-label="Tutup">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <form className="sales-form" onSubmit={onSubmit}>
          {children}
          <div className="sales-form__actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Batal</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? "Menyimpan..." : submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * InfoNote — penjelasan singkat cara memakai fitur.
 */
export function InfoNote({ children, icon = "info" }) {
  return (
    <div className="store-profile-help">
      <span className="material-symbols-outlined">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * StatusBadge — label status seragam.
 */
export function StatusBadge({ label, tone = "neutral" }) {
  const palette = {
    neutral: { background: "var(--color-surface-container-high)", color: "var(--color-text-secondary)" },
    primary: { background: "var(--color-primary-fixed)", color: "var(--color-primary)" },
    success: { background: "rgba(16,185,129,0.16)", color: "#047857" },
    warning: { background: "rgba(245,158,11,0.18)", color: "#92400E" },
    danger: { background: "rgba(239,68,68,0.16)", color: "#B91C1C" },
  };
  return <span className="badge" style={palette[tone] || palette.neutral}>{label}</span>;
}

/**
 * useSearchFilter — filter daftar berdasarkan beberapa field.
 *
 * Parameters:
 * - `rows`: data sumber
 * - `fields`: fungsi pengambil teks pencarian per baris
 */
export function useSearchFilter(rows, fields) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => fields(row).toLowerCase().includes(term));
  }, [rows, query, fields]);
  return { query, setQuery, filtered };
}

/**
 * rupiah — format angka ke mata uang rupiah.
 */
export const rupiah = (value) => `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
