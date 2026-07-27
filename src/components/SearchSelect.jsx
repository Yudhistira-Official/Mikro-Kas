import { useEffect, useMemo, useRef, useState } from "react";

export default function SearchSelect({
  value = "",
  onChange,
  options = [],
  placeholder = "Pilih...",
  className = "input-field",
  required = false,
  disabled = false,
  style,
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => {
    const found = options.find((o) => o.value === value);
    return found ? found.label : "";
  });
  const [activeIdx, setActiveIdx] = useState(0); // index item yang disorot keyboard
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    const query = text.trim().toLowerCase();
    if (!query) return options;
    return options
      .map((option, index) => ({ option, index, label: String(option.label).toLowerCase() }))
      .sort((a, b) => {
        const rank = (label) => label === query ? 0 : label.startsWith(query) ? 1 : label.includes(query) ? 2 : 3;
        return rank(a.label) - rank(b.label) || a.index - b.index;
      })
      .map(({ option }) => option);
  }, [options, text]);

  // Reset highlight ke elemen pertama saat hasil filter berubah
  useEffect(() => {
    setActiveIdx(0);
  }, [text, options]);

  // Auto-scroll ke elemen yang aktif disorot oleh keyboard
  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.children[activeIdx];
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx, open]);

  // Hitung saran autocomplete dari opsi teratas
  const suggestion = useMemo(() => {
    if (!text || filtered.length === 0) return "";
    const first = filtered[0];
    if (!first.label.toLowerCase().startsWith(text.toLowerCase())) return "";
    if (first.label.toLowerCase() === text.toLowerCase()) return "";
    return first.label.slice(text.length);
  }, [text, filtered]);

  // Nilai kosong berarti belum memilih data; tampilkan placeholder, bukan label opsi kosong.
  // Ini menjaga field opsional seperti customer/sales tetap terlihat kosong setelah reset.
  useEffect(() => {
    const found = value ? options.find((o) => String(o.value) === String(value)) : null;
    if (found && found.label !== text) setText(found.label);
    if (!value && text) setText("");
  }, [options, value]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); inputRef.current?.focus(); }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const pick = (opt) => {
    onChange?.(opt.value);
    setText(opt.label);
    setOpen(false);
  };

  return (
    <div className="search-select" ref={rootRef} style={style}>
      {/* Wrapper untuk positioning saran overlay */}
      <div style={{ position: "relative" }}>
        <input
          ref={inputRef}
          className={className}
          value={text}
          disabled={disabled}
          required={required}
          placeholder={placeholder}
          autoComplete="off"
          style={{ background: "transparent", position: "relative", zIndex: 2, width: "100%", paddingRight: 40 }}
          onChange={(e) => { setText(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (open && filtered.length > 0 && activeIdx >= 0 && activeIdx < filtered.length) {
                pick(filtered[activeIdx]);
              }
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) {
                setOpen(true);
              } else {
                setActiveIdx((prev) => Math.min(prev + 1, filtered.length - 1));
              }
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              if (open) {
                setActiveIdx((prev) => Math.max(prev - 1, 0));
              }
            }
          }}
        />
        {/* Overlay saran autocomplete — abu-abu, tidak bisa diklik */}
        {suggestion && (
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              pointerEvents: "none",
              zIndex: 1,
              color: "var(--color-text-secondary)",
              opacity: 0.35,
              fontSize: "14px",
              fontFamily: "inherit",
              padding: "10px 12px",
            }}
          >
            <span style={{ visibility: "hidden" }}>{text}</span>
            <span style={{ whiteSpace: "nowrap" }}>{suggestion}</span>
          </div>
        )}
        
        {/* Tombol panah ke bawah */}
        <button
          type="button"
          tabIndex={-1}
          style={{
            position: "absolute",
            right: 4,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            zIndex: 3,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--color-text-secondary)",
          }}
          onClick={() => { setOpen((prev) => !prev); inputRef.current?.focus(); }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            {open ? "arrow_drop_up" : "arrow_drop_down"}
          </span>
        </button>
      </div>
      
      {open && (
        <div className="search-select__popup" ref={listRef} style={{ position: "fixed" }}>
          {filtered.map((opt, idx) => (
            <button
              key={opt.value}
              type="button"
               className={`search-select__option${String(opt.value) === String(value) ? " is-selected" : ""}${idx === activeIdx ? " is-active" : ""}`}
              onClick={() => pick(opt)}
              onMouseDown={(e) => e.preventDefault()}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
      
      {open && <DropPositionFix open={open} rootRef={rootRef} listRef={listRef} />}
    </div>
  );
}

/** Window-level listener: positions the popup fixed relative to viewport when it opens. */
function DropPositionFix({open,rootRef,listRef}) {
  useEffect(()=>{
    if(!open)return;
    const fn=()=>{
      const root=rootRef.current?.getBoundingClientRect();if(!root)return;
      const list=listRef.current;if(!list)return;
      const ph=Math.min(320,window.innerHeight-24);
      const spaceBelow=window.innerHeight-root.bottom-8;
      const spaceAbove=root.top-8;
      
      list.style.width=`${Math.min(root.width, 400)}px`;
      
      if(spaceBelow<ph&&spaceAbove>spaceBelow){
        list.style.position='fixed';list.style.bottom=`${window.innerHeight-root.top+6}px`;list.style.left=`${root.left}px`;list.style.top='auto';
      }else{
        list.style.position='fixed';list.style.top=`${root.bottom+6}px`;list.style.left=`${root.left}px`;list.style.bottom='auto';
      }
    };
    fn();
    window.addEventListener('scroll',fn,true);window.addEventListener('resize',fn);
    return()=>{window.removeEventListener('scroll',fn,true);window.removeEventListener('resize',fn);};
  },[open,rootRef,listRef]);
  return null;
}
