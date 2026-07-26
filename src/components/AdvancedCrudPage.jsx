import { useEffect, useMemo, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

export default function AdvancedCrudPage({ title, subtitle, icon, loadCommand, loadArgs = {}, actions = [], fields = [] }) {
  const { addToast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({});
  const [result, setResult] = useState(null);

  const defaultForm = useMemo(() => {
    const next = {};
    fields.forEach((field) => { next[field.name] = field.defaultValue ?? ""; });
    return next;
  }, [fields]);

  useEffect(() => {
    setForm(defaultForm);
  }, [defaultForm]);

  const load = async () => {
    if (!loadCommand) return;
    setLoading(true);
    try {
      const data = await invoke(loadCommand, loadArgs);
      setRows(Array.isArray(data) ? data : data ? [data] : []);
    } catch (e) {
      setRows([]);
      addToast(String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [loadCommand]);

  const buildPayload = (action) => {
    if (action.payload) return action.payload(form);
    const payload = {};
    fields.forEach((field) => {
      const raw = form[field.name];
      payload[field.name] = field.type === "number" ? Number(raw || 0) : raw || null;
    });
    return payload;
  };

  const runAction = async (action) => {
    try {
      const data = await invoke(action.command, buildPayload(action));
      setResult(data ?? "OK");
      addToast(action.success || "Berhasil", "success");
      if (action.reload !== false) load();
    } catch (e) {
      addToast(String(e), "error");
    }
  };

  return (
    <div className="page-container advanced-detail-page">
      <div className="advanced-detail-header">
        <div className="advanced-card-icon"><span className="material-symbols-outlined">{icon}</span></div>
        <div>
          <h1 className="text-headline-lg">{title}</h1>
          <p className="text-body-md" style={{ color: "var(--color-text-secondary)" }}>{subtitle}</p>
        </div>
      </div>

      {fields.length > 0 && (
        <section className="card advanced-form">
          <h2 className="text-headline-sm">Form Aksi</h2>
          <div className="advanced-form-grid">
            {fields.map((field) => (
              <label key={field.name}>
                <span className="input-label">{field.label}</span>
                <input
                  className="input-field"
                  type={field.type || "text"}
                  value={form[field.name] ?? ""}
                  placeholder={field.placeholder || ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, [field.name]: e.target.value }))}
                />
              </label>
            ))}
          </div>
          <div className="advanced-toolbar">
            {actions.map((action) => (
              <button key={action.label} className={action.primary ? "btn-primary" : "btn-secondary"} onClick={() => runAction(action)}>
                {action.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {result !== null && (
        <section className="card advanced-result">
          <h2 className="text-headline-sm">Hasil</h2>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </section>
      )}

      <section className="card advanced-list">
        <div className="advanced-list-header">
          <h2 className="text-headline-sm">Data</h2>
          {loadCommand && <button className="btn-secondary" onClick={load}>{loading ? "Memuat..." : "Refresh"}</button>}
        </div>
        {rows.length === 0 ? (
          <div className="empty-state"><span className="material-symbols-outlined">inbox</span><p>Belum ada data</p></div>
        ) : (
          <div className="advanced-json-list">
            {rows.map((row, index) => <pre key={index}>{JSON.stringify(row, null, 2)}</pre>)}
          </div>
        )}
      </section>
    </div>
  );
}
