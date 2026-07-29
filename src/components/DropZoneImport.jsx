import { useRef, useState, useEffect } from "react";

export default function DropZoneImport({ title = "Pilih / Drop File XLSX", subtitle, onFile, accept = ".xlsx", icon = "upload_file" }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const processingRef = useRef(false); // guard: satu proses per drop

  const handleFile = async (file) => {
    if (!file || processingRef.current) return;
    processingRef.current = true;
    try {
      if (onFile) await onFile(file);
    } finally {
      processingRef.current = false;
    }
  };

  // Tauri intercepts drag-drop before HTML events on Linux/GTK.
  // onDragDropEvent adalah window-level, jadi guard processingRef penting.
  useEffect(() => {
    let unlisten;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlisten = await getCurrentWindow().onDragDropEvent(async (event) => {
          if (event.payload.type === "over") {
            setDragging(true);
          } else if (event.payload.type === "leave" || event.payload.type === "cancelled") {
            setDragging(false);
          } else if (event.payload.type === "drop") {
            setDragging(false);
            const paths = event.payload.paths;
            if (!paths?.length) return;
            const path = paths[0];
            if (!path.toLowerCase().endsWith(".xlsx")) return;
            const { readFile } = await import("@tauri-apps/plugin-fs");
            const bytes = await readFile(path);
            const fileName = path.split(/[\\/]/).pop() || "file.xlsx";
            const file = new File([bytes], fileName, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
            await handleFile(file);
          }
        });
      } catch (e) {
        // Fallback: browser drag-drop (non-Tauri env)
      }
    })();
    return () => { if (unlisten) unlisten(); };
  }, []); // kosongkan deps — onFile stabil via ref pattern tidak perlu

  // Fallback HTML drag-drop (browser/dev mode)
  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    await handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`dropzone${dragging ? " dragging" : ""}`}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
    >
      <input ref={inputRef} type="file" accept={accept} hidden onChange={(event) => handleFile(event.target.files?.[0])} />
      <span className="dropzone__icon material-symbols-outlined">{icon}</span>
      <strong>{title}</strong>
      {subtitle && <p>{subtitle}</p>}
      <span className="dropzone__hint">Klik untuk memilih · atau seret file ke sini</span>
    </div>
  );
}
