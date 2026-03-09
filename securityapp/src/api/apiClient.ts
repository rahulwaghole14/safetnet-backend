import axios, { AxiosResponse, AxiosError } from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import apiConfig from './config';

// Types for better error handling
export interface ApiError {
  message: string;
  status?: number;
  details?: any;
}

export interface ApiResponse<T = any> {
  data: T;
  status: number;
  message?: string;
}

// Unified axios client with token management
const apiClient = axios.create({
  baseURL: `${apiConfig.BASE_URL}/api/security`,
  timeout: 20000, // 20 seconds for mobile + Render
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

// Request interceptor - Add auth token and handle token refresh
apiClient.interceptors.request.use(
  async (config) => {
    try {
      // Get token from AsyncStorage
      const token = await AsyncStorage.getItem('token') || await AsyncStorage.getItem('authToken');

      // Don't send Authorization header for public endpoints (login, refresh)
      // This prevents 401 errors if there is an expired token in storage
      const isPublicEndpoint = config.url?.includes('/login/') || config.url?.includes('/token/refresh/');

      if (token && !isPublicEndpoint) {
        config.headers.Authorization = `Bearer ${token}`;
      }

      // Debug logging for profile updates
      if (config.url?.includes('/profile/') && config.method === 'patch') {
        console.log(' [API] Profile Update Request:', JSON.stringify({
          url: config.baseURL + config.url,
          method: config.method,
          data: config.data,
          headers: {
            ...config.headers,
            Authorization: config.headers.Authorization ? '[REDACTED]' : 'NONE'
          }
        }, null, 2));
      }

      return config;
    } catch (error) {
      console.error('[API] Error in request interceptor:', error);
      return config;
    }
  },
  (error) => Promise.reject(error)
);

// Response interceptor - Handle token refresh and errors
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // Debug logging for profile updates
    if (response.config.url?.includes('/profile/') && response.config.method === 'patch') {
      console.log(' [API] Profile Update Response:', {
        status: response.status,
        data: response.data,
        headers: response.headers
      });
    }
    
    // Return clean response format
    return {
      ...response,
      data: response.data,
    };
  },
  async (error: AxiosError) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized - Token expired
    if (error.response?.status === 401 && originalRequest) {
      try {
        console.log('[API] Token expired, attempting refresh...');

        // Get refresh token
        const refreshToken = await AsyncStorage.getItem('refresh_token');

        if (!refreshToken) {
          console.log('[API] No refresh token available, clearing auth');
          await clearAuthData();
          // Emit logout event for navigation
          DeviceEventEmitter.emit('auth:logout', { reason: 'no_refresh_token' });
          throw new Error('Authentication expired. Please login again.');
        }

        // Attempt token refresh
        const refreshResponse = await axios.post(
          `${apiConfig.BASE_URL}/api/security/token/refresh/`,
          { refresh: refreshToken },
          { timeout: 10000 }
        );

        if (refreshResponse.data.access) {
          // Store new access token
          await AsyncStorage.setItem('token', refreshResponse.data.access);

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${refreshResponse.data.access}`;
          return apiClient(originalRequest);
        }
      } catch (refreshError) {
        console.error('[API] Token refresh failed:', refreshError);
        await clearAuthData();
        // Emit logout event for navigation
        DeviceEventEmitter.emit('auth:logout', { reason: 'refresh_failed' });
        throw new Error('Session expired. Please login again.');
      }
    }

    // Handle other errors with clean error format
    return Promise.reject(formatApiError(error));
  }
);

// Helper function to clear auth data on logout/token expiry
export const clearAuthData = async (): Promise<void> => {
  try {
    await AsyncStorage.multiRemove(['token', 'refresh_token', 'authToken']);
    console.log('[API] Auth data cleared');
  } catch (error) {
    console.error('[API] Error clearing auth data:', error);
  }
};

// Format API errors into clean, consistent format
const formatApiError = (error: AxiosError): ApiError => {
  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;

    // Handle different error formats
    let message = 'An error occurred';
    let details = data;

    if (typeof data === 'string') {
      message = data;
    } else if (data && typeof data === 'object' && 'message' in data) {
      message = String(data.message);
    } else if (data && typeof data === 'object' && 'detail' in data) {
      message = String(data.detail);
    } else if (data && typeof data === 'object' && 'error' in data) {
      message = String(data.error);
    } else if (status === 400 && data && typeof data === 'object' && 'non_field_errors' in data && Array.isArray(data.non_field_errors) && data.non_field_errors.length > 0) {
      message = String((data.non_field_errors[0] as string));
    } else if (status === 404) {
      message = 'Resource not found';
    } else if (status === 403) {
      message = 'Access denied';
    } else if (status === 500) {
      message = 'Server error. Please try again later.';
    }

    return {
      message,
      status,
      details,
    };
  } else if (error.request) {
    // Request made but no response received
    return {
      message: 'Network error. Please check your connection and try again.',
      details: { request: error.request },
    };
  } else {
    // Something else happened
    return {
      message: error.message || 'An unexpected error occurred',
      details: error,
    };
  }
};

// Helper functions for common API operations
export const apiHelpers = {
  // Generic GET request
  get: async <T = any>(url: string): Promise<ApiResponse<T>> => {
    const response = await apiClient.get<T>(url);
    return {
      data: response.data,
      status: response.status,
      message: 'Success',
    };
  },

  // Generic POST request
  post: async <T = any>(url: string, data?: any): Promise<ApiResponse<T>> => {
    const response = await apiClient.post<T>(url, data);
    return {
      data: response.data,
      status: response.status,
      message: 'Created successfully',
    };
  },

  // Generic PUT request
  put: async <T = any>(url: string, data?: any): Promise<ApiResponse<T>> => {
    const response = await apiClient.put<T>(url, data);
    return {
      data: response.data,
      status: response.status,
      message: 'Updated successfully',
    };
  },

  // Generic PATCH request
  patch: async <T = any>(url: string, data?: any): Promise<ApiResponse<T>> => {
    const response = await apiClient.patch<T>(url, data);
    return {
      data: response.data,
      status: response.status,
      message: 'Updated successfully',
    };
  },

  // Generic DELETE request
  delete: async (url: string): Promise<ApiResponse<null>> => {
    // Explicitly pass empty config to ensure NO request body is sent
    // This prevents any data (including created_by_role) from being included
    const response = await apiClient.delete(url, {});
    return {
      data: null,
      status: response.status,
      message: 'Deleted successfully',
    };
  },
};

export default apiClient;