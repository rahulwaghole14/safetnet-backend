import { useEffect } from 'react';
import messaging, { FirebaseMessagingTypes } from '@react-native-firebase/messaging';
import * as fcmTokenService from '../api/services/fcmTokenService';
import { DeviceEventEmitter, Platform, Alert, PermissionsAndroid } from 'react-native';
import { useAppSelector } from '../store/hooks';
import { useAlertsStore } from '../store/alertsStore'; // Assuming this import exists or needs to be added

export const usePushNotifications = (isAuthenticated: boolean) => {
  const { fetchAlerts } = useAlertsStore();
  const { officer } = useAppSelector((state) => state.auth);

  useEffect(() => {
    if (!isAuthenticated) return;

        const requestUserPermission = async () => {
            if (Platform.OS === 'ios') {
                const authStatus = await messaging().requestPermission();
                const enabled =
                    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
                    authStatus === messaging.AuthorizationStatus.PROVISIONAL;

                if (!enabled) {
                    console.log('[FCM] Permission not granted on iOS');
                    return;
                }
            } else if (Platform.OS === 'android') {
                if (Platform.Version >= 33) {
                    // PermissionsAndroid is already imported at the top
                    const granted = await PermissionsAndroid.request(
                        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
                    );
                    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                        console.log('[FCM] Permission not granted on Android 13+');
                        return;
                    }
                }
                // For older Android versions, permission is granted at install time
            }

            await registerFCMToken();
        };

        const registerFCMToken = async () => {
            try {
                const token = await messaging().getToken();
                console.log('[FCM] Token:', token);
                await fcmTokenService.updateFCMToken(token);
            } catch (error: any) {
                const errorStr = String(error);
                if (errorStr.includes('SERVICE_NOT_AVAILABLE')) {
                    console.log('[FCM] Google Play Services unavailable (SERVICE_NOT_AVAILABLE). Push notifications will be disabled for this session.');
                } else {
                    console.error('[FCM] Registration Error:', error);
                }
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
            
            // Handle SOS alerts and officer broadcasts in the foreground
            const type = remoteMessage.data?.type;
            if (type === 'sos_alert' || type === 'emergency' || type === 'area_security_alert' || type === 'officer_alert_broadcast') {
                
                // Fallback for title and body from data payload if notification object is missing
                const rawTitle = remoteMessage.notification?.title || remoteMessage.data?.title || "🚨 SECURITY ALERT";
                const rawBody = remoteMessage.notification?.body || remoteMessage.data?.body || "A new security alert has been issued.";
                
                const title = String(rawTitle);
                const body = String(rawBody);
                const officerName = officer?.name || '';
                
                // Check if this alert was created by the current officer to avoid self-notification
                if (officerName && body.includes(officerName)) {
                    console.log('🚫 Skipping foreground notification alert for creator:', officerName);
                    return;
                }

                Alert.alert(
                    title,
                    body,
                    [
                        { 
                            text: 'VIEW ALERT',
                            onPress: () => {
                                if (remoteMessage.data?.sos_alert_id) {
                                    DeviceEventEmitter.emit('notification:navigate', {
                                        alertId: String(remoteMessage.data.sos_alert_id)
                                    });
                                }
                                console.log('[FCM] User clicked View Alert from Foreground');
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
