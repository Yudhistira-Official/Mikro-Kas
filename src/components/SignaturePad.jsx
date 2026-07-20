// ============================================================
// SignaturePad.jsx — Canvas tanda tangan ringan tanpa dependency
// ============================================================
import { useRef, useState } from "react";

export default function SignaturePad({ onChange }) {
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);

  const point = (event) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const touch = event.touches?.[0];
    const clientX = touch ? touch.clientX : event.clientX;
    const clientY = touch ? touch.clientY : event.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const start = (event) => {
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = point(event);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    setDrawing(true);
  };

  const move = (event) => {
    if (!drawing) return;
    event.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = point(event);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.stroke();
  };

  const end = () => {
    setDrawing(false);
    try { onChange?.(canvasRef.current.toDataURL("image/png")); } catch {}
  };

  const clear = () => {
    const canvas = canvasRef.current;
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    onChange?.(null);
  };

  return <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
    <canvas
      ref={canvasRef}
      width={320}
      height={120}
      style={{ width: "100%", height: "120px", border: "1px solid var(--color-surface-border)", borderRadius: "12px", background: "#fff", touchAction: "none" }}
      onMouseDown={start}
      onMouseMove={move}
      onMouseUp={end}
      onMouseLeave={end}
      onTouchStart={start}
      onTouchMove={move}
      onTouchEnd={end}
    />
    <button type="button" className="btn-secondary" onClick={clear}>Bersihkan Tanda Tangan</button>
  </div>;
}
