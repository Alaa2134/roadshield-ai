'use client';
// Interactive cut-away of a TYPICAL flexible pavement (illustrative layer model — not a scan of
// any real road). Layers, a pothole and fatigue cracking can be explored, separated ("explode"),
// and the two most common repairs (patch / mill & overlay) applied. Thicknesses are typical
// textbook values; real structures vary and must be confirmed by coring.
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export type LayerKey = 'surface' | 'binder' | 'base' | 'subbase' | 'subgrade';
export type RepairMode = 'damaged' | 'patch' | 'overlay';
type Labels = Record<LayerKey, string> & { title: string; note: string; explode: string; modes: Record<RepairMode, string>; thickness: string; hint: string; newLayer: string };

// thickness in metres (typical values, illustrative)
const LAYERS: { key: LayerKey; t: number; color: string; mm: string }[] = [
  { key: 'surface', t: 0.05, color: '#2b2f36', mm: '40–50' },
  { key: 'binder', t: 0.07, color: '#3a3f47', mm: '60–80' },
  { key: 'base', t: 0.18, color: '#7a6f5f', mm: '150–200' },
  { key: 'subbase', t: 0.22, color: '#9c8e74', mm: '200–250' },
  { key: 'subgrade', t: 0.35, color: '#6d5a43', mm: '—' },
];
const W = 3.2; // road width shown (m)
const L = 2.4; // section length (m)

function useAsphaltTexture(crack: boolean) {
  return useMemo(() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d')!;
    g.fillStyle = '#30343b'; g.fillRect(0, 0, 512, 512);
    // aggregate speckle
    for (let i = 0; i < 9000; i++) { const v = 40 + Math.random() * 60; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5); }
    // lane marking
    g.fillStyle = '#e8dfb8'; for (let y = 0; y < 512; y += 96) g.fillRect(250, y, 12, 56);
    if (crack) {
      // fatigue (alligator) cracking polygon network in the wheel path
      g.strokeStyle = '#0d0f12'; g.lineWidth = 2.2;
      const pts: [number, number][] = [];
      for (let i = 0; i < 70; i++) pts.push([340 + Math.random() * 140, 120 + Math.random() * 280]);
      for (const [x, y] of pts) { g.beginPath(); g.moveTo(x, y); const n = pts[Math.floor(Math.random() * pts.length)]!; if (Math.hypot(n[0] - x, n[1] - y) < 60) { g.lineTo(n[0], n[1]); g.stroke(); } }
      // longitudinal crack
      g.beginPath(); g.moveTo(120, 0); for (let y = 0; y <= 512; y += 16) g.lineTo(120 + Math.sin(y / 30) * 6 + Math.random() * 4, y); g.stroke();
    }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return tex;
  }, [crack]);
}

function Layer({ y, t, color, active, dim, onHover, map, children }: { y: number; t: number; color: string; active: boolean; dim: boolean; onHover: (v: boolean) => void; map?: THREE.Texture | null; children?: React.ReactNode }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.y += (y - ref.current.position.y) * 0.14;
  });
  return (
    <mesh ref={ref} position={[0, y, 0]} castShadow receiveShadow
      onPointerOver={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); onHover(true); }} onPointerOut={() => onHover(false)}>
      <boxGeometry args={[W, t, L]} />
      <meshStandardMaterial color={map ? '#ffffff' : color} map={map ?? undefined} roughness={0.92} metalness={0.02}
        emissive={active ? '#2878ff' : '#000000'} emissiveIntensity={active ? 0.25 : 0} transparent opacity={dim ? 0.35 : 1} />
      {children}
    </mesh>
  );
}

