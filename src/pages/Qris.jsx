// QRIS.jsx — Generate QRIS dinamis dengan pemilihan profil.
// v2: Tab "Generate QRIS" + "Riwayat QRIS", QR code centered dinamis.
import { useEffect, useState, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { useSearchParams } from "react-router-dom";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
const keys = [[1, 2, 3], [4, 5, 6], [7, 8, 9], ["000", 0, "⌫"]];

const statusColor = {
  pending: "#E6A817",
  dibayar: "#1B8A3D",
  expired: "#999",
  gagal: "#E53935",
};

export default function Qris() {
  const { addToast } = useToast();
  const [searchParams] = useSearchParams();
  const [profiles, setProfiles] = useState([]);
  const [selectedProfileId, setSelectedProfileId] = useState(null);
  const [nominal, setNominal] = useState("");
  const [showKeypad, setShowKeypad] = useState(false);
  const [qrisImage, setQrisImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("generate"); // "generate" | "riwayat"

  const loadProfiles = useCallback(() => {
    invoke("list_qris_profile").then((list) => {
      setProfiles(list);
      const active = list.find((p) => p.is_active);
      if (active && !selectedProfileId) setSelectedProfileId(active.id);
    }).catch(console.error);
  }, [selectedProfileId]);

  const loadHistory = useCallback(() => {
    invoke("prune_old_qris_logs")
      .then(() => invoke("list_qris_log", { limit: 20 }))
      .then(setHistory)
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadProfiles();
    loadHistory();
    // Pre-fill nominal dari URL jika redirect dari Transaksi
    const nm = searchParams.get("nominal");
    if (nm && !nominal) setNominal(nm);
  }, []);

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  const handleKey = (key) => {
    if (key === "⌫") {
      setNominal((prev) => prev.slice(0, -1));
    } else if (key === "000") {
      setNominal((prev) => prev + "000");
    } else {
      setNominal((prev) => prev + String(key));
    }
  };

  const generateQris = async () => {
    const n = parseInt(nominal, 10);
    if (!n || n <= 0) return addToast("Masukkan nominal > 0", "error");
    if (!selectedProfile) return addToast("Pilih profil QRIS terlebih dahulu", "error");
    setLoading(true);
    try {
      const image = await invoke("generate_qris", { nominal: n, profileId: selectedProfile.id });
      setQrisImage(image);
      setShowKeypad(false);
      loadHistory();
    } catch (e) {
      addToast(`Gagal generate QRIS: ${e}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const konfirmasiBayar = async (id) => {
    try {
      await invoke("konfirmasi_qris", { qrisLogId: id });
      addToast("Pembayaran QRIS dikonfirmasi", "success");
      loadHistory();
      // Clear QR image if the confirmed transaction matches
      setQrisImage(null);
      setNominal("");
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
  };

  const tandaiExpired = async (id) => {
    try {
      await invoke("expire_qris", { qrisLogId: id });
      addToast("QRIS ditandai expired", "info");
      loadHistory();
    } catch (e) { addToast(`Gagal: ${e}`, "error"); }
  };

  const statusIcon = (status) => {
    if (status === "dibayar") return "check_circle";
    if (status === "expired") return "timer_off";
    if (status === "gagal") return "error";
    return "hourglass_empty";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem", height: "100%" }}>
      <span className="text-headline-md">QRIS Dinamis</span>

      {/* Tab switcher */}
      <div className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", padding: "0.5rem", background: "var(--color-surface-container-low)" }}>
        {["generate", "riwayat"].map((key) => (
          <button key={key} type="button" onClick={() => setTab(key)}
            className={tab === key ? "btn-primary" : "btn-secondary"}
            style={{ padding: "8px 4px", fontSize: "13px" }}>
            {key === "generate" ? "Generate QRIS" : "Riwayat QRIS"}
          </button>
        ))}
      </div>

      {tab === "generate" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", flex: 1 }}>
          {/* Profile selector */}
          {profiles.length > 0 && (
            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
              {profiles.map((p) => (
                <button key={p.id} type="button" onClick={() => setSelectedProfileId(p.id)} style={{
                  flexShrink: 0, padding: "6px 14px", borderRadius: "999px", fontSize: "13px", fontWeight: 600,
                  border: p.id === selectedProfileId ? "2px solid var(--color-primary)" : "1px solid var(--color-surface-border)",
                  background: p.id === selectedProfileId ? "var(--color-primary)" : "var(--color-surface)",
                  color: p.id === selectedProfileId ? "#fff" : "var(--color-text-primary)",
                  cursor: "pointer",
                }}>
                  {p.nama}
                </button>
              ))}
            </div>
          )}

          {/* Generate panel */}
          <div className="card" style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
            {selectedProfile && <p className="text-headline-sm" style={{ marginBottom: "12px" }}>{selectedProfile.nama}</p>}

            <input className="input-field" inputMode="none" readOnly placeholder="Masukkan nominal"
              value={nominal ? rupiah(nominal) : ""} onFocus={() => setShowKeypad(true)}
              style={{ textAlign: "center", fontSize: "22px", fontWeight: 700, cursor: "text", minHeight: "52px", maxWidth: "280px", alignSelf: "center" }} />

            {showKeypad && (
              <div style={{ marginTop: "12px", borderTop: "1px solid var(--color-surface-border)", paddingTop: "12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "280px", margin: "0 auto" }}>
                  {keys.map((row, ri) => (
                    <div key={ri} style={{ display: "flex", gap: "6px" }}>
                      {row.map((k, ki) => (
                        <button key={ki} type="button" onClick={() => handleKey(k)}
                          style={{
                            flex: 1, padding: "14px 0", fontSize: "18px", fontWeight: 600,
                            borderRadius: "10px", border: "1px solid var(--color-surface-border)",
                            background: "var(--color-surface)", color: "var(--color-text-primary)",
                            cursor: "pointer",
                          }}>
                          {k}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button className="btn-primary" onClick={generateQris} disabled={loading || !nominal}
              style={{ marginTop: "16px", maxWidth: "280px", alignSelf: "center", width: "100%" }}>
              {loading ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : "Generate QRIS"}
            </button>

            {/* QRIS Image — centered dinamis */}
            {qrisImage && (
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                flex: 1, marginTop: "16px", minHeight: "200px",
              }}>
                <img src={qrisImage} alt="QRIS Code" style={{ maxWidth: "220px", maxHeight: "220px", borderRadius: "12px", boxShadow: "0 4px 16px rgba(0,0,0,0.08)" }} />
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Riwayat QRIS tab */
        <div className="card" style={{ padding: "1rem", flex: 1, overflowY: "auto" }}>
          <h3 className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Riwayat QRIS</h3>
          {history.length === 0 ? (
            <p className="text-body-md" style={{ color: "var(--color-text-secondary)", textAlign: "center", padding: "2rem 0" }}>Belum ada riwayat QRIS</p>
          ) : (
            history.map((item) => {
              const isPending = item.status === "pending";
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 0", borderBottom: "1px solid var(--color-surface-border)" }}>
                  <span className="material-symbols-outlined" style={{ fontSize: "20px", color: statusColor[item.status] || "#999" }}>
                    {statusIcon(item.status)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600 }}>{rupiah(item.nominal)}</span>
                    <span className="text-label-md" style={{ display: "block", color: "var(--color-text-secondary)", fontSize: "11px" }}>
                      {item.profile_nama || "Default"} • {item.created_at?.slice(0, 16)}
                    </span>
                  </div>
                  <span style={{
                    fontSize: "11px", fontWeight: 600, padding: "2px 8px", borderRadius: "999px",
                    color: "#fff", background: statusColor[item.status] || "#999",
                  }}>
                    {item.status}
                  </span>
                  {isPending && (
                    <div style={{ display: "flex", gap: "4px" }}>
                      <button type="button" className="btn-primary" style={{ padding: "4px 10px", fontSize: "11px", minHeight: 0 }}
                        onClick={() => konfirmasiBayar(item.id)}>
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>check</span>
                      </button>
                      <button type="button" className="btn-secondary" style={{ padding: "4px 10px", fontSize: "11px", minHeight: 0 }}
                        onClick={() => tandaiExpired(item.id)}>
                        <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}