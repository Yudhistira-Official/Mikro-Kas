// ============================================================
// UserManagement.jsx — CRUD user & role (PageKit).
//
// Commands: list_users, create_user, deactivate_user
// ============================================================
import { useEffect, useState, useCallback } from "react";
import { invoke } from "../utils/ipc";
import { useToast } from "../hooks/useToast";
import SearchSelect from "../components/SearchSelect";
import {
  PageShell, DataPanel, DataTable, FormModal, InfoNote, StatusBadge, useSearchFilter,
} from "../components/PageKit";

/** Map role → tone StatusBadge. */
function roleTone(role) {
  if (role === "admin") return "primary";
  if (role === "supervisor") return "warning";
  if (role === "kasir") return "success";
  return "neutral";
}

/**
 * Halaman manajemen user: list, tambah, nonaktifkan.
 */
export default function UserManagement() {
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", namaLengkap: "", role: "kasir" });
  const [errors, setErrors] = useState({});
  const [deactivatingId, setDeactivatingId] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [securityQuestions, setSecurityQuestions] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke("list_users");
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
    invoke("get_current_user").then(setCurrentUser).catch(() => {});
  }, [load]);

  const { query, setQuery, filtered } = useSearchFilter(
    users,
    (u) => `${u.username || ""} ${u.nama_lengkap || ""} ${u.role || ""}`
  );

  const aktif = users.filter((u) => u.is_active).length;
  const nonaktif = users.length - aktif;

  const openNew = () => {
    setForm({ username: "", password: "", namaLengkap: "", role: "kasir" });
    setErrors({});
    setEditMode(false);
    setSecurityQuestions([]);
    setShowModal(true);
  };

  const openEdit = (user) => {
    setForm({
      username: user.username,
      password: "",
      namaLengkap: user.nama_lengkap || "",
      role: user.role,
    });
    setErrors({});
    setEditMode(true);
    setEditUserId(user.id);
    // Load security questions for this user
    invoke("get_security_questions_admin", { user_id: user.id })
      .then((qs) => {
        setSecurityQuestions((qs || []).map((q) => ({
          pertanyaan: q.pertanyaan,
          jawaban: q.jawaban,
        })));
      })
      .catch(() => setSecurityQuestions([]));
    setShowModal(true);
  };

  const validate = () => {
    const e = {};
    if (!editMode && form.username.trim().length < 3) e.username = "Username min 3 karakter";
    if (!editMode && form.password.length < 6) e.password = "Password min 6 karakter";
    if (editMode && form.password.length > 0 && form.password.length < 6) e.password = "Password min 6 karakter";
    if (!form.role) e.role = "Role wajib dipilih";
    // Admin users must have at least 1 security question
    if (form.role === "admin") {
      const filled = securityQuestions.filter((q) => q.pertanyaan.trim() && q.jawaban.trim());
      if (filled.length === 0) {
        e.questions = "Admin wajib memiliki minimal 1 pertanyaan keamanan";
      }
    }
    return e;
  };

  /** Buat user baru atau update user via create_user/update_user. */
  const save = async (evt) => {
    evt.preventDefault();
    const e = validate();
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    setSaving(true);
    try {
      if (editMode) {
        await invoke("update_user", {
          req: {
            id: editUserId,
            nama_lengkap: form.namaLengkap.trim() || null,
            role: form.role,
            password: form.password || null,
          },
        });
        // Save security questions
        const filledQuestions = securityQuestions
          .filter((q) => q.pertanyaan.trim() && q.jawaban.trim())
          .map((q) => ({
            pertanyaan: q.pertanyaan.trim(),
            jawaban: q.jawaban.trim(),
          }));
        await invoke("set_security_questions", {
          user_id: editUserId,
          questions: filledQuestions,
        });
        addToast("User berhasil diperbarui", "success");
        // Notify App.jsx to refresh currentUser (clears must_change_password banner)
        window.dispatchEvent(new CustomEvent("user-updated"));
      } else {
        const questions = securityQuestions
          .filter((q) => q.pertanyaan.trim() && q.jawaban.trim())
          .map((q) => ({
            pertanyaan: q.pertanyaan.trim(),
            jawaban: q.jawaban.trim(),
          }));
        await invoke("create_user", {
          req: {
            username: form.username.trim(),
            password: form.password,
            nama_lengkap: form.namaLengkap.trim() || null,
            role: form.role,
            questions: questions.length > 0 ? questions : undefined,
          },
        });
        addToast("User berhasil ditambahkan", "success");
      }
      setShowModal(false);
      load();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setSaving(false);
    }
  };

  /** Nonaktifkan user via deactivate_user. */
  const deactivate = async (user) => {
    if (!confirm(`Nonaktifkan user "${user.username}"? User tidak bisa login setelah ini.`)) return;
    setDeactivatingId(user.id);
    try {
      await invoke("deactivate_user", { id: Number(user.id) });
      addToast(`User ${user.username} dinonaktifkan`, "success");
      load();
    } catch (err) {
      addToast(String(err), "error");
    } finally {
      setDeactivatingId(null);
    }
  };

  const setField = (name, value) => {
    setForm((p) => ({ ...p, [name]: value }));
    setErrors((p) => ({ ...p, [name]: null }));
    // Auto add first security question row when switching role to admin
    if (name === "role" && value === "admin") {
      setSecurityQuestions((prev) => prev.length === 0 ? [{ pertanyaan: "", jawaban: "" }] : prev);
    }
  };

  const addQuestion = () => {
    if (securityQuestions.length >= 3) return;
    setSecurityQuestions((prev) => [...prev, { pertanyaan: "", jawaban: "" }]);
  };

  const removeQuestion = (idx) => {
    setSecurityQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const setQuestion = (idx, field, value) => {
    setSecurityQuestions((prev) =>
      prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q))
    );
  };

  const columns = [
    {
      key: "user",
      label: "User",
      render: (u) => (
        <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: u.is_active ? 1 : 0.55 }}>
          <span
            className="material-symbols-outlined"
            style={{ color: u.is_active ? "var(--color-primary)" : "var(--color-text-secondary)" }}
          >
            person
          </span>
          <div>
            <b>{u.username}</b>
            {u.nama_lengkap && (
              <div className="text-label-md" style={{ color: "var(--color-text-secondary)" }}>
                {u.nama_lengkap}
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "role",
      label: "Role",
      render: (u) => <StatusBadge label={u.role} tone={roleTone(u.role)} />,
    },
    {
      key: "status",
      label: "Status",
      render: (u) => (
        u.is_active
          ? <StatusBadge label="Aktif" tone="success" />
          : <StatusBadge label="Nonaktif" tone="danger" />
      ),
    },
    {
      key: "aksi",
      label: "",
      align: "right",
      render: (u) => (
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {currentUser?.role === "admin" && (
            <button
              type="button"
              className="btn-icon"
              onClick={() => openEdit(u)}
              title="Edit user"
              aria-label={`Edit ${u.username}`}
            >
              <span className="material-symbols-outlined" style={{ color: "#2563EB" }}>edit</span>
            </button>
          )}
          {currentUser?.role === "admin" && u.is_active && (
            <button
              type="button"
              className="btn-icon"
              onClick={() => deactivate(u)}
              disabled={deactivatingId === u.id}
              title="Nonaktifkan user"
              aria-label={`Nonaktifkan ${u.username}`}
            >
              {deactivatingId === u.id
                ? <span className="spinner" style={{ width: 16, height: 16 }} />
                : <span className="material-symbols-outlined" style={{ color: "#B91C1C" }}>person_off</span>}
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageShell
      eyebrow="SISTEM"
      title="User Management"
      description="Kelola pengguna dan hak akses. Kasir = POS saja; Supervisor = semua kecuali user; Admin = penuh."
      actions={
        currentUser?.role === "admin" && (
          <button type="button" className="btn-primary" onClick={openNew}>
            <span className="material-symbols-outlined">person_add</span> Tambah User
          </button>
        )
      }
      stats={[
        { label: "Total", value: users.length, icon: "group" },
        { label: "Aktif", value: aktif, icon: "check_circle", tone: "#047857" },
        { label: "Nonaktif", value: nonaktif, icon: "person_off", tone: "#B91C1C" },
      ]}
    >
      <InfoNote>
        Username min 3 karakter, password min 6. User nonaktif tidak bisa login. Hanya admin yang mengelola user.
      </InfoNote>

      <DataPanel
        searchValue={query}
        onSearch={setQuery}
        searchPlaceholder="Cari username / nama / role..."
        onRefresh={load}
        loading={loading}
        isEmpty={!loading && filtered.length === 0}
        emptyIcon="group"
        emptyTitle="Belum ada user"
        emptyHint="Klik Tambah User untuk membuat akun pertama."
      >
        <DataTable columns={columns} rows={filtered} rowKey={(u) => u.id} />
      </DataPanel>

      {showModal && (
        <FormModal
          title={editMode ? "Edit User" : "Tambah User Baru"}
          description={editMode ? "Ubah nama lengkap, role, atau ganti password." : "Isi username, password, dan role. Username tidak bisa diubah setelah dibuat."}
          onClose={() => setShowModal(false)}
          onSubmit={save}
          submitLabel={editMode ? "Simpan Perubahan" : "Tambah User"}
          submitting={saving}
        >
          <label className="input-label">Username *</label>
          <input
            className="input-field"
            value={form.username}
            onChange={(e) => setField("username", e.target.value)}
            placeholder="min. 3 karakter"
            disabled={editMode}
            autoFocus={!editMode}
          />
          {errors.username && (
            <p style={{ fontSize: 11, color: "var(--color-error)", marginBottom: 8 }}>{errors.username}</p>
          )}

          <label className="input-label">{editMode ? "Password Baru" : "Password *"}</label>
          <input
            className="input-field"
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            placeholder={editMode ? "Kosongkan jika tidak ingin diubah" : "min. 6 karakter"}
            autoFocus={editMode}
          />
          {errors.password && (
            <p style={{ fontSize: 11, color: "var(--color-error)", marginBottom: 8 }}>{errors.password}</p>
          )}

          <label className="input-label">Nama Lengkap</label>
          <input
            className="input-field"
            value={form.namaLengkap}
            onChange={(e) => setField("namaLengkap", e.target.value)}
            placeholder="Opsional"
          />

          <label className="input-label">Role *</label>
          <SearchSelect
            value={form.role}
            onChange={(value) => setField("role", value)}
            options={[{ value: "kasir", label: "Kasir — akses POS saja" }, { value: "supervisor", label: "Supervisor — semua kecuali manajemen user" }, { value: "admin", label: "Admin — akses penuh" }]}
            placeholder="Pilih role"
          />
          {errors.role && (
            <p style={{ fontSize: 11, color: "var(--color-error)", marginBottom: 8 }}>{errors.role}</p>
          )}

          {errors.questions && (
            <p style={{ fontSize: 11, color: "var(--color-error)", marginBottom: 8 }}>{errors.questions}</p>
          )}

          {(editMode || form.role === "admin") && (
            <>
              <hr style={{ margin: "16px 0", border: "none", borderTop: "1px solid var(--color-outline-variant, #ddd)" }} />
              <p className="input-label" style={{ marginBottom: 8, fontWeight: 600 }}>
                Pertanyaan Keamanan{" "}
                <span style={{ fontWeight: 400, color: "var(--color-text-secondary)" }}>
                  ({form.role === "admin" ? "wajib" : "opsional"}, maks. 3)
                </span>
              </p>
              {securityQuestions.map((q, idx) => (
                <div key={idx} style={{ marginBottom: 12, padding: 12, border: "1px solid var(--color-outline-variant, #ddd)", borderRadius: 8, position: "relative" }}>
                  <button
                    type="button"
                    className="btn-icon"
                    onClick={() => removeQuestion(idx)}
                    style={{ position: "absolute", top: 4, right: 4 }}
                    title="Hapus pertanyaan"
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: "#B91C1C" }}>close</span>
                  </button>
                  <label className="input-label">Pertanyaan {idx + 1}</label>
                  <input
                    className="input-field"
                    value={q.pertanyaan}
                    onChange={(e) => setQuestion(idx, "pertanyaan", e.target.value)}
                    placeholder="Contoh: Siapa nama hewan peliharaan pertama Anda?"
                  />
                  <label className="input-label">Jawaban</label>
                  <input
                    className="input-field"
                    value={q.jawaban}
                    onChange={(e) => setQuestion(idx, "jawaban", e.target.value)}
                    placeholder="Jawaban (tidak case-sensitive)"
                  />
                </div>
              ))}
              {securityQuestions.length < 3 && (
                <button type="button" className="btn-secondary" onClick={addQuestion} style={{ width: "100%" }}>
                  + Tambah Pertanyaan
                </button>
              )}
            </>
          )}
        </FormModal>
      )}
    </PageShell>
  );
}
