import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type ThemeMode = 'light' | 'dark' | 'system';

interface SettingsState {
  themeMode: ThemeMode;
  language: 'en' | 'es' | 'fr';
  notificationsEnabled: boolean;
  locationTrackingEnabled: boolean;
  notificationPermissionGranted: boolean;
  autoRefreshInterval: number; // in seconds
  onDuty: boolean;
  quietHoursEnabled: boolean;
  doNotDisturbEnabled: boolean;
  vibrationEnabled: boolean;
  soundEnabled: boolean;
  analyticsEnabled: boolean;
  crashReportsEnabled: boolean;
  performanceDataEnabled: boolean;
  biometricEnabled: boolean;
  twoFactorEnabled: boolean;
}

const initialState: SettingsState = {
  themeMode: 'system',
  language: 'en',
  notificationsEnabled: true,
  locationTrackingEnabled: true,
  notificationPermissionGranted: false,
  autoRefreshInterval: 30,
  onDuty: false,
  quietHoursEnabled: false,
  doNotDisturbEnabled: false,
  vibrationEnabled: true,
  soundEnabled: true,
  analyticsEnabled: true,
  crashReportsEnabled: true,
  performanceDataEnabled: true,
  biometricEnabled: false,
  twoFactorEnabled: false,
};

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setThemeMode: (state, action: PayloadAction<ThemeMode>) => {
      state.themeMode = action.payload;
    },
    setLanguage: (state, action: PayloadAction<'en' | 'es' | 'fr'>) => {
      state.language = action.payload;
    },
    toggleNotifications: (state) => {
      state.notificationsEnabled = !state.notificationsEnabled;
    },
    toggleLocationTracking: (state) => {
      state.locationTrackingEnabled = !state.locationTrackingEnabled;
    },
    setAutoRefreshInterval: (state, action: PayloadAction<number>) => {
      state.autoRefreshInterval = action.payload;
    },
    setOnDuty: (state, action: PayloadAction<boolean>) => {
      state.onDuty = action.payload;
    },
    setNotificationPermissionGranted: (state, action: PayloadAction<boolean>) => {
      state.notificationPermissionGranted = action.payload;
    },
    toggleQuietHours: (state) => {
      state.quietHoursEnabled = !state.quietHoursEnabled;
    },
    toggleDoNotDisturb: (state) => {
      state.doNotDisturbEnabled = !state.doNotDisturbEnabled;
    },
    toggleVibration: (state) => {
      state.vibrationEnabled = !state.vibrationEnabled;
    },
    toggleSound: (state) => {
      state.soundEnabled = !state.soundEnabled;
    },
    toggleAnalytics: (state) => {
      state.analyticsEnabled = !state.analyticsEnabled;
    },
    toggleCrashReports: (state) => {
      state.crashReportsEnabled = !state.crashReportsEnabled;
    },
    togglePerformanceData: (state) => {
      state.performanceDataEnabled = !state.performanceDataEnabled;
    },
    toggleBiometrics: (state) => {
      state.biometricEnabled = !state.biometricEnabled;
    },
    toggleTwoFactor: (state) => {
      state.twoFactorEnabled = !state.twoFactorEnabled;
    },
  },
});

export const {
  setThemeMode,
  setLanguage,
  toggleNotifications,
  toggleLocationTracking,
  setNotificationPermissionGranted,
  setAutoRefreshInterval,
  setOnDuty,
  toggleQuietHours,
  toggleDoNotDisturb,
  toggleVibration,
  toggleSound,
  toggleAnalytics,
  toggleCrashReports,
  togglePerformanceData,
  toggleBiometrics,
  toggleTwoFactor,
} = settingsSlice.actions;

export default settingsSlice.reducer;