import { useEffect, useMemo, useRef, useState } from "react";
import { formatDateId, toIsoDate, todayIso } from "../utils/dateFormat";

const WEEKDAYS = ["Sen","Sel","Rab","Kam","Jum","Sab","Min"];
const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

function parseIsoParts(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y,m,d]=iso.split("-").map(Number);
  return {y,m,d};
}
function daysInMonth(y,m) { return new Date(y,m,0).getDate(); }
function startWeekdayMon(y,m) { return (new Date(y,m-1,1).getDay()+6)%7; }

export default function DateField({value="",onChange,className="input-field",required=false,placeholder="DD/MM/YYYY",disabled=false}) {
  const iso=toIsoDate(value)||"";
  const [open,setOpen]=useState(false);
  const [text,setText]=useState(iso?formatDateId(iso):"");
  const rootRef=useRef(null);const inputRef=useRef(null);const popupRef=useRef(null);
  const initial=parseIsoParts(iso)||parseIsoParts(todayIso());
  const [viewY,setViewY]=useState(initial.y);const [viewM,setViewM]=useState(initial.m);

  useEffect(()=>{setText(iso?formatDateId(iso):"");const p=parseIsoParts(iso);if(p){setViewY(p.y);setViewM(p.m);}},[iso]);

  useEffect(()=>{
    if(!open)return;
    const onDown=e=>{if(rootRef.current&&!rootRef.current.contains(e.target))setOpen(false);};
    const onKey=e=>{if(e.key==="Escape"){e.preventDefault();setOpen(false);inputRef.current?.focus();}};
    document.addEventListener("mousedown",onDown);document.addEventListener("keydown",onKey);
    return()=>{document.removeEventListener("mousedown",onDown);document.removeEventListener("keydown",onKey);};
  },[open]);

  const cells=useMemo(()=>{const dim=daysInMonth(viewY,viewM);const start=startWeekdayMon(viewY,viewM);const arr=[];for(let i=0;i<start;i++)arr.push(null);for(let d=1;d<=dim;d++)arr.push(d);while(arr.length%7!==0)arr.push(null);return arr;},[viewY,viewM]);

  const commitText=()=>{
    const next=toIsoDate(text);
    if(!text.trim()){onChange?.("");setText("");return;}
    if(!next){setText(iso?formatDateId(iso):"");return;}
    onChange?.(next);setText(formatDateId(next));
  };
  const pickDay=d=>{
    const next=`${viewY}-${String(viewM).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    onChange?.(next);setText(formatDateId(next));setOpen(false);
  };
  const shiftMonth=delta=>{let m=viewM+delta;let y=viewY;if(m<1){m=12;y-=1;}if(m>12){m=1;y+=1;}setViewM(m);setViewY(y);};
  const selected=parseIsoParts(iso);

  return (
    <div className="date-field" ref={rootRef}>
      <div className="date-field__row">
        <input ref={inputRef} className={className} value={text} disabled={disabled} required={required} placeholder={placeholder} inputMode="numeric" autoComplete="off"
          onChange={e=>setText(e.target.value.replace(/[^\d/]/g,"").slice(0,10))}
          onBlur={commitText}
          onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();commitText();setOpen(false);}}}
          onFocus={()=>{if(!disabled){const p=parseIsoParts(iso)||parseIsoParts(todayIso());setViewY(p.y);setViewM(p.m);}}}
        />
        <button type="button" className="date-field__btn" disabled={disabled} aria-label="Buka kalender" onClick={()=>{if(disabled)return;setOpen(v=>!v);const p=parseIsoParts(iso)||parseIsoParts(todayIso());setViewY(p.y);setViewM(p.m);}}>
          <span className="material-symbols-outlined">calendar_month</span>
        </button>
      </div>
      {open && <div className="date-field__popup" ref={popupRef} role="dialog" aria-label="Pilih tanggal">
        <div className="date-field__header">
          <button type="button" className="date-field__nav" onClick={()=>shiftMonth(-1)} aria-label="Bulan sebelumnya"><span className="material-symbols-outlined">chevron_left</span></button>
          <strong>{MONTHS[viewM-1]} {viewY}</strong>
          <button type="button" className="date-field__nav" onClick={()=>shiftMonth(1)} aria-label="Bulan berikutnya"><span className="material-symbols-outlined">chevron_right</span></button>
        </div>
        <div className="date-field__weekdays">{WEEKDAYS.map(w=><span key={w}>{w}</span>)}</div>
        <div className="date-field__grid">{cells.map((d,i)=>{
          if(!d) return <span key={`e${i}`} className="date-field__empty"/>;
          const isSel=selected&&selected.y===viewY&&selected.m===viewM&&selected.d===d;
          const today=parseIsoParts(todayIso());const isToday=today&&today.y===viewY&&today.m===viewM&&today.d===d;
          return <button key={`${viewY}-${viewM}-${d}`} type="button" className={`date-field__day${isSel?" is-selected":""}${isToday?" is-today":""}`} onClick={()=>pickDay(d)}>{d}</button>;
        })}</div>
        <div className="date-field__footer">
          <button type="button" className="btn-secondary" style={{fontSize:12,padding:"4px 10px"}} onClick={()=>{const t=parseIsoParts(todayIso());setViewY(t.y);setViewM(t.m);pickDay(t.d);}}>Hari ini</button>
           <button type="button" className="btn-secondary" style={{fontSize:12,padding:"4px 10px"}} onClick={()=>setOpen(false)}>Batal</button>
        </div>
      </div>}
      {open && <DropPositionFix open={open} rootRef={rootRef} popupRef={popupRef} />}
    </div>
  );
}

/** Window-level listener: positions the popup fixed relative to viewport when it opens. */
function DropPositionFix({open,rootRef,popupRef}) {
  useEffect(()=>{
    if(!open)return;
    const fn=()=>{
      const root=rootRef.current?.getBoundingClientRect();if(!root)return;
      const popup=popupRef.current;if(!popup)return;
      const ph=Math.min(320,window.innerHeight-24);
      const spaceBelow=window.innerHeight-root.bottom-8;
      const spaceAbove=root.top-8;
      if(spaceBelow<ph&&spaceAbove>spaceBelow){
        popup.style.position='fixed';popup.style.bottom=`${window.innerHeight-root.top+6}px`;popup.style.left=`${root.left}px`;popup.style.width=`${Math.min(root.width,300)}px`;popup.style.top='auto';
      }else{
        popup.style.position='fixed';popup.style.top=`${root.bottom+6}px`;popup.style.left=`${root.left}px`;popup.style.width=`${Math.min(root.width,300)}px`;popup.style.bottom='auto';
      }
    };
    fn();
    window.addEventListener('scroll',fn,true);window.addEventListener('resize',fn);
    return()=>{window.removeEventListener('scroll',fn,true);window.removeEventListener('resize',fn);};
  },[open,rootRef,popupRef]);
  return null;
}
