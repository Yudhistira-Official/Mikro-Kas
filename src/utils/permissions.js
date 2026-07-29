const ROLE_PATHS = {
  kasir: new Set(["/", "/transaksi", "/shift", "/riwayat", "/laporan", "/sistem", "/profile"]),
  inventori: new Set(["/", "/produk", "/gudang", "/pembelian", "/riwayat-pembelian", "/stock-opname", "/riwayat-stok", "/serial", "/hpp", "/sistem", "/profile"]),
};

export function canAccessPath(role, path) {
  if (role === "admin" || role === "supervisor") return true;
  return ROLE_PATHS[role]?.has(path) ?? false;
}

export function canAuditStock(role) {
  return role === "admin" || role === "supervisor" || role === "inventori";
}
