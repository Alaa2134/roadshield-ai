import { ImageResponse } from 'next/og';

export const alt = 'RoadShield — from the pothole to the paid repair';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OG() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72,
        background: 'radial-gradient(60% 60% at 75% 0%, rgba(40,120,255,0.45), transparent 70%), #071629', color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <svg width="64" height="64" viewBox="0 0 40 40"><path d="M20 2.5 34.5 8v11.2c0 9-6.1 15.6-14.5 18.3C11.6 34.8 5.5 28.2 5.5 19.2V8L20 2.5Z" fill="#2878FF"/><path d="M17.6 12.5h4.8l4.6 19.2a14.9 14.9 0 0 1-3.1 1.9h-.7l-1-6.1h-4.4l-1 6.1h-.7a14.9 14.9 0 0 1-3.1-1.9l4.6-19.2Z" fill="#071629"/><circle cx="28.2" cy="12.4" r="2.3" fill="#fff"/></svg>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>RoadShield AI</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>From the pothole to the paid repair.</div>
          <div style={{ fontSize: 30, color: '#A9B6C9' }}>Detect. Predict. Budget. Repair. Optimize.</div>
        </div>
        <div style={{ display: 'flex', gap: 14 }}>
          {['#12A879', '#00B8A9', '#F5A524', '#E5484D'].map((c) => <div key={c} style={{ width: 120, height: 8, borderRadius: 8, background: c }} />)}
        </div>
      </div>
    ),
    size,
  );
}
