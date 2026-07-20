// QRIS.jsx — Generate QRIS dinamis dengan pemilihan profil.
// User memilih profil QRIS aktif, memasukkan nominal, lalu generate.
// Riwayat QRIS ditampilkan dengan nama profil.
import { useEffect, useState, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import { useSearchParams } from "react-router-dom";

const rupiah = (n) => `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
const keys = [[1, 2, 3], [4, 5, 6], [7, 8, 9], ["000", 0, "⌫"]];

const statusColor = {
  pending: "var(--color-accent-yellow, #E6A817)",
  dibayar: "var(--color-accent-green, #1B8A3D)",
  expired: "var(--color-text-disabled, #999)",
  gagal: "var(--color-error, #E53935)",
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

  const loadProfiles = useCallback(() => {
    invoke("list_qris_profile").then((list) => {
      setProfiles(list);
      // Auto-select active profile
      const active = list.find((p) => p.is_active);
      if (active && !selectedProfileId) setSelectedProfileId(active.id);
    }).catch(console.error);
  }, [selectedProfileId]);

  const loadHistory = useCallback(() => {
    // Riwayat QRIS hanya berlaku untuk hari ini. Saat hari berganti, backend
    // menghapus log lama sebelum daftar terbaru dibaca.
    invoke("prune_old_qris_logs")
      .then(() => invoke("list_qris_log", { limit: 20 }))
      .then(setHistory)
      .catch(console.error);
  }, []);

  useEffect(() => {
    loadProfiles();
    loadHistory();
    const value = searchParams.get("nominal");
    if (value) setNominal(value.replace(/\D/g, ""));
  }, []);

  const inputKey = (key) => {
    if (key === "⌫") setNominal((prev) => prev.slice(0, -1));
    else setNominal((prev) => `${prev}${key}`.replace(/^0+(?=\d)/, ""));
  };

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId);

  const generate = async () => {
    const amount = Number(nominal);
    if (!amount) return addToast("Nominal wajib diisi", "error");
    if (!selectedProfile) return addToast("Pilih profil QRIS terlebih dahulu", "error");
    setLoading(true);
    try {
      const result = await invoke("generate_qris_dinamis", {
        nominal: amount,
        transaksiId: null,
        profileId: selectedProfileId,
      });
      setQrisImage(result.qr_image_base64);
      loadHistory();
      setShowKeypad(false);
      addToast("QRIS dinamis berhasil dibuat", "success");
    } catch (error) {
      addToast(`Gagal: ${error}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const simpanQr = () => {
    if (!qrisImage) return;
    const a = document.createElement("a");
    a.href = `data:image/png;base64,${qrisImage}`;
    a.download = `QRIS-${selectedProfile?.nama || "profil"}-Rp${Number(nominal)}.png`;
    a.click();
    addToast("Gambar QRIS tersimpan", "success");
  };

  const konfirmasiBayar = async (id) => {
    try {
      await invoke("konfirmasi_bayar_qris", { qrisLogId: id });
      addToast("QRIS dikonfirmasi dibayar", "success");
      loadHistory();
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
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <span className="text-headline-md" style={{ color: "var(--color-text-secondary)" }}>QRIS Dinamis</span>

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
      <div className="card" style={{ textAlign: "center" }}>
        <h2 className="text-headline-sm" style={{ color: "var(--color-text-secondary)" }}>Scan untuk Bayar</h2>
        {selectedProfile && <p className="text-headline-md" style={{ margin: "4px 0 16px" }}>{selectedProfile.nama}</p>}

        <input className="input-field" inputMode="none" readOnly placeholder="Masukkan nominal"
          value={nominal ? rupiah(nominal) : ""} onFocus={() => setShowKeypad(true)}
          style={{ textAlign: "center", fontSize: "22px", fontWeight: 700, cursor: "text", minHeight: "52px" }} />

        {showKeypad && (
          <div style={{ marginTop: "12px", borderTop: "1px solid var(--color-surface-border)", paddingTop: "12px" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px", maxWidth: "280px", margin: "0 auto" }}>
              {keys.map((row) => (
                <div key={row.join()} style={{ display: "flex", gap: "6px" }}>
                  {row.map((key) => (
                    <button key={String(key)} type="button" onPointerDown={() => inputKey(key)}
                      style={{ flex: 1, height: "48px", borderRadius: "10px", border: "1px solid var(--color-surface-border)",
                        background: "var(--color-surface)", fontWeight: 700, fontSize: "16px", touchAction: "manipulation" }}>
                      {key === "⌫" ? <span className="material-symbols-outlined">backspace</span> : key}
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <button type="button" className="btn-secondary" style={{ marginTop: "10px", width: "100%" }} onClick={() => setShowKeypad(false)}>Selesai</button>
          </div>
        )}

        {qrisImage && (
          <div style={{ background: "var(--color-surface-container-lowest)", padding: "1rem", borderRadius: "12px", border: "1px solid var(--color-surface-border)", marginTop: "1rem" }}>
            <img src={`data:image/png;base64,${qrisImage}`} alt="QRIS Dinamis" style={{ width: "220px", maxWidth: "100%" }} />
            <p className="text-headline-md" style={{ marginTop: "1rem" }}>{rupiah(nominal)}</p>
            <p className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>Total Pembayaran</p>
          </div>
        )}

        <button className="btn-primary" onClick={generate} disabled={loading || !nominal || !selectedProfile} style={{ width: "100%", marginTop: "1rem" }}>
          {loading ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : <span className="material-symbols-outlined">qr_code_2</span>}
          Generate QRIS
        </button>
        {qrisImage && (
          <button className="btn-secondary" style={{ width: "100%", marginTop: "0.5rem" }} onClick={simpanQr}>
            <span className="material-symbols-outlined">save_alt</span> Simpan QRIS
          </button>
        )}
      </div>

      {/* Riwayat QRIS */}
      {history.length > 0 && (
        <div className="card">
          <p className="text-headline-sm" style={{ marginBottom: "0.75rem" }}>Riwayat QRIS</p>
          {history.map((item) => {
            const isPending = item.status === "pending";
            return (
              <div key={item.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 0", borderBottom: "1px solid var(--color-surface-border)" }}>
                <span className="material-symbols-outlined" style={{ fontSize: "20px", color: statusColor[item.status] || "#999" }}>
                  {statusIcon(item.status)}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600 }}>{rupiah(item.nominal)}</span>
                  <span className="text-label-md" style={{ display: "block", color: "var(--color-text-secondary)", fontSize: "11px" }}>
                    {item.profile_nama || "Default"} • {item.created_at.slice(0, 16)}
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
          })}
        </div>
      )}
    </div>
  );
}
