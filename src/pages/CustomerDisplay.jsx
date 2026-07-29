import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { rupiah } from "../components/PageKit";

export default function CustomerDisplay() {
  const [data, setData] = useState({ total: 0, items: [] });
  const transactionId = Number(localStorage.getItem("customer_display_transaction_id") || 0);

  useEffect(() => {
    if (!transactionId) return undefined;
    let stopped = false;
    let timer;
    const load = async () => {
      try {
        const next = await invoke("get_customer_display_data", { transaksiId: transactionId });
        if (!stopped) setData(next);
      } catch (_) {
        // Display may start before checkout data exists.
      }
      if (!stopped) timer = window.setTimeout(load, 1000);
    };
    load();
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [transactionId]);

  return (
    <main style={{ minHeight: "100vh", background: "#101318", color: "#fff", padding: 32, fontFamily: "sans-serif" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 30, margin: "0 0 24px" }}>Detail Belanja</h1>
        <div style={{ display: "grid", gap: 12 }}>
          {data.items.map((item, index) => (
            <div key={`${item.nama}-${index}`} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 24, fontSize: 24 }}>
              <span>{item.nama}</span><span>{item.qty}x</span><strong>{rupiah(item.subtotal)}</strong>
            </div>
          ))}
        </div>
        <div style={{ borderTop: "2px solid #fff", marginTop: 28, paddingTop: 20, display: "flex", justifyContent: "space-between", fontSize: 34, fontWeight: 700 }}>
          <span>Total</span><span>{rupiah(data.total)}</span>
        </div>
      </div>
    </main>
  );
}
