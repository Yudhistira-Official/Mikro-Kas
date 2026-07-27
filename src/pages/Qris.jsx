// ============================================================
// Qris.jsx — Generate QRIS dinamis + riwayat (PageKit).
//
// Commands: list_qris_profile, prune_old_qris_logs, list_qris_log,
//   generate_qris_dinamis, konfirmasi_bayar_qris, expire_qris
// ============================================================
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { formatDateTimeId } from "../utils/dateFormat";
import {
  PageShell, DataPanel, DataTable, InfoNote, StatusBadge,
  useSearchFilter, rupiah,
} from "../components/PageKit";

const keys = [[1, 2, 3], [4, 5, 6], [7, 8, 9], ["000", 0, "⌫"]];

/**
 * Map status QRIS → tone StatusBadge.
 */
function statusTone(status) {
  if (status === "dibayar") return "success";
  if (status === "pending") return "warning";
  if (status === "gagal") return "danger";
  return "neutral";
}

/**
 * Halaman QRIS: generate kode bayar + konfirmasi/expire riwayat.
 */
export default function Qris() {
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [nominal, setNominal] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const [qrisImage, setQrisImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState(() => (window.innerWidth >= 768 ? "riwayat" : "generate"));

  const loadProfiles = useCallback(() => {
    invoke("list_qris_profile").then((list) => {
      setProfiles(list);
      setSelectedProfileId((prev) => {
        if (prev) return prev;
        const active = list.find((p) => p.is_active);
        return active ? active.id : (list[0]?.id ?? null);
      });
    }).catch(console.error);
  }, []);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    invoke("prune_old_qris_logs")
      .then(() => invoke("list_qris_log", { limit: 20 }))
      .then(setHistory)
      .catch(console.error)
      .finally(() => setHistoryLoading(false));
  }, []);

  useEffect(() => {
    loadProfiles();
    loadHistory();
    const nm = searchParams.get("nominal");
    if (nm) setNominal(nm);
  }, [loadProfiles, loadHistory, searchParams]);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);
  const { query, setQuery, filtered } = useSearchFilter(
    history,
    (item) => `${item.profile_nama || ""} ${item.status || ""} ${item.nominal || ""}`
  );

  const pendingCount = history.filter((h) => h.status === "pending").length;
  const paidCount = history.filter((h) => h.status === "dibayar").length;

  /** Input keypad nominal. */
  const handleKey = (key) => {
    if (key === "⌫") setNominal((prev) => prev.slice(0, -1));
    else if (key === "000") setNominal((prev) => prev + "000");
    else setNominal((prev) => prev + String(key));
  };

  /** Generate QR dinamis dari profil terpilih. */
  const generateQris = async () => {
    const n = parseInt(nominal, 10);
    if (!n || n <= 0) return addToast("Masukkan nominal > 0", "error");
    if (!selectedProfile) return addToast("Pilih profil QRIS terlebih dahulu", "error");
    setLoading(true);
    try {
      const result = await invoke("generate_qris_dinamis", { nominal: n, profileId: selectedProfile.id });
      setQrisImage(`data:image/png;base64,${result.qr_image_base64}`);
      setShowKeypad(false);
      loadHistory();
    } catch (e) {
      addToast(`Gagal generate QRIS: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  /** Tandai log QRIS sebagai dibayar. */
  const konfirmasiBayar = async (id) => {
    try {
      await invoke("konfirmasi_bayar_qris", { qrisLogId: id });
      addToast("Pembayaran QRIS dikonfirmasi", "success");
      loadHistory();
      setQrisImage(null);
      setNominal("");
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
  };

  /** Tandai log QRIS expired. */
  const tandaiExpired = async (id) => {
    try {
      await invoke("expire_qris", { qrisLogId: id });
      addToast("QRIS ditandai expired", "info");
      loadHistory();
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
  };

  const historyColumns = [
    {
      key: "info", label: "QRIS",
      render: (item) => (
        <div>
          <b>{rupiah(item.nominal)}</b>
          <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
            {item.profile_nama || "Default"} · {formatDateTimeId(item.created_at)}
          </div>
        </div>
      ),
    },
    {
      key: "status", label: "Status",
      render: (item) => <StatusBadge label={item.status} tone={statusTone(item.status)} />,
    },
    {
      key: "aksi", label: "", align: "right",
      render: (item) => (
        item.status === "pending" ? (
          <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
            <button type="button" className="btn-primary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => konfirmasiBayar(item.id)} title="Konfirmasi bayar">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check</span>
            </button>
            <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => tandaiExpired(item.id)} title="Tandai expired">
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
            </button>
          </div>
        ) : null
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="PEMBAYARAN"
      title="QRIS Dinamis"
      description="Buat kode QR bayar sesuai nominal, lalu konfirmasi di riwayat setelah pelanggan transfer."
      actions={
        <button type="button" className="btn-secondary" onClick={loadHistory}>
          <span className="material-symbols-outlined">refresh</span> Muat ulang
        </button>
      }
      stats={[
        { label: "Profil", value: profiles.length, icon: "qr_code_2" },
        { label: "Pending", value: pendingCount, icon: "hourglass_empty", tone: pendingCount ? "#92400E" : undefined },
        { label: "Dibayar", value: paidCount, icon: "check_circle", tone: "#047857" },
      ]}
    >
      <InfoNote>
        Pilih profil merchant, masukkan nominal, generate QR. Di tab Riwayat: centang = sudah dibayar, silang = expired.
      </InfoNote>

      <div className="filter-row" style={{ marginBottom: 12 }}>
        <button type="button" className={`filter-chip${tab === "generate" ? " active" : ""}`} onClick={() => setTab("generate")}>Generate QRIS</button>
        <button type="button" className={`filter-chip${tab === "riwayat" ? " active" : ""}`} onClick={() => setTab("riwayat")}>Riwayat QRIS</button>
      </div>

      {tab === "generate" ? (
        <DataPanel
          emptyIcon="qr_code"
          emptyTitle=""
          isEmpty={false}
          loading={false}
        >
          {profiles.length === 0 ? (
            <div className="empty-state">
              <span className="material-symbols-outlined">qr_code_2</span>
              <p>Belum ada profil QRIS</p>
              <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Tambah profil di pengaturan toko dulu.</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: 8 }}>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {profiles.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`filter-chip${p.id === selectedProfileId ? " active" : ""}`}
                    onClick={() => setSelectedProfileId(p.id)}
                  >
                    {p.nama}
                  </button>
                ))}
              </div>

              {selectedProfile && (
                <p className="text-headline-sm" style={{ textAlign: "center" }}>{selectedProfile.nama}</p>
              )}

              <input
                className="input-field"
                inputMode="none"
                readOnly
                placeholder="Masukkan nominal"
                value={nominal ? rupiah(nominal) : ""}
                onFocus={() => setShowKeypad(true)}
                style={{ textAlign: "center", fontSize: 22, fontWeight: 700, maxWidth: 320, margin: "0 auto", width: "100%" }}
              />

              {showKeypad && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 280, margin: "0 auto", width: "100%" }}>
                  {keys.map((row, ri) => (
                    <div key={ri} style={{ display: "flex", gap: 6 }}>
                      {row.map((k, ki) => (
                        <button
                          key={ki}
                          type="button"
                          className="btn-secondary"
                          style={{ flex: 1, padding: "14px 0", fontSize: 18, fontWeight: 600 }}
                          onClick={() => handleKey(k)}
                        >
                          {k}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <button
                type="button"
                className="btn-primary"
                onClick={generateQris}
                disabled={loading || !nominal}
                style={{ maxWidth: 320, margin: "0 auto", width: "100%" }}
              >
                {loading ? "Generating..." : "Generate QRIS"}
              </button>

              {qrisImage && (
                <div style={{ display: "flex", justifyContent: "center", marginTop: 8 }}>
                  <img src={qrisImage} alt="QRIS Code" style={{ maxWidth: 220, maxHeight: 220, borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }} />
                </div>
              )}
            </div>
          )}
        </DataPanel>
      ) : (
        <DataPanel
          searchValue={query}
          onSearch={setQuery}
          searchPlaceholder="Cari nominal / profil / status..."
          onRefresh={loadHistory}
          loading={historyLoading}
          isEmpty={!historyLoading && filtered.length === 0}
          emptyIcon="history"
          emptyTitle="Belum ada riwayat QRIS"
          emptyHint="Generate QRIS dulu di tab Generate."
        >
          <DataTable columns={historyColumns} rows={filtered} rowKey={(item) => item.id} />
        </DataPanel>
      )}
    </PageShell>
  );
}
