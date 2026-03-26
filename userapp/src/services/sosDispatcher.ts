import {Alert, Platform, PermissionsAndroid, NativeModules} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import GeolocationService from 'react-native-geolocation-service';
import {useContactStore} from '../stores/contactStore';
import {requestDirectCall} from './callService';
import {sendSmsDirect} from './smsService';
import {useSettingsStore, DEFAULT_SOS_TEMPLATE, DEFAULT_SOS_MESSAGES} from '../stores/settingsStore';
import {useAuthStore} from '../stores/authStore';
import {apiService} from './apiService';
import {startLiveLocationShareUpdates, startLiveLocationShare, getActiveLiveShareSession, type LiveShareSession} from './liveLocationShareService';
import {sendAlertNotification} from './notificationService';

// Import push notifications - use dynamic import to avoid bundling issues
let PushNotification: any = null;
const loadPushNotification = (forceReload: boolean = false) => {
  // If forceReload is true, always try to reload
  if (!forceReload && PushNotification !== null && PushNotification !== false) {
    return PushNotification;
  }
  try {
    // Use require with explicit path to avoid module resolution issues
    const pushNotifModule = require('react-native-push-notification');
    const loadedModule = pushNotifModule.default || pushNotifModule;
    // Only cache if it's a valid module
    if (loadedModule && typeof loadedModule.configure === 'function') {
      PushNotification = loadedModule;
    return PushNotification;
    } else {
      PushNotification = false;
      return null;
    }
  } catch (error) {
    console.warn('PushNotification module not available:', error);
    PushNotification = false; // Use false instead of null to indicate we tried
    return null;
  }
};

// Configure notifications once
let notificationsConfigured = false;
let channelCreated = false;

const POLICE_CONTACT = {name: 'Police', phone: '7887659473'};

/**
 * Check if a point is inside a polygon using ray casting algorithm
 * Polygon coordinates are in GeoJSON format: [longitude, latitude]
 */
const isPointInPolygon = (
  point: {latitude: number; longitude: number},
  polygon: number[][]
): boolean => {
  if (!polygon || polygon.length < 3) return false;
  
  const {latitude: lat, longitude: lng} = point;
  let inside = false;
  
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    // GeoJSON format: [longitude, latitude]
    const [xi, yi] = polygon[i]; // xi = lng, yi = lat
    const [xj, yj] = polygon[j]; // xj = lng, yj = lat
    
    // Ray casting algorithm
    const intersect = 
      ((yi > lat) !== (yj > lat)) &&
      (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    
    if (intersect) inside = !inside;
  }
  
  return inside;
};

/**
 * Find which geofence the user is currently in
 */
const findUserGeofence = async (
  location: {latitude: number; longitude: number},
  userId: number
): Promise<{geofence: any; securityOfficer: any} | null> => {
  try {
    // Get all geofences
    const geofencesData = await apiService.getGeofences(userId, true);
    const geofences = Array.isArray(geofencesData?.geofences) 
      ? geofencesData.geofences 
      : Array.isArray(geofencesData) 
        ? geofencesData 
        : [];
    
    if (!geofences.length) {
      console.log('No geofences found');
      return null;
    }
    
    // Check each geofence to see if user is inside
    for (const geofence of geofences) {
      if (!geofence.is_active && geofence.active !== true) continue;
      
      // Check if point is inside polygon
      const polygon = geofence.polygon || geofence.polygon_json;
      if (polygon && Array.isArray(polygon) && polygon.length > 0) {
        // Polygon format: [[[lng, lat], [lng, lat], ...]]
        const ring = Array.isArray(polygon[0]) ? polygon[0] : polygon;
        const isInside = isPointInPolygon(location, ring);
        
        if (isInside) {
          console.log(`User is inside geofence: ${geofence.name}`);
          
          // Get security officers for this geofence
          try {
            const officersData = await apiService.getSecurityOfficers(
              location.latitude,
              location.longitude
            );
            const officers = Array.isArray(officersData?.officers)
              ? officersData.officers
              : Array.isArray(officersData)
                ? officersData
                : [];
            
            // Find officer assigned to this geofence
            const assignedOfficer = officers.find(
              (officer: any) => 
                officer.assigned_geofence_id === geofence.id ||
                officer.assigned_geofence?.id === geofence.id ||
                officer.geofence_id === geofence.id
            );
            
            if (assignedOfficer) {
              return {
                geofence,
                securityOfficer: assignedOfficer,
              };
            }
          } catch (error) {
            console.error('Error getting security officers:', error);
          }
        }
      }
    }
    
    console.log('User is not inside any geofence');
    return null;
  } catch (error) {
    console.error('Error finding user geofence:', error);
    return null;
  }
};

