import { useEffect } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '@/theme/ThemeProvider';

/** Gentle floating motion for illustrations (disabled when Reduce Motion is on). */
function Float({ children, size }: { children: React.ReactNode; size: number }) {
  const { reduceMotion } = useTheme();
  const t = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [t, reduceMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * t.value }] }));
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: size, height: size }, style]}
    >
      {children}
    </Animated.View>
  );
}

function Shield({ x = 0, y = 0, s = 1 }: { x?: number; y?: number; s?: number }) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <Path d="M100 10 L168 35 C169 92 149 145 100 177 C51 145 31 92 32 35 Z" fill="url(#shieldG)" />
      <Path d="M91 58 L109 58 L138 180 L62 180 Z" fill="#070F1E" opacity={0.9} />
      <Path d="M100 66 V80 M100 92 V110 M100 124 V150" stroke="#fff" strokeWidth={5} strokeLinecap="round" />
      <Circle cx={124} cy={118} r={10} fill="#FF9B35" />
      <Circle cx={124} cy={118} r={17} fill="none" stroke="#FF9B35" strokeWidth={3} opacity={0.5} />
    </G>
  );
}

function Defsets() {
  return (
    <Defs>
      <LinearGradient id="shieldG" x1="0" y1="0" x2="1" y2="1">
        <Stop offset="0" stopColor="#00D6FF" />
        <Stop offset="0.6" stopColor="#287BFF" />
        <Stop offset="1" stopColor="#1A4FD6" />
      </LinearGradient>
      <LinearGradient id="glow" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#287BFF" stopOpacity={0.35} />
        <Stop offset="1" stopColor="#287BFF" stopOpacity={0} />
      </LinearGradient>
      <LinearGradient id="road" x1="0" y1="0" x2="0" y2="1">
        <Stop offset="0" stopColor="#1B2C48" />
        <Stop offset="1" stopColor="#0B1628" />
      </LinearGradient>
    </Defs>
  );
}

/** Onboarding 1 — shield over a smart-city skyline. */
export function WelcomeArt({ size = 280 }: { size?: number }) {
  return (
    <Float size={size}>
      <Svg width={size} height={size} viewBox="0 0 280 280">
        <Defsets />
        <Circle cx={140} cy={130} r={120} fill="url(#glow)" />
        {[30, 58, 84, 182, 208, 236].map((x, i) => (
          <Rect key={x} x={x} y={150 - (i % 3) * 22 - 20} width={20} height={110 + (i % 3) * 22} rx={4} fill="#16263F" />
        ))}
        {[34, 62, 88, 186, 212, 240].map((x, i) => (
          <G key={x}>
            <Rect x={x} y={150 - (i % 3) * 22} width={4} height={4} fill="#00D6FF" opacity={0.7} />
            <Rect x={x + 8} y={166 - (i % 3) * 22} width={4} height={4} fill="#287BFF" opacity={0.8} />
          </G>
        ))}
        <Path d="M0 250 L280 250 L280 280 L0 280 Z" fill="#101D32" />
        <Shield x={40} y={40} s={1} />
      </Svg>
    </Float>
  );
}

/** Onboarding 2 — phone camera with an AI bounding box over a pothole. */
export function DetectArt({ size = 280 }: { size?: number }) {
  return (
    <Float size={size}>
      <Svg width={size} height={size} viewBox="0 0 280 280">
        <Defsets />
        <Circle cx={140} cy={140} r={118} fill="url(#glow)" />
        <Rect x={78} y={30} width={124} height={220} rx={22} fill="#101D32" stroke="#22355A" strokeWidth={3} />
        <Rect x={88} y={50} width={104} height={170} rx={12} fill="url(#road)" />
        <Path d="M140 60 V78 M140 92 V112 M140 128 V150" stroke="#fff" strokeWidth={4} strokeLinecap="round" opacity={0.7} />
        <Path d="M108 168 C116 156 160 154 172 166 C180 176 160 188 140 188 C118 188 100 180 108 168 Z" fill="#070F1E" />
        <Rect x={100} y={150} width={80} height={46} rx={6} fill="none" stroke="#00D6FF" strokeWidth={3} strokeDasharray="8 5" />
        <Rect x={100} y={136} width={58} height={14} rx={4} fill="#00D6FF" />
        <Circle cx={140} cy={236} r={8} fill="#22355A" />
        <Circle cx={214} cy={70} r={16} fill="#FF9B35" opacity={0.9} />
        <Path d="M207 70 L212 75 L222 64" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
    </Float>
  );
}

