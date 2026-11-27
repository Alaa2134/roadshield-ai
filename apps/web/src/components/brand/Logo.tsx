// RoadShield mark: a shield whose inner form is a road vanishing to the horizon, with a
// detection node. Original artwork.
export function LogoMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="rs-shield" x1="6" y1="3" x2="34" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2878FF" />
          <stop offset="1" stopColor="#00B8A9" />
        </linearGradient>
      </defs>
      <path d="M20 2.5 34.5 8v11.2c0 9-6.1 15.6-14.5 18.3C11.6 34.8 5.5 28.2 5.5 19.2V8L20 2.5Z" fill="url(#rs-shield)" />
      <path d="M20 2.5 34.5 8v11.2c0 9-6.1 15.6-14.5 18.3" fill="#fff" fillOpacity=".08" />
      <path d="M17.6 12.5h4.8l4.6 19.2a14.9 14.9 0 0 1-3.1 1.9h-.7l-1-6.1h-4.4l-1 6.1h-.7a14.9 14.9 0 0 1-3.1-1.9l4.6-19.2Z" fill="#071629" fillOpacity=".9" />
      <path d="M20 15.2v2.6M20 21v3" stroke="#51C7F5" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="28.2" cy="12.4" r="2.3" fill="#fff" />
      <circle cx="28.2" cy="12.4" r="1" fill="#2878FF" />
    </svg>
  );
}

export function Logo({ dark = false, size = 30, label = 'RoadShield AI' }: { dark?: boolean; size?: number; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2.5" aria-label={label}>
      <LogoMark size={size} />
      <span className={`text-[15px] font-[650] tracking-[-0.02em] ${dark ? 'text-white' : 'text-ink'}`}>
        RoadShield<span className={dark ? 'text-cyan' : 'text-accent'}> AI</span>
      </span>
    </span>
  );
}
