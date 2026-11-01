import { render, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { initI18n } from '@/lib/i18n';
import { ThemeProvider } from '@/theme/ThemeProvider';

export async function renderWithProviders(ui: ReactElement, language: 'en' | 'ar' = 'en', options?: RenderOptions) {
  const i18n = initI18n(language);
  if (i18n.language !== language) await i18n.changeLanguage(language);
  return render(<ThemeProvider>{ui}</ThemeProvider>, options);
}
