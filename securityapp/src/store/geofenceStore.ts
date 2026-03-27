import { create } from 'zustand';
import { Geofence } from '../types/alert.types';
import { officerGeofenceService } from '../services/officerGeofenceService';

interface GeofenceState {
  // State
  geofences: Geofence[];
  assignedGeofence: Geofence | null;
  usersInArea: any[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: string | null;

  // Enter/exit detection state
  lastKnownLocation: { latitude: number; longitude: number } | null;
  isInsideGeofence: boolean;
  lastBoundaryCrossTime: number;
  consecutiveInsideCount: number;
  consecutiveOutsideCount: number;

  // Actions
  fetchGeofences: (officerId: string) => Promise<void>;
  fetchAssignedGeofence: (officerId: string) => Promise<void>;
  fetchUsersInArea: (geofenceId: string) => Promise<void>;
  updateLocation: (latitude: number, longitude: number) => Promise<void>;

  // Helper actions
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearError: () => void;

  // Boundary detection
  checkBoundaryCrossing: (latitude: number, longitude: number) => void;
}

export const useGeofenceStore = create<GeofenceState>((set, get) => ({
  // Initial state
  geofences: [],
  assignedGeofence: null,
  usersInArea: [],
  isLoading: false,
  error: null,
  lastUpdated: null,

  // Boundary detection state
  lastKnownLocation: null,
  isInsideGeofence: false,
  lastBoundaryCrossTime: 0,
  consecutiveInsideCount: 0,
  consecutiveOutsideCount: 0,

  // Fetch all geofences
  fetchGeofences: async (officerId: string) => {
    if (!officerId) {
      console.error('❌ Officer ID is required');
      set({ error: 'Officer ID is required' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      console.log('🎯 Fetching geofences...');
      console.log("OFFICER ID:", officerId);
      const geofences: Geofence[] = await officerGeofenceService.getOfficerGeofences(officerId);

      console.log("🏪 ZUSTAND STORE - RECEIVED FROM SERVICE:", geofences.length, "geofences");
      
      // Detailed store analysis
      console.log("🔍 STORE LAYER ANALYSIS:");
      geofences.forEach((geofence: Geofence, index: number) => {
        console.log(`📍 Store Geofence ${index + 1} - ${geofence.name}:`, {
          id: geofence.id,
          type: geofence.geofence_type,
          // Center point information
          center_point: geofence.center_point,
          center_point_type: typeof geofence.center_point,
          center_latitude: geofence.center_latitude,
          center_longitude: geofence.center_longitude,
          // Polygon information
          polygon_json_type: typeof geofence.polygon_json,
          polygon_json_value: geofence.polygon_json,
          hasCoordinates: !!geofence.polygon_json,
          coordinatesLength: Array.isArray(geofence.polygon_json) ? geofence.polygon_json.length : 0,
          // Validate polygon format in store
          isValidPolygon: Array.isArray(geofence.polygon_json) && geofence.polygon_json.length > 2,
          isPolygonClosed: Array.isArray(geofence.polygon_json) && 
            geofence.polygon_json.length > 0 && 
            JSON.stringify(geofence.polygon_json[0]) === JSON.stringify(geofence.polygon_json[geofence.polygon_json.length - 1]),
          firstCoordinate: Array.isArray(geofence.polygon_json) && geofence.polygon_json.length > 0 ? geofence.polygon_json[0] : null,
          coordinateFormat: Array.isArray(geofence.polygon_json) && geofence.polygon_json.length > 0 && 
            Array.isArray(geofence.polygon_json[0]) && geofence.polygon_json[0].length === 2 ? 
            `[${geofence.polygon_json[0][0]}, ${geofence.polygon_json[0][1]}]` : 'invalid'
        });
      });

      set({
        geofences,
        isLoading: false,
        error: null,
        lastUpdated: new Date().toISOString()
      });

      console.log("✅ STORE LAYER - Data stored in Zustand:", {
        count: geofences.length,
        polygonTypes: geofences.map((g: Geofence) => typeof g.polygon_json),
        validPolygons: geofences.filter((g: Geofence) => Array.isArray(g.polygon_json) && g.polygon_json.length > 2).length,
        closedPolygons: geofences.filter((g: Geofence) => 
          Array.isArray(g.polygon_json) && 
          g.polygon_json.length > 0 && 
          JSON.stringify(g.polygon_json[0]) === JSON.stringify(g.polygon_json[g.polygon_json.length - 1])
        ).length
      });
      
      console.log("🚀 STORE TO UI - Final data ready for components:", geofences);
    } catch (error: any) {
      console.error('❌ Failed to fetch geofences:', error);
      
      // Provide user-friendly error message for SSL/connection issues
      let errorMessage = error.message || 'Failed to fetch geofences';
      if (error.message?.includes('SSL connection has been closed unexpectedly')) {
        errorMessage = 'Network connection unstable. Please check your internet connection.';
      } else if (error.message?.includes('Network Error') || error.code === 'NETWORK_ERROR') {
        errorMessage = 'Unable to connect to server. Please check your internet connection.';
      }
      
      set({
        isLoading: false,
        error: errorMessage
      });
    }
  },

  // Fetch assigned geofence
  fetchAssignedGeofence: async (officerId: string) => {
    if (!officerId) {
      console.error('❌ Officer ID is required');
      set({ error: 'Officer ID is required' });
      return;
    }

    set({ isLoading: true, error: null });

    try {
      console.log('🎯 Fetching assigned geofence...');
      console.log("OFFICER ID:", officerId);
      const geofences: Geofence[] = await officerGeofenceService.getOfficerGeofences(officerId);
      const assignedGeofence: Geofence | null = geofences.length > 0 ? geofences[0] : null;

      set({
        assignedGeofence,
        isLoading: false,
        error: null,
        lastUpdated: new Date().toISOString()
      });

      console.log(`✅ Assigned geofence: ${assignedGeofence?.name || 'None'}`);
    } catch (error: any) {
      console.error('❌ Failed to fetch assigned geofence:', error);
      set({
        isLoading: false,
        error: error.message || 'Failed to fetch assigned geofence'
      });
    }
  },

  // Fetch users in geofence area
  fetchUsersInArea: async (geofenceId: string) => {
    try {
      console.log('👥 Fetching users in geofence area:', geofenceId);
      const usersInArea = await officerGeofenceService.getUsersInArea(geofenceId);

      set({
        usersInArea,
        lastUpdated: new Date().toISOString()
      });

      console.log(`✅ Found ${usersInArea.length} users in area`);
    } catch (error: any) {
      console.error('❌ Failed to fetch users in area:', error);
      set({
        error: error.message || 'Failed to fetch users in area'
      });
    }
  },

  // Update location and check boundaries - DISABLED (backend handles location)
  updateLocation: async (latitude: number, longitude: number) => {
    console.log('🚫 Location tracking disabled - frontend no longer handles location updates');
    // Backend handles all location logic, frontend should not perform location tracking
    // Set neutral state without calling geofenceService
    set({ 
      lastKnownLocation: { latitude, longitude },
      isInsideGeofence: false,
      consecutiveInsideCount: 0,
      consecutiveOutsideCount: 0
    });
  },

  // Check for boundary crossing with hysteresis and debouncing - DISABLED (backend handles geofence logic)
  checkBoundaryCrossing: (latitude: number, longitude: number) => {
    console.log('🚫 Geofence detection disabled - frontend no longer handles boundary crossing');
    // Backend handles all geofence logic, frontend should not perform boundary detection
    // Set neutral state without calling geofenceService
    set({
      isInsideGeofence: false,
      consecutiveInsideCount: 0,
      consecutiveOutsideCount: 0,
      lastBoundaryCrossTime: Date.now()
    });
  },

  // Helper actions
  setLoading: (loading: boolean) => set({ isLoading: loading }),
  setError: (error: string | null) => set({ error }),
  clearError: () => set({ error: null }),
}));