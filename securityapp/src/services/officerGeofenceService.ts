import apiClient from '../api/apiClient';
import apiConfig from '../api/config';
import { Geofence } from '../types/alert.types';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Define interfaces for officer geofence assignments
interface OfficerGeofenceAssignment {
  id: string;
  officer_id: string;
  geofence_id: string;
  assigned_at: string;
  assigned_by: string;
  is_active: boolean;
  geofence?: Geofence;
}

interface OfficerWithGeofences {
  officer_id: string;
  officer_name: string;
  assigned_geofences: Geofence[];
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

class OfficerGeofenceService {
  private cache: Map<string, Geofence[]> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Get all geofences assigned to an officer
   */
  async getOfficerGeofences(officerId: string): Promise<Geofence[]> {
    try {
      console.log('🔍 Fetching geofences for officer:', officerId);
      
      // Use the correct endpoint: GET /api/security/geofence/
      const endpoint = '/geofence/';
      console.log('📡 API Endpoint:', endpoint);
      console.log('🌐 Full URL:', `${apiConfig.BASE_URL}/api/security${endpoint}`);
      
      const response = await apiClient.get(endpoint, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log('📥 Raw API Response:', response.data);
      
      // Handle different response formats
      let geofences: Geofence[] = [];
      
      if (!response.data) {
        console.log('❌ No data received from API');
        return [];
      }
      
      if (!Array.isArray(response.data)) {
        // Single geofence object - wrap in array
        console.log('📦 Single object detected - wrapping in array');
        geofences = [response.data];
      } else {
        // Array response
        if (response.data.length === 0) {
          console.log('📭 Empty array received');
          return [];
        }
        
        // Check if it's assignment format or direct geofence format
        if (response.data[0] && typeof response.data[0] === 'object' && 'geofence' in response.data[0]) {
          // Assignment format: [{geofence: {...}}, ...]
          console.log('📋 Assignment format detected - extracting geofence objects');
          geofences = response.data.map(item => item.geofence).filter(Boolean);
        } else {
          // Direct geofence format: [{...}, {...}]
          console.log('📋 Direct array format detected - using objects directly');
          geofences = response.data;
        }
      }
      
      // Robust transformation: Infer geofence_type if missing
      geofences = geofences.map(g => {
        if (!g) return g;
        
        let inferredType = g.geofence_type;
        if (!inferredType) {
          if (g.polygon_json) {
            inferredType = 'polygon';
          } else if (g.center_latitude || g.center_point) {
            inferredType = 'circle';
          }
        }
        
        return {
          ...g,
          geofence_type: inferredType || 'polygon' // Default to polygon if unsure
        };
      });
      
      console.log('✅ Processed geofences:', {
        count: geofences.length,
        items: geofences.map(g => ({
          id: g.id,
          name: g.name,
          type: g.geofence_type,
          hasCenter: !!g.center_point,
          hasPolygon: !!g.polygon_json
        }))
      });
      
      return geofences;
      
    } catch (error: any) {
      console.error('❌ Error fetching geofences:', error.message);
      
      // Handle specific error types
      if (error.response) {
        console.error('🚫 API Error Response:', {
          status: error.response.status,
          statusText: error.response.statusText,
          data: error.response.data
        });
      } else if (error.request) {
        console.error('🌐 Network Error - No response received');
      } else {
        console.error('💥 Request Setup Error:', error.message);
      }
      
      // Return empty array on error to maintain consistent return type
      return [];
    }
  }

  /**
   * Get assigned geofence for an officer (single geofence)
   */
  async getAssignedGeofence(officerId: string): Promise<Geofence | null> {
    try {
      const geofences = await this.getOfficerGeofences(officerId);
      
      if (geofences.length === 0) {
        console.log('❌ No assigned geofences found for officer:', officerId);
        return null;
      }
      
      // Return the first assigned geofence
      const assignedGeofence = geofences[0];
      
      console.log('✅ Found assigned geofence:', {
        officerId,
        geofenceId: assignedGeofence.id,
        geofenceName: assignedGeofence.name,
        type: assignedGeofence.geofence_type
      });
      
      return assignedGeofence;
    } catch (error: any) {
      console.error('❌ Error getting assigned geofence:', error.message);
      return null;
    }
  }

  /**
   * Get users physically located within a geofence area
   */
  async getUsersInArea(geofenceId: string): Promise<UserInArea[]> {
    try {
      if (!geofenceId) {
        console.warn('⚠️ No geofenceId provided to getUsersInArea');
        return [];
      }

      console.log('👥 Fetching users in area for geofence:', geofenceId);
      
      // Correct endpoint: GET /geofence/{geofence_id}/users/
      const endpoint = `/geofence/${geofenceId}/users/`;
      const response = await apiClient.get(endpoint);
      
      console.log(`📥 Users in area raw response (${geofenceId}):`, response.data);
      
      let users: UserInArea[] = [];
      if (Array.isArray(response.data)) {
        users = response.data;
      } else if (response.data && response.data.results && Array.isArray(response.data.results)) {
        users = response.data.results;
      } else if (response.data && typeof response.data === 'object') {
        // Handle case where it might be a single user or a different object structure
        console.log('📦 Non-standard structure for users response, checking fields...');
        if ('users' in response.data && Array.isArray(response.data.users)) {
          users = response.data.users;
        }
      }
      
      console.log(`✅ Processed ${users.length} users in area for geofence ${geofenceId}`);
      return users;
    } catch (error: any) {
      console.error(`❌ Error fetching users in area for geofence ${geofenceId}:`, error.message);
      if (error.response) {
        console.error('🚫 Error response status:', error.response.status);
        console.error('🚫 Error response data:', error.response.data);
      }
      return [];
    }
  }

  /**
   * Clear cache for specific officer
   */
  clearOfficerCache(officerId: string): void {
    this.cache.delete(officerId);
    this.cacheExpiry.delete(officerId);
    console.log('🗑️ Cleared cache for officer:', officerId);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.cache.clear();
    this.cacheExpiry.clear();
    console.log('🗑️ Cleared all cache');
  }

  /**
   * Check if officer has any geofence assignments
   */
  async hasOfficerGeofences(officerId: string): Promise<boolean> {
    try {
      const geofences = await this.getOfficerGeofences(officerId);
      return geofences.length > 0;
    } catch (error: any) {
      console.error('❌ Error checking officer geofences:', error.message);
      return false;
    }
  }
}

// Export singleton instance
export const officerGeofenceService = new OfficerGeofenceService();
export default officerGeofenceService;
