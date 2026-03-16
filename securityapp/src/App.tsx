/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

declare global {
  var __REMOTEDEV__: boolean;
}

import React, { useEffect, useRef } from 'react';
import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider, useDispatch } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';
import { store, persistor } from './store';
import { AppNavigator } from './navigation/AppNavigator';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loginSuccess } from './store/slices/authSlice';
import { useSelector } from 'react-redux';
import { usePushNotifications } from './hooks/usePushNotifications';


// Disable debugger connections to prevent registration errors
if (__DEV__) {
  // Disable remote debugging connections
  (console as any).disableDebugger = true;
  // Prevent debugger WebSocket connections
  __REMOTEDEV__ = false;
}

// Component that checks for persisted auth data
function AuthPersistenceWrapper({ children }: { children: React.ReactNode }) {
  // Authentication is now handled automatically by Redux Persist via store.ts and PersistGate
  console.log('[App] Auth persistence managed by Redux Persist');

  return <>{children}</>;
}

// Component that uses theme context for status bar
function AppContent() {
  const { currentTheme } = useTheme();
  // We need to check auth state from Redux
  const isAuthenticated = useSelector((state: any) => state.auth.isAuthenticated);

  // Initialize push notifications
  usePushNotifications(isAuthenticated);

  return (
    <AuthPersistenceWrapper>
      <StatusBar
        barStyle={currentTheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={currentTheme === 'dark' ? '#000000' : '#FFFFFF'}
      />
      <AppNavigator />
    </AuthPersistenceWrapper>
  );
}

function App() {

  return (
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ThemeProvider>
          <SafeAreaProvider>
            <AppContent />
          </SafeAreaProvider>
        </ThemeProvider>
      </PersistGate>
    </Provider>
  );
}

export default App;
