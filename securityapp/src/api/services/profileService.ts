import apiClient from '../apiClient';
import { API_ENDPOINTS } from '../endpoints';
import { SecurityOfficer } from '../../types/user.types';

export const profileService = {
  getProfile: async (securityId: string): Promise<SecurityOfficer> => {
    try {
      console.log('🔄 Fetching profile from /api/security/profile/');
      const response = await apiClient.get(API_ENDPOINTS.GET_PROFILE);

      // Log full API response
      console.log("FULL PROFILE RESPONSE:", response.data);

      // Map UserProfileSerializer response to SecurityOfficer interface
      const backendData = response.data;

      // Map assigned geofence if available
      const assignedGeofence = backendData.assigned_geofence || backendData.geofences?.[0] || null;

      const officer: SecurityOfficer = {
        id: backendData.id,
        security_id: backendData.security_id || String(backendData.id),
        name: backendData.name || backendData.username,
        email_id: backendData.email,
        mobile: backendData.phone || '',
        security_role: backendData.security_role || (backendData.role === 'security_officer' ? 'guard' : 'guard'),
        geofence_id: assignedGeofence?.id || '',
        user_image: undefined,
        status: backendData.status || (backendData.is_active ? 'active' : 'inactive'),
        badge_number: backendData.badge_number || backendData.username,
        shift_schedule: 'Day Shift',
        stats: {
          total_responses: backendData.stats?.total_responses ?? 0,
          avg_response_time: backendData.stats?.avg_response_time ?? 0,
          active_hours: backendData.stats?.active_hours ?? 0,
          area_coverage: backendData.stats?.area_coverage ?? 0,
        },
        geofence_name: backendData.geofence_name || assignedGeofence?.name || undefined,
        assigned_geofence: assignedGeofence ? {
          id: assignedGeofence.id,
          name: assignedGeofence.name,
        } : undefined,
        date_joined: backendData.date_joined,
        last_login: backendData.last_login,
      };

      console.log('✅ Mapped profile data to SecurityOfficer format:', officer);
      return officer;
    } catch (error: any) {
      console.error('❌ Failed to fetch profile:', error.message || error);
      console.error('Error details:', error?.response?.data || error);
      throw error;
    }
  },

  updateProfile: async (securityId: string, updates: Partial<SecurityOfficer>) => {
    try {
      console.log('[profileService] Updating profile for securityId:', securityId);
      console.log('[profileService] Update data:', JSON.stringify(updates, null, 2));

      const response = await apiClient.patch(API_ENDPOINTS.UPDATE_PROFILE, updates);

      console.log('[profileService] Update response:', response.data);
      return { result: 'success', msg: 'Profile updated successfully' };
    } catch (error: any) {
      console.error('[profileService] Failed to update profile:', error);
      console.error('[profileService] Error response:', error?.response?.data);
      throw error;
    }
  },
};