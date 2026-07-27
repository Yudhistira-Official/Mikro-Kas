import { useEffect, useRef } from "react";

/**
 * Captures input from USB/HID barcode scanners (keyboard wedge).
 * Most scanners type characters quickly then send Enter.
 *
 * Parameters:
 * - `onScan`: callback(string) when a complete barcode is detected
 * - `enabled`: listen only when true
 * - `minLength`: minimum barcode length (default 3)
 * - `maxGapMs`: max gap between keys to count as one scan (default 50)
 */
export function useHardwareScanner(onScan, { enabled = true, minLength = 3, maxGapMs = 50 } = {}) {
  const bufferRef = useRef("");
  const lastKeyAtRef = useRef(0);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;

    const isEditable = (el) => {
      if (!el || el === document.body) return false;
      const tag = el.tagName;
      if (tag === "TEXTAREA" || tag === "SELECT") return true;
      if (tag === "INPUT") {
        const type = (el.type || "text").toLowerCase();
        // Number pads / qty fields still receive scanner if focus is search-like
        if (["button", "checkbox", "radio", "file", "submit", "reset", "range", "color"].includes(type)) return false;
        // Allow scanner to override slow typing only if field is empty or dedicated scan field
        if (el.dataset?.scanner !== "allow" && el.value && document.activeElement === el) {
          // If user is actively typing slowly in a filled field, don't hijack
          return true;
        }
      }
      if (el.isContentEditable) return true;
      return false;
    };

    const flush = () => {
      const code = bufferRef.current.trim();
      bufferRef.current = "";
      if (code.length >= minLength) onScanRef.current?.(code);
    };

    const onKeyDown = (e) => {
      // Ignore modifiers-only / shortcuts
      if (e.ctrlKey || e.altKey || e.metaKey) return;

      const now = Date.now();
      if (now - lastKeyAtRef.current > maxGapMs) {
        bufferRef.current = "";
      }
      lastKeyAtRef.current = now;

      if (e.key === "Enter") {
        if (bufferRef.current.length >= minLength) {
          // Prevent form submit when scanner finishes
          e.preventDefault();
          e.stopPropagation();
          flush();
        }
        return;
      }

      // Printable single character from scanner
      if (e.key.length === 1) {
        // If focused on a slow-typing field with existing content, skip capture
        const active = document.activeElement;
        if (isEditable(active) && active.dataset?.scanner !== "allow" && active.value?.length > 0) {
          // Still allow if keystrokes are scanner-fast (gap already small)
          if (now - (active._lastManual || 0) > maxGapMs * 3 && bufferRef.current.length === 0) {
            // treat as manual; mark
            active._lastManual = now;
            return;
          }
        }
        bufferRef.current += e.key;
        // Cap runaway buffer
        if (bufferRef.current.length > 128) bufferRef.current = bufferRef.current.slice(-128);
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [enabled, minLength, maxGapMs]);
}
