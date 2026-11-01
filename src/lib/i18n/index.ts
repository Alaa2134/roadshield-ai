import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { DevSettings, I18nManager } from 'react-native';
import ar from './ar';
import en from './en';
import type { Language } from '@/stores/settings';

export function deviceLanguage(): Language {
  const code = getLocales()[0]?.languageCode?.toLowerCase();
  return code === 'ar' ? 'ar' : 'en';
}

export function resolveLanguage(preference: Language | null): Language {
  return preference ?? deviceLanguage();
}

let initialized = false;

export function initI18n(language: Language) {
  if (initialized) {
    if (i18n.language !== language) void i18n.changeLanguage(language);
    return i18n;
  }
  initialized = true;
  void i18n.use(initReactI18next).init({
    resources: { en: { translation: en }, ar: { translation: ar } },
    lng: language,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}

/** True when the native layout direction does not match the language yet. */
export function needsDirectionChange(language: Language): boolean {
  return I18nManager.isRTL !== (language === 'ar');
}

/**
 * Applies the layout direction for a language. React Native only applies a direction change
 * after the JS bundle reloads, so callers reload the app when this returns true.
 */
export function applyDirection(language: Language): boolean {
  const rtl = language === 'ar';
  if (I18nManager.isRTL === rtl) return false;
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  I18nManager.swapLeftAndRightInRTL(true);
  return true;
}

export async function reloadApp(): Promise<void> {
  try {
    const Updates = await import('expo-updates');
    await Updates.reloadAsync();
  } catch {
    if (__DEV__) DevSettings.reload();
  }
}

export default i18n;