export const configureNotifications = () => {
  const notificationModule = loadPushNotification();
  if (!notificationModule) {
    return;
  }

  try {
    if (!notificationsConfigured && notificationModule && typeof notificationModule.configure === 'function') {
      const shouldRequestPermissions = Platform.OS === 'ios';

      const config: any = {
        onRegister: function (token: any) {
          console.log('Push notification token:', token);
        },
        onNotification: function (notification: any) {
          console.log('Notification received:', notification);
        },
        permissions: {
          alert: true,
          badge: true,
          sound: true,
        },
        popInitialNotification: false,
        requestPermissions: shouldRequestPermissions,
      };

      notificationModule.configure(config);
      notificationsConfigured = true;
      console.log('PushNotification configured');
    }

    // Create notification channel for Android - always ensure it exists
    if (Platform.OS === 'android' && notificationModule && notificationModule !== null && notificationModule !== false) {
      if (!channelCreated && typeof notificationModule.createChannel === 'function') {
        try {
        notificationModule.createChannel(
          {
            channelId: 'sos-channel',
            channelName: 'SOS Alerts',
            channelDescription: 'Notifications for emergency SOS alerts',
            playSound: true,
            soundName: 'default',
            importance: 4, // High importance
            vibrate: true,
          },
          (created: boolean) => {
              if (created !== undefined) {
            console.log(`SOS notification channel ${created ? 'created' : 'already exists'}`);
              }
            channelCreated = true;
          },
        );
        } catch (error) {
          console.warn('Error creating notification channel:', error);
          // Mark as created to prevent retries
          channelCreated = true;
        }
      } else if (!channelCreated) {
        // If createChannel is not available, mark as created to prevent errors
        console.warn('createChannel function not available on PushNotification module');
        channelCreated = true;
      }
    }
  } catch (error) {
    console.warn('Failed to configure notifications:', error);
  }
};

const sendSOSNotification = async () => {
  try {
    console.log('=== Starting SOS Notification ===');
    
    // Try to load the notification module fresh
    let notificationModule: any = null;
    try {
      const pushNotifModule = require('react-native-push-notification');
      notificationModule = pushNotifModule.default || pushNotifModule;
      // Validate it's a proper module
      if (!notificationModule || typeof notificationModule.configure !== 'function') {
        notificationModule = null;
      }
    } catch (error) {
      console.warn('Could not load PushNotification module:', error);
      notificationModule = null;
    }

    // Ensure notifications are configured first
    configureNotifications();

    // Request notification permission on Android 13+ if needed
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        const hasPermission = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        if (!hasPermission) {
          console.log('Requesting notification permission...');
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
            {
              title: 'Notification Permission',
              message: 'This app needs notification permission to show SOS alerts.',
              buttonNeutral: 'Ask Me Later',
              buttonNegative: 'Cancel',
              buttonPositive: 'OK',
            }
          );
          if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
            console.warn('Notification permission not granted:', granted);
            // Continue to fallback even if permission denied
          } else {
            console.log('Notification permission granted');
          }
        } else {
          console.log('Notification permission already granted');
        }
      } catch (error) {
        console.warn('Failed to request notification permission:', error);
      }
    }

    // Check native module availability
    let nativeModuleAvailable = false;
    try {
      const RNPushNotification = NativeModules.RNPushNotification;
      if (RNPushNotification && RNPushNotification !== null) {
        nativeModuleAvailable = true;
        console.log('✅ RNPushNotification native module is available');
      } else {
        console.warn('⚠️ RNPushNotification native module is null');
      }
    } catch (nativeCheckError) {
      console.warn('Could not check native module:', nativeCheckError);
    }

    // Try to send notification via native module if available
    if (notificationModule && nativeModuleAvailable && typeof notificationModule.localNotification === 'function') {
      try {
        const notificationConfig: any = {
          id: 'sos-' + Date.now(),
          title: 'SOS Sent',
          message: 'SOS is sent, we will reach you immediately as soon as possible',
          playSound: true,
          soundName: 'default',
          vibrate: true,
          vibration: 1000,
          tag: 'sos-alert',
          userInfo: {
            type: 'sos',
            timestamp: Date.now(),
          },
        };

        if (Platform.OS === 'android') {
          notificationConfig.channelId = 'sos-channel';
          notificationConfig.importance = 'high';
          notificationConfig.priority = 'high';
          notificationConfig.autoCancel = false;
          notificationConfig.ongoing = false;
        }

        notificationModule.localNotification(notificationConfig);
        console.log('✅ SOS notification sent successfully via native module');
        return; // Success, exit early
      } catch (notifError: any) {
        console.warn('Could not send notification via native module:', notifError?.message || String(notifError));
        // Fall through to fallback
      }
    } else {
      console.warn('⚠️ Native notification module not available, using Alert fallback');
    }

    // Fallback: Use Alert.alert for critical SOS notifications (works even if native module is null)
    // This ensures users always see the SOS confirmation
    try {
      Alert.alert(
        'SOS Sent',
        'SOS is sent, we will reach you immediately as soon as possible',
        [{text: 'OK'}]
      );
      console.log('✅ SOS notification sent via Alert.alert fallback');
    } catch (fallbackError) {
      console.error('Even Alert.alert fallback failed:', fallbackError);
    }
  } catch (error: any) {
    console.error('Failed to send SOS notification:', error);
    // Last resort: try basic Alert
    try {
      Alert.alert('SOS Sent', 'SOS alert has been triggered');
    } catch (finalError) {
      console.error('All notification methods failed:', finalError);
    }
  }
};

type DispatchResult = {
  smsInitiated: boolean;
  callInitiated: boolean;
  apiCallCompleted: boolean;
  liveShareUrl?: string | null;
  liveShareSession?: LiveShareSession | null;
};

/**
 * Get current user location using enhanced GPS (same method that works in liveLocationShareService)
 */
const getCurrentLocation = (): Promise<{latitude: number; longitude: number} | null> => {
  return new Promise((resolve) => {
    // On Android, use enhanced GPS service (more reliable)
    if (Platform.OS === 'android') {
      GeolocationService.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('[SOS Location] Enhanced GPS failed, trying primary GPS...', error);
          // Fallback to primary GPS
          Geolocation.getCurrentPosition(
            (position) => {
              resolve({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
              });
            },
            (error) => {
              console.warn('Error getting location for SOS:', error);
              resolve(null);
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 0,
            }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
          forceRequestLocation: true,
          showLocationDialog: true,
        }
      );
    } else {
      // iOS - use primary GPS
      Geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => {
          console.warn('Error getting location for SOS:', error);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    }
  });
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

export const dispatchSOSAlert = async (message: string): Promise<DispatchResult> => {
  console.log('=== SOS Alert Dispatch ===');
  
  const user = useAuthStore.getState().user;
  const {contacts, primaryContactId} = useContactStore.getState();
  const userPlan = user?.plan || 'free';
  const isPremium = userPlan === 'premium';
  const sanitizedContacts = contacts
    .filter(contact => contact.phone)
    .map(contact => ({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
    }));

  const primaryContact = sanitizedContacts.find(contact => contact.id === primaryContactId);
  const hasFamilyContacts = sanitizedContacts.length > 0;

  // Variables for background operations (will be updated asynchronously)
  let smsInitiated = false;
  let apiCallCompleted = false;
  let liveShareUrl: string | null = null;
  let liveShareSession: LiveShareSession | null = null;

  // Get current location
  let location = null;
  try {
    location = await getCurrentLocation();
    if (location) {
      console.log('Location obtained:', location);
    } else {
      console.warn('Could not get location for SOS');
    }
  } catch (error) {
    console.error('Error getting location:', error);
  }

  // STEP 1: Determine recipient based on geofence (needed for both calls and messages)
  // Check which geofence user is in and get assigned security officer
  let assignedSecurityOfficer: any = null;
  let isInsideGeofence = false;
  
  if (location && user?.id) {
    try {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      const geofenceInfo = await findUserGeofence(location, userId);
      
      if (geofenceInfo?.securityOfficer) {
        assignedSecurityOfficer = geofenceInfo.securityOfficer;
        isInsideGeofence = true;
        console.log('✅ Found assigned security officer:', assignedSecurityOfficer);
      }
    } catch (error) {
      console.error('Error checking geofence:', error);
    }
  }

  // STEP 1: STORE SOS IN DATABASE FIRST (should be fast now - < 1 second)
  // This allows security officers to access it immediately
  console.log('💾 ========== STORING SOS IN DATABASE (FIRST) ==========');
  
  if (user?.id) {
    try {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      const sosData: {longitude?: number; latitude?: number; notes?: string} = {};
      
      if (location) {
        sosData.longitude = location.longitude;
        sosData.latitude = location.latitude;
      }
      
      const template = useSettingsStore.getState().sosMessageTemplate || DEFAULT_SOS_TEMPLATE;
      sosData.notes = message || template;
      
      console.log('📤 Storing SOS event in database...');
      // API call should be fast now (< 1 second) - await it to ensure it completes
      await apiService.triggerSOS(userId, sosData);
      console.log('✅ SOS event stored in database');
      apiCallCompleted = true;
    } catch (error: any) {
      // Log error but don't block - continue with calls and SMS
      const errorMessage = error?.message || String(error);
      const isTimeout = errorMessage.includes('timeout') || 
                       errorMessage.includes('Aborted') || 
                       error?.name === 'AbortError';
      
      if (!isTimeout) {
        console.warn('⚠️ Failed to store SOS in database (non-critical):', errorMessage);
      } else {
        console.log('⏱️ SOS database storage timed out (non-critical, continuing...)');
      }
      apiCallCompleted = false;
    }
  }

  // STEP 2: TRIGGER CALLS IMMEDIATELY (User already held for 3 seconds)
  // Call happens immediately and doesn't block - runs in background
  console.log('📞 ========== TRIGGERING CALLS IMMEDIATELY (NON-BLOCKING) ==========');
  let callInitiated = false;
  
  // Call immediately (non-blocking - don't await)
  (async () => {
    try {
      // Determine who to call based on geofence
      if (isInsideGeofence && assignedSecurityOfficer) {
        // Inside geofence - call police immediately
        await requestDirectCall(POLICE_CONTACT.phone);
        callInitiated = true;
        console.log('✅ Police call initiated immediately (geofence mode)');
      } else {
        // Outside geofence - call primary contact first, then police
        if (primaryContact?.phone) {
          try {
            await requestDirectCall(primaryContact.phone);
            callInitiated = true;
            console.log('✅ Primary contact call initiated immediately');
          } catch (error) {
            console.error('Error calling primary contact:', error);
          }
        }
        
        // Also call police
        await requestDirectCall(POLICE_CONTACT.phone);
        callInitiated = true;
        console.log('✅ Police call initiated immediately (outside geofence)');
      }
    } catch (error) {
      console.error('Error calling:', error);
      Alert.alert(
        'Unable to call',
        'We could not place the call automatically. Please dial manually.',
      );
    }
  })().catch(err => console.error('Call initiation failed:', err));

  // STEP 3: HANDLE LIVE LOCATION SHARING AND SMS IN BACKGROUND
  // These run asynchronously and don't block - they continue even if call screen opens
  console.log('📤 ========== HANDLING LIVE LOCATION & SMS (BACKGROUND) ==========');
  
  // Start background operations immediately (non-blocking - don't await)
  // They will complete in the background and continue even when call screen is open
  (async () => {
    let backgroundSmsInitiated = false;
    let backgroundLiveShareUrl: string | null = null;
    let backgroundLiveShareSession: LiveShareSession | null = null;
    
    // Function to send multiple SMS messages in batch (quick succession)
    const sendSmsBatch = async (label: string, recipients: string[], messages: string[]): Promise<boolean> => {
      if (!recipients.length || !messages.length) {
        return false;
      }
      
      console.log(`📤 [SOS SMS Intent] Opening SMS app for ${label}, recipients:`, recipients);
      
      // Send each message in quick succession
      let allSuccess = true;
      for (let i = 0; i < messages.length; i++) {
        const messageText = messages[i];
        console.log(`📤 [SOS SMS Batch] Sending message ${i + 1}/${messages.length} to ${label}...`);
        console.log(`📤 [SOS SMS Batch] Message ${i + 1} length:`, messageText.length);
        
        try {
          const success = await sendSmsDirect(recipients, messageText);
          console.log(`📤 [SOS SMS Batch] Message ${i + 1} sendSmsDirect result:`, success);
          
          if (success) {
            console.log(`✅ [SOS SMS Batch] Message ${i + 1} sent successfully`);
          } else {
            console.warn(`⚠️ [SOS SMS Batch] Message ${i + 1} failed`);
            allSuccess = false;
          }
          
          // Small delay between messages (100ms) to ensure they're sent in order
          if (i < messages.length - 1) {
            await new Promise(resolve => setTimeout(() => resolve(null), 100));
          }
        } catch (error) {
          console.error(`❌ [SOS SMS Batch] Error sending message ${i + 1}:`, error);
          allSuccess = false;
        }
      }
      
      // Return result - no SMS app fallback
      if (allSuccess) {
        console.log(`✅ [SOS SMS Batch] All ${messages.length} message(s) sent successfully via direct SMS`);
        return true;
      } else {
        console.warn(`⚠️ [SOS SMS Batch] Some messages failed to send`);
        return false;
      }
    };
    
    const sendSmsGroup = async (label: string, recipients: string[], body: string) => {
      if (!recipients.length) {
        return false;
      }
      
      // Use EXACT same logic as HomeScreen handleSendSMS (lines 675-709)
      const {Linking} = require('react-native');
      const messageBody = body || '';
      
      // Use direct SMS sending (no app opens) if available, otherwise fallback to SMS app
      // EXACT same as HomeScreen line 689-690
      try {
        console.log(`📤 [SOS SMS] Sending to ${label}, recipients:`, recipients);
        console.log(`📤 [SOS SMS] Message length:`, messageBody.length);
        const success = await sendSmsDirect(recipients, messageBody); // No third param, same as HomeScreen line 690
        console.log(`📤 [SOS SMS] sendSmsDirect result:`, success);
        if (success) {
          console.log(`✅ [SOS SMS] Direct SMS sent to ${label} (${recipients.length} recipient(s))`);
          return true;
        }
        // Direct SMS failed - return false (no fallback)
        console.warn(`⚠️ [SOS SMS] Direct SMS returned false for ${label}`);
        return false;
      } catch (error) {
        // Direct SMS error - return false (no fallback)
        console.warn(`⚠️ [SOS SMS] Failed to send direct SMS to ${label}:`, error);
        return false;
      }
    };
  
    try {
      // STEP 2a: Start live location sharing FIRST (exactly like HomeScreen)
      console.log('📍 Starting live location sharing for SOS (background)...');
      let liveShareResult: {shareUrl: string; locationMessage: string} | null = null;
      
      try {
        // Use live location service directly (same as HomeScreen)
        // Increased timeout to 30 seconds to allow for slower GPS/API
        const result = await Promise.race([
          startLiveLocationShare((payload) => {
            console.log('SOS live share session ended:', payload);
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Live share timeout after 30 seconds')), 30000)
          ),
        ]) as Awaited<ReturnType<typeof startLiveLocationShare>>;
      
      // Verify we got a valid URL
      if (!result.shareUrl || !result.locationMessage) {
        throw new Error('Live share URL or message is missing');
      }
      
      backgroundLiveShareUrl = result.shareUrl;
      backgroundLiveShareSession = result.session;
      liveShareUrl = result.shareUrl; // Update outer scope
      liveShareSession = result.session; // Update outer scope
      liveShareResult = {
        shareUrl: result.shareUrl,
        locationMessage: result.locationMessage,
      };
      
      console.log('✅ Live location sharing started for SOS:', {
        shareUrl: result.shareUrl,
        locationMessage: result.locationMessage.substring(0, 100) + '...',
        sessionId: result.sessionId,
      });
    } catch (error: any) {
      console.error('❌ Error starting live location sharing for SOS:', error);
      
      // Send push notification when live share fails in SOS
      const errorMessage = error?.message || 'Unknown error';
      let notificationMessage = 'Live location sharing failed. Using static location instead.';
      
      if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
        notificationMessage = 'Live location sharing timed out. Using static location instead.';
      } else if (errorMessage.includes('Cannot connect') || errorMessage.includes('Network')) {
        notificationMessage = 'Cannot connect to server for live sharing. Using static location instead.';
      }
      
      try {
        await sendAlertNotification(
          'SOS Alert - Location Sharing',
          notificationMessage
        );
        console.log('📱 Push notification sent for live share failure in SOS');
      } catch (notifError) {
        console.warn('Failed to send push notification for live share failure:', notifError);
      }
      
      // Fallback to static location if live sharing fails
      if (location) {
        liveShareUrl = buildGoogleMapsUrl(location.latitude, location.longitude);
        liveShareResult = {
          shareUrl: liveShareUrl,
          locationMessage: `My location:\n${liveShareUrl}`,
        };
        console.log('⚠️ Using static location fallback:', liveShareUrl);
      } else {
        console.warn('⚠️ No location available for fallback');
      }
    }

    // STEP 2b: Construct 3 separate messages: [SOS message, Location text, URL]
    const settingsState = useSettingsStore.getState();
    const messageTemplates = settingsState.sosMessages || DEFAULT_SOS_MESSAGES;
    const baseFamilyMessage = message?.trim() || messageTemplates.family || DEFAULT_SOS_TEMPLATE;
    const baseSecurityMessage = messageTemplates.security || DEFAULT_SOS_MESSAGES.security;

    // Prepare messages as separate arrays: [SOS message, Location text, URL]
    let familyMessages: string[] = [];
    let securityMessages: string[] = [];
    
    if (liveShareResult && liveShareResult.shareUrl) {
      // Message 1: SOS message
      // Message 2: Location sharing text (without URL)
      // Message 3: URL only
      const locationTextWithoutUrl = liveShareResult.locationMessage 
        ? liveShareResult.locationMessage.replace(liveShareResult.shareUrl, '').trim()
        : 'Track my live location:';
      
      familyMessages = [
        baseFamilyMessage, 
        locationTextWithoutUrl || 'I\'m sharing my live location.',
        liveShareResult.shareUrl
      ];
      securityMessages = [
        baseSecurityMessage,
        locationTextWithoutUrl || 'I\'m sharing my live location.',
        liveShareResult.shareUrl
      ];
      
      console.log('✅ Prepared 3 separate messages for batch sending:', {
        familyMessages: familyMessages.length,
        securityMessages: securityMessages.length,
        url: liveShareResult.shareUrl,
        message1Length: familyMessages[0]?.length || 0,
        message2Length: familyMessages[1]?.length || 0,
        message3Length: familyMessages[2]?.length || 0,
        message3Content: familyMessages[2]?.substring(0, 100) || 'EMPTY',
      });
      console.log('🔗 Live location URL that will be sent:', liveShareResult.shareUrl);
    } else if (location) {
      // Fallback: static location - send as 3 messages
      const staticLocationUrl = buildGoogleMapsUrl(location.latitude, location.longitude);
      familyMessages = [
        baseFamilyMessage, 
        'My location:',
        staticLocationUrl
      ];
      securityMessages = [
        baseSecurityMessage,
        'My location:',
        staticLocationUrl
      ];
    } else {
      // No location available - just SOS message (send as single message)
      familyMessages = [baseFamilyMessage];
      securityMessages = [baseSecurityMessage];
    }

    // STEP 3a: Send SMS messages in batch (separate messages sent in quick succession)
    console.log('📤 Preparing to send SMS in batch (separate messages)...');
    console.log('📝 Family messages:', familyMessages);
    console.log('📝 Security messages:', securityMessages);
    console.log('🔗 Live share URL included:', liveShareResult?.shareUrl || 'NO URL');
    
    // Send SMS in batch (await this one as it's important)
    const smsResult = await Promise.resolve(
      (async () => {
        try {
          if (isInsideGeofence && assignedSecurityOfficer) {
            const officerPhone = assignedSecurityOfficer.contact || assignedSecurityOfficer.phone;
            if (officerPhone) {
              console.log(`📤 Attempting to send batch SMS to security officer: ${officerPhone}`);
              const securitySuccess = await sendSmsBatch(
                'assigned security officer',
                [officerPhone],
                securityMessages
              );
              backgroundSmsInitiated = backgroundSmsInitiated || securitySuccess;
              smsInitiated = backgroundSmsInitiated; // Update outer scope
              console.log(`✅ SMS batch result for security officer: ${securitySuccess}`);
              return securitySuccess;
            } else {
              console.warn('⚠️ No phone number for security officer');
              return false;
            }
          } else {
            if (hasFamilyContacts) {
              const smsRecipients = sanitizedContacts.map((contact) => contact.phone);
              console.log(`📤 Attempting to send batch SMS to ${smsRecipients.length} family contact(s):`, smsRecipients);
              const familySuccess = await sendSmsBatch('family contacts', smsRecipients, familyMessages);
              backgroundSmsInitiated = backgroundSmsInitiated || familySuccess;
              smsInitiated = backgroundSmsInitiated; // Update outer scope
              console.log(`✅ SMS batch result for family contacts: ${familySuccess}`);
              return familySuccess;
            } else {
              console.warn('⚠️ No family contacts available');
              return false;
            }
          }
        } catch (error) {
          console.error('❌ Error in SMS batch sending:', error);
          return false;
        }
      })()
    );

    // Check SMS result
    if (smsResult) {
      backgroundSmsInitiated = smsResult || backgroundSmsInitiated;
      smsInitiated = backgroundSmsInitiated; // Update outer scope
      console.log('✅ SMS sent:', smsResult);
    } else {
      console.warn('⚠️ SMS was not sent successfully, attempting fallback...');
      // Try to send SMS again as fallback
      try {
        const settingsState = useSettingsStore.getState();
        const messageTemplates = settingsState.sosMessages || DEFAULT_SOS_MESSAGES;
        const baseMessage = message?.trim() || messageTemplates.family || DEFAULT_SOS_TEMPLATE;
        const fallbackMessage = liveShareResult 
          ? `${baseMessage}\n\n${liveShareResult.locationMessage}`
          : baseMessage;
        
        if (isInsideGeofence && assignedSecurityOfficer) {
          const officerPhone = assignedSecurityOfficer.contact || assignedSecurityOfficer.phone;
          if (officerPhone) {
            const retrySuccess = await sendSmsGroup('security officer (retry)', [officerPhone], fallbackMessage);
            backgroundSmsInitiated = backgroundSmsInitiated || retrySuccess;
            smsInitiated = backgroundSmsInitiated; // Update outer scope
          }
        } else if (hasFamilyContacts) {
          const smsRecipients = sanitizedContacts.map((contact) => contact.phone);
          const retrySuccess = await sendSmsGroup('family contacts (retry)', smsRecipients, fallbackMessage);
          backgroundSmsInitiated = backgroundSmsInitiated || retrySuccess;
          smsInitiated = backgroundSmsInitiated; // Update outer scope
        }
      } catch (retryError) {
        console.error('❌ SMS retry also failed:', retryError);
      }
    }

    console.log('✅ Background SOS operations completed:', {
      smsInitiated: backgroundSmsInitiated,
      liveShareUrl: backgroundLiveShareUrl,
      liveShareSession: backgroundLiveShareSession ? 'active' : 'none',
    });
    
    // Final check: If SMS wasn't sent, try one more time with whatever we have
    if (!backgroundSmsInitiated) {
      console.warn('⚠️ SMS was not sent successfully, attempting final fallback...');
      try {
        const settingsState = useSettingsStore.getState();
        const messageTemplates = settingsState.sosMessages || DEFAULT_SOS_MESSAGES;
        const baseMessage = message?.trim() || messageTemplates.family || DEFAULT_SOS_TEMPLATE;
        
        // Try to include location if available
        let finalMessage = baseMessage;
        if (liveShareResult && liveShareResult.shareUrl) {
          const locationText = liveShareResult.locationMessage || `Track my live location:\n${liveShareResult.shareUrl}`;
          finalMessage = `${baseMessage}\n\n${locationText}`;
        } else if (location) {
          const staticUrl = buildGoogleMapsUrl(location.latitude, location.longitude);
          finalMessage = `${baseMessage}\n\nMy location:\n${staticUrl}`;
        }
        
        if (isInsideGeofence && assignedSecurityOfficer) {
          const officerPhone = assignedSecurityOfficer.contact || assignedSecurityOfficer.phone;
          if (officerPhone) {
            const finalSuccess = await sendSmsGroup('assigned security officer (final fallback)', [officerPhone], finalMessage);
            backgroundSmsInitiated = backgroundSmsInitiated || finalSuccess;
            smsInitiated = backgroundSmsInitiated; // Update outer scope
            console.log('✅ Final fallback SMS result:', finalSuccess);
          }
        } else if (hasFamilyContacts) {
          const smsRecipients = sanitizedContacts.map((contact) => contact.phone);
          const finalSuccess = await sendSmsGroup('family contacts (final fallback)', smsRecipients, finalMessage);
          backgroundSmsInitiated = backgroundSmsInitiated || finalSuccess;
          smsInitiated = backgroundSmsInitiated; // Update outer scope
          console.log('✅ Final fallback SMS result:', finalSuccess);
        }
      } catch (finalError) {
        console.error('❌ Final fallback SMS also failed:', finalError);
      }
    }
  } catch (error) {
    console.error('❌ Error in background SOS operations:', error);
    // Even if there's an error, try to send basic SOS message without location
    try {
      const settingsState = useSettingsStore.getState();
      const messageTemplates = settingsState.sosMessages || DEFAULT_SOS_MESSAGES;
      const baseMessage = message?.trim() || messageTemplates.family || DEFAULT_SOS_TEMPLATE;
      
      if (isInsideGeofence && assignedSecurityOfficer) {
        const officerPhone = assignedSecurityOfficer.contact || assignedSecurityOfficer.phone;
        if (officerPhone) {
          const fallbackSuccess = await sendSmsGroup('assigned security officer (fallback)', [officerPhone], baseMessage);
          backgroundSmsInitiated = backgroundSmsInitiated || fallbackSuccess;
          smsInitiated = backgroundSmsInitiated; // Update outer scope
          console.log('✅ Fallback SMS result:', fallbackSuccess);
        }
      } else if (hasFamilyContacts) {
        const smsRecipients = sanitizedContacts.map((contact) => contact.phone);
        const fallbackSuccess = await sendSmsGroup('family contacts (fallback)', smsRecipients, baseMessage);
        backgroundSmsInitiated = backgroundSmsInitiated || fallbackSuccess;
        smsInitiated = backgroundSmsInitiated; // Update outer scope
        console.log('✅ Fallback SMS result:', fallbackSuccess);
      }
    } catch (fallbackError) {
      console.error('❌ Fallback SMS also failed:', fallbackError);
    }
  }
  })().catch(err => {
    console.error('❌ Error in background SOS operations:', err);
    // Try to send basic SMS even on error
    try {
      const settingsState = useSettingsStore.getState();
      const messageTemplates = settingsState.sosMessages || DEFAULT_SOS_MESSAGES;
      const baseMessage = message?.trim() || messageTemplates.family || DEFAULT_SOS_TEMPLATE;
      
      if (isInsideGeofence && assignedSecurityOfficer) {
        const officerPhone = assignedSecurityOfficer.contact || assignedSecurityOfficer.phone;
        if (officerPhone) {
          sendSmsDirect([officerPhone], baseMessage, true).catch(() => {});
        }
      } else if (hasFamilyContacts) {
        const smsRecipients = sanitizedContacts.map((contact) => contact.phone);
        sendSmsDirect(smsRecipients, baseMessage, true).catch(() => {});
      }
    } catch (fallbackError) {
      console.error('❌ Fallback SMS also failed:', fallbackError);
    }
  });

  // Send push notification immediately (don't await to avoid blocking)
  // This ensures notification is sent even if there are delays in other operations
  sendSOSNotification().catch((error) => {
    console.error('Failed to send SOS notification:', error);
  });

  // Return immediately - background operations continue asynchronously
  // The function returns right away so the call screen can open without blocking
  return {
    smsInitiated, // May be false initially, will be updated by background operations
    callInitiated,
    apiCallCompleted, // API call completed first (before calls and SMS)
    liveShareUrl, // May be null initially, will be updated by background operations
    liveShareSession, // May be null initially, will be updated by background operations
  };
};
