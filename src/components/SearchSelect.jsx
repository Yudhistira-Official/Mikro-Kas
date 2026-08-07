import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * SearchSelect — dropdown autocomplete dengan keyboard navigation.
 *
 * Performance notes (low-end device optimization):
 * - Dropdown list DIBATASI MAX_VISIBLE_OPTIONS item untuk mencegah ribuan DOM node
 *   saat produkList besar. Filter tetap berjalan di semua options, tapi hanya
 *   MAX_VISIBLE_OPTIONS pertama yang di-render ke DOM.
 * - `filtered` di-memoize; hanya re-compute saat `options` reference ATAU `text` berubah.
 *   Parent wajib memoize array options dengan useMemo agar cache tidak invalidate setiap render.
 * - `pick` dan event handlers di-wrap useCallback agar tidak trigger re-render child.
 *
 * @param {string}   value       - Controlled value (option.value yang dipilih)
 * @param {Function} onChange    - Callback (value) => void saat opsi dipilih
 * @param {Array}    options     - Array { value, label } — wajib di-memoize oleh parent
 * @param {string}   placeholder - Teks placeholder input
 * @param {string}   className   - CSS class untuk input element
 * @param {boolean}  required    - HTML required attribute
 * @param {boolean}  disabled    - Disable seluruh komponen
 * @param {object}   style       - Inline style untuk wrapper div
 */

/** Batas maksimum item yang di-render ke DOM sekaligus.
 *  Mencegah freeze saat produkList > 500 item di perangkat low-end. */
const MAX_VISIBLE_OPTIONS = 100;

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
    // Inisialisasi label dari value awal; kosong jika tidak ditemukan
    const found = options.find((o) => o.value === value);
    return found ? found.label : "";
  });
  const [activeIdx, setActiveIdx] = useState(0); // index item yang disorot keyboard
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    // Filter + rank berdasarkan query; jika kosong tampilkan semua.
    // Ranking: exact match(0) > starts-with(1) > contains(2) > no-match(3).
    // Memo hanya invalid saat options reference atau text berubah —
    // parent WAJIB pass options via useMemo agar cache tidak buang setiap re-render.
    const query = text.trim().toLowerCase();
    if (!query) return options;
    return options
      .map((option, index) => ({ option, index, label: String(option.label).toLowerCase() }))
      .filter(({ label }) => label.includes(query)) // buang no-match sebelum sort
      .sort((a, b) => {
        const rank = (label) => label === query ? 0 : label.startsWith(query) ? 1 : 2;
        return rank(a.label) - rank(b.label) || a.index - b.index;
      })
      .map(({ option }) => option);
  }, [options, text]);

  /**
   * Slice filtered ke MAX_VISIBLE_OPTIONS untuk membatasi jumlah DOM node.
   * Semua item tetap diproses filter di atas, tapi hanya sebagian kecil di-render.
   */
  const visibleOptions = useMemo(
    () => filtered.slice(0, MAX_VISIBLE_OPTIONS),
    [filtered]
  );

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

  /**
   * pick — pilih satu opsi, update text, tutup dropdown, panggil onChange.
   * Wrapped useCallback agar referensi stabil dan tidak trigger re-render child.
   *
   * @param {{value: string, label: string}} opt - Opsi yang dipilih
   */
  const pick = useCallback((opt) => {
    onChange?.(opt.value);
    setText(opt.label);
    setOpen(false);
  }, [onChange]);

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
              // Confirm selection from visible (capped) list, not full filtered list
              if (open && visibleOptions.length > 0 && activeIdx >= 0 && activeIdx < visibleOptions.length) {
                pick(visibleOptions[activeIdx]);
              }
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              if (!open) {
                setOpen(true);
              } else {
                // Bound to visibleOptions length, not full filtered, to match rendered DOM
                setActiveIdx((prev) => Math.min(prev + 1, visibleOptions.length - 1));
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
          {/* Render hanya MAX_VISIBLE_OPTIONS item pertama untuk mencegah DOM besar.
              Ketik lebih spesifik untuk mempersempit hasil jika item tidak terlihat. */}
          {visibleOptions.map((opt, idx) => (
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
          {/* Tampilkan hint jika ada item tersembunyi karena cap MAX_VISIBLE_OPTIONS */}
          {filtered.length > MAX_VISIBLE_OPTIONS && (
            <div
              style={{
                padding: "6px 12px",
                fontSize: "11px",
                color: "var(--color-text-secondary)",
                borderTop: "1px solid var(--color-border)",
                textAlign: "center",
              }}
            >
              {filtered.length - MAX_VISIBLE_OPTIONS} item lainnya — ketik untuk mempersempit
            </div>
          )}
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
