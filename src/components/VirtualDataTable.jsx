import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * VirtualDataTable — tabel virtual, 1 baris per item.
 * - Header sticky + body grid sejajar
 * - Border hanya antar baris (bukan di tengah teks wrap)
 * - measureElement: tinggi baris dinamis saat nama panjang
 */
export function VirtualDataTable({
  columns,
  rows,
  rowKey,
  sortable,
  sortBy,
  sortOrder,
  onSort,
  height = "min(65vh, 680px)",
  loading = false,
  hasMore = false,
  onEndReached,
  emptyMessage = "Belum ada data",
}) {
  const scrollRef = useRef(null);
  // minmax(0,1fr) default; kolom bisa set width: "120px" | "minmax(140px, 1.5fr)"
  const gridTemplateColumns = columns
    .map((c) => c.width || "minmax(80px, 1fr)")
    .join(" ");

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    // overscan 3: render 3 extra rows above+below viewport.
    // Sebelumnya 8 — terlalu banyak DOM node di-render di luar viewport pada low-end device.
    // 3 cukup untuk scroll mulus tanpa flash, lebih hemat layout cost.
    overscan: 3,
    measureElement:
      typeof ResizeObserver !== "undefined"
        ? (el) => el.getBoundingClientRect().height
        : undefined,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (last && hasMore && last.index >= rows.length - 8) onEndReached?.();
  }, [virtualRows, rows.length, hasMore, onEndReached]);

  // Remeasure saat rows berubah (nama wrap, input stok opname, dll.)
  // Hanya deps rows.length + columns.length — bukan virtualizer object (berubah tiap render)
  // dan bukan rows/columns array reference (juga berubah tiap render pada beberapa parent).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    virtualizer.measure();
  // rows.length dan columns.length cukup sebagai sinyal bahwa struktur tabel berubah
  }, [rows.length, columns.length]);

  const isSortable = (key) =>
    Array.isArray(sortable) ? sortable.includes(key) : Boolean(sortable);

  return (
    <div
      ref={scrollRef}
      className="sales-table-wrap sales-table-wrap--virtual"
      style={{ height, overflow: "auto" }}
    >
      <div className="vdt-table" style={{ minWidth: "100%" }}>
        <div
          className="vdt-head"
          style={{
            display: "grid",
            gridTemplateColumns,
            position: "sticky",
            top: 0,
            zIndex: 2,
            background: "var(--color-surface-container-low)",
            borderBottom: "1px solid var(--color-surface-border)",
          }}
        >
          {columns.map((column) => {
            const canSort = isSortable(column.key);
            const active = sortBy === column.key;
            return (
              <div
                key={column.key}
                className="vdt-th"
                role="columnheader"
                style={{
                  textAlign: column.align || "left",
                  cursor: canSort ? "pointer" : undefined,
                  padding: "10px 12px",
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "var(--color-text-secondary)",
                  minWidth: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
                onClick={canSort && onSort ? () => onSort(column.key) : undefined}
              >
                {column.label}
                {canSort && active && (
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 14, verticalAlign: "middle", marginLeft: 2 }}
                  >
                    {sortOrder === "desc" ? "expand_less" : "expand_more"}
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div
          className="vdt-body"
          style={{
            position: "relative",
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
          }}
        >
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const key = rowKey ? rowKey(row, virtualRow.index) : virtualRow.key;
            return (
              <div
                key={key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="vdt-row"
                style={{
                  display: "grid",
                  gridTemplateColumns,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  alignItems: "center",
                  minHeight: 48,
                  boxSizing: "border-box",
                  borderBottom: "1px solid var(--color-surface-border)",
                  background: "var(--color-surface-bright, #fff)",
                }}
              >
                {columns.map((column) => (
                  <div
                    key={column.key}
                    className="vdt-td"
                    style={{
                      textAlign: column.align || "left",
                      padding: "10px 12px",
                      minWidth: 0,
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      whiteSpace: "normal",
                      lineHeight: 1.35,
                      fontSize: 13,
                      color: "var(--color-text-primary)",
                      /* no border on cell — garis hanya di row */
                      border: "none",
                      boxSizing: "border-box",
                    }}
                  >
                    {column.render
                      ? column.render(row, virtualRow.index)
                      : row[column.key] ?? "-"}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: "center", padding: 12, color: "var(--color-text-secondary)" }}>
          Memuat...
        </div>
      )}
      {!loading && !rows.length && (
        <div className="empty-state">
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
