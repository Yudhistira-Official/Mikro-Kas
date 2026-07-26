import { useRef, useState } from "react";

export default function DropZoneImport({ title = "Pilih / Drop File CSV", subtitle, onText }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const readFile = async (file) => {
    if (!file) return;
    const text = await file.text();
    await onText(text);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    await readFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`dropzone${dragging ? " dragging" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      role="button"
      tabIndex={0}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt"
        style={{ display: "none" }}
        onChange={(event) => readFile(event.target.files?.[0])}
      />
      <span className="material-symbols-outlined">upload_file</span>
      <strong>{title}</strong>
      {subtitle && <p>{subtitle}</p>}
    </div>
  );
}
