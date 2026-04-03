import apiClient from '../apiClient';
import { API_ENDPOINTS } from '../endpoints';
import apiConfig from '../config';
import { LoginPayload, LoginResponse, DjangoLoginResponse } from '../../types/user.types';
import { storage } from '../../utils/storage';
import { constants } from '../../utils/constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

// All mock data has been removed - app relies on real API calls only

// Network connectivity test
export const testBackendConnectivity = async (): Promise<{ available: boolean, message: string }> => {
  try {
    console.log('🔍 Testing backend connectivity...');
    console.log('🌐 Testing URL:', `${apiConfig.BASE_URL}/api/security/login/`);

    // Try a simple HEAD request to test connectivity
    const response = await apiClient.head('/login/', { timeout: 10000 });

    console.log('✅ Backend is reachable!');
    console.log('📊 Response status:', response.status);

    return {
      available: true,
      message: 'Backend service is responding'
    };
  } catch (error: any) {
    console.error('❌ Backend connectivity test failed:');

    if (error.response) {
      return {
        available: false,
        message: `Backend responded with error: ${error.response.status}`
      };
    } else if (error.request) {
      return {
        available: false,
        message: 'Cannot connect to backend. Service may be sleeping or down.'
      };
    } else {
      return {
        available: false,
        message: `Connection error: ${error.message}`
      };
    }
  }
};

// Login function - real backend only
export const login = async (credentials: LoginPayload, retryCount: number = 0): Promise<LoginResponse> => {
  try {
    console.log('🔍 Attempting login with:', credentials.email);
    console.log('🌐 Backend URL:', `${apiConfig.BASE_URL}/api/security/login/`);

    // Simplified login - just try the API call directly
    // Pre-login connectivity tests are brittle on mobile + Render
    console.log('🔐 Making real API call to backend...');
    const response = await apiClient.post('/login/', {
      username: credentials.email,
      password: credentials.password,
    });
    console.log('✅ LOGIN SUCCESSFUL');
    return response.data;
  } catch (error: any) {
    console.error('❌ LOGIN FAILED - Detailed Error Analysis:', error);
    console.error('🔍 Error Type:', error.constructor.name);
    console.error('💬 Error Message:', error.message);
    console.error('📊 Error Response:', error.response);
    console.error('🌐 Error Request:', error.request);
    console.error('⚙️ Error Config:', error.config);

    // Retry logic for SSL errors (max 2 retries)
    if (error.message && error.message.includes('SSL') && retryCount < 2) {
      console.log(`🔄 SSL error detected, retrying... (${retryCount + 1}/2)`);
      await new Promise(resolve => setTimeout(resolve as any, 2000)); // Wait 2 seconds
      return login(credentials, retryCount + 1);
    }

    // Throw the original error - callers (like LoginScreen) are better equipped 
    // to parse the detailed error structure (response data, status codes, etc.)
    throw error;
  }
};

// Other auth functions
export const logout = async (): Promise<void> => {
  try {
    await apiClient.post(API_ENDPOINTS.LOGOUT);
    console.log('✅ LOGOUT SUCCESSFUL');
  } catch (error: any) {
    console.error('❌ LOGOUT FAILED:', error);
    // Don't throw error - logout should work even if backend call fails
    // The frontend will clear auth state regardless
  }
};

export const refreshToken = async (refresh: string): Promise<LoginResponse> => {
  try {
    const response = await apiClient.post('/security/refresh/', { refresh });
    return response.data;
  } catch (error: any) {
    console.error('❌ TOKEN REFRESH FAILED:', error);
    throw new Error('Token refresh failed');
  }
};

export const forgotPassword = async (email: string): Promise<void> => {
  try {
    await apiClient.post('/security/forgot-password/', { email });
    console.log('✅ PASSWORD RESET EMAIL SENT');
  } catch (error: any) {
    console.error('❌ PASSWORD RESET FAILED:', error);
    throw new Error('Password reset failed');
  }
};

export const resetPassword = async (token: string, password: string): Promise<void> => {
  try {
    await apiClient.post('/security/reset-password/', { token, password });
    console.log('✅ PASSWORD RESET SUCCESSFUL');
  } catch (error: any) {
    console.error('❌ PASSWORD RESET FAILED:', error);
    throw new Error('Password reset failed');
  }
};
export const changePassword = async (old_password: string, new_password: string, confirm_password: string): Promise<void> => {
  try {
    await apiClient.post(API_ENDPOINTS.CHANGE_PASSWORD, { old_password, new_password, confirm_password });
    console.log('✅ PASSWORD CHANGE SUCCESSFUL');
  } catch (error: any) {
    console.error('❌ PASSWORD CHANGE FAILED:', error);
    throw error;
  }
};

export const authService = {
  login,
  logout,
  refreshToken,
  forgotPassword,
  resetPassword,
  changePassword,
  testBackendConnectivity,
};
