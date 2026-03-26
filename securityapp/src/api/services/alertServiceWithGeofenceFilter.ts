import apiClient from '../apiClient';
import { API_ENDPOINTS } from '../endpoints';
import { Alert } from '../../types/alert.types';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Status mapping function
const mapStatus = (backendStatus: string | undefined): string => {
  if (!backendStatus) return 'pending';
  
  switch (backendStatus.toUpperCase()) {
    case 'ACTIVE':
    case 'PENDING':
      return 'pending';
    case 'ACCEPTED':
      return 'accepted';
    case 'RESOLVED':
      return 'resolved';
    default:
      return 'pending';
  }
};

// Storage keys for local alerts
const LOCAL_ALERTS_KEY = '@local_alerts';

// Helper functions for local alert persistence
const saveLocalAlert = async (alert: Alert): Promise<void> => {
  try {
    const existingLocalAlerts = await AsyncStorage.getItem(LOCAL_ALERTS_KEY);
    const localAlerts: Alert[] = existingLocalAlerts ? JSON.parse(existingLocalAlerts) : [];
    
    // Add new local alert at the beginning
    localAlerts.unshift(alert);
    
    // Limit to 50 local alerts
    const limitedLocalAlerts = localAlerts.slice(0, 50);
    
    await AsyncStorage.setItem(LOCAL_ALERTS_KEY, JSON.stringify(limitedLocalAlerts));
    console.log('💾 Local alert saved:', alert.id);
  } catch (error) {
    console.error('❌ Failed to save local alert:', error);
  }
};

const getLocalAlerts = async (): Promise<Alert[]> => {
  try {
    const existingLocalAlerts = await AsyncStorage.getItem(LOCAL_ALERTS_KEY);
    const localAlerts: Alert[] = existingLocalAlerts ? JSON.parse(existingLocalAlerts) : [];
    console.log('📂 Loaded local alerts:', localAlerts.length);
    return localAlerts;
  } catch (error) {
    console.error('❌ Failed to load local alerts:', error);
    return [];
  }
};

export const alertServiceWithGeofenceFilter = {

  // Get all alerts with backend-authoritative area filtering
  // Backend automatically identifies officer from authentication context
  getAlerts: async (): Promise<Alert[]> => {
    try {
      console.log('📡 GET /sos/ - Fetching alerts with backend-authoritative area filtering...');
      console.log('🔐 Backend will identify officer from authentication context');
      
      // Add cache-busting timestamp only
      // Backend will handle officer identification and geofence filtering automatically
      const timestamp = Date.now();
      let apiUrl = `${API_ENDPOINTS.LIST_SOS}?_t=${timestamp}`;
      
      console.log(`🗺️ Backend filtering enabled - No frontend parameters needed`);
      
      const response = await apiClient.get(apiUrl);
      
      let alertsData: any[] = [];

      // Handle different response structures
      console.log('🔍 Backend Response Analysis:');
      if (!response.data) {
        console.warn('⚠️ API returned null or undefined data');
        return [];
      }
      
      console.log(`   📊 Response type: ${typeof response.data}`);
      console.log(`   📊 Response keys: ${Object.keys(response.data)}`);
      console.log(`   📊 Has results: ${!!response.data?.results}`);
      console.log(`   📊 Is array: ${Array.isArray(response.data)}`);
      
      // Handle paginated response (Django REST Framework style)
      if (response.data.results && Array.isArray(response.data.results)) {
        alertsData = response.data.results;
        console.log('📄 Paginated response detected');
        console.log(`📊 Pagination info:`, {
          count: response.data.count,
          next: response.data.next ? 'YES' : 'NO',
          previous: response.data.previous ? 'YES' : 'NO',
          pageSize: response.data.results?.length || 0
        });
        
        // If there are more pages, fetch them all (backend maintains filtering)
        if (response.data.next) {
          console.log('🔄 Fetching additional pages with backend filtering...');
          let nextPage = response.data.next;
          let allAlerts = [...alertsData];
          
          while (nextPage) {
            try {
              const nextPageResponse = await apiClient.get(nextPage);
              if (nextPageResponse.data.results && Array.isArray(nextPageResponse.data.results)) {
                allAlerts = [...allAlerts, ...nextPageResponse.data.results];
                nextPage = nextPageResponse.data.next;
                console.log(`📄 Fetched page ${Math.ceil(allAlerts.length / response.data.results.length)}, total alerts: ${allAlerts.length}`);
              } else {
                break;
              }
            } catch (pageError) {
              console.error('❌ Error fetching additional pages:', pageError);
              break;
            }
          }
          
          alertsData = allAlerts;
          console.log(`✅ Total alerts after fetching all pages: ${alertsData.length}`);
        }
      } else if (Array.isArray(response.data)) {
        alertsData = response.data;
        console.log('📄 Direct array response detected');
      } else {
        console.warn('⚠️ Unexpected API response format for getAlerts');
        console.log('🔍 Full response data:', response.data);
        return [];
      }

      console.log(`📥 Backend-filtered alerts received: ${alertsData.length} alerts`);
      console.log(`📥 Response timestamp: ${new Date().toISOString()}`);
      
      // Log filtered alerts details
      if (alertsData.length > 0) {
        console.log(' First 3 alerts from backend:');
        alertsData.slice(0, 3).forEach((alert, index) => {
          console.log(`     ${index + 1}. ID:${alert.id} Status:${alert.status} Type:${alert.alert_type} Location:${alert.location_lat},${alert.location_long}`);
        });
      }

      // Transform alerts to ensure they have the correct fields
      const transformedAlerts = alertsData.map((alert: any, index: number) => {
        // Safety check: ensure we're working with an object, not an array
        if (Array.isArray(alert)) {
          console.error(`❌ Alert at index ${index} is an array, not an object:`, alert);
          return null; // Skip this invalid entry
        }
        
        // Debug log to check the structure of each alert
        console.log('🔍 Processing alert:', {
          id: alert.id,
          has_created_by_role: 'created_by_role' in alert,
          created_by_role: alert.created_by_role,
          alert_type: typeof alert
        });
        
        // Skip null alerts
        if (!alert || typeof alert !== 'object') {
          console.error(`❌ Invalid alert at index ${index}:`, alert);
          return null;
        }
        
        // Robust GPS parsing
        const nestedLat = alert.location?.latitude || alert.location?.lat;
        const nestedLng = alert.location?.longitude || alert.location?.lng;
        
        const lat = nestedLat ?? alert.location_lat ?? alert.latitude ?? 0;
        const lng = nestedLng ?? alert.location_long ?? alert.longitude ?? 0;
        
        return {
          ...alert,
          id: typeof alert.id === 'number' ? alert.id : parseInt(alert.id) || alert.pk || alert.alert_id,
          log_id: alert.log_id || '',
          user_id: alert.user_id || '',
          user_name: alert.user_name || alert.user || 'Unknown User',
          user_email: alert.user_email || '',
          user_phone: alert.user_phone || '',
          created_by_role: alert.created_by_role || 'USER',
          alert_type: alert.alert_type || 'security',
          priority: alert.priority || 'medium',
          message: alert.message || 'Alert message',
          location: {
            latitude: lat,
            longitude: lng,
            address: alert.location_address || alert.address || alert.location?.address || 'Unknown location'
          },
          location_lat: lat,
          location_long: lng,
        };
      }).filter(alert => alert !== null); // Filter out any null alerts

      // Sort alerts by created_at in descending order (most recent first)
      transformedAlerts.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA; // Most recent first
      });

      // Always include local alerts
      const localAlerts = await getLocalAlerts();
      console.log(' Loading local alerts:', localAlerts.length);
      
      // Combine backend and local alerts
      const allAlerts = [...transformedAlerts, ...localAlerts];
      
      // Sort combined alerts by created_at (most recent first)
      allAlerts.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      console.log('✅ Backend-authoritative alerts processed:', transformedAlerts.length, 'alerts');
      console.log('📱 Local alerts loaded:', localAlerts.length, 'alerts');
      console.log('🔢 Total alerts (combined):', allAlerts.length, 'alerts');
      console.log('🕒 Latest alert timestamp:', allAlerts.length > 0 ? 
        allAlerts[0].created_at : 'No alerts');
      console.log('📊 Alerts sorted by created_at (most recent first)');
      console.log('🔝 First 3 alerts timestamps:');
      allAlerts.slice(0, 3).forEach((alert, index) => {
        console.log(`   ${index + 1}. ${alert.created_at} (${alert.id}) ${alert.isLocal ? '(LOCAL)' : '(BACKEND)'}`);
      });
      
      return allAlerts;
    } catch (error: any) {
      console.error('❌ Failed to fetch alerts with backend-authoritative filtering:', error.message || error);
      console.error('🔍 Error details:', error.response?.data || error);
      
      // Check for SSL connection errors
      if (error.message && error.message.includes('SSL connection has been closed unexpectedly')) {
        console.log('🔐 SSL connection error detected - unable to fetch alerts');
        throw new Error('SSL connection error. Please check your network connection and try again.');
      }
      
      // Check for network/connection errors
      if (error.code === 'NETWORK_ERROR' || error.code === 'ECONNABORTED') {
        console.log('🌐 Network error detected - unable to fetch alerts');
        throw new Error('Network connection error. Please check your internet connection and try again.');
      }
      
      // Return empty array for other backend errors
      console.log('🚨 Backend filtering failed - returning local alerts if available');
      
      // Try to return local alerts as fallback
      const localAlerts = await getLocalAlerts();
      if (localAlerts.length > 0) {
        console.log('📱 Returning local alerts as fallback:', localAlerts.length);
        return localAlerts;
      }
      
      return [];
    }
  },

  // Get recent alerts with backend-authoritative filtering
  getRecentAlerts: async (limit: number = 5): Promise<Alert[]> => {
    try {
      console.log(`📡 GET /sos/ - Fetching recent alerts with backend-authoritative filtering (limit: ${limit})`);
      
      let apiUrl = API_ENDPOINTS.LIST_SOS;
      
      // Backend will handle all filtering based on authenticated officer
      apiUrl += `?limit=${limit}`;
      
      const response = await apiClient.get(apiUrl);
      
      let alertsData: any[] = [];

      if (response.data.results && Array.isArray(response.data.results)) {
        alertsData = response.data.results;
      } else if (Array.isArray(response.data)) {
        alertsData = response.data;
      } else {
        console.warn('Unexpected API response format for getRecentAlerts');
        return [];
      }

      // Transform the alerts
      const transformedAlerts = alertsData.map((alert: any) => {
        // Robust GPS parsing
        const nestedLat = alert.location?.latitude || alert.location?.lat;
        const nestedLng = alert.location?.longitude || alert.location?.lng;
        
        const lat = nestedLat ?? alert.location_lat ?? alert.latitude ?? 0;
        const lng = nestedLng ?? alert.location_long ?? alert.longitude ?? 0;

        return {
          ...alert,
          id: typeof alert.id === 'number' ? alert.id : parseInt(alert.id) || alert.pk || alert.alert_id,
          log_id: alert.log_id || '',
          user_id: alert.user_id || '',
          user_name: alert.user_name || alert.user || 'Unknown User',
          user_email: alert.user_email || '',
          user_phone: alert.user_phone || '',
          alert_type: alert.alert_type || 'security',
          priority: alert.priority || 'medium',
          message: alert.message || 'Alert message',
          location: {
            latitude: lat,
            longitude: lng,
            address: alert.location_address || alert.address || alert.location?.address || 'Unknown location'
          },
          location_lat: lat,
          location_long: lng,
          timestamp: alert.timestamp || alert.created_at || new Date().toISOString(),
          status: alert.status || 'pending',
          geofence_id: alert.geofence_id || '',
          created_at: alert.created_at || alert.timestamp || new Date().toISOString(),
          updated_at: alert.updated_at
        };
      });

    // Sort alerts by created_at in descending order (most recent first)
      transformedAlerts.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      // Include local alerts in recent alerts
      const localAlerts = await getLocalAlerts();
      const allRecentAlerts = [...transformedAlerts, ...localAlerts];
      
      // Sort combined alerts and apply limit
      allRecentAlerts.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });
      
      const limitedAlerts = allRecentAlerts.slice(0, limit);

      console.log(`✅ Fetched ${limitedAlerts.length} recent alerts (${transformedAlerts.length} backend + ${localAlerts.length} local)`);
      return limitedAlerts;
  } catch (error: any) {
    console.error('❌ Failed to fetch recent alerts with backend-authoritative filtering:', error.message || error);
    return [];
  }
},

  // Get active alerts with backend-authoritative filtering
  getActiveAlerts: async (): Promise<Alert[]> => {
    try {
      let apiUrl = API_ENDPOINTS.GET_ACTIVE_SOS;
      
      // Backend will identify officer and filter automatically
      const response = await apiClient.get(apiUrl);
      return response.data;
    } catch (error) {
      console.error('Error fetching active alerts with backend-authoritative filtering:', error);
      throw error;
    }
  },

  // Get resolved alerts with backend-authoritative filtering
  getResolvedAlerts: async (): Promise<Alert[]> => {
    try {
      let apiUrl = API_ENDPOINTS.GET_RESOLVED_SOS;
      
      // Backend will identify officer and filter automatically
      const response = await apiClient.get(apiUrl);
      return response.data;
    } catch (error: any) {
      console.error('Error fetching resolved alerts with backend-authoritative filtering:', error);
      console.error('Error details:', error.response?.data || error);
      return [];
    }
  },

  // Other methods remain the same as original alertService
  getAlertById: async (id: string): Promise<Alert> => {
    try {
      console.log(`📡 GET /sos/${id} - Fetching alert details`);
      const response = await apiClient.get(API_ENDPOINTS.GET_SOS.replace('{id}', String(id)));
      
      // Transform backend data to match frontend Alert interface
      const alertData = response.data;
      console.log('🔍 Raw backend alert data:', alertData);
      
      // Transform location fields to location object
      const nestedLat = alertData.location?.latitude || alertData.location?.lat;
      const nestedLng = alertData.location?.longitude || alertData.location?.lng;
      
      const rawLat = nestedLat ?? alertData.location_lat ?? alertData.latitude ?? alertData.lat;
      const rawLng = nestedLng ?? alertData.location_long ?? alertData.longitude ?? alertData.lng;
      
      if (rawLat !== undefined && rawLat !== null && rawLng !== undefined && rawLng !== null) {
        const lat = parseFloat(String(rawLat));
        const lng = parseFloat(String(rawLng));
        
        // Validate GPS coordinates
        if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180 || (lat === 0 && lng === 0)) {
          console.error('❌ Invalid GPS coordinates in alert data:', { 
            original_lat: rawLat,
            original_lng: rawLng,
            parsed_lat: lat,
            parsed_lng: lng
          });
          
          if (!alertData.location?.latitude) {
            alertData.location = {
              latitude: 0,
              longitude: 0,
              address: 'Invalid GPS coordinates'
            };
            alertData.location_lat = 0;
            alertData.location_long = 0;
          }
        } else {
          alertData.location = {
            latitude: lat,
            longitude: lng,
            address: alertData.location_address || alertData.location?.address || `GPS: ${lat.toFixed(6)}, ${lng.toFixed(6)}`
          };
          
          alertData.location_lat = lat;
          alertData.location_long = lng;
          
          console.log('✅ Transformed location object:', alertData.location);
        }
      } else {
        console.warn('⚠️ No location coordinates found in alert data');
        if (!alertData.location?.latitude) {
          alertData.location = {
            latitude: 0,
            longitude: 0,
            address: 'Unknown location - GPS coordinates missing'
          };
          alertData.location_lat = 0;
          alertData.location_long = 0;
        }
      }
      
      return alertData;
    } catch (error) {
      console.error('Error fetching alert:', error);
      throw error;
    }
  },

  acceptAlert: async (id: string): Promise<Alert> => {
    try {
      const response = await apiClient.patch(API_ENDPOINTS.UPDATE_SOS.replace('{id}', String(id)), {
        status: 'accepted'
      });
      return response.data;
    } catch (error) {
      console.error('Error accepting alert:', error);
      throw error;
    }
  },

  createAlert: async (alertData: {
    alert_type: 'emergency' | 'security' | 'general' | 'area_user_alert';
    message: string;
    description?: string;
    location?: { latitude: number; longitude: number };
    priority?: 'high' | 'medium' | 'low';
    expires_at?: string; // For area-based alerts
    location_lat?: number; // Direct latitude field
    location_long?: number; // Direct longitude field
  }): Promise<Alert> => {
    // Create API payload with location data
    const apiData: {
      alert_type: string;
      message: string;
      description: string;
      priority: string;
      expires_at?: string;
      location_lat?: number; // Add location fields to API payload
      location_long?: number;
    } = {
      alert_type: alertData.alert_type === 'general' ? 'normal' : alertData.alert_type,
      message: alertData.message,
      description: alertData.description || alertData.message,
      priority: alertData.priority || 'medium',
    };

    // Add location data - ensure location_lat and location_long are always present
    if (alertData.location_lat !== undefined && alertData.location_long !== undefined) {
      apiData.location_lat = alertData.location_lat;
      apiData.location_long = alertData.location_long;
    } else if (alertData.location) {
      apiData.location_lat = alertData.location.latitude;
      apiData.location_long = alertData.location.longitude;
    } else {
      // For area_user_alert or when location is not available, use dummy coordinates
      // Backend will handle geofence assignment for area alerts
      apiData.location_lat = 0.0;
      apiData.location_long = 0.0;
    }

    // Add expiry for area-based alerts - always include for area_user_alert
    if (alertData.alert_type === 'area_user_alert') {
      // Use provided expires_at or default to 30 minutes from now
      apiData.expires_at = alertData.expires_at || new Date(Date.now() + 30 * 60 * 1000).toISOString();
    }

    console.log('📤 Alert Creation Debug (Backend-Authoritative):');
    console.log('   📤 Alert Type:', apiData.alert_type);
    console.log('   📤 Message:', apiData.message);
    console.log('   📤 Priority:', apiData.priority);
    console.log('   📤 Location Lat:', apiData.location_lat);
    console.log('   📤 Location Long:', apiData.location_long);
    console.log('   � Expires at:', apiData.expires_at || 'Not set');

    // API call for alert creation
    console.log('📤 Sending alert data');

    try {
      console.log('📡 Creating alert with data:', apiData);
      const response = await apiClient.post(API_ENDPOINTS.CREATE_SOS, apiData);

      console.log('📥 POST /sos/ response:', response.data);
      console.log('✅ Alert created, response:', response.data);

      // Robust GPS parsing for response
      const nestedLat = response.data.location?.latitude || response.data.location?.lat;
      const nestedLng = response.data.location?.longitude || response.data.location?.lng;
      
      const resLat = nestedLat ?? response.data.location_lat ?? response.data.latitude ?? apiData.location_lat ?? 0;
      const resLng = nestedLng ?? response.data.location_long ?? response.data.longitude ?? apiData.location_long ?? 0;

      // Transform the response to ensure it matches our Alert interface
      const createdAlert = {
        ...response.data,
        id: typeof response.data.id === 'number' ? response.data.id : parseInt(response.data.id) || response.data.pk || response.data.alert_id,
        log_id: response.data.log_id || '',
        user_id: response.data.user_id || '',
        user_name: response.data.user_name || response.data.user || 'Security Officer',
        user_email: response.data.user_email || '',
        user_phone: response.data.user_phone || '',
        alert_type: response.data.alert_type || apiData.alert_type,
        priority: response.data.priority || (apiData.alert_type === 'emergency' || apiData.alert_type === 'area_user_alert' ? 'high' : 'medium'),
        message: response.data.message || apiData.message,
        location: {
          latitude: resLat,
          longitude: resLng,
          address: response.data.location_address || response.data.location?.address || 'Backend assigned location'
        },
        location_lat: resLat,
        location_long: resLng,
        timestamp: response.data.timestamp || response.data.created_at || new Date().toISOString(),
        status: response.data.status || 'pending',
        geofence_id: response.data.geofence_id || '',
        created_at: response.data.created_at || response.data.timestamp || new Date().toISOString(),
        updated_at: response.data.updated_at,
        // Area-based alert specific fields
        affected_users_count: response.data.affected_users_count,
        notification_sent: response.data.notification_sent,
        expires_at: response.data.expires_at,
      };

      console.log('🔄 Transformed created alert:', createdAlert.id);
      console.log('📊 Area-based alert info:', {
        type: createdAlert.alert_type,
        affected_users: createdAlert.affected_users_count,
        notification_sent: createdAlert.notification_sent,
        expires_at: createdAlert.expires_at
      });
      
      return createdAlert;
    } catch (error: any) {
      console.error('Failed to create alert:', error.message || error);
      console.error('Error details:', error.response?.data || error);
      console.error('Full error response:', JSON.stringify(error.details, null, 2));
      // Check if this is a backend logger issue
      if (error.message?.includes('logger') || error.response?.data?.message?.includes('logger')) {
        console.error('🔍 BACKEND ISSUE: The server is missing logger import.');
        console.error('📝 Backend team needs to add: import logging; logger = logging.getLogger(__name__)');
        
        // Temporary workaround: Create alert using a simplified approach
        console.log('🔄 Attempting workaround for backend logger issue...');
        
        try {
          // Try creating alert with minimal data to avoid logger usage
          const simplifiedAlertData = {
            alert_type: apiData.alert_type,
            message: apiData.message,
            priority: apiData.priority || 'medium',
            // Include location data in workaround too
            location_lat: apiData.location_lat,
            location_long: apiData.location_long,
            // Include expires_at for area_user_alert
            ...(apiData.alert_type === 'area_user_alert' && { expires_at: apiData.expires_at }),
          };
          
          console.log('📤 Sending simplified alert data:', simplifiedAlertData);
          const response = await apiClient.post(API_ENDPOINTS.CREATE_SOS, simplifiedAlertData);
          
          console.log('✅ Alert created with workaround:', response.data);
          
          // Transform the response to ensure it matches our Alert interface
          const createdAlert = {
            ...response.data,
            id: typeof response.data.id === 'number' ? response.data.id : parseInt(response.data.id) || response.data.pk || response.data.alert_id || Date.now(),
            log_id: response.data.log_id || `workaround_${Date.now()}`,
            user_id: response.data.user_id || '1',
            user_name: response.data.user_name || 'Security Officer',
            user_email: response.data.user_email || '',
            user_phone: response.data.user_phone || '',
            alert_type: response.data.alert_type || apiData.alert_type || 'security',
            priority: response.data.priority || apiData.priority || 'medium',
            message: response.data.message || apiData.message,
            description: response.data.description || apiData.description || apiData.message,
            location: response.data.location || {
              latitude: apiData.location_lat || 0,
              longitude: apiData.location_long || 0,
              address: 'Backend assigned location'
            },
            location_lat: response.data.location_lat || apiData.location_lat || 0,
            location_long: response.data.location_long || apiData.location_long || 0,
            timestamp: response.data.timestamp || response.data.created_at || new Date().toISOString(),
            status: response.data.status || 'pending',
            geofence_id: response.data.geofence_id || '',
            created_at: response.data.created_at || response.data.timestamp || new Date().toISOString(),
            updated_at: response.data.updated_at || new Date().toISOString(),
          };
          
          console.log('🔄 Transformed workaround alert:', createdAlert.id);
          return createdAlert;
          
        } catch (workaroundError: any) {
          console.error('❌ Workaround also failed:', workaroundError);
          console.error('🔍 Workaround error details:', {
            message: workaroundError?.message,
            status: workaroundError?.response?.status,
            data: workaroundError?.response?.data,
            stack: workaroundError?.stack
          });
          
          // If workaround fails, create a local alert that syncs later
          console.log('📱 Creating local alert for later sync...');
          
          const localAlert = {
            id: Date.now(), // Use number ID to match Alert interface
            log_id: `local_${Date.now()}`,
            user_id: '1',
            user_name: 'Security Officer',
            user_email: '',
            user_phone: '',
            alert_type: apiData.alert_type === 'general' ? 'normal' as const : apiData.alert_type as 'emergency' | 'security' | 'area_user_alert',
            priority: (apiData.priority || 'medium') as 'high' | 'medium' | 'low',
            message: apiData.message,
            description: apiData.description || apiData.message,
            created_by_role: undefined, // No default - must be set explicitly by backend
            location: {
              latitude: apiData.location_lat || 0,
              longitude: apiData.location_long || 0,
              address: 'Backend assigned location'
            },
            location_lat: apiData.location_lat || 0,
            location_long: apiData.location_long || 0,
            timestamp: new Date().toISOString(),
            status: 'pending' as const,
            geofence_id: '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            isLocal: true, // Flag for local alerts
          };
          
          console.log('✅ Local alert created for later sync:', localAlert.id);
          
          // Save local alert for persistence
          await saveLocalAlert(localAlert);
          
          return localAlert;
        }
      }
      
      throw error;
    }
  },

  updateAlert: async (id: string | number, updateData: Partial<Alert>): Promise<Alert> => {
    try {
      console.log('📡 Updating alert:', id, updateData);
      
      const alertId = typeof id === 'string' ? parseInt(id) : id;
      
      const apiData: any = {};
      
      if (updateData.status) {
        apiData.status = updateData.status;
      }
      if (updateData.message) {
        apiData.message = updateData.message;
      }
      if (updateData.alert_type) {
        apiData.alert_type = updateData.alert_type === 'normal' ? 'normal' : updateData.alert_type;
      }
      if (updateData.priority) {
        apiData.priority = updateData.priority;
      }
      
      const response = await apiClient.patch(API_ENDPOINTS.UPDATE_SOS.replace('{id}', String(alertId)), apiData);
      
      // Robust GPS parsing
      const nestedLat = response.data.location?.latitude || response.data.location?.lat;
      const nestedLng = response.data.location?.longitude || response.data.location?.lng;
      
      const resLat = nestedLat ?? response.data.location_lat ?? response.data.latitude ?? 0;
      const resLng = nestedLng ?? response.data.location_long ?? response.data.longitude ?? 0;

      const updatedAlert = {
        ...response.data,
        id: typeof response.data.id === 'number' ? response.data.id : parseInt(response.data.id) || response.data.pk || response.data.alert_id,
        log_id: response.data.log_id || '',
        user_id: response.data.user_id || '',
        user_name: response.data.user_name || response.data.user || 'Security Officer',
        user_email: response.data.user_email || '',
        user_phone: response.data.user_phone || '',
        alert_type: response.data.alert_type || updateData.alert_type || 'security',
        priority: response.data.priority || updateData.priority || 'medium',
        message: response.data.message || updateData.message || 'Alert message',
        location: {
          latitude: resLat,
          longitude: resLng,
          address: response.data.location_address || response.data.location?.address || 'Current Location'
        },
        location_lat: resLat,
        location_long: resLng,
        timestamp: response.data.timestamp || response.data.created_at || new Date().toISOString(),
        status: response.data.status || updateData.status || 'pending',
        geofence_id: response.data.geofence_id || '',
        created_at: response.data.created_at || response.data.timestamp || new Date().toISOString(),
        updated_at: response.data.updated_at
      };

      console.log('✅ Alert updated successfully:', updatedAlert.id);
      return updatedAlert;
    } catch (error: any) {
      console.error('Failed to update alert:', error.message || error);
      console.error('Error details:', error.response?.data || error);
      throw error;
    }
  },

  deleteAlert: async (id: number): Promise<void> => {
    try {
      console.log('📡 Deleting alert:', id);
      await apiClient.delete(API_ENDPOINTS.DELETE_SOS.replace('{id}', String(id)));
      console.log('✅ Alert deleted successfully');
    } catch (error: any) {
      console.error('Error deleting alert:', error);

      if (error.response?.status === 404) {
        console.error('DELETE endpoint not implemented on backend');
        throw new Error('Delete functionality is not yet available. This feature will be implemented with the next backend update.');
      } else if (error.response?.status === 405) {
        console.error('DELETE method not allowed');
        throw new Error('Delete operation is not permitted on this alert.');
      } else if (error.response?.status >= 500) {
        console.error('Server error during delete');
        throw new Error('Server error occurred. Please try again later.');
      } else {
        throw error;
      }
    }
  },

  resolveAlert: async (id: string | number): Promise<Alert> => {
    try {
      console.log('📡 Resolving alert:', id);
      
      const alertId = typeof id === 'string' ? parseInt(id) : id;
      
      const response = await apiClient.patch(API_ENDPOINTS.RESOLVE_SOS.replace('{id}', String(alertId)));
      
      const resolvedAlert = {
        ...response.data,
        id: typeof response.data.id === 'number' ? response.data.id : parseInt(response.data.id) || response.data.pk || response.data.alert_id,
        log_id: response.data.log_id || '',
        user_id: response.data.user_id || '',
        user_name: response.data.user_name || response.data.user || 'Security Officer',
        user_email: response.data.user_email || '',
        user_phone: response.data.user_phone || '',
        alert_type: response.data.alert_type || 'security',
        priority: response.data.priority || 'medium',
        message: response.data.message || 'Alert message',
        location: response.data.location || {
          latitude: response.data.location_lat || 0,
          longitude: response.data.location_long || 0,
          address: response.data.location || 'Current Location'
        },
        timestamp: response.data.timestamp || response.data.created_at || new Date().toISOString(),
        status: 'completed',
        geofence_id: response.data.geofence_id || '',
        created_at: response.data.created_at || response.data.timestamp || new Date().toISOString(),
        updated_at: response.data.updated_at
      };

      console.log('✅ Alert resolved successfully:', resolvedAlert.id);
      return resolvedAlert;
    } catch (error: any) {
      console.error('Failed to resolve alert:', error.message || error);
      console.error('Error details:', error.response?.data || error);
      throw error;
    }
  },

  getDashboardData: async (): Promise<any> => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.DASHBOARD);
      return response.data;
    } catch (error: any) {
      console.error('Failed to fetch dashboard data:', error.message || error);
      return {
        stats: {
          total_sos_handled: 0,
          active_cases: 0,
          resolved_cases_this_week: 0,
          average_response_time_minutes: 0,
          unread_notifications: 0
        },
        recent_alerts: [],
        officer_info: {
          name: 'Security Officer',
          badge_number: 'N/A',
          status: 'active'
        }
      };
    }
  },
};
