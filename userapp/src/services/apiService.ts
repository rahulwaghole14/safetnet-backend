/**
 * API Service for User App
 * Handles all API calls to the backend with smart caching
 */

// Import AsyncStorage using the initialization utility
import { getAsyncStorage, getAsyncStorageSync } from '../utils/asyncStorageInit';
import { cacheService } from './cacheService';
import { useNetworkToastStore } from '../stores/networkToastStore';

// Get AsyncStorage synchronously (will be initialized on first async call)
let AsyncStorage: any = getAsyncStorageSync();

// Initialize AsyncStorage asynchronously
getAsyncStorage().then((storage) => {
  AsyncStorage = storage;
}).catch((error) => {
  console.error('Failed to initialize AsyncStorage in apiService:', error);
});

// API Base URL configuration - use live server
const API_BASE_URL = 'https://safetnet-backend-1.onrender.com/api/user';

// Get the working API base URL
let cachedApiBaseUrl: string | null = null;

const getApiBaseUrl = async (): Promise<string> => {
  if (!cachedApiBaseUrl) {
    console.log(`[API] Using server: ${API_BASE_URL}`);
    cachedApiBaseUrl = API_BASE_URL;
  }
  return API_BASE_URL;
};

interface LoginResponse {
  message: string;
  user: {
    id: number;
    name?: string;
    email: string;
    phone?: string | null;
    plantype?: string;
    planexpiry?: string | null;
    is_premium?: boolean;
    is_paid_user?: boolean;
    first_name?: string;
    last_name?: string;
    username?: string;
    location?: {
      longitude?: number;
      latitude?: number;
    } | null;
  };
  tokens: {
    access: string;
    refresh: string;
  };
}

interface RegisterResponse {
  message: string;
  user: {
    id: number;
    name?: string;
    email: string;
    phone?: string;
    plantype?: string;
    planexpiry?: string;
    is_premium?: boolean;
  };
  tokens: {
    access: string;
    refresh: string;
  };
}

