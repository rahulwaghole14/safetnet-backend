import { useEffect } from 'react';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import * as fcmTokenService from '../api/services/fcmTokenService';
import { Platform, Alert } from 'react-native';

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

        const unsubscribeTokenRefresh = messaging().onTokenRefresh(async (token: string) => {
            console.log('[FCM] Token Refreshed:', token);
            try {
                await fcmTokenService.updateFCMToken(token);
            } catch (error) {
                console.error('[FCM] Error updating refreshed token', error);
            }
        });

        const unsubscribeMessage = messaging().onMessage(async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
            console.log('[FCM] Foreground Message:', JSON.stringify(remoteMessage));
            
            // If it's an SOS alert, show a high-visibility alert
            if (remoteMessage.data?.type === 'sos_alert') {
                Alert.alert(
                    "🚨 EMERGENCY SOS",
                    remoteMessage.notification?.body || "New SOS Alert received!",
                    [
                        { 
                            text: "VIEW ALERT", 
                            onPress: () => {
                                // You can add navigation logic here if needed
                                console.log("User clicked View Alert from Foreground");
                            }
                        },
                        { text: "DISMISS", style: "cancel" }
                    ],
                    { cancelable: false }
                );
            }
        });

        return () => {
            unsubscribeTokenRefresh();
            unsubscribeMessage();
        };
    }, [isAuthenticated]);
};