/** Onboarding 3 — map with hazard pins and pulsing rings. */
export function MapArt({ size = 280 }: { size?: number }) {
  return (
    <Float size={size}>
      <Svg width={size} height={size} viewBox="0 0 280 280">
        <Defsets />
        <Rect x={24} y={40} width={232} height={200} rx={28} fill="#0B1628" stroke="#22355A" strokeWidth={2} />
        <Path d="M24 120 C90 100 120 170 256 130" stroke="#24406B" strokeWidth={14} fill="none" />
        <Path d="M110 40 C120 110 90 170 130 240" stroke="#1B2C48" strokeWidth={10} fill="none" />
        <Path d="M24 190 L256 200" stroke="#1B2C48" strokeWidth={8} fill="none" />
        {[
          [86, 112, '#F04452'],
          [176, 140, '#FF9B35'],
          [124, 200, '#00D6FF'],
          [206, 92, '#13C48A'],
        ].map(([x, y, c]) => (
          <G key={`${x}-${y}`}>
            <Circle cx={x as number} cy={y as number} r={20} fill={c as string} opacity={0.18} />
            <Circle cx={x as number} cy={y as number} r={9} fill={c as string} stroke="#fff" strokeWidth={2.5} />
          </G>
        ))}
        <Circle cx={150} cy={170} r={7} fill="#287BFF" stroke="#fff" strokeWidth={3} />
      </Svg>
    </Float>
  );
}

/** Onboarding 4 — community: three people around a repaired road with a check. */
export function CommunityArt({ size = 280 }: { size?: number }) {
  return (
    <Float size={size}>
      <Svg width={size} height={size} viewBox="0 0 280 280">
        <Defsets />
        <Circle cx={140} cy={140} r={120} fill="url(#glow)" />
        <Path d="M60 250 L120 120 L160 120 L220 250 Z" fill="url(#road)" />
        <Path d="M140 130 V150 M140 168 V196 M140 214 V246" stroke="#fff" strokeWidth={5} strokeLinecap="round" opacity={0.8} />
        {[
          [62, 110, '#287BFF'],
          [140, 70, '#00D6FF'],
          [218, 110, '#FF9B35'],
        ].map(([x, y, c]) => (
          <G key={`${x}`}>
            <Circle cx={x as number} cy={y as number} r={16} fill={c as string} />
            <Path
              d={`M${(x as number) - 24} ${(y as number) + 46} C${(x as number) - 22} ${(y as number) + 20} ${(x as number) + 22} ${(y as number) + 20} ${(x as number) + 24} ${(y as number) + 46} Z`}
              fill={c as string}
              opacity={0.85}
            />
          </G>
        ))}
        <Circle cx={140} cy={182} r={26} fill="#13C48A" />
        <Path d="M128 182 L137 191 L153 173" stroke="#fff" strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </Float>
  );
}

/** Empty states. */
export function EmptyReportsArt({ size = 150 }: { size?: number }) {
  const { p } = useTheme();
  return (
    <Float size={size}>
      <Svg width={size} height={size} viewBox="0 0 150 150">
        <Defsets />
        <Circle cx={75} cy={75} r={66} fill={p.surface2} />
        <Rect x={44} y={34} width={62} height={80} rx={10} fill={p.surface} stroke={p.border} strokeWidth={2} />
        <Path d="M56 56 H94 M56 70 H88 M56 84 H80" stroke={p.textFaint} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={104} cy={104} r={18} fill={p.primary} />
        <Path d="M104 96 V112 M96 104 H112" stroke="#fff" strokeWidth={4} strokeLinecap="round" />
      </Svg>
    </Float>
  );
}

export function EmptyBellArt({ size = 150 }: { size?: number }) {
  const { p } = useTheme();
  return (
    <Float size={size}>
      <Svg width={size} height={size} viewBox="0 0 150 150">
        <Circle cx={75} cy={75} r={66} fill={p.surface2} />
        <Path d="M75 36 C56 36 48 52 48 68 V88 L40 100 H110 L102 88 V68 C102 52 94 36 75 36 Z" fill={p.surface} stroke={p.border} strokeWidth={2} />
        <Circle cx={75} cy={108} r={9} fill={p.warning} />
        <Circle cx={104} cy={44} r={7} fill={p.cyan} />
      </Svg>
    </Float>
  );
}

export function EmptyMapArt({ size = 150 }: { size?: number }) {
  const { p } = useTheme();
  return (
    <Float size={size}>
      <Svg width={size} height={size} viewBox="0 0 150 150">
        <Circle cx={75} cy={75} r={66} fill={p.surface2} />
        <Path d="M30 50 L62 38 L90 50 L120 38 V102 L90 114 L62 102 L30 114 Z" fill={p.surface} stroke={p.border} strokeWidth={2} />
        <Path d="M62 38 V102 M90 50 V114" stroke={p.border} strokeWidth={2} />
        <Circle cx={76} cy={74} r={12} fill={p.success} />
        <Path d="M70 74 L75 79 L83 69" stroke="#fff" strokeWidth={3} fill="none" strokeLinecap="round" />
      </Svg>
    </Float>
  );
}

export function BrandMark({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="30 5 140 180">
      <Defsets />
      <Shield />
    </Svg>
  );
}
