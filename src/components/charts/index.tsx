import { useEffect, useMemo, useState } from 'react';
import { Pressable, View, type GestureResponderEvent } from 'react-native';
import Animated, { Easing, FadeIn, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { Text } from '@/components/ui/Text';
import { formatNumber } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useTheme } from '@/theme/ThemeProvider';

/* ----------------------------------------------------------------- line chart */
type Series = { label: string; color: string; values: number[] };

/** Multi-series line chart. Tap or drag across it to inspect a day. */
export function LineChart({ labels, series, height = 180 }: { labels: string[]; series: Series[]; height?: number }) {
  const { p, isRTL } = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const n = labels.length;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const padY = 16;
  const x = (i: number) => {
    const raw = n <= 1 ? width / 2 : (i / (n - 1)) * (width - 8) + 4;
    return isRTL ? width - raw : raw;
  };
  const y = (v: number) => height - padY - (v / max) * (height - padY * 2);

  const paths = useMemo(
    () =>
      series.map((s) =>
        s.values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [series, width, height, isRTL],
  );

  const pick = (e: GestureResponderEvent) => {
    if (width <= 0 || n === 0) return;
    let rel = e.nativeEvent.locationX / width;
    if (isRTL) rel = 1 - rel;
    const i = Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1))));
    if (i !== selected) haptic.tap();
    setSelected(i);
  };

  return (
    <View style={{ gap: 10 }}>
      <Pressable
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={pick}
        onTouchMove={pick}
        accessibilityRole="image"
        accessibilityLabel={series.map((s) => `${s.label}: ${s.values.reduce((a, b) => a + b, 0)}`).join(', ')}
        style={{ height }}
      >
        {width > 0 ? (
          <Animated.View entering={FadeIn.duration(500)}>
            <Svg width={width} height={height}>
              {[0, 0.5, 1].map((f) => (
                <Line key={f} x1={0} x2={width} y1={y(max * f)} y2={y(max * f)} stroke={p.border} strokeDasharray="4 6" />
              ))}
              <SvgText x={isRTL ? width - 2 : 2} y={y(max) - 4} fill={p.textFaint} fontSize={10} textAnchor={isRTL ? 'end' : 'start'}>
                {formatNumber(max)}
              </SvgText>
              {paths.map((d, i) => (
                <Path key={series[i]!.label} d={d} stroke={series[i]!.color} strokeWidth={2.5} fill="none" strokeLinejoin="round" />
              ))}
              {selected != null ? (
                <G>
                  <Line x1={x(selected)} x2={x(selected)} y1={padY / 2} y2={height - padY / 2} stroke={p.textFaint} />
                  {series.map((s) => (
                    <Circle key={s.label} cx={x(selected)} cy={y(s.values[selected] ?? 0)} r={4.5} fill={s.color} stroke={p.surface} strokeWidth={2} />
                  ))}
                </G>
              ) : null}
            </Svg>
          </Animated.View>
        ) : null}
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        {series.map((s) => (
          <View key={s.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text variant="caption" tone="muted">
              {s.label}
              {selected != null ? `: ${formatNumber(s.values[selected] ?? 0)}` : ''}
            </Text>
          </View>
        ))}
        {selected != null ? (
          <Text variant="caption" tone="faint">
            {labels[selected]}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* ----------------------------------------------------------------- horizontal bars */
function Bar({ fraction, color, delay }: { fraction: number; color: string; delay: number }) {
  const { p, reduceMotion } = useTheme();
  const w = useSharedValue(reduceMotion ? fraction : 0);
  useEffect(() => {
    w.value = reduceMotion ? fraction : withDelay(delay, withTiming(fraction, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, [fraction, delay, reduceMotion, w]);
  const style = useAnimatedStyle(() => ({ width: `${Math.max(2, w.value * 100)}%` }));
  return (
    <View style={{ height: 10, borderRadius: 5, backgroundColor: p.surface2, overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: 5, backgroundColor: color }, style]} />
    </View>
  );
}

export function BarList({
  items,
  color,
  onPressItem,
}: {
  items: { key: string; label: string; value: number; color?: string }[];
  color?: string;
  onPressItem?: (key: string) => void;
}) {
  const { p } = useTheme();
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <View style={{ gap: 12 }}>
      {items.map((item, idx) => (
        <Pressable
          key={item.key}
          disabled={!onPressItem}
          onPress={() => onPressItem?.(item.key)}
          accessibilityLabel={`${item.label}: ${item.value}`}
          style={{ gap: 6 }}
        >
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
              {item.label}
            </Text>
            <Text variant="caption" tone="muted">
              {formatNumber(item.value)}
            </Text>
          </View>
          <Bar fraction={item.value / max} color={item.color ?? color ?? p.primary} delay={idx * 60} />
        </Pressable>
      ))}
    </View>
  );
}

/* ----------------------------------------------------------------- donut */
export function Donut({
  segments,
  size = 140,
  centerLabel,
  centerValue,
}: {
  segments: { key: string; label: string; value: number; color: string }[];
  size?: number;
  centerLabel?: string;
  centerValue?: string;
}) {
  const { p } = useTheme();
  const [active, setActive] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const activeSeg = segments.find((s) => s.key === active);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={p.surface2} strokeWidth={16} fill="none" />
          {total > 0
            ? segments.map((s) => {
                const len = (s.value / total) * c;
                const el = (
                  <Circle
                    key={s.key}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={s.color}
                    strokeWidth={active === s.key ? 20 : 16}
                    fill="none"
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-offset}
                    rotation={-90}
                    origin={`${size / 2}, ${size / 2}`}
                    onPress={() => setActive((a) => (a === s.key ? null : s.key))}
                  />
                );
                offset += len;
                return el;
              })
            : null}
        </Svg>
        <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
          <Text variant="heading">{activeSeg ? formatNumber(activeSeg.value) : (centerValue ?? formatNumber(total))}</Text>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {activeSeg ? activeSeg.label : centerLabel}
          </Text>
        </View>
      </View>
      <View style={{ flex: 1, gap: 8 }}>
        {segments.map((s) => (
          <Pressable
            key={s.key}
            onPress={() => setActive((a) => (a === s.key ? null : s.key))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, opacity: active && active !== s.key ? 0.5 : 1 }}
          >
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: s.color }} />
            <Text variant="caption" style={{ flex: 1 }} numberOfLines={1}>
              {s.label}
            </Text>
            <Text variant="caption" tone="muted">
              {formatNumber(s.value)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
