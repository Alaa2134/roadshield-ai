'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

/**
 * Click to open full-screen; wheel / pinch / buttons to zoom (1–5×), drag to pan, double-click
 * to toggle, Esc to close. `children` is rendered both as the thumbnail and (scaled) in the
 * viewer, so annotation overlays stay locked to the image.
 */
export function Lightbox({ children, label, ratio }: { children: ReactNode; label: string; ratio: string }) {
  const [open, setOpen] = useState(false);
  const [z, setZ] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const pinch = useRef<{ d: number; z: number } | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); if (e.key === '+') setZ((v) => Math.min(5, v + 0.5)); if (e.key === '-') setZ((v) => Math.max(1, v - 0.5)); };
    document.body.style.overflow = 'hidden'; window.addEventListener('keydown', k);
    return () => { document.body.style.overflow = ''; window.removeEventListener('keydown', k); };
  }, [open]);
  useEffect(() => { if (z === 1) setPan({ x: 0, y: 0 }); }, [z]);
  const close = () => { setOpen(false); setZ(1); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative block w-full cursor-zoom-in text-start" aria-label={label}>
        {children}
        <span className="absolute bottom-3 end-3 grid size-8 place-items-center rounded-full bg-black/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><Maximize2 size={14} /></span>
      </button>
      {open ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 fade-up" role="dialog" aria-modal="true" aria-label={label}
          onWheel={(e) => setZ((v) => Math.max(1, Math.min(5, v - e.deltaY * 0.0025)))}>
          <div className="relative w-[min(92vw,1400px)] touch-none" style={{ aspectRatio: ratio, maxHeight: '86vh' }}
            onDoubleClick={() => setZ((v) => (v > 1 ? 1 : 2.5))}
            onPointerDown={(e) => { pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); (e.currentTarget as Element).setPointerCapture(e.pointerId);
              if (pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; pinch.current = { d: Math.hypot(a!.x - b!.x, a!.y - b!.y), z }; }
              else drag.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y }; }}
            onPointerMove={(e) => { if (!pointers.current.has(e.pointerId)) return; pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pinch.current && pointers.current.size === 2) { const [a, b] = [...pointers.current.values()]; setZ(Math.max(1, Math.min(5, pinch.current.z * Math.hypot(a!.x - b!.x, a!.y - b!.y) / pinch.current.d))); }
              else if (drag.current && z > 1) setPan({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }); }}
            onPointerUp={(e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; drag.current = null; }}>
            <div className="h-full w-full overflow-hidden rounded-xl">
              <div className="h-full w-full transition-transform duration-150" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${z})`, cursor: z > 1 ? 'grab' : 'zoom-in' }}>{children}</div>
            </div>
          </div>
          <div className="absolute bottom-6 start-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-white/10 p-1.5 backdrop-blur rtl:translate-x-1/2">
            <button type="button" className="grid size-9 place-items-center rounded-full text-white hover:bg-white/15" aria-label="Zoom out" onClick={() => setZ((v) => Math.max(1, v - 0.5))}><ZoomOut size={17} /></button>
            <span className="grid min-w-12 place-items-center text-xs text-white/80 tabular">{Math.round(z * 100)}%</span>
            <button type="button" className="grid size-9 place-items-center rounded-full text-white hover:bg-white/15" aria-label="Zoom in" onClick={() => setZ((v) => Math.min(5, v + 0.5))}><ZoomIn size={17} /></button>
          </div>
          <button type="button" onClick={close} className="absolute end-5 top-5 grid size-10 place-items-center rounded-full bg-white/12 text-white hover:bg-white/20" aria-label="Close"><X size={20} /></button>
        </div>
      ) : null}
    </>
  );
}
