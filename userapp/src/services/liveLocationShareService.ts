import Geolocation from '@react-native-community/geolocation';
import {Alert, Platform, PermissionsAndroid} from 'react-native';
import GeolocationService from 'react-native-geolocation-service';
import {apiService} from './apiService';
import {useAuthStore} from '../stores/authStore';

export interface LiveShareSession {
  userId: number;
  sessionId: number;
  shareUrl?: string | null;
  shareToken?: string | null;
  planType?: string | null;
  expiresAt?: string | null;
}

type LiveShareEndReason = 'expired' | 'error';

interface LiveShareUpdateOptions {
  onSessionEnded?: (payload: {reason: LiveShareEndReason; message?: string}) => void;
  shareUrl?: string | null;
  shareToken?: string | null;
  planType?: string | null;
  expiresAt?: string | null;
}

let watchId: number | null = null;
let activeSession: LiveShareSession | null = null;
let updateInterval: NodeJS.Timeout | null = null; // Fallback interval for location updates

const clearWatcher = () => {
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (updateInterval !== null) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
};

export const getActiveLiveShareSession = (): LiveShareSession | null => activeSession;

export const startLiveLocationShareUpdates = async (
  userId: number,
  sessionId: number,
  initialLocation?: {latitude: number; longitude: number},
  options?: LiveShareUpdateOptions,
) => {
  activeSession = {
    userId,
    sessionId,
    shareUrl: options?.shareUrl ?? null,
    shareToken: options?.shareToken ?? null,
    planType: options?.planType ?? null,
    expiresAt: options?.expiresAt ?? null,
  };

  if (initialLocation) {
    try {
      await apiService.updateLiveLocationShare(userId, sessionId, initialLocation.latitude, initialLocation.longitude);
    } catch (error) {
      console.warn('Failed to send initial live share location:', error);
    }
  }

  clearWatcher();

  console.log('[Live Share] 🚀 Starting location watcher with options:', {
    enableHighAccuracy: true,
    distanceFilter: 0,
    interval: 2000,
    fastestInterval: 1000,
    timeout: 20000,
    maximumAge: 0,
  });
  
  watchId = Geolocation.watchPosition(
    async (position) => {
      console.log('[Live Share] 📍 watchPosition callback triggered');
      if (!activeSession) {
        console.warn('[Live Share] ⚠️ No active session, skipping update');
        return;
      }
      try {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        const accuracy = position.coords.accuracy;
        
        // Detailed logging for Android app
        console.log('═══════════════════════════════════════════════════════════');
        console.log('📍 [LIVE LOCATION UPDATE - ANDROID APP]');
        console.log('═══════════════════════════════════════════════════════════');
        console.log(`📱 Session ID: ${activeSession.sessionId}`);
        console.log(`👤 User ID: ${activeSession.userId}`);
        console.log(`🌍 Latitude: ${lat}`);
        console.log(`🌍 Longitude: ${lng}`);
        console.log(`📊 Accuracy: ${accuracy}m`);
        console.log(`🕐 Timestamp: ${new Date().toISOString()}`);
        console.log(`📡 Sending to backend: ${apiService.getBaseUrl()}/${activeSession.userId}/live_location/${activeSession.sessionId}/`);
        console.log(`📦 Payload: {"latitude": ${lat}, "longitude": ${lng}}`);
        console.log('═══════════════════════════════════════════════════════════');
        
        // Log accuracy - but don't block updates (GPS accuracy can vary)
        if (accuracy) {
          if (accuracy > 100) {
            console.warn(`[Live Share] ⚠️ GPS accuracy is poor: ${accuracy}m - coordinates may be inaccurate`);
          } else if (accuracy > 50) {
            console.warn(`[Live Share] ⚠️ GPS accuracy is moderate: ${accuracy}m - coordinates may be off by several meters`);
          } else {
            console.log(`[Live Share] ✅ GPS accuracy is good: ${accuracy}m`);
          }
        } else {
          console.warn(`[Live Share] ⚠️ GPS accuracy not available`);
        }
        
        console.log(`[Live Share] ✅ Sending location update with accuracy: ${accuracy || 'unknown'}m`);
        try {
          await apiService.updateLiveLocationShare(
            activeSession.userId,
            activeSession.sessionId,
            lat,
            lng,
          );
          console.log(`[Live Share] ✅ Location update sent successfully`);
        } catch (updateError) {
          console.error(`[Live Share] ❌ Failed to send location update:`, updateError);
          throw updateError; // Re-throw to be caught by outer catch
        }
      } catch (error: any) {
        const message = error?.message?.toLowerCase?.() || '';
        if (message.includes('session has ended')) {
          clearWatcher();
          activeSession = null;
          options?.onSessionEnded?.({
            reason: 'expired',
            message: error?.message || 'Live location session has ended',
          });
          return;
        }
        console.warn('Live share update failed:', error);
      }
    },
    (error) => {
      console.error('[Live Share] ❌ watchPosition error:', error);
      console.error('[Live Share] Error code:', error.code);
      console.error('[Live Share] Error message:', error.message);
      console.warn('Live share watch error:', error);
      Alert.alert('Live sharing paused', 'Unable to get GPS updates. Please ensure location services are enabled.');
    },
    {
      enableHighAccuracy: true,
      distanceFilter: 0, // Send updates for any movement (0 = send all updates)
      interval: 2000, // Update every 2 seconds
      fastestInterval: 1000, // Fastest update interval
      timeout: 20000, // Longer timeout for better accuracy
      maximumAge: 0, // Don't use cached location - always get fresh GPS
    },
  );
  
  // Fallback: Force location update every 3 seconds using getCurrentPosition
  // This ensures updates are sent even if watchPosition doesn't fire reliably
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  updateInterval = setInterval(async () => {
    if (!activeSession) {
      return;
    }
    try {
      console.log('[Live Share] 🔄 Fallback: Forcing location update...');
      const coords = await fetchLocationWithFallback();
      console.log('[Live Share] 🔄 Fallback: Got coordinates:', coords);
      
      await apiService.updateLiveLocationShare(
        activeSession.userId,
        activeSession.sessionId,
        coords.latitude,
        coords.longitude,
      );
      console.log('[Live Share] 🔄 Fallback: Location update sent successfully');
    } catch (error) {
      console.warn('[Live Share] 🔄 Fallback: Failed to send location update:', error);
    }
  }, 3000); // Every 3 seconds as fallback
};