class ApiService {
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  /**
   * Test backend connectivity and health
   * Returns true if backend is reachable, false otherwise
   */
  /**
   * Check backend connectivity (optional - for diagnostic purposes)
   * Note: This is a simple connectivity test, not a full health check
   */
  async checkBackendHealth(): Promise<{ isHealthy: boolean; message: string; details?: any }> {
    // Use the login endpoint itself as a simple connectivity test
    // We'll just try to reach it (without actually logging in)
    const baseUrl = await getApiBaseUrl();
    const healthCheckUrl = `${baseUrl}/login/`;
    const timeoutMs = 3000; // 3 second timeout for quick check

    try {
      console.log(`[Health Check] Testing backend connectivity at: ${healthCheckUrl}`);

      // Create an AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Try an OPTIONS request or HEAD request to test connectivity
      // We'll do a minimal POST request with invalid data to test connectivity
      const response = await fetch(healthCheckUrl, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // Empty body will get validation error but confirms backend is reachable
      });

      clearTimeout(timeoutId);

      const text = await response.text();
      console.log(`[Health Check] Response status: ${response.status}`);

      // Any response (even 400/401) means backend is reachable
      // 400 = validation error (backend is up)
      // 401 = auth error (backend is up but requires auth)
      // 404 = endpoint not found (but backend is up)
      if (response.status < 500) {
        return {
          isHealthy: true,
          message: 'Backend is reachable and responding',
          details: { status: response.status, url: healthCheckUrl },
        };
      } else {
        return {
          isHealthy: false,
          message: `Backend responded with server error: ${response.status} ${response.statusText}`,
          details: { status: response.status, text: text.substring(0, 200) },
        };
      }
    } catch (error: any) {
      console.error('[Health Check] Error:', error);

      const errorMessage = error?.message || error?.toString() || 'Unknown error';
      const errorName = error?.name || '';

      const baseUrl = await getApiBaseUrl();
      if (error.name === 'AbortError' || errorMessage.includes('timeout')) {
        return {
          isHealthy: false,
          message: `Backend timeout: Server at ${baseUrl} did not respond within ${timeoutMs}ms. Is the backend running?`,
          details: { url: healthCheckUrl, timeout: timeoutMs },
        };
      }

      if (
        errorMessage.includes('Network request failed') ||
        errorMessage.includes('Failed to fetch') ||
        errorName === 'TypeError'
      ) {
        return {
          isHealthy: false,
          message: `Cannot connect to backend at ${baseUrl}. Please check: 1) Backend server is running, 2) Network connection is active, 3) Device is on the same network (for local development)`,
          details: { url: healthCheckUrl, error: errorMessage },
        };
      }

      return {
        isHealthy: false,
        message: `Backend health check failed: ${errorMessage}`,
        details: { url: healthCheckUrl, error: errorMessage },
      };
    }
  }

  /**
   * Set tokens after login/register
   */
  async setTokens(access: string, refresh: string) {
    this.accessToken = access;
    this.refreshToken = refresh;
    // Store in AsyncStorage for persistence
    try {
      const storage = await getAsyncStorage();
      await storage.setItem('access_token', access);
      await storage.setItem('refresh_token', refresh);
    } catch (error) {
      console.error('Error saving tokens:', error);
    }
  }

  /**
   * Get stored tokens
   */
  async loadTokens() {
    try {
      const storage = await getAsyncStorage();
      const access = await storage.getItem('access_token');
      const refresh = await storage.getItem('refresh_token');
      if (access && refresh) {
        this.accessToken = access;
        this.refreshToken = refresh;
      }
    } catch (error) {
      console.error('Error loading tokens:', error);
    }
  }

  /**
   * Clear tokens on logout
   */
  async clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    try {
      const storage = await getAsyncStorage();
      await storage.removeItem('access_token');
      await storage.removeItem('refresh_token');
    } catch (error) {
      console.error('Error clearing tokens:', error);
    }
  }

  /**
   * Make authenticated API request
   */
  private async request(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<any> {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    // Add timeout to fetch request
    const timeoutMs = 30000; // 30 seconds
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      console.log(`[API Request] ${options.method || 'GET'} ${url}`);

      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Read response text first (can only read once)
      const text = await response.text();

      if (!response.ok) {
        // Try to parse error response
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          if (text) {
            const errorData = JSON.parse(text);
            // Extract error message from various possible formats
            if (errorData.detail) {
              errorMessage = errorData.detail;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            } else if (errorData.error) {
              errorMessage = errorData.error;
            } else if (errorData.non_field_errors) {
              errorMessage = Array.isArray(errorData.non_field_errors)
                ? errorData.non_field_errors[0]
                : errorData.non_field_errors;
            } else if (typeof errorData === 'object') {
              // Get first error message from object
              const firstKey = Object.keys(errorData)[0];
              if (firstKey) {
                const firstError = errorData[firstKey];
                errorMessage = Array.isArray(firstError) ? firstError[0] : firstError;
              }
            }
          }
        } catch (parseError) {
          // If parsing fails, use the text as error message
          errorMessage = text || errorMessage;
        }

        // Only try token refresh for authenticated endpoints (not login/register)
        // Login endpoints should never have 401 (they return 400 for invalid credentials)
        const isAuthEndpoint = endpoint.includes('/login/') || endpoint.includes('/register/') || endpoint === '/';
        if (response.status === 401 && this.refreshToken && !isAuthEndpoint) {
          // Try to refresh token for authenticated endpoints
          const refreshed = await this.refreshAccessToken();
          if (refreshed) {
            // Retry request with new token
            headers['Authorization'] = `Bearer ${this.accessToken}`;
            const retryResponse = await fetch(url, {
              ...options,
              headers,
            });
            const retryText = await retryResponse.text();
            if (!retryResponse.ok) {
              try {
                const retryError = retryText ? JSON.parse(retryText) : {};
                throw new Error(retryError.detail || retryError.message || `HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
              } catch (parseError) {
                throw new Error(retryText || `HTTP ${retryResponse.status}: ${retryResponse.statusText}`);
              }
            }
            return retryText ? JSON.parse(retryText) : {};
          }
        }

        // For login/register endpoints, 401 shouldn't happen - backend returns 400 for invalid credentials
        if (response.status === 401 && isAuthEndpoint) {
          console.warn('[API Request] Received 401 on auth endpoint - this is unusual, backend should return 400 for invalid credentials');
        }

        throw new Error(errorMessage);
      }

      return text ? JSON.parse(text) : {};
    } catch (error: any) {
      // Clean up timeout if still active
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // For SOS endpoint, don't log detailed errors (they're expected and non-critical)
      const isSOSEndpoint = endpoint.includes('/sos/');
      if (!isSOSEndpoint) {
        console.error('[API Request Error] Full error details:', {
          name: error?.name,
          message: error?.message,
          stack: error?.stack,
          url: url,
          endpoint: endpoint,
        });
      }

      // Handle network errors specifically
      // Check error message, name, and string representation
      const errorMessage = error?.message || error?.toString() || '';
      const errorName = error?.name || '';
      const errorString = String(error || '');

      // Timeout errors (check first)
      // For SOS endpoint, don't log timeout errors as they're expected and non-critical
      // Reuse isSOSEndpoint declared above
      if (
        error.name === 'AbortError' ||
        errorMessage.includes('timeout') ||
        errorString.includes('timeout') ||
        errorMessage.includes('TIMEOUT') ||
        errorMessage.includes('aborted')
      ) {
        if (isSOSEndpoint) {
          // For SOS endpoint, silently handle timeout - it's non-critical and runs in background
          // Don't log error or show toast for SOS timeouts
          throw new Error(`Request timeout after ${timeoutMs}ms. The server at ${await getApiBaseUrl()} took too long to respond.`);
        } else {
          // For other endpoints, log timeout as before
          console.error('[API Request Error] Request timeout');
          useNetworkToastStore.getState().show();
          const baseUrl = await getApiBaseUrl();
          throw new Error(`Request timeout after ${timeoutMs}ms. The server at ${baseUrl} took too long to respond. Please check if the backend is running.`);
        }
      }

      // Network request failed - common in React Native
      if (
        errorMessage.includes('Network request failed') ||
        errorString.includes('Network request failed') ||
        (errorName === 'TypeError' && errorMessage.includes('Network'))
      ) {
        console.error('[API Request Error] Network request failed - backend may be unreachable');
        useNetworkToastStore.getState().show();
        const baseUrl = await getApiBaseUrl();
        throw new Error(`Cannot connect to backend at ${baseUrl}. Please check: 1) Backend server is running, 2) Network connection is active, 3) Device is on the same network (for local development).`);
      }
      // Failed to fetch - common in web browsers
      else if (
        errorMessage.includes('Failed to fetch') ||
        errorString.includes('Failed to fetch') ||
        (errorName === 'TypeError' && errorMessage.includes('fetch'))
      ) {
        console.error('[API Request Error] Failed to fetch - connection error');
        useNetworkToastStore.getState().show();
        const baseUrl = await getApiBaseUrl();
        throw new Error(`Failed to connect to server at ${baseUrl}. Please check if the backend is running.`);
      }
      // Connection refused
      else if (
        errorMessage.includes('ECONNREFUSED') ||
        errorString.includes('ECONNREFUSED') ||
        errorMessage.includes('Connection refused')
      ) {
        console.error('[API Request Error] Connection refused');
        useNetworkToastStore.getState().show();
        const baseUrl = await getApiBaseUrl();
        throw new Error(`Connection refused by ${baseUrl}. Please ensure the backend server is running.`);
      }
      // TypeError without specific message (often network related)
      else if (errorName === 'TypeError') {
        console.error('[API Request Error] TypeError - likely network issue');
        useNetworkToastStore.getState().show();
        const baseUrl = await getApiBaseUrl();
        throw new Error(`Network error connecting to ${baseUrl}. Please check: 1) Backend server is running, 2) Network connection is active, 3) Device network connection. Error: ${errorMessage || 'Unknown TypeError'}`);
      }

      // For other errors, re-throw as-is but log details
      console.error('[API Request Error] Other error:', error);
      throw error;
    }
  }

  /**
   * Refresh access token
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const baseUrl = await getApiBaseUrl();
      const refreshUrl = baseUrl.replace('/api/user', '/api/auth');
      const response = await fetch(`${refreshUrl}/refresh/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refresh: this.refreshToken }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.access) {
          this.accessToken = data.access;
          try {
            const storage = await getAsyncStorage();
            await storage.setItem('access_token', data.access);
          } catch (error) {
            console.error('Error saving refreshed token:', error);
          }
          return true;
        }
      }
    } catch (error) {
      console.error('Token refresh error:', error);
    }
    return false;
  }

  /**
   * User login
   */
  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      const baseUrl = await getApiBaseUrl();
      console.log('[Login] Attempting login with:', { email, url: `${baseUrl}/login/` });

      // Note: We don't do a separate health check before login because:
      // 1. The login request itself will fail fast if backend is unreachable
      // 2. Health check endpoints often require authentication
      // 3. It adds unnecessary latency to the login flow

      const response = await this.request('/login/', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      console.log('[Login] Login successful, received tokens:', {
        hasAccessToken: !!response.tokens?.access,
        hasRefreshToken: !!response.tokens?.refresh,
        userId: response.user?.id,
      });

      if (response.tokens) {
        await this.setTokens(response.tokens.access, response.tokens.refresh);
        console.log('[Login] Tokens saved successfully');
      } else {
        console.warn('[Login] No tokens in response:', response);
        throw new Error('Login successful but no tokens received from server');
      }

      return response;
    } catch (error: any) {
      console.error('[Login] Login error:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
      });

      // Provide user-friendly error messages
      if (error.message && error.message.includes('400')) {
        throw new Error('Invalid email or password. Please check your credentials and try again.');
      } else if (error.message && error.message.includes('401')) {
        // This shouldn't happen for login, but handle it gracefully
        throw new Error('Authentication failed. Please check your credentials and try again.');
      }

      // Re-throw the error as-is if it's already a user-friendly message
      throw error;
    }
  }

  /**
   * User registration
   */
  async register(
    name: string,
    email: string,
    phone: string,
    password: string,
    passwordConfirm: string
  ): Promise<RegisterResponse> {
    const response = await this.request('/', {
      method: 'POST',
      body: JSON.stringify({
        name,
        email,
        phone,
        password,
        password_confirm: passwordConfirm,
        plantype: 'free', // Default to free
      }),
    });

    if (response.tokens) {
      await this.setTokens(response.tokens.access, response.tokens.refresh);
    }

    return response;
  }

  /**
   * Get user profile (with caching)
   */
  async getProfile(): Promise<any> {
    const cacheKey = 'user_profile';
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request('/profile/'),
      { compareByHash: true }
    );
  }

  /**
   * Update user profile (invalidates cache)
   */
  async updateProfile(data: any): Promise<any> {
    const result = await this.request('/profile/', {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    // Invalidate profile cache after updating
    await cacheService.invalidate('user_profile');
    return result;
  }

  /**
   * Update FCM token for push notifications
   */
  async updateFCMToken(token: string): Promise<any> {
    try {
      const response = await this.request('/profile/update-fcm-token/', {
        method: 'POST',
        body: JSON.stringify({ token }),
      });
      console.log('[API] FCM token updated successfully');
      return response;
    } catch (error) {
      console.error('[API Error] Failed to update FCM token', error);
      throw error;
    }
  }

  /**
   * Get family contacts (with caching)
   */
  async getFamilyContacts(userId: number): Promise<any> {
    const cacheKey = `family_contacts_${userId}`;
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/${userId}/family_contacts/`),
      { compareByHash: true }
    );
  }

  /**
   * Get community memberships (with caching)
   */
  async getCommunityGroups(userId: number): Promise<any> {
    const cacheKey = `community_groups_${userId}`;
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/${userId}/communities/`),
      { compareByHash: true }
    );
  }

  /**
   * Add family contact (invalidates cache)
   */
  async addFamilyContact(userId: number, contact: any): Promise<any> {
    const result = await this.request(`/${userId}/family_contacts/`, {
      method: 'POST',
      body: JSON.stringify(contact),
    });
    // Invalidate cache after adding
    await cacheService.invalidate(`family_contacts_${userId}`);
    return result;
  }

  /**
   * Trigger SOS (invalidates SOS events cache)
   */
  async triggerSOS(userId: number, data: { longitude?: number; latitude?: number; notes?: string }): Promise<any> {
    const result = await this.request(`/${userId}/sos/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // Invalidate SOS events cache after triggering
    await cacheService.invalidate(`sos_events_${userId}`);
    return result;
  }

  /**
   * Get alerts for user based on their geofences (with caching)
   */
  async getAlerts(): Promise<any> {
    const cacheKey = 'user_alerts';
    try {
      // Use the unified alerts endpoint at /api/user/alerts/
      // This now returns alerts from the users_alert table filtered by user's geofences
      const baseUrl = await getApiBaseUrl();
      const url = `${baseUrl}/alerts/`;

      console.log('[getAlerts] Fetching alerts from:', url);

      return await cacheService.getOrFetch(
        cacheKey,
        async () => {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (this.accessToken) {
            headers['Authorization'] = `Bearer ${this.accessToken}`;
            console.log('[getAlerts] Using access token');
          } else {
            console.warn('[getAlerts] No access token available');
          }

          const response = await fetch(url, {
            method: 'GET',
            headers,
          });

          console.log('[getAlerts] Response status:', response.status);

          if (!response.ok) {
            const text = await response.text();
            let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
              const errorData = JSON.parse(text);
              errorMessage = errorData.message || errorData.detail || errorMessage;
            } catch {
              errorMessage = text || errorMessage;
            }
            console.error('[getAlerts] Error response:', errorMessage);
            throw new Error(errorMessage);
          }

          const data = await response.json();
          console.log('[getAlerts] Response data type:', Array.isArray(data) ? 'array' : typeof data);
          console.log('[getAlerts] Has results field:', 'results' in data);

          // Handle paginated response (results field) or direct array
          const alerts = Array.isArray(data?.results) ? data.results : (Array.isArray(data) ? data : []);
          console.log('[getAlerts] Returning', alerts.length, 'alerts');
          return alerts;
        },
        { compareByHash: true }
      );
    } catch (error: any) {
      console.error('[getAlerts] Error fetching alerts:', error);
      // Return empty array on error instead of throwing
      return [];
    }
  }

  /**
   * Get SOS events (with caching)
   */
  async getSOSEvents(userId: number): Promise<any> {
    const cacheKey = `sos_events_${userId}`;
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/${userId}/sos_events/`),
      { compareByHash: true }
    );
  }

  /**
   * Validate a promo code
   */
  async validatePromocode(code: string): Promise<{
    valid: boolean;
    code?: string;
    discount_percentage?: number;
    expiry_date?: string;
    error?: string;
    message?: string;
  }> {
    try {
      const baseUrl = await getApiBaseUrl();
      const url = `${baseUrl}/validate-promocode/`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          valid: false,
          error: data.error || 'Failed to validate promo code',
        };
      }

      return data;
    } catch (error: any) {
      console.error('[Validate Promocode] Error:', error);
      return {
        valid: false,
        error: 'Network error. Please check your connection.',
      };
    }
  }

  /**
   * Subscribe to premium plan
   */
  async subscribe(planType: 'premium-monthly' | 'premium-annual', promoCode?: string): Promise<any> {
    return this.request('/subscribe/', {
      method: 'POST',
      body: JSON.stringify({
        plan_type: planType,
        promo_code: promoCode || '',
      }),
    });
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(): Promise<any> {
    return this.request('/subscribe/cancel/', {
      method: 'POST',
    });
  }


  /**
   * Record geofence enter/exit event
   */
  async recordGeofenceEvent(
    userId: number,
    geofenceId: number,
    eventType: 'enter' | 'exit',
    latitude: number,
    longitude: number
  ): Promise<any> {
    try {
      return await this.request(`/${userId}/geofence_event/`, {
        method: 'POST',
        body: JSON.stringify({
          geofence_id: geofenceId,
          event_type: eventType,
          latitude,
          longitude,
        }),
      });
    } catch (error) {
      // Don't throw - geofence event recording is non-critical
      console.warn('Failed to record geofence event:', error);
      return null;
    }
  }

  /**
   * Get geofences (Premium only) (with caching)
   */
  async getGeofences(userId: number, forceRefresh: boolean = false): Promise<any> {
    const cacheKey = `geofences_${userId}`;

    // If force refresh, invalidate cache first
    if (forceRefresh) {
      await cacheService.invalidate(cacheKey);
    }

    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/${userId}/geofences/`),
      { compareByHash: true }
    );
  }

  /**
   * Create geofence (Premium only) (invalidates cache)
   */
  async createGeofence(userId: number, data: {
    name: string;
    center_location: { longitude: number; latitude: number };
    radius_meters: number;
    alert_on_entry?: boolean;
    alert_on_exit?: boolean;
  }): Promise<any> {
    const result = await this.request(`/${userId}/geofences/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // Invalidate cache after creating
    await cacheService.invalidate(`geofences_${userId}`);
    return result;
  }

  /**
   * Get community alerts for user based on geofence (with caching)
   */
  async getCommunityAlerts(userId: number): Promise<any> {
    const cacheKey = `community_alerts_${userId}`;
    try {
      return await cacheService.getOrFetch(
        cacheKey,
        () => this.request(`/${userId}/community_alerts/`),
        { compareByHash: true }
      );
    } catch (error: any) {
      console.error('Error fetching community alerts:', error);
      // Return empty array on error instead of throwing
      return [];
    }
  }

  /**
   * Send community alert (invalidates relevant caches)
   */
  async sendCommunityAlert(userId: number, data: {
    message: string;
    location: { longitude: number; latitude: number };
    radius_meters?: number;
  }): Promise<any> {
    const result = await this.request(`/${userId}/community_alert/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // Invalidate alerts cache after sending
    await cacheService.invalidate(`community_alerts_${userId}`);
    return result;
  }

  /**
   * Update family contact (invalidates cache)
   */
  async updateFamilyContact(userId: number, contactId: number, contact: any): Promise<any> {
    const result = await this.request(`/${userId}/family_contacts/${contactId}/`, {
      method: 'PATCH',
      body: JSON.stringify(contact),
    });
    // Invalidate cache after updating
    await cacheService.invalidate(`family_contacts_${userId}`);
    return result;
  }

  /**
   * Delete family contact (invalidates cache)
   */
  async deleteFamilyContact(userId: number, contactId: number): Promise<any> {
    const result = await this.request(`/${userId}/family_contacts/${contactId}/`, {
      method: 'DELETE',
    });
    // Invalidate cache after deleting
    await cacheService.invalidate(`family_contacts_${userId}`);
    return result;
  }

  /**
   * Get nearby help locations (hospitals, police, fire, etc.)
   */
  async getNearbyHelp(latitude: number, longitude: number, radius: number = 5000): Promise<any> {
    const cacheKey = `nearby_help_${latitude.toFixed(4)}_${longitude.toFixed(4)}_${radius}`;
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/nearby_help/?latitude=${latitude}&longitude=${longitude}&radius=${radius}`),
      { compareByHash: true, ttl: 30 * 60 * 1000 } // Cache for 30 minutes as locations don't change frequently
    );
  }

  /**
   * Get security officers near the user (uses live/offline data)
   */
  async getSecurityOfficers(latitude: number, longitude: number): Promise<any> {
    const cacheKey = `security_officers_${latitude.toFixed(3)}_${longitude.toFixed(3)}`;
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/security_officers/?latitude=${latitude}&longitude=${longitude}`),
      { compareByHash: true, ttl: 5 * 60 * 1000 },
    );
  }

  /**
   * Get safety tips
   */
  async getSafetyTips(): Promise<any> {
    const cacheKey = 'safety_tips';
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request('/safety_tips/'),
      { compareByHash: true, ttl: 60 * 60 * 1000 } // Cache for 1 hour
    );
  }

  /**
   * Get available users for group creation
   * @param geofenceOnly - Only show users from same geofences (default: true)
   * @param includeOtherGeofences - Include users from other geofences (default: false)
   * @param search - Search query to filter users by name or email
   */
  async getAvailableUsers(options?: {
    geofenceOnly?: boolean;
    includeOtherGeofences?: boolean;
    search?: string;
  }): Promise<any> {
    const { geofenceOnly = true, includeOtherGeofences = false, search = '' } = options || {};

    // Build query string
    const params = new URLSearchParams();
    params.append('geofence_only', geofenceOnly.toString());
    params.append('include_other_geofences', includeOtherGeofences.toString());
    if (search.trim()) {
      params.append('search', search.trim());
    }

    // Create cache key with sanitized search term
    const searchTerm = (search || '').trim().toLowerCase().substring(0, 20); // Limit search term length
    const cacheKey = `available_users_${geofenceOnly}_${includeOtherGeofences}_${searchTerm}`;

    try {
      return await cacheService.getOrFetch(
        cacheKey,
        () => this.request(`/available_users/?${params.toString()}`),
        { compareByHash: true, ttl: 2 * 60 * 1000 } // Cache for 2 minutes (shorter due to search)
      );
    } catch (error: any) {
      console.error('Error fetching available users:', error);
      // If it's a network error, return empty array instead of throwing
      if (error?.message && (
        error.message.includes('Network request failed') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('ECONNREFUSED')
      )) {
        console.warn('Network error fetching available users, returning empty array');
        return [];
      }
      throw error;
    }
  }

  /**
   * Get user's chat groups
   */
  async getChatGroups(userId: number): Promise<any> {
    const cacheKey = `chat_groups_${userId}`;
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/${userId}/chat_groups/`),
      { compareByHash: true }
    );
  }

  /**
   * Create a chat group
   */
  async createChatGroup(userId: number, data: {
    name: string;
    description?: string;
    member_ids: number[];
  }): Promise<any> {
    const result = await this.request(`/${userId}/chat_groups/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // Invalidate cache after creating
    await cacheService.invalidate(`chat_groups_${userId}`);
    return result;
  }

  /**
   * Get chat group details
   */
  async getChatGroupDetails(userId: number, groupId: number): Promise<any> {
    const cacheKey = `chat_group_${groupId}`;
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/${userId}/chat_groups/${groupId}/`),
      { compareByHash: true }
    );
  }

  /**
   * Delete a chat group
   */
  async deleteChatGroup(userId: number, groupId: number): Promise<any> {
    const result = await this.request(`/${userId}/chat_groups/${groupId}/`, {
      method: 'DELETE',
    });
    // Invalidate cache after deleting
    await cacheService.invalidate(`chat_groups_${userId}`);
    await cacheService.invalidate(`chat_group_${groupId}`);
    return result;
  }

  /**
   * Get messages for a chat group
   */
  async getChatMessages(userId: number, groupId: number): Promise<any> {
    const cacheKey = `chat_messages_${groupId}`;
    return cacheService.getOrFetch(
      cacheKey,
      () => this.request(`/${userId}/chat_groups/${groupId}/messages/`),
      { compareByHash: true, ttl: 0 } // Don't cache messages for long
    );
  }

  /**
   * Send a message to a chat group
   */
  async sendChatMessage(userId: number, groupId: number, text: string): Promise<any> {
    const result = await this.request(`/${userId}/chat_groups/${groupId}/messages/`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    // Invalidate messages cache after sending
    await cacheService.invalidate(`chat_messages_${groupId}`);
    // Also invalidate group cache to update updated_at
    await cacheService.invalidate(`chat_group_${groupId}`);
    await cacheService.invalidate(`chat_groups_${userId}`);
    return result;
  }

  /**
   * Send a chat message with file or image attachment
   */
  async sendChatMessageWithFile(userId: number, groupId: number, formData: FormData): Promise<any> {
    const baseUrl = await getApiBaseUrl();
    const url = `${baseUrl}/${userId}/chat_groups/${groupId}/messages/`;
    const headers: Record<string, string> = {};

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    // Don't set Content-Type for FormData - let the browser set it with boundary

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      const text = await response.text();

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          if (text) {
            const errorData = JSON.parse(text);
            errorMessage = errorData.error || errorData.detail || errorData.message || errorMessage;
          }
        } catch {
          // If parsing fails, use default error message
        }
        throw new Error(errorMessage);
      }

      const result = text ? JSON.parse(text) : {};

      // Invalidate messages cache after sending
      await cacheService.invalidate(`chat_messages_${groupId}`);
      await cacheService.invalidate(`chat_group_${groupId}`);
      await cacheService.invalidate(`chat_groups_${userId}`);

      return result;
    } catch (error: any) {
      if (error.message && error.message.includes('Failed to fetch')) {
        throw new Error('Network error. Please check your connection.');
      }
      throw error;
    }
  }

  /**
   * Edit a chat message
   */
  async editChatMessage(userId: number, groupId: number, messageId: number, text: string): Promise<any> {
    const result = await this.request(`/${userId}/chat_groups/${groupId}/messages/${messageId}/`, {
      method: 'PUT',
      body: JSON.stringify({ text }),
    });
    await cacheService.invalidate(`chat_messages_${groupId}`);
    await cacheService.invalidate(`chat_group_${groupId}`);
    return result;
  }

  /**
   * Delete a chat message
   */
  async deleteChatMessage(userId: number, groupId: number, messageId: number): Promise<any> {
    const result = await this.request(`/${userId}/chat_groups/${groupId}/messages/${messageId}/`, {
      method: 'DELETE',
    });
    await cacheService.invalidate(`chat_messages_${groupId}`);
    await cacheService.invalidate(`chat_group_${groupId}`);
    return result;
  }

  /**
   * Add members to a chat group
   */
  async addGroupMembers(userId: number, groupId: number, memberIds: number[]): Promise<any> {
    const result = await this.request(`/${userId}/chat_groups/${groupId}/members/`, {
      method: 'POST',
      body: JSON.stringify({ member_ids: memberIds }),
    });
    await cacheService.invalidate(`chat_group_${groupId}`);
    await cacheService.invalidate(`chat_groups_${userId}`);
    return result;
  }

  /**
   * Remove a member from a chat group (admin only)
   */
  async removeGroupMember(userId: number, groupId: number, memberId: number): Promise<any> {
    const result = await this.request(`/${userId}/chat_groups/${groupId}/members/${memberId}/`, {
      method: 'DELETE',
    });
    await cacheService.invalidate(`chat_group_${groupId}`);
    await cacheService.invalidate(`chat_groups_${userId}`);
    return result;
  }

  /**
   * Leave a chat group
   */
  async leaveChatGroup(userId: number, groupId: number): Promise<any> {
    const result = await this.request(`/${userId}/chat_groups/${groupId}/leave/`, {
      method: 'DELETE',
    });
    await cacheService.invalidate(`chat_group_${groupId}`);
    await cacheService.invalidate(`chat_groups_${userId}`);
    return result;
  }

  /**
   * Start live location sharing session
   */
  async startLiveLocationShare(userId: number, durationMinutes: number, sharedWithUserIds: number[] = []): Promise<any> {
    return this.request(`/${userId}/live_location/start/`, {
      method: 'POST',
      body: JSON.stringify({
        duration_minutes: durationMinutes,
        shared_with_user_ids: sharedWithUserIds,
      }),
    });
  }

  /**
   * Get active live location sessions
   */
  async getLiveLocationSessions(userId: number): Promise<any> {
    return this.request(`/${userId}/live_location/`);
  }

  /**
   * Update live location session with coordinates
   */
  async updateLiveLocationShare(userId: number, sessionId: number, latitude: number, longitude: number): Promise<any> {
    // Detailed logging for Android app
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📤 [API REQUEST - SENDING COORDINATES]');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`👤 User ID: ${userId}`);
    console.log(`🆔 Session ID: ${sessionId}`);
    console.log(`🌍 Latitude: ${latitude}`);
    console.log(`🌍 Longitude: ${longitude}`);
    console.log(`🔗 Endpoint: /${userId}/live_location/${sessionId}/`);
    console.log(`📦 Payload:`, JSON.stringify({ latitude, longitude }, null, 2));
    console.log(`🕐 Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════════');

    const payload = { latitude, longitude };
    return this.request(`/${userId}/live_location/${sessionId}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Stop live location session
   */
  async stopLiveLocationShare(userId: number, sessionId: number): Promise<any> {
    return this.request(`/${userId}/live_location/${sessionId}/`, {
      method: 'DELETE',
    });
  }
}

export const apiService = new ApiService();

export type { LoginResponse, RegisterResponse };

