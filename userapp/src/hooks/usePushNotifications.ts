import { useEffect } from 'react';
import messaging from '@react-native-firebase/messaging';
import { apiService } from '../services/apiService';
import { Platform, PermissionsAndroid, Alert } from 'react-native';

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
            } else if (Platform.OS === 'android') {
                if (Platform.Version >= 33) {
                    const granted = await PermissionsAndroid.request(
                        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
                    );
                    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                        console.log('[FCM] Permission not granted on Android 13+');
                        return;
                    }
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
        const unsubscribeMessage = messaging().onMessage(async (remoteMessage) => {
            console.log('[FCM] Foreground Message:', JSON.stringify(remoteMessage));
            
            // Handle SOS alerts and officer broadcasts in the foreground
            const type = remoteMessage.data?.type;
            if (type === 'sos_alert' || type === 'emergency' || type === 'area_security_alert' || type === 'officer_alert_broadcast' || type === 'sos_alert_confirmation') {
                
                // Fallback for title and body from data payload if notification object is missing
                const rawTitle = remoteMessage.notification?.title || remoteMessage.data?.title || "🚨 SECURITY ALERT";
                const rawBody = remoteMessage.notification?.body || remoteMessage.data?.body || "A new security alert has been issued for your area.";

                const title = String(rawTitle);
                const body = String(rawBody);

                Alert.alert(
                    title,
                    body,
                    [
                        { 
                            text: 'OK', 
                            style: 'default',
                            onPress: () => console.log('[FCM] User dismissed foreground alert') 
                        }
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
