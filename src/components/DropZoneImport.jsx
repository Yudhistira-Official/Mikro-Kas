import { useRef, useState } from "react";

export default function DropZoneImport({ title = "Pilih / Drop File CSV", subtitle, onText, onFile, accept = ".csv,.txt", icon = "upload_file" }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    if (onFile) return onFile(file);
    await onText(file.text());
  };

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
