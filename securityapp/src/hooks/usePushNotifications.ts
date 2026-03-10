import { useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import { fcmTokenService } from '../api/services';
import { Platform } from 'react-native';

export const usePushNotifications = (isAuthenticated: boolean) => {
    useEffect(() => {
        if (!isAuthenticated) return;

        const requestUserPermission = async () => {
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
                await fcmTokenService.updateFCMToken(token);
            } catch (error) {
                console.error('[FCM] Error getting/registering token', error);
            }
        };

        requestUserPermission();

        const unsubscribeTokenRefresh = messaging().onTokenRefresh(async token => {
            console.log('[FCM] Token Refreshed:', token);
            try {
                await fcmTokenService.updateFCMToken(token);
            } catch (error) {
                console.error('[FCM] Error updating refreshed token', error);
            }
        });

        const unsubscribeMessage = messaging().onMessage(async remoteMessage => {
            console.log('[FCM] Foreground Message:', JSON.stringify(remoteMessage));
        });

        return () => {
            unsubscribeTokenRefresh();
            unsubscribeMessage();
        };
    }, [isAuthenticated]);
};