function Scene({ explode, mode, hover, setHover, reduceMotion }: { explode: number; mode: RepairMode; hover: LayerKey | 'repair' | null; setHover: (k: LayerKey | 'repair' | null) => void; reduceMotion: boolean }) {
  const tex = useAsphaltTexture(mode === 'damaged');
  const fresh = useAsphaltTexture(false);
  const { invalidate } = useThree();
  useEffect(() => { invalidate(); }, [explode, mode, hover, invalidate]);
  // stack from the top surface (y=0) downwards, with explode gaps
  let top = 0;
  const placed = LAYERS.map((l, i) => {
    const skipSurfaceTop = mode === 'overlay' && l.key === 'surface';
    const cy = top - l.t / 2 - i * explode * 0.35;
    top -= l.t;
    return { ...l, cy, skipSurfaceTop };
  });
  const surf = placed[0]!;
  const overlayY = surf.cy + (mode === 'overlay' ? explode * 0.4 : 0);
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 3]} intensity={1.4} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[-4, 2, -3]} intensity={0.35} color="#9fc3ff" />
      <group rotation={[0, -0.55, 0]} position={[0, 0.35, 0]}>
        {placed.map((l) => {
          if (l.key === 'surface' && mode === 'overlay') return null; // milled away, replaced below
          return (
            <Layer key={l.key} y={l.cy} t={l.t} color={l.color} active={hover === l.key} dim={hover !== null && hover !== l.key && hover !== 'repair'}
              onHover={(v) => setHover(v ? l.key : null)} map={l.key === 'surface' ? tex : undefined}>
              {l.key === 'surface' && mode === 'damaged' ? (
                // pothole: a depression through the surface course
                <group position={[0.75, l.t / 2 + 0.002, -0.25]} rotation={[-Math.PI / 2, 0, 0]}>
                  {/* crater floor + broken rim, drawn on the surface so it is always visible */}
                  <mesh><circleGeometry args={[0.3, 40]} /><meshStandardMaterial color="#0c0d10" roughness={1} /></mesh>
                  <mesh position={[0, 0, 0.001]}><ringGeometry args={[0.3, 0.36, 40]} /><meshStandardMaterial color="#5b5e63" roughness={1} /></mesh>
                  <mesh position={[0.05, -0.04, 0.002]}><circleGeometry args={[0.16, 24]} /><meshStandardMaterial color="#6d5a43" roughness={1} /></mesh>
                </group>
              ) : null}
            </Layer>
          );
        })}
        {mode === 'patch' ? (
          <mesh position={[0.75, surf.cy + 0.0015, -0.25]} onPointerOver={(e) => { e.stopPropagation(); setHover('repair'); }} onPointerOut={() => setHover(null)}>
            <boxGeometry args={[0.85, surf.t + 0.003, 0.85]} />
            <meshStandardMaterial color="#1d2024" roughness={0.7} emissive={hover === 'repair' ? '#00b8a9' : '#000'} emissiveIntensity={hover === 'repair' ? 0.35 : 0} />
          </mesh>
        ) : null}
        {mode === 'overlay' ? (
          <Layer y={overlayY} t={surf.t} color="#1c1f24" active={hover === 'repair'} dim={false} onHover={(v) => setHover(v ? 'repair' : null)} map={fresh} />
        ) : null}
        {/* shoulder / ground plane */}
        <mesh position={[0, top - 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[9, 7]} />
          <meshStandardMaterial color="#0b1420" roughness={1} />
        </mesh>
      </group>
      <OrbitControls target={[0, -0.05, 0]} enablePan={false} minDistance={4} maxDistance={9} minPolarAngle={0.35} maxPolarAngle={1.35} autoRotate={!reduceMotion && hover === null} autoRotateSpeed={0.35} onChange={() => invalidate()} />
    </>
  );
}

export function RoadLayers3D({ labels }: { labels: Labels }) {
  const [explode, setExplode] = useState(0.3);
  const [mode, setMode] = useState<RepairMode>('damaged');
  const [hover, setHover] = useState<LayerKey | 'repair' | null>(null);
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(m.matches);
    const f = (e: MediaQueryListEvent) => setReduceMotion(e.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f);
  }, []);
  const info = hover === 'repair' ? { name: labels.newLayer, mm: mode === 'overlay' ? '40–50' : '≈ layer depth' } : hover ? { name: labels[hover], mm: LAYERS.find((l) => l.key === hover)!.mm } : null;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b1420]">
      <div className="h-[440px] w-full pb-16 sm:h-[520px] sm:pb-20" aria-label={labels.title} role="img">
        <Canvas shadows dpr={[1, 2]} camera={{ position: [4.6, 2.9, 4.6], fov: 34 }} frameloop={reduceMotion ? 'demand' : 'always'} gl={{ antialias: true }}>
          <Scene explode={explode} mode={mode} hover={hover} setHover={setHover} reduceMotion={reduceMotion} />
        </Canvas>
      </div>
      <div className="pointer-events-none absolute start-4 top-4 max-w-[60%]">
        <p className="text-[11px] font-[600] uppercase tracking-[0.12em] text-[#F5C542] rtl:tracking-normal">{labels.title}</p>
        <p className="mt-1 text-[11.5px] leading-snug text-white/55">{labels.note}</p>
      </div>
      <div className="absolute end-4 top-4 min-h-[54px] min-w-[170px] rounded-xl border border-white/10 bg-black/55 px-3 py-2 text-white backdrop-blur" aria-live="polite">
        {info ? (<><p className="text-[13px] font-[600]">{info.name}</p><p className="text-[11.5px] text-white/60">{labels.thickness}: {info.mm} mm</p></>) : <p className="text-[11.5px] text-white/55">{labels.hint}</p>}
      </div>
      <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3 rounded-xl border border-white/10 bg-black/55 p-3 text-white backdrop-blur sm:flex-row sm:items-center">
        <div className="flex gap-1 rounded-lg bg-white/8 p-1" role="radiogroup" aria-label="Repair">
          {(['damaged', 'patch', 'overlay'] as RepairMode[]).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-[560] transition-colors ${mode === m ? 'bg-white text-[#071629]' : 'text-white/75 hover:text-white'}`}>{labels.modes[m]}</button>
          ))}
        </div>
        <label className="flex flex-1 items-center gap-3 text-[12px] text-white/70">
          {labels.explode}
          <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(Number(e.target.value))} className="flex-1 accent-[#2878ff]" />
        </label>
      </div>
    </div>
  );
}