export const stopLiveLocationShareUpdates = async () => {
  clearWatcher();
  if (activeSession) {
    try {
      await apiService.stopLiveLocationShare(activeSession.userId, activeSession.sessionId);
    } catch (error) {
      console.warn('Failed to stop live share session:', error);
    }
  }
  activeSession = null;
};

/**
 * Get live share base URL
 */
const getLiveShareBaseUrl = (): string => {
  const base = `${apiService.getBackendBaseUrl()}/live-share`;
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

/**
 * Build Google Maps URL as fallback
 */
const buildGoogleMapsUrl = (latitude: number, longitude: number): string => {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
};

/**
 * Ensure location permission is granted
 */
const ensureLocationPermission = async (): Promise<boolean> => {
  if (Platform.OS !== 'android') {
    return true;
  }
  try {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'SafeTNet needs location access to share your live position.',
        buttonPositive: 'Allow',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch (error) {
    console.warn('Error requesting location permission:', error);
    return false;
  }
};

/**
 * Get current location with fallback methods
 */
const fetchLocationWithFallback = async (): Promise<{latitude: number; longitude: number}> => {
  const getCurrentPosition = (options = {
    enableHighAccuracy: true,
    timeout: 15000, // 15 seconds - enough time for GPS to get accurate fix
    maximumAge: 0, // Don't use cached location - always get fresh GPS
  }) =>
    new Promise<{latitude: number; longitude: number}>((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          let lat = position.coords.latitude;
          let lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          
          // Validate coordinates - ensure they're in valid ranges
          if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            console.warn(`[Location Fetch] Invalid coordinates from GPS: lat=${lat}, lng=${lng}`);
            console.warn(`[Location Fetch] Attempting coordinate swap...`);
            // If coordinates are outside valid ranges, they might be swapped
            if (Math.abs(lat) > 90) {
              const temp = lat;
              lat = lng;
              lng = temp;
              console.log(`[Location Fetch] Swapped coordinates: new lat=${lat}, new lng=${lng}`);
            }
          }
          
          // Final validation
          if (Math.abs(lat) > 90) {
            console.error(`[Location Fetch] ERROR: Invalid latitude after validation: ${lat}`);
          }
          if (Math.abs(lng) > 180) {
            console.error(`[Location Fetch] ERROR: Invalid longitude after validation: ${lng}`);
          }
          
          console.log(`[Location Fetch] GPS Position obtained: lat=${lat}, lng=${lng}, accuracy=${accuracy}m`);
          console.log(`[Location Fetch] Full position data:`, {
            latitude: lat,
            longitude: lng,
            accuracy: accuracy,
            altitude: position.coords.altitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          });
          resolve({
            latitude: lat,
            longitude: lng,
          });
        },
        (error) => {
          console.error('[Location Fetch] GPS Error:', error);
          reject(error);
        },
        options,
      );
    });

  const getEnhancedPosition = () =>
    new Promise<{latitude: number; longitude: number}>((resolve, reject) => {
      GeolocationService.getCurrentPosition(
        (position) => {
          let lat = position.coords.latitude;
          let lng = position.coords.longitude;
          const accuracy = position.coords.accuracy;
          
          // Validate coordinates - ensure they're in valid ranges
          if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
            console.warn(`[Location Fetch] Invalid coordinates from Enhanced GPS: lat=${lat}, lng=${lng}`);
            console.warn(`[Location Fetch] Attempting coordinate swap...`);
            // If coordinates are outside valid ranges, they might be swapped
            if (Math.abs(lat) > 90) {
              const temp = lat;
              lat = lng;
              lng = temp;
              console.log(`[Location Fetch] Swapped coordinates: new lat=${lat}, new lng=${lng}`);
            }
          }
          
          // Final validation
          if (Math.abs(lat) > 90) {
            console.error(`[Location Fetch] ERROR: Invalid latitude after validation: ${lat}`);
          }
          if (Math.abs(lng) > 180) {
            console.error(`[Location Fetch] ERROR: Invalid longitude after validation: ${lng}`);
          }
          
          console.log(`[Location Fetch] Enhanced Position obtained: lat=${lat}, lng=${lng}, accuracy=${accuracy}m`);
          console.log(`[Location Fetch] Full enhanced position data:`, {
            latitude: lat,
            longitude: lng,
            accuracy: accuracy,
            altitude: position.coords.altitude,
            heading: position.coords.heading,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          });
          resolve({
            latitude: lat,
            longitude: lng,
          });
        },
        (error) => {
          console.error('[Location Fetch] Enhanced GPS Error:', error);
          reject(error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000, // 15 seconds - enough time for GPS to get accurate fix
          maximumAge: 0, // Don't use cached location - always get fresh GPS
          forceRequestLocation: true,
          showLocationDialog: true,
        },
      );
    });

  // Try to get location - prioritize enhanced GPS on Android for better accuracy
  try {
    if (Platform.OS === 'android') {
      // On Android, try enhanced GPS first (more reliable)
      try {
        console.log('[Location Fetch] Trying enhanced GPS first (Android)...');
        return await getEnhancedPosition();
      } catch (enhancedError: any) {
        console.warn('[Location Fetch] Enhanced GPS failed, trying primary GPS...', enhancedError);
        // Fallback to primary GPS
        try {
          return await getCurrentPosition();
        } catch (primaryError) {
          console.error('[Location Fetch] Both GPS methods failed');
          throw enhancedError; // Throw the enhanced error as it's more descriptive
        }
      }
    } else {
      // iOS - use primary GPS
      return await getCurrentPosition();
    }
  } catch (error: any) {
    console.error('[Location Fetch] All GPS methods failed:', error);
    throw error;
  }
};

/**
 * Start live location sharing and return share URL
 * This is a reusable function that can be called from SOS or home screen
 */
export interface StartLiveShareResult {
  shareUrl: string;
  shareToken: string | null;
  sessionId: number;
  session: LiveShareSession | null;
  locationMessage: string; // The formatted message with share URL
}

export const startLiveLocationShare = async (
  onSessionEnded?: (payload: {reason: LiveShareEndReason; message?: string}) => void,
): Promise<StartLiveShareResult> => {
  // Get user info
  const user = useAuthStore.getState().user;
  if (!user?.id) {
    throw new Error('User not authenticated');
  }

  const isPremium = user.plan === 'premium';
  const durationMinutes = isPremium ? 1440 : 15;

  // Check location permission
  const hasPermission = await ensureLocationPermission();
  if (!hasPermission) {
    throw new Error('Location permission not granted');
  }

  // Get current location (with faster timeout and cached location support)
  console.log('[Live Share] 📍 Fetching location (fast mode - allows cached location)...');
  const coords = await fetchLocationWithFallback();
  
  // Detailed logging for Android app
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🚀 [LIVE SHARE START - INITIAL COORDINATES]');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🌍 Latitude: ${coords.latitude}`);
  console.log(`🌍 Longitude: ${coords.longitude}`);
  console.log(`📍 Coordinates: [${coords.latitude}, ${coords.longitude}]`);
  console.log(`🕐 Time: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════════');

  // Create live location share session (exactly like old working HomeScreen)
  // Note: Old commit used user.id directly, but API expects number, so we ensure it's a number
  const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
  const response = await apiService.startLiveLocationShare(userId, durationMinutes);
  const session = response?.session;
  const sessionId = session?.id;

  if (!sessionId) {
    throw new Error('Could not start live share session');
  }

  // Session plan type logic (exactly like old working HomeScreen with fallback)
  const sessionPlanType =
    session?.plan_type === 'premium'
      ? 'premium'
      : session?.plan_type === 'free'
      ? 'free'
      : isPremium
      ? 'premium'
      : 'free';

  const shareToken = session?.share_token || session?.shareToken;
  const liveShareBaseUrl = getLiveShareBaseUrl();
  const normalizedBase = liveShareBaseUrl.endsWith('/')
    ? liveShareBaseUrl.slice(0, -1)
    : liveShareBaseUrl;

  const shareUrl = shareToken
    ? `${normalizedBase}/${shareToken}/`
    : buildGoogleMapsUrl(coords.latitude, coords.longitude);

  // Start live location updates (exactly like old working HomeScreen)
  await startLiveLocationShareUpdates(userId, sessionId, coords, {
    onSessionEnded,
    shareUrl,
    shareToken,
    planType: sessionPlanType,
    expiresAt: session?.expires_at || session?.expiresAt || null,
  });

  // Get active session
  const activeSession = getActiveLiveShareSession();

  // Construct location message (exactly like old working HomeScreen)
  const locationMessage = isPremium
    ? `I'm sharing my live location. Track me here until I stop sharing:\n${shareUrl}`
    : `I'm sharing my live location for the next 15 minutes. Track me here:\n${shareUrl}`;

  return {
    shareUrl,
    shareToken,
    sessionId,
    session: activeSession,
    locationMessage,
  };
};


