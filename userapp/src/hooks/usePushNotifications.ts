import { useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import { apiService } from '../services/apiService';
import { Platform } from 'react-native';

export const usePushNotifications = (isAuthenticated: boolean) => {
    useEffect(() => {
        if (!isAuthenticated) return;

        const requestUserPermission = async () => {
            // For iOS you need to request permissions
            if (Platform.OS === 'ios') {
                const authStatus = await messaging().requestPermission();
                const enabled =
                    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

                if (!enabled) {
                    console.log('[FCM] Permission not granted');
                    return;
                }
            }

            await registerFCMToken();
        };

        const registerFCMToken = async () => {
            try {
                const token = await messaging().getToken();
                console.log('[FCM] Token:', token);
                await apiService.updateFCMToken(token);
            } catch (error) {
                console.error('[FCM] Error getting/registering token', error);
            }
        };

        requestUserPermission();

        // Listen to token refreshes
        const unsubscribeTokenRefresh = messaging().onTokenRefresh(async token => {
            console.log('[FCM] Token Refreshed:', token);
            try {
                await apiService.updateFCMToken(token);
            } catch (error) {
                console.error('[FCM] Error updating refreshed token', error);
            }
        });

        // Handle messages in foreground
        const unsubscribeMessage = messaging().onMessage(async remoteMessage => {
            console.log('[FCM] Foreground Message:', JSON.stringify(remoteMessage));
            // Optional: Show in-app toast here if needed
        });

        return () => {
            unsubscribeTokenRefresh();
            unsubscribeMessage();
        };
    }, [isAuthenticated]);
};
