import { useEffect, useState } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";

/**
 * Role badge: maps role string to label + color.
 * @param {string} role - "admin" | "supervisor" | "kasir"
 */
const RoleBadge = ({ role }) => {
  const map = {
    admin: { label: "Admin", bg: "#7C3AED", color: "#fff" },
    supervisor: { label: "Supervisor", bg: "#06B6D4", color: "#fff" },
    kasir: { label: "Kasir", bg: "#10B981", color: "#fff" },
  };
  const s = map[role] || { label: role, bg: "#E2E8F0", color: "#0F172A" };
  return (
    <span style={{
      fontSize: "10px", fontWeight: 600, padding: "2px 8px",
      borderRadius: "999px", background: s.bg, color: s.color,
      textTransform: "uppercase", letterSpacing: "0.5px",
    }}>
      {s.label}
    </span>
  );
};

/**
 * Modal form untuk buat user baru.
 * Validasi: username min 3 karakter, password min 6 karakter.
 * @param {{ onClose: Function, onSaved: Function }} props
 */
const TambahUserModal = ({ onClose, onSaved }) => {
  const { addToast } = useToast();
  const [form, setForm] = useState({ username: "", password: "", namaLengkap: "", role: "kasir" });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (form.username.trim().length < 3) e.username = "Username min 3 karakter";
    if (form.password.length < 6) e.password = "Password min 6 karakter";
    if (!form.role) e.role = "Role wajib dipilih";
    return e;
  };

  const save = async (evt) => {
    evt.preventDefault();
    const e = validate();
    if (Object.keys(e).length) { setErrors(e); return; }
    setSaving(true);
    try {
      await invoke("create_user", {
        req: {
          username: form.username.trim(),
          password: form.password,
          nama_lengkap: form.namaLengkap.trim() || null,
          role: form.role,
        },
      });
      addToast("User berhasil ditambahkan", "success");
      onSaved();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ name, label, type = "text", placeholder, hint }) => (
    <div style={{ marginBottom: "14px" }}>
      <label className="input-label">{label}</label>
      <input
        className="input-field"
        type={type}
        value={form[name]}
        placeholder={placeholder}
        onChange={(e) => {
          setForm((p) => ({ ...p, [name]: e.target.value }));
          setErrors((p) => ({ ...p, [name]: null }));
        }}
      />
      {hint && !errors[name] && (
        <p style={{ fontSize: "11px", color: "var(--color-text-secondary)", marginTop: "4px" }}>{hint}</p>
      )}
      {errors[name] && (
        <p style={{ fontSize: "11px", color: "var(--color-error)", marginTop: "4px" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "12px", verticalAlign: "middle" }}>error</span>
          {" "}{errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "36px", height: "36px", borderRadius: "10px",
              background: "var(--color-primary-fixed)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: "20px", color: "var(--color-primary)" }}>person_add</span>
            </div>
            <div>
              <h3 className="text-headline-sm">Tambah User Baru</h3>
              <p style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Isi data pengguna di bawah</p>
            </div>
          </div>
          <button className="btn-icon" onClick={onClose} aria-label="Tutup">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={save}>
          <Field name="username" label="Username *" placeholder="min. 3 karakter" hint="Username min 3 karakter, tidak bisa diubah" />
          <Field name="password" label="Password *" type="password" placeholder="min. 6 karakter" hint="Password min 6 karakter" />
          <Field name="namaLengkap" label="Nama Lengkap" placeholder="Nama lengkap (opsional)" />

          <div style={{ marginBottom: "14px" }}>
            <label className="input-label">Role *</label>
            <select
              className="input-field"
              value={form.role}
              onChange={(e) => { setForm((p) => ({ ...p, role: e.target.value })); setErrors((p) => ({ ...p, role: null })); }}
            >
              <option value="kasir">Kasir — akses POS saja</option>
              <option value="supervisor">Supervisor — semua kecuali manajemen user</option>
              <option value="admin">Admin — akses penuh</option>
            </select>
            {errors.role && (
              <p style={{ fontSize: "11px", color: "var(--color-error)", marginTop: "4px" }}>{errors.role}</p>
            )}
          </div>

          {/* Role info card */}
          <div style={{
            background: "var(--color-surface-container-low)", borderRadius: "10px",
            padding: "10px 12px", marginBottom: "16px",
            display: "flex", gap: "8px", alignItems: "flex-start",
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: "16px", color: "var(--color-text-secondary)", marginTop: "1px", flexShrink: 0 }}>info</span>
            <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", lineHeight: "1.5" }}>
              <b>Kasir</b>: POS kasir saja.{" "}<b>Supervisor</b>: semua fitur kecuali kelola user.{" "}<b>Admin</b>: akses penuh termasuk user management.
            </p>
          </div>

          <div style={{ display: "flex", gap: "10px" }}>
            <button type="button" className="btn-secondary" style={{ flex: 1 }} onClick={onClose}>Batal</button>
            <button type="submit" className="btn-primary" style={{ flex: 2 }} disabled={saving}>
              {saving ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : (
                <><span className="material-symbols-outlined" style={{ fontSize: "16px" }}>person_add</span> Tambah User</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * Kartu user: menampilkan info + tombol nonaktifkan.
 * @param {{ user: object, onDeactivated: Function }} props
 */
const UserCard = ({ user, onDeactivated }) => {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const deactivate = async () => {
    if (!confirm(`Nonaktifkan user "${user.username}"? User tidak bisa login setelah ini.`)) return;
    setLoading(true);
    try {
      await invoke("deactivate_user", { id: Number(user.id) });
      addToast(`User ${user.username} dinonaktifkan`, "success");
      onDeactivated();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card" style={{
      display: "flex", alignItems: "center", gap: "12px",
      opacity: user.is_active ? 1 : 0.5,
      border: user.is_active ? "1px solid var(--color-surface-border)" : "1px dashed var(--color-surface-border)",
    }}>
      {/* Avatar */}
      <div style={{
        width: "42px", height: "42px", borderRadius: "50%", flexShrink: 0,
        background: user.is_active ? "var(--color-primary-fixed)" : "var(--color-surface-container-high)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <span className="material-symbols-outlined" style={{
          fontSize: "22px", color: user.is_active ? "var(--color-primary)" : "var(--color-text-secondary)",
        }}>person</span>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 600, fontSize: "14px" }}>{user.username}</span>
          <RoleBadge role={user.role} />
          {!user.is_active && (
            <span style={{ fontSize: "10px", color: "var(--color-error)", background: "var(--color-error-container)", padding: "2px 6px", borderRadius: "999px" }}>
              Nonaktif
            </span>
          )}
        </div>
        {user.nama_lengkap && (
          <p style={{ fontSize: "12px", color: "var(--color-text-secondary)", marginTop: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {user.nama_lengkap}
          </p>
        )}
      </div>

      {/* Action */}
      {user.is_active && (
        <button
          className="btn-icon"
          style={{ padding: "6px", flexShrink: 0 }}
          onClick={deactivate}
          disabled={loading}
          title="Nonaktifkan user"
          aria-label={`Nonaktifkan ${user.username}`}
        >
          {loading
            ? <span className="spinner" style={{ width: "16px", height: "16px" }} />
            : <span className="material-symbols-outlined" style={{ fontSize: "18px", color: "var(--color-error)" }}>person_off</span>
          }
        </button>
      )}
    </div>
  );
};

/**
 * Halaman manajemen user.
 * Load: list_users. Create: create_user. Deactivate: deactivate_user.
 */
export default function UserManagement() {
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await invoke("list_users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // Summary stats
  const aktif = users.filter((u) => u.is_active).length;
  const nonaktif = users.length - aktif;

  if (loading) return <div className="loading-page"><div className="spinner" /></div>;

  return (
    <div className="page-container" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{
            width: "44px", height: "44px", borderRadius: "12px",
            background: "var(--color-accent-gradient)", display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: "22px", color: "#fff" }}>group</span>
          </div>
          <div>
            <h1 className="text-headline-md">User Management</h1>
            <p className="text-body-sm" style={{ color: "var(--color-text-secondary)" }}>Kelola pengguna dan hak akses</p>
          </div>
        </div>
        <button className="btn-primary" style={{ fontSize: "13px", padding: "8px 14px", minHeight: 0 }} onClick={() => setShowModal(true)}>
          <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>add</span> Tambah
        </button>
      </div>

      {/* Stats cards */}
      {users.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <div className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-income-green)" }}>{aktif}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>User Aktif</div>
          </div>
          <div className="card" style={{ padding: "12px 14px", textAlign: "center" }}>
            <div style={{ fontSize: "24px", fontWeight: 700, color: "var(--color-text-secondary)" }}>{nonaktif}</div>
            <div style={{ fontSize: "12px", color: "var(--color-text-secondary)" }}>Nonaktif</div>
          </div>
        </div>
      )}

      {/* User list */}
      {users.length === 0 ? (
        <div className="card" style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
          <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--color-text-secondary)", opacity: 0.4 }}>group</span>
          <p className="text-body-md" style={{ color: "var(--color-text-secondary)", marginTop: "10px" }}>Belum ada user</p>
          <button className="btn-primary" style={{ marginTop: "1rem" }} onClick={() => setShowModal(true)}>Tambah User Pertama</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {users.map((u) => (
            <UserCard key={u.id} user={u} onDeactivated={load} />
          ))}
        </div>
      )}

      {showModal && (
        <TambahUserModal
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}
