import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';

type Variant = 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'caption' | 'label' | 'stat';
type Weight = 'regular' | 'medium' | 'semibold' | 'bold';
type Tone = 'default' | 'muted' | 'faint' | 'primary' | 'cyan' | 'warning' | 'danger' | 'success' | 'inverse';

const sizes: Record<Variant, { fontSize: number; lineHeight: number; weight: Weight; display?: boolean }> = {
  display: { fontSize: 30, lineHeight: 38, weight: 'bold', display: true },
  title: { fontSize: 24, lineHeight: 31, weight: 'bold', display: true },
  heading: { fontSize: 18, lineHeight: 25, weight: 'semibold' },
  subheading: { fontSize: 16, lineHeight: 23, weight: 'semibold' },
  body: { fontSize: 15, lineHeight: 23, weight: 'regular' },
  caption: { fontSize: 13, lineHeight: 19, weight: 'regular' },
  label: { fontSize: 12, lineHeight: 16, weight: 'semibold' },
  stat: { fontSize: 28, lineHeight: 34, weight: 'bold', display: true },
};

export type AppTextProps = TextProps & {
  variant?: Variant;
  weight?: Weight;
  tone?: Tone;
  center?: boolean;
  uppercase?: boolean;
};

export function Text({ variant = 'body', weight, tone = 'default', center, uppercase, style, ...rest }: AppTextProps) {
  const { p, font, lang } = useTheme();
  const spec = sizes[variant];
  const w = weight ?? spec.weight;
  const family = spec.display && w === 'bold' ? font.display : spec.display && w === 'semibold' ? font.displaySemi : font[w];
  const color = {
    default: p.text,
    muted: p.textMuted,
    faint: p.textFaint,
    primary: p.primary,
    cyan: p.cyan,
    warning: p.warning,
    danger: p.danger,
    success: p.success,
    inverse: '#FFFFFF',
  }[tone];
  // Arabic script needs a little more line height to avoid clipping diacritics.
  const lineHeight = lang === 'ar' ? Math.round(spec.lineHeight * 1.12) : spec.lineHeight;
  return (
    <RNText
      maxFontSizeMultiplier={1.6}
      {...rest}
      style={[
        {
          fontFamily: family,
          fontSize: spec.fontSize,
          lineHeight,
          color,
          textAlign: center ? 'center' : undefined,
          writingDirection: lang === 'ar' ? 'rtl' : 'ltr',
          letterSpacing: variant === 'label' && lang === 'en' ? 0.3 : 0,
          textTransform: uppercase && lang === 'en' ? 'uppercase' : 'none',
        },
        style,
      ]}
    />
  );
}
