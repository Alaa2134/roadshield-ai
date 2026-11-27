'use client';
import dynamic from 'next/dynamic';
import type { ComponentProps } from 'react';
import type { RoadLayers3D as T } from './RoadLayers3D';

// WebGL scene is client-only and code-split so it never blocks first paint.
const RoadLayers3D = dynamic(() => import('./RoadLayers3D').then((m) => m.RoadLayers3D), {
  ssr: false,
  loading: () => <div className="h-[420px] w-full animate-pulse rounded-2xl border border-white/10 bg-[#0b1420] sm:h-[480px]" />,
});
export function RoadLayersLazy(props: ComponentProps<typeof T>) {
  return <RoadLayers3D {...props} />;
}
