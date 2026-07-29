import { useEffect, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * VirtualDataTable — tabel virtual dengan row height dinamis.
 * measureElement mencegah overlap saat nama panjang wrap ke baris baru.
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
  const gridTemplateColumns = columns
    .map((c) => c.width || "minmax(0, 1fr)")
    .join(" ");
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 56,
    overscan: 6,
    measureElement:
      typeof window !== "undefined" && !navigator.userAgent.includes("Firefox")
        ? (el) => el?.getBoundingClientRect().height ?? 56
        : undefined,
  });
  const virtualRows = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualRows[virtualRows.length - 1];
    if (last && hasMore && last.index >= rows.length - 6) onEndReached?.();
  }, [virtualRows, rows.length, hasMore, onEndReached]);

  const isSortable = (key) => (Array.isArray(sortable) ? sortable.includes(key) : Boolean(sortable));
  return (
    <div ref={scrollRef} className="sales-table-wrap sales-table-wrap--virtual" style={{ height, overflow: "auto" }}>
      <table className="sales-table sales-table--virtual">
        <thead>
          <tr style={{ display: "grid", gridTemplateColumns }}>
            {columns.map((column) => {
              const canSort = isSortable(column.key);
              const active = sortBy === column.key;
              return (
                <th
                  key={column.key}
                  style={{ textAlign: column.align || undefined, cursor: canSort ? "pointer" : undefined }}
                  onClick={canSort && onSort ? () => onSort(column.key) : undefined}
                >
                  {column.label}
                  {canSort && active && (
                    <span className="material-symbols-outlined" style={{ fontSize: 14, verticalAlign: "middle", marginLeft: 4 }}>
                      {sortOrder === "desc" ? "expand_less" : "expand_more"}
                    </span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody style={{ display: "block", position: "relative", height: `${virtualizer.getTotalSize()}px` }}>
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const key = rowKey ? rowKey(row, virtualRow.index) : virtualRow.key;
            return (
              <tr
                key={key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                style={{
                  display: "grid",
                  gridTemplateColumns,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                  alignItems: "start",
                  minHeight: 48,
                  borderBottom: "1px solid var(--color-surface-border)",
                  background: "var(--color-surface)",
                }}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    style={{
                      textAlign: column.align || undefined,
                      padding: "10px 12px",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                      whiteSpace: "normal",
                      lineHeight: 1.35,
                    }}
                  >
                    {column.render ? column.render(row, virtualRow.index) : row[column.key] ?? "-"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && <div style={{ textAlign: "center", padding: 12, color: "var(--color-text-secondary)" }}>Memuat...</div>}
      {!loading && !rows.length && (
        <div className="empty-state">
          <p>{emptyMessage}</p>
        </div>
      )}
    </div>
  );
}
