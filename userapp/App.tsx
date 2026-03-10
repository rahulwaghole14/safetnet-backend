/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, { useEffect, useMemo } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, StyleSheet, useColorScheme, Platform, PermissionsAndroid, View, ActivityIndicator, Text } from 'react-native';
import { SafeGestureHandlerRootView } from './src/utils/gestureHandlerFallback';
import { useAuthStore } from './src/stores/authStore';
import { useSettingsStore } from './src/stores/settingsStore';
import AuthNavigator from './src/navigation/AuthNavigator';
import AppNavigator from './src/navigation/AppNavigator';
import { LightAppTheme, DarkAppTheme } from './src/theme/navigationThemes';
import { getAsyncStorage } from './src/utils/asyncStorageInit';
import { UpgradeModal } from './src/components/common/UpgradeModal';
import { NetworkErrorToast } from './src/components/common/NetworkErrorToast';
import { navigationRef } from './src/navigation/navigationRef';

const RootStack = createStackNavigator();

function App(): React.JSX.Element {
  // Always call hooks in the same order (before any conditional logic)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const loadAuth = useAuthStore((state) => state.load);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const systemScheme = useColorScheme();

  // Initialize push notifications
  usePushNotifications(isAuthenticated);

  useEffect(() => {
    // Initialize AsyncStorage first, then load app state
    const initializeApp = async () => {
      try {
        // Initialize AsyncStorage early
        await getAsyncStorage();
        console.log('✓ AsyncStorage initialized in App.tsx');

        // Load auth state on app start to restore session
        await loadAuth();

        // Load settings
        await loadSettings();
      } catch (error) {
        console.error('Error initializing app:', error);
      }
    };

    initializeApp();

    // Request permissions after app is mounted and ready
    if (Platform.OS === 'android') {
      // Use setTimeout to ensure the app is fully attached to Activity
      const requestPermissions = async () => {
        try {
          // Wait a bit to ensure Activity is ready
          await new Promise(resolve => setTimeout(() => resolve(undefined), 500));

          const permissions = [
            PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
            PermissionsAndroid.PERMISSIONS.CALL_PHONE,
            PermissionsAndroid.PERMISSIONS.SEND_SMS,
            PermissionsAndroid.PERMISSIONS.CAMERA,
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          ];

          // Add storage permissions based on Android version
          if (Number(Platform.Version) < 33) {
            permissions.push(
              PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
              PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE
            );
          }

          // Request all permissions - Android system will show dialogs automatically
          await PermissionsAndroid.requestMultiple(permissions);
        } catch (error) {
          console.warn('Permission request error:', error);
        }
      };
      requestPermissions();
    }
  }, [loadAuth, loadSettings]);

  const resolvedScheme = themeMode === 'system' ? systemScheme ?? 'light' : themeMode;

  const navigationTheme = useMemo(
    () => (resolvedScheme === 'dark' ? DarkAppTheme : LightAppTheme),
    [resolvedScheme],
  );

  const statusBarStyle = resolvedScheme === 'dark' ? 'light-content' : 'dark-content';

  // Show loading screen while checking auth state
  if (isLoading) {
    return (
      <SafeGestureHandlerRootView style={styles.container}>
        <SafeAreaProvider>
          <View style={[styles.loadingContainer, { backgroundColor: navigationTheme.colors.background }]}>
            <StatusBar barStyle={statusBarStyle} backgroundColor={navigationTheme.colors.background} />
            {/* You can add a loading spinner here if needed */}
          </View>
        </SafeAreaProvider>
      </SafeGestureHandlerRootView>
    );
  }

  return (
    <SafeGestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <NavigationContainer theme={navigationTheme} ref={navigationRef}>
          <StatusBar barStyle={statusBarStyle} backgroundColor={navigationTheme.colors.background} />
          <RootStack.Navigator screenOptions={{ headerShown: false }}>
            {isAuthenticated ? (
              <RootStack.Screen name="AppStack" component={AppNavigator} />
            ) : (
              <RootStack.Screen name="AuthStack" component={AuthNavigator} />
            )}
          </RootStack.Navigator>
          <UpgradeModal />
          <NetworkErrorToast />
        </NavigationContainer>
      </SafeAreaProvider>
    </SafeGestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default App;
