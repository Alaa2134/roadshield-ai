/**
 * RoadShield AI design tokens. The same values back the NativeWind CSS variables in
 * global.css (for className styling) and this object (for SVG, maps, gradients, icons).
 */
export const brand = {
  primary: '#287BFF',
  cyan: '#00D6FF',
  warning: '#FF9B35',
  danger: '#F04452',
  success: '#13C48A',
  midnight: '#070F1E',
  surface: '#101D32',
} as const;

export type Palette = {
  scheme: 'dark' | 'light';
  bg: string;
  surface: string;
  surface2: string;
  border: string;
  text: string;
  textMuted: string;
  textFaint: string;
  primary: string;
  cyan: string;
  warning: string;
  danger: string;
  success: string;
  overlay: string;
  glass: string;
  mapStyle: 'dark' | 'light';
};

export const darkPalette: Palette = {
  scheme: 'dark',
  bg: '#070F1E',
  surface: '#101D32',
  surface2: '#16263F',
  border: '#22355A',
  text: '#EAF1FF',
  textMuted: '#9DB0D0',
  textFaint: '#5E7398',
  primary: brand.primary,
  cyan: brand.cyan,
  warning: brand.warning,
  danger: brand.danger,
  success: brand.success,
  overlay: 'rgba(3,8,18,0.72)',
  glass: 'rgba(16,29,50,0.78)',
  mapStyle: 'dark',
};

export const lightPalette: Palette = {
  scheme: 'light',
  bg: '#F2F5FB',
  surface: '#FFFFFF',
  surface2: '#E9EFF9',
  border: '#D5DEEC',
  text: '#0A1628',
  textMuted: '#4E6283',
  textFaint: '#8A9AB5',
  primary: '#1F6CF0',
  cyan: '#00A9CC',
  warning: '#E9822A',
  danger: '#D93545',
  success: '#0FA676',
  overlay: 'rgba(10,22,40,0.45)',
  glass: 'rgba(255,255,255,0.86)',
  mapStyle: 'light',
};

export const severityColor = (p: Palette, severity: 'low' | 'medium' | 'high' | 'critical'): string =>
  ({ low: p.success, medium: p.cyan, high: p.warning, critical: p.danger })[severity];

export const priorityColor = (p: Palette, level: string | undefined): string =>
  level === 'high' ? p.danger : level === 'medium' ? p.warning : level === 'low' ? p.success : p.textFaint;

export const radii = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 } as const;

export const fonts = {
  en: {
    regular: 'IBMPlexSansArabic_400Regular',
    medium: 'IBMPlexSansArabic_500Medium',
    semibold: 'IBMPlexSansArabic_600SemiBold',
    bold: 'IBMPlexSansArabic_700Bold',
    display: 'Sora_700Bold',
    displaySemi: 'Sora_600SemiBold',
  },
  ar: {
    regular: 'IBMPlexSansArabic_400Regular',
    medium: 'IBMPlexSansArabic_500Medium',
    semibold: 'IBMPlexSansArabic_600SemiBold',
    bold: 'IBMPlexSansArabic_700Bold',
    display: 'IBMPlexSansArabic_700Bold',
    displaySemi: 'IBMPlexSansArabic_600SemiBold',
  },
} as const;

/** Dark Google/Apple map style used on Android (iOS uses userInterfaceStyle). */
export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#0b1628' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8ea3c7' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#070f1e' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#1b2c48' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#24406b' }] },
  { featureType: 'road', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#06243f' }] },
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#2a4672' }] },
];
