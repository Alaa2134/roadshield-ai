import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Language = 'en' | 'ar';
export type ThemePreference = 'system' | 'dark' | 'light';
export type MapKind = 'standard' | 'satellite';

type SettingsState = {
  hydrated: boolean;
  onboardingDone: boolean;
  /** null = follow the device language (when supported). */
  language: Language | null;
  theme: ThemePreference;
  mapType: MapKind;
  warningDistanceM: number;
  voiceWarnings: boolean;
  backgroundAlerts: boolean;
  drivingAcknowledgedAt: number | null;
  setOnboardingDone: () => void;
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemePreference) => void;
  setMapType: (mapType: MapKind) => void;
  setWarningDistance: (meters: number) => void;
  setVoiceWarnings: (on: boolean) => void;
  setBackgroundAlerts: (on: boolean) => void;
  acknowledgeDriving: () => void;
};

export const WARNING_DISTANCES = [150, 300, 500, 800] as const;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      hydrated: false,
      onboardingDone: false,
      language: null,
      theme: 'system',
      mapType: 'standard',
      warningDistanceM: 300,
      voiceWarnings: false,
      backgroundAlerts: false,
      drivingAcknowledgedAt: null,
      setOnboardingDone: () => set({ onboardingDone: true }),
      setLanguage: (language) => set({ language }),
      setTheme: (theme) => set({ theme }),
      setMapType: (mapType) => set({ mapType }),
      setWarningDistance: (warningDistanceM) => set({ warningDistanceM }),
      setVoiceWarnings: (voiceWarnings) => set({ voiceWarnings }),
      setBackgroundAlerts: (backgroundAlerts) => set({ backgroundAlerts }),
      acknowledgeDriving: () => set({ drivingAcknowledgedAt: Date.now() }),
    }),
    {
      name: 'roadshield-settings',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated: _h, ...rest }) => rest,
      onRehydrateStorage: () => () => {
        useSettings.setState({ hydrated: true });
      },
    },
  ),
);
