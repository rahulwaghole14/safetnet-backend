import {PermissionsAndroid, Platform} from 'react-native';

export type PermissionType = 'location' | 'backgroundLocation' | 'camera' | 'notifications';

/**
 * Service to handle permission requests with previous disclosure if needed
 */
class PermissionService {
  /**
   * Check and request permission
   * Usually called after a disclosure modal has been shown and accepted
   */
  async requestPermission(type: PermissionType): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    try {
      let permission;
      let title = '';
      let message = '';

      switch (type) {
        case 'location':
          permission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
          title = 'Location Permission';
          message = 'SafeTNet needs location access for safety features.';
          break;
        case 'backgroundLocation':
          // Background location must be requested AFTER fine location on Android 10+
          if (Platform.OS === 'android' && Platform.Version >= 29) {
            // Ensure fine location is already granted (should be handled by UI disclosure flow)
            const fineGranted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
            if (!fineGranted) {
              console.warn('[PermissionService] Background location requested without Fine Location granted.');
              return false;
            }
            
            permission = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
            title = 'Always-on Location Permission';
            message = 'To enable geofencing and SOS alerts while the app is closed, please select "Allow all the time" in the next screen.';
          } else {
            return true; // Already handled by fine location on older versions
          }
          break;
        case 'camera':
          permission = PermissionsAndroid.PERMISSIONS.CAMERA;
          title = 'Camera Permission';
          message = 'SafeTNet needs camera access to take photos.';
          break;
        case 'notifications':
          if (Platform.OS === 'android' && Platform.Version >= 33) {
            permission = (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS;
            title = 'Notification Permission';
            message = 'SafeTNet needs notification permission to show SOS alerts and status.';
          } else {
            return true;
          }
          break;
      }

      if (!permission) return true;

      const granted = await PermissionsAndroid.request(permission, {
        title,
        message,
        buttonPositive: 'Allow',
        buttonNegative: 'Deny',
      });

      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn('Permission request error:', err);
      return false;
    }
  }

  /**
   * Check if a permission is already granted
   */
  async checkPermission(type: PermissionType): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return true;
    }

    let permission;
    switch (type) {
      case 'location':
        permission = PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
        break;
      case 'backgroundLocation':
        if (Platform.Version >= 29) {
          permission = PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION;
        } else {
          return true;
        }
        break;
      case 'camera':
        permission = PermissionsAndroid.PERMISSIONS.CAMERA;
        break;
      case 'notifications':
        if (Platform.Version >= 33) {
          permission = (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS;
        } else {
          return true;
        }
        break;
    }

    if (!permission) return true;
    return await PermissionsAndroid.check(permission);
  }
}

export const permissionService = new PermissionService();
