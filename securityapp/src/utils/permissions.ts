import { Alert, Platform, PermissionsAndroid } from 'react-native';

/**
 * Requests location permissions with a prominent disclosure as required by Google Play.
 * Sequential request is performed on Android (Foreground then Background).
 */
export const requestLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS === 'ios') {
    // Note: react-native-geolocation-service has its own requestAuthorization
    // but we can also use PermissionsAndroid or similar if available/needed.
    return Promise.resolve(true); 
  }

  if (Platform.OS === 'android') {
    return new Promise((resolve) => {
      Alert.alert(
        'Location Permission for Officer Safety',
        'SafeTNet Security collects location data to enable real-time tracking of officers during SOS alerts and for geofencing purposes, even when the app is closed or not in use. This data is essential for emergency response and officer safety.',
        [
          {
            text: 'Deny',
            onPress: () => resolve(false),
            style: 'cancel',
          },
          {
            text: 'Accept',
            onPress: async () => {
              try {
                // Step 1: Request Foreground Location
                const foregroundGranted = await PermissionsAndroid.request(
                  PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
                );

                if (foregroundGranted !== PermissionsAndroid.RESULTS.GRANTED) {
                  resolve(false);
                  return;
                }

                // Step 2: Request Background Location (for Android 10+)
                const version = typeof Platform.Version === 'string' ? parseInt(Platform.Version, 10) : Platform.Version;
                if (version >= 29) {
                  const backgroundGranted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
                  );
                  resolve(backgroundGranted === PermissionsAndroid.RESULTS.GRANTED);
                } else {
                  resolve(true);
                }
              } catch (err) {
                console.warn('[Permissions] Error requesting location:', err);
                resolve(false);
              }
            },
          },
        ],
        { cancelable: false }
      );
    });
  }

  return false;
};

export const requestLocationPermissionWithCheck = async () => {
  const granted = await requestLocationPermission();
  return {
    granted,
    canAskAgain: true,
  };
};