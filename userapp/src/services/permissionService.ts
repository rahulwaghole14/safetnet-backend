import {PermissionsAndroid, Platform, Permission} from 'react-native';

export type PermissionType = 
  | 'location' 
  | 'backgroundLocation' 
  | 'camera' 
  | 'notifications' 
  | 'photos'
  | 'audio';

/**
 * Service to handle native Android permission requests.
 * Designed to be called AFTER a prominent disclosure modal has been shown to the user.
 * 
 * IMPORTANT: Google Play Store requires every sensitive permission (Location, Camera, etc.)
 * to be preceded by an in-app disclosure explaining WHAT, WHY, and HOW data is used.
 */
class PermissionService {
  /**
   * Translates our PermissionType to native Android PERMISSIONS
   */
  private getNativePermission(type: PermissionType): Permission | null {
    if (Platform.OS !== 'android') return null;

    switch (type) {
      case 'location':
        return PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION;
      case 'backgroundLocation':
        return Platform.Version >= 29 ? PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION : null;
      case 'camera':
        return PermissionsAndroid.PERMISSIONS.CAMERA;
      case 'notifications':
        return Platform.Version >= 33 ? (PermissionsAndroid.PERMISSIONS as any).POST_NOTIFICATIONS : null;
      case 'photos':
        // Android 13+ handles photos separately from generic storage
        return Platform.Version >= 33 
          ? (PermissionsAndroid.PERMISSIONS as any).READ_MEDIA_IMAGES
          : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
      case 'audio':
        return PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
      default:
        return null;
    }
  }

  /**
   * Requests a permission from the system.
   * This method does NOT show its own disclosure; it expects one has been shown by the UI.
   */
  async requestPermission(type: PermissionType): Promise<boolean> {
    const permission = this.getNativePermission(type);
    if (!permission) return true;

    try {
      /**
       * We do NOT pass the 'rationale' object (title, message) to request() here. 
       * Instead, we rely ENTIRELY on our custom Disclosure Modals in the UI.
       * This ensures full control over the disclosure presentation as required by Google.
       */
      const granted = await PermissionsAndroid.request(permission);
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    } catch (err) {
      console.warn(`[PermissionService] Error requesting ${type}:`, err);
      return false;
    }
  }

  /**
   * Checks if a permission is already granted.
   */
  async checkPermission(type: PermissionType): Promise<boolean> {
    const permission = this.getNativePermission(type);
    if (!permission) return true;

    try {
      return await PermissionsAndroid.check(permission);
    } catch (err) {
      console.warn(`[PermissionService] Error checking ${type}:`, err);
      return false;
    }
  }
}

export const permissionService = new PermissionService();
