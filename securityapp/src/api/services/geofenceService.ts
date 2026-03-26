import apiClient from '../apiClient';
import { API_ENDPOINTS } from '../endpoints';
import { Geofence } from '../../types/alert.types';

// Location data interface for backend responses only
export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy?: number;
  timestamp?: string;
  address?: string;
}

export interface UserInArea {
  user_id: string;
  user_name: string;
  user_email: string;
  current_latitude: number;
  current_longitude: number;
  last_seen: string;
  distance_from_center?: number;
  is_inside: boolean;
}

// Live location session interface for backend responses only
export interface LiveLocationSession {
  id: string;
  officer_id: string;
  geofence_id: string;
  start_time: string;
  end_time?: string;
  status: 'active' | 'paused' | 'stopped';
  last_location?: LocationData;
}

import GeolocationService from 'react-native-geolocation-service';
import { Platform, PermissionsAndroid } from 'react-native';

// Location tracking service - restored to provide real-time GPS
export const locationService = {
  // Check and request location permissions
  requestPermission: async (): Promise<boolean> => {
    if (Platform.OS === 'ios') {
      const auth = await GeolocationService.requestAuthorization('whenInUse');
      return auth === 'granted';
    }

    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }

    return false;
  },

  // Get current location
  getCurrentLocation: async (): Promise<LocationData | null> => {
    return new Promise((resolve) => {
      GeolocationService.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: new Date(position.timestamp).toISOString(),
          });
        },
        (error) => {
          console.error('❌ [locationService] getCurrentPosition Error:', error);
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
      );
    });
  },

  // Watch location updates (for map screen)
  watchLocation: (
    onSuccess: (location: LocationData) => void,
    onError: (error: any) => void
  ): number => {
    return GeolocationService.watchPosition(
      (position) => {
        onSuccess({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: new Date(position.timestamp).toISOString(),
        });
      },
      (error) => {
        console.error('❌ [locationService] watchPosition Error:', error);
        onError(error);
      },
      { 
        enableHighAccuracy: true, 
        distanceFilter: 10, // Update every 10 meters 
        interval: 5000, // Update every 5 seconds
        fastestInterval: 2000 
      }
    );
  },

  // Stop watching location
  stopWatching: (watchId: number) => {
    GeolocationService.clearWatch(watchId);
  }
};

export const geofenceService = {
  // Get all geofences
  getGeofences: async (): Promise<Geofence[]> => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.GET_GEOFENCE_DETAILS);

      // Handle both array response and paginated response
      if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data.results && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      return [];
    } catch (error: any) {
      console.error('Failed to fetch geofences:', error.message || error);
      return [];
    }
  },

  // Get geofence by ID
  getGeofenceById: async (id: string): Promise<Geofence | null> => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.GET_GEOFENCE_DETAILS.replace('{id}', id));
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch geofence:', error.message || error);
      return null;
    }
  },

  // Get assigned geofence (for current officer)
  getAssignedGeofence: async (): Promise<Geofence | null> => {
    try {
      // This might need a specific endpoint for assigned geofence
      // For now, we'll get all geofences and return the first active one
      const geofences = await geofenceService.getGeofences();
      return geofences.find(g => g.status === 'active') || null;
    } catch (error: any) {
      console.error('Failed to fetch assigned geofence:', error.message || error);
      return null;
    }
  },

  // Get users in geofence area
  getUsersInArea: async (geofenceId: string): Promise<UserInArea[]> => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.GET_USERS_IN_AREA.replace('{geofence_id}', geofenceId));

      // Handle both array response and paginated response
      if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data.results && Array.isArray(response.data.results)) {
        return response.data.results;
      }
      return [];
    } catch (error: any) {
      console.error('Failed to fetch users in area:', error.message || error);
      return [];
    }
  },

  // Check if point is inside geofence - disabled (backend handles geofence logic)
  isPointInGeofence: (latitude: number, longitude: number, geofence: Geofence): boolean => {
    console.log('🚫 Geofence detection disabled - frontend no longer handles geofence calculations');
    // Backend handles all geofence logic, frontend should not perform calculations
    // Return false instead of throwing
    return false;
  },

  // Point-in-polygon algorithm - disabled (backend handles geofence logic)
  isPointInPolygon: (lat: number, lon: number, polygon: number[][]): boolean => {
    console.log('🚫 Geofence detection disabled - frontend no longer handles polygon calculations');
    // Backend handles all geofence logic, frontend should not perform calculations
    // Return false instead of throwing
    return false;
  },

  // Calculate distance between two points - disabled (backend handles location calculations)
  calculateDistance: (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }): number => {
    console.log('🚫 Distance calculation disabled - frontend no longer handles location calculations');
    // Backend handles all location calculations, frontend should not perform distance calculations
    // Return 0 instead of throwing
    return 0;
  },

  // Legacy methods for backward compatibility
  getGeofenceDetails: async (id: string): Promise<any> => {
    const geofence = await geofenceService.getGeofenceById(id);
    return geofence ? {
      geofence_id: geofence.id,
      name: geofence.name,
      radius: geofence.radius || 100,
      center_lat: geofence.center_latitude,
      center_lng: geofence.center_longitude
    } : null;
  },

  createGeofence: async (data: any): Promise<{ id: string }> => {
    try {
      const response = await apiClient.post(API_ENDPOINTS.GET_GEOFENCE_DETAILS, data);
      return { id: response.data.id };
    } catch (error: any) {
      console.error('Failed to create geofence:', error.message || error);
      throw error;
    }
  },

  updateGeofence: async (id: string, data: any): Promise<any> => {
    try {
      const response = await apiClient.patch(API_ENDPOINTS.GET_GEOFENCE_DETAILS.replace('{id}', id), data);
      return response.data;
    } catch (error: any) {
      console.error('Failed to update geofence:', error.message || error);
      throw error;
    }
  },

  deleteGeofence: async (id: string): Promise<boolean> => {
    try {
      await apiClient.delete(API_ENDPOINTS.GET_GEOFENCE_DETAILS.replace('{id}', id));
      return true;
    } catch (error: any) {
      console.error('Failed to delete geofence:', error.message || error);
      return false;
    }
  }
};