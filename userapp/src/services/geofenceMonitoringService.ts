/**
 * Geofence Monitoring Service
 * Monitors user location and sends push notifications when entering/exiting geofences
 */

import Geolocation from '@react-native-community/geolocation';
import {Platform} from 'react-native';
import {sendAlertNotification} from './notificationService';
import {apiService} from './apiService';
import {permissionService} from './permissionService';
import {useAuthStore} from '../stores/authStore';

interface Geofence {
  id: string;
  name: string;
  center: {lat: number; lng: number};
  radius: number;
  isActive: boolean;
  alert_on_entry?: boolean;
  alert_on_exit?: boolean;
}

interface UserLocation {
  latitude: number;
  longitude: number;
}

// Track which geofences user is currently inside
let currentGeofences: Set<string> = new Set();
let watchId: number | null = null;
let isMonitoring = false;
let lastKnownLocation: UserLocation | null = null;
let geofences: Geofence[] = [];
let nativeLocationListener: any = null; // Listener for native service location updates

/**
 * Calculate distance between two points using Haversine formula
 */
const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number => {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

/**
 * Check if user is inside a geofence
 */
const isInsideGeofence = (
  location: UserLocation,
  geofence: Geofence,
): boolean => {
  const distance = calculateDistance(
    location.latitude,
    location.longitude,
    geofence.center.lat,
    geofence.center.lng,
  );
  return distance <= geofence.radius;
};

/**
 * Check geofence entry/exit and send notifications
 */
const checkGeofences = (location: UserLocation) => {
  if (!geofences.length) {
    return;
  }

  const currentlyInside = new Set<string>();

  // Check each active geofence
  for (const geofence of geofences) {
    if (!geofence.isActive) {
      continue;
    }

    const isInside = isInsideGeofence(location, geofence);

    if (isInside) {
      currentlyInside.add(geofence.id);

      // Check if user just entered this geofence
      if (!currentGeofences.has(geofence.id)) {
        // User entered geofence
        if (geofence.alert_on_entry !== false) {
          // Send local notification to user
          sendAlertNotification(
            'Geofence Entered',
            `You have entered ${geofence.name}`,
          ).catch((error) => {
            console.warn('Failed to send geofence entry notification:', error);
          });
          
          // Record event in backend (non-blocking)
          const user = useAuthStore.getState().user;
          if (user?.id) {
            const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
            const geofenceId = parseInt(geofence.id, 10);
            if (!isNaN(userId) && !isNaN(geofenceId)) {
              apiService.recordGeofenceEvent(
                userId,
                geofenceId,
                'enter',
                location.latitude,
                location.longitude
              ).catch((error) => {
                console.warn('Failed to record geofence enter event:', error);
              });
            }
          }
          
          console.log(`[Geofence] Entered: ${geofence.name}`);
        }
      }
    } else {
      // Check if user just exited this geofence
      if (currentGeofences.has(geofence.id)) {
        // User exited geofence
        if (geofence.alert_on_exit !== false) {
          // Send local notification to user
          sendAlertNotification(
            'Geofence Exited',
            `You have exited ${geofence.name}`,
          ).catch((error) => {
            console.warn('Failed to send geofence exit notification:', error);
          });
          
          // Record event in backend (non-blocking)
          const user = useAuthStore.getState().user;
          if (user?.id) {
            const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
            const geofenceId = parseInt(geofence.id, 10);
            if (!isNaN(userId) && !isNaN(geofenceId)) {
              apiService.recordGeofenceEvent(
                userId,
                geofenceId,
                'exit',
                location.latitude,
                location.longitude
              ).catch((error) => {
                console.warn('Failed to record geofence exit event:', error);
              });
            }
          }
          
          console.log(`[Geofence] Exited: ${geofence.name}`);
        }
      }
    }
  }

  // Update current geofences
  currentGeofences = currentlyInside;
};

/**
 * Ensure location permission is granted
 */
const ensureLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }

  // Check for background location on Android 10+
  if (Platform.Version >= 29) {
    return await permissionService.checkPermission('backgroundLocation');
  }
  
  // For older versions, fine location is enough
  return await permissionService.checkPermission('location');
};

/**
 * Load geofences from API
 */
const loadGeofences = async (userId: number): Promise<Geofence[]> => {
  try {
    const response = await apiService.getGeofences(userId);
    // Handle response format: backend returns {geofences: [...]} or direct array
    const data = response?.geofences || (Array.isArray(response) ? response : []);
    if (Array.isArray(data)) {
      return data.map((geo: any) => {
        // Handle both old format (center_location) and new format (center)
        let center = {lat: 0, lng: 0};
        if (geo.center_location) {
          center = {
            lat: geo.center_location.latitude || geo.center_location.lat || 0,
            lng: geo.center_location.longitude || geo.center_location.lng || 0,
          };
        } else if (geo.center) {
          center = {
            lat: geo.center.latitude || geo.center.lat || 0,
            lng: geo.center.longitude || geo.center.lng || 0,
          };
        }
        
        return {
          id: geo.id?.toString() || geo.name,
          name: geo.name,
          radius: geo.radius_meters || geo.radius || 100,
          center,
          isActive: geo.is_active !== false,
          alert_on_entry: geo.alert_on_entry !== false,
          alert_on_exit: geo.alert_on_exit !== false,
        };
      });
    }
    return [];
  } catch (error) {
    console.error('Failed to load geofences:', error);
    return [];
  }
};

/**
 * Start monitoring geofences
 */
export const startGeofenceMonitoring = async (userId: number) => {
  if (isMonitoring) {
    console.log('[Geofence] Already monitoring');
    return;
  }

  const hasPermission = await ensureLocationPermission();
  if (!hasPermission) {
    console.warn('[Geofence] Location permission not granted');
    return;
  }

  // Load geofences
  const loadedGeofences = await loadGeofences(userId);
  if (loadedGeofences.length === 0) {
    console.log('[Geofence] No geofences to monitor');
    return;
  }

  geofences = loadedGeofences.filter(
    (g) => g.isActive && (g.center.lat !== 0 || g.center.lng !== 0),
  );

  if (geofences.length === 0) {
    console.log('[Geofence] No active geofences to monitor');
    return;
  }

  console.log(`[Geofence] Starting monitoring for ${geofences.length} geofences`);

  // Try to start native background service first (works even when app is closed)
  try {
    const {NativeModules} = require('react-native');
    const GeofenceModule = NativeModules.GeofenceModule;
    if (GeofenceModule && typeof GeofenceModule.startGeofenceMonitoring === 'function') {
      await GeofenceModule.startGeofenceMonitoring(userId);
      console.log('[Geofence] Native background service started');
      
      // Listen for location updates from native service (works even when app is in background)
      const {DeviceEventEmitter} = require('react-native');
      // Remove existing listener if any
      if (nativeLocationListener) {
        nativeLocationListener.remove();
      }
      nativeLocationListener = DeviceEventEmitter.addListener('GeofenceLocationUpdate', (locationData: any) => {
        if (locationData && locationData.latitude && locationData.longitude) {
          const location = {
            latitude: locationData.latitude,
            longitude: locationData.longitude,
          };
          lastKnownLocation = location;
          checkGeofences(location);
        }
      });
      console.log('[Geofence] Native location update listener registered');
    }
  } catch (error) {
    console.warn('[Geofence] Could not start native service, using React Native location:', error);
  }

  // Clear any existing watch
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
  }

  // Get initial location
  Geolocation.getCurrentPosition(
    (position) => {
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      lastKnownLocation = location;
      checkGeofences(location);
    },
    (error) => {
      console.warn('[Geofence] Error getting initial location:', error);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    },
  );

  // Start watching position (as backup if native service fails)
  watchId = Geolocation.watchPosition(
    (position) => {
      const location = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };
      lastKnownLocation = location;
      checkGeofences(location);
    },
    (error) => {
      console.warn('[Geofence] Location watch error:', error);
    },
    {
      enableHighAccuracy: true,
      distanceFilter: 10, // Update every 10 meters
      interval: 5000, // Check every 5 seconds
      fastestInterval: 3000,
    },
  );

  isMonitoring = true;
  console.log('[Geofence] Monitoring started');
};

/**
 * Stop monitoring geofences
 */
export const stopGeofenceMonitoring = () => {
  // Stop native background service
  try {
    const {NativeModules} = require('react-native');
    const GeofenceModule = NativeModules.GeofenceModule;
    if (GeofenceModule && typeof GeofenceModule.stopGeofenceMonitoring === 'function') {
      GeofenceModule.stopGeofenceMonitoring().catch((error: any) => {
        console.warn('[Geofence] Error stopping native service:', error);
      });
    }
  } catch (error) {
    console.warn('[Geofence] Could not stop native service:', error);
  }
  
  // Remove native location listener
  if (nativeLocationListener) {
    nativeLocationListener.remove();
    nativeLocationListener = null;
  }
  
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
  }
  isMonitoring = false;
  currentGeofences.clear();
  geofences = [];
  lastKnownLocation = null;
  console.log('[Geofence] Monitoring stopped');
};

/**
 * Refresh geofences list (useful when geofences are added/updated)
 */
export const refreshGeofences = async (userId: number) => {
  if (!isMonitoring) {
    return;
  }

  const loadedGeofences = await loadGeofences(userId);
  geofences = loadedGeofences.filter(
    (g) => g.isActive && (g.center.lat !== 0 || g.center.lng !== 0),
  );

  // Re-check current location with new geofences
  if (lastKnownLocation) {
    currentGeofences.clear(); // Reset to re-detect entry
    checkGeofences(lastKnownLocation);
  }

  console.log(`[Geofence] Refreshed: ${geofences.length} geofences`);
};

/**
 * Get current monitoring status
 */
export const isGeofenceMonitoringActive = (): boolean => {
  return isMonitoring;
};

/**
 * Get currently entered geofences
 */
export const getCurrentGeofences = (): string[] => {
  return Array.from(currentGeofences);
};

