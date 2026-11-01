import { colorScheme as nwColorScheme } from 'nativewind';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, I18nManager, useColorScheme } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSettings } from '@/stores/settings';
import { darkPalette, fonts, lightPalette, type Palette } from './tokens';

type ThemeValue = {
  p: Palette;
  isDark: boolean;
  isRTL: boolean;
  lang: 'en' | 'ar';
  font: (typeof fonts)['en'] | (typeof fonts)['ar'];
  reduceMotion: boolean;
};

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSettings((s) => s.theme);
  const system = useColorScheme();
  const { i18n } = useTranslation();
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    nwColorScheme.set(preference);
  }, [preference]);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference;
    const lang = i18n.language === 'ar' ? 'ar' : 'en';
    return {
      p: scheme === 'dark' ? darkPalette : lightPalette,
      isDark: scheme === 'dark',
      isRTL: I18nManager.isRTL,
      lang,
      font: fonts[lang],
      reduceMotion,
    };
  }, [preference, system, i18n.language, reduceMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}
