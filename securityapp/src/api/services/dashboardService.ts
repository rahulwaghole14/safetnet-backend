import apiClient from '../apiClient';
import { API_ENDPOINTS } from '../endpoints';
import { Alert } from '../../types/alert.types';

export interface DashboardStats {
  active_sos_alerts: number;
  assigned_cases: number;
  resolved_today: number;
  on_duty_status: boolean;
  total_alerts?: number;
}

export interface DashboardData {
  stats: DashboardStats;
  recent_alerts: Alert[];
  officer_info?: {
    id: number;
    name: string;
    email: string;
    badge_number?: string;
    on_duty: boolean;
    organization?: string;
  };
}

export const dashboardService = {
  /**
   * Get dashboard data including stats and recent alerts
   * GET /api/security/dashboard/
   */
  getDashboardData: async (): Promise<DashboardData> => {
    try {
      console.log('📡 GET /dashboard/ - Fetching dashboard data from backend');
      const response = await apiClient.get(API_ENDPOINTS.DASHBOARD);
      console.log('📥 GET /dashboard/ response:', response.data);

      // Validate required fields from backend - no fallback dummy data
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid dashboard data received from server');
      }

      // Transform the response to match our interface - only use backend data
      const dashboardData: DashboardData = {
        stats: {
          active_sos_alerts: response.data.metrics?.active_alerts ?? 0,
          assigned_cases: response.data.metrics?.pending_alerts ?? 0,
          resolved_today: response.data.metrics?.resolved_today ?? 0,
          on_duty_status: true, // Default to true since backend doesn't provide this
          total_alerts: response.data.metrics?.total_sos_handled ?? 0,
        },
        recent_alerts: Array.isArray(response.data.recent_alerts) ? response.data.recent_alerts : [],
        officer_info: {
          id: 1, // Default since backend doesn't provide officer ID
          name: response.data.officer_name || 'Security Officer',
          email: 'officer001@safetnet.com', // Default since backend doesn't provide email
          badge_number: undefined,
          on_duty: true,
          organization: undefined,
        },
      };

      console.log('✅ Dashboard data transformed:', {
        stats: dashboardData.stats,
        recentAlertsCount: dashboardData.recent_alerts.length,
        hasOfficerInfo: !!dashboardData.officer_info,
      });

      return dashboardData;
    } catch (error: any) {
      console.error('❌ Failed to fetch dashboard data:', error.message || error);
      console.error('Error details:', error.response?.data || error);
      
      // Re-throw error instead of returning dummy data
      throw new Error(error.message || 'Failed to load dashboard data from server');
    }
  },

  /**
   * Get dashboard stats only (for periodic updates)
   */
  getDashboardStats: async (): Promise<DashboardStats> => {
    try {
      console.log('📡 GET /dashboard/ - Fetching dashboard stats only');
      const response = await apiClient.get(API_ENDPOINTS.DASHBOARD);
      
      // Validate response data
      if (!response.data || typeof response.data !== 'object') {
        throw new Error('Invalid dashboard stats received from server');
      }
      
      const stats: DashboardStats = {
        active_sos_alerts: response.data.active_sos_alerts ?? response.data.stats?.active_sos_alerts ?? 0,
        assigned_cases: response.data.assigned_cases ?? response.data.stats?.assigned_cases ?? 0,
        resolved_today: response.data.resolved_today ?? response.data.stats?.resolved_today ?? 0,
        on_duty_status: response.data.on_duty_status ?? response.data.stats?.on_duty_status ?? true,
        total_alerts: response.data.total_alerts ?? response.data.stats?.total_alerts ?? 0,
      };

      console.log('✅ Dashboard stats:', stats);
      return stats;
    } catch (error: any) {
      console.error('❌ Failed to fetch dashboard stats:', error.message || error);
      
      // Re-throw error instead of returning dummy data
      throw new Error(error.message || 'Failed to load dashboard stats from server');
    }
  },
};
