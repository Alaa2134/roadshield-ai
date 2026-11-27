'use client';
import { useCallback, useRef, useState, type ReactNode } from 'react';

/**
 * Drag (mouse/touch/keyboard) to compare two layers of the SAME image — e.g. the original photo
 * and the photo with RoadShield Vision's real detections — or two real evidence photos.
 */
export function CompareSlider({ left, right, leftLabel, rightLabel, ratio }: { left: ReactNode; right: ReactNode; leftLabel: string; rightLabel: string; ratio: string }) {
  const [x, setX] = useState(0.5);
  const box = useRef<HTMLDivElement>(null);
  const move = useCallback((clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setX(Math.max(0, Math.min(1, (clientX - r.left) / r.width)));
  }, []);
  return (
    <div ref={box} dir="ltr" className="relative w-full touch-none select-none overflow-hidden rounded-2xl" style={{ aspectRatio: ratio }}
      onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); move(e.clientX); }}
      onPointerMove={(e) => { if (e.buttons) move(e.clientX); }}>
      <div className="absolute inset-0">{right}</div>
      <div className="absolute inset-0" style={{ clipPath: `inset(0 ${(1 - x) * 100}% 0 0)` }}>{left}</div>
      <div className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,.25)]" style={{ left: `${x * 100}%` }}>
        <button type="button" role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(x * 100)} aria-label={`${leftLabel} / ${rightLabel}`}
          onKeyDown={(e) => { if (e.key === 'ArrowLeft') setX((v) => Math.max(0, v - 0.05)); if (e.key === 'ArrowRight') setX((v) => Math.min(1, v + 0.05)); }}
          className="absolute top-1/2 grid size-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize place-items-center rounded-full bg-white text-[#071629] shadow-lg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="m9 18-6-6 6-6M15 6l6 6-6 6" /></svg>
        </button>
      </div>
      <span className="pointer-events-none absolute start-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-[600] text-white">{leftLabel}</span>
      <span className="pointer-events-none absolute end-3 top-3 rounded-md bg-black/60 px-2 py-1 text-[11px] font-[600] text-white">{rightLabel}</span>
    </div>
  );
}
