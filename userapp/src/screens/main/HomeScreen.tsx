import React, {useState, useEffect, useRef, useCallback} from 'react';
import {useRoute, useTheme} from '@react-navigation/native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Animated,
  Vibration,
  Modal,
  Linking,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Share,
  PermissionsAndroid,
  Alert,
  AppState,
  DeviceEventEmitter,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import GeolocationService from 'react-native-geolocation-service';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAuthStore} from '../../stores/authStore';
import {useSettingsStore, DEFAULT_SOS_TEMPLATE} from '../../stores/settingsStore';
import {useContactStore} from '../../stores/contactStore';
import {useSubscription} from '../../lib/hooks/useSubscription';
import {CustomVibration} from '../../modules/VibrationModule';
import {shakeDetectionService} from '../../services/shakeDetectionService';
import {dispatchSOSAlert} from '../../services/sosDispatcher';
import {ThemedAlert} from '../../components/common/ThemedAlert';
import {apiService} from '../../services/apiService';
import {
  getActiveLiveShareSession,
  startLiveLocationShareUpdates,
  stopLiveLocationShareUpdates,
} from '../../services/liveLocationShareService';
import {sendLiveShareNotification} from '../../services/notificationService';
import {
  startGeofenceMonitoring,
  stopGeofenceMonitoring,
  refreshGeofences,
} from '../../services/geofenceMonitoringService';
import {requestDirectCall} from '../../services/callService';
import {sendSmsDirect} from '../../services/smsService';

const COMMUNITY_MESSAGES = [
  'Suspicious activity near my location.',
  'Medical assistance needed urgently.',
  'Please check in, safety concern reported.',
];

const withAlpha = (color: string, alpha: number): string => {
  if (color.startsWith('#')) {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (color.startsWith('rgba')) {
    return color.replace(/[\d.]+\)$/g, `${alpha})`);
  }
  if (color.startsWith('rgb')) {
    return color.replace('rgb', 'rgba').replace(')', `, ${alpha})`);
  }
  return color;
};

const categoryCards = [
  {
    key: 'police',
    title: 'Police',
    icon: 'local-police',
    iconColor: '#1D4ED8',
    lightBackground: '#EFF6FF',
    lightBorder: '#DBEAFE',
    phone: '9561606066',
    smsBody: 'Emergency! Please send help immediately.',
    type: 'call' as const,
    isPremium: false,
  },
  {
    key: 'security',
    title: 'Security',
    icon: 'security',
    iconColor: '#047857',
    lightBackground: '#ECFDF5',
    lightBorder: '#A7F3D0',
    phone: '+18005550101',
    smsBody: 'Security alert needed. Please respond ASAP.',
    type: 'call' as const,
    isPremium: false,
  },
  {
    key: 'family',
    title: 'Family',
    icon: 'favorite',
    iconColor: '#7C3AED',
    lightBackground: '#F5F3FF',
    lightBorder: '#DDD6FE',
    phone: '+18005550123',
    smsBody: 'I need your help. Please call me back.',
    type: 'sms' as const,
    isPremium: false,
  },
  {
    key: 'community',
    title: 'Community',
    icon: 'groups',
    iconColor: '#B91C1C',
    lightBackground: '#FEF2F2',
    lightBorder: '#FECACA',
    phone: '+18005550999',
    smsBody: 'Alerting the community—please check in.',
    type: 'community' as const,
          contacts: [], // Will be loaded from API
    quickMessages: COMMUNITY_MESSAGES,
    isPremium: false, // Free users get 500m radius
  },
  {
    key: 'ambulance',
    title: 'Ambulance',
    icon: 'local-hospital',
    iconColor: '#DC2626',
    lightBackground: '#FEE2E2',
    lightBorder: '#FCA5A5',
    phone: '108',
    smsBody: 'Medical emergency. Please dispatch assistance immediately.',
    type: 'call' as const,
    isPremium: false,
  },
  {
    key: 'location',
    title: 'Share\nLocation',
    icon: 'my-location',
    iconColor: '#0EA5E9',
    lightBackground: '#E0F2FE',
    lightBorder: '#BAE6FD',
    phone: '+18005550155',
    smsBody: 'Here is my current location. Please monitor me closely.',
    type: 'sms' as const,
    isPremium: false, // Free users get 30min limit
  },
];

type CategoryCard = typeof categoryCards[number];

const {width} = Dimensions.get('window');

// Live share base URL
const getLiveShareBaseUrl = (): string => {
  const base = `${apiService.getBackendBaseUrl()}/live-share`;
  return base.endsWith('/') ? base.slice(0, -1) : base;
};

const HomeScreen = ({navigation}: any) => {
  const route = useRoute();
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const {isPremium, promptUpgrade} = useSubscription();
  const shakeToSendSOS = useSettingsStore((state) => state.shakeToSendSOS);
  const theme = useTheme();
  const colors = theme.colors;
  
  // Theme-dependent colors
  const isDarkMode = theme.dark || false;
  const cardShadowColor = isDarkMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.1)';
  const mutedTextColor = isDarkMode ? 'rgba(255, 255, 255, 0.6)' : '#6B7280';
  const subtleTextColor = isDarkMode ? 'rgba(255, 255, 255, 0.5)' : '#9CA3AF';
  const softSurface = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#F3F4F6';
  const inputSurface = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : '#F9FAFB';
  const placeholderColor = isDarkMode ? 'rgba(255, 255, 255, 0.4)' : '#9CA3AF';
  const quickBoxBackground = isDarkMode ? withAlpha(colors.primary, 0.15) : '#EFF6FF';
  const quickBorderColor = isDarkMode ? withAlpha(colors.primary, 0.35) : '#BFDBFE';
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [isButtonPressed, setIsButtonPressed] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSuccessScreen, setShowSuccessScreen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showShakeSOSModal, setShowShakeSOSModal] = useState(false);
  const [isSendingSOSFromModal, setIsSendingSOSFromModal] = useState(false);
  const [alertState, setAlertState] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type?: 'error' | 'success' | 'info' | 'warning';
  }>({
    visible: false,
    title: '',
    message: '',
    type: 'info',
  });
  const [actionCard, setActionCard] = useState<CategoryCard | null>(null);
  const familyContacts = useContactStore((state) => state.contacts);
  const contactsInitialized = useContactStore((state) => state.initialized);
  const [isSendingCommunityMessage, setIsSendingCommunityMessage] = useState(false);
  const loadContacts = useContactStore((state) => state.loadContacts);
  const [customFamilyMessage, setCustomFamilyMessage] = useState('');
  const [selectedCommunityContact, setSelectedCommunityContact] = useState<any>(null);
  const [communityContacts, setCommunityContacts] = useState<any[]>([]);
  const [communityLoading, setCommunityLoading] = useState(false);
  const [selectedQuickMessage, setSelectedQuickMessage] = useState(COMMUNITY_MESSAGES[0]);
  const [customCommunityMessage, setCustomCommunityMessage] = useState(COMMUNITY_MESSAGES[0]);
  const [familyActionMode, setFamilyActionMode] = useState<'single' | 'all'>('single');
  const [selectedFamilyContactId, setSelectedFamilyContactId] = useState<string | null>(null);
  const [isSharingCurrentLocation, setIsSharingCurrentLocation] = useState(false);
  const [liveShareStopAlert, setLiveShareStopAlert] = useState<{
    visible: boolean;
    message: string;
    type: 'success' | 'info';
  }>({
    visible: false,
    message: '',
    type: 'success',
  });
  const [isStartingLiveShare, setIsStartingLiveShare] = useState(false);
  const [activeLiveShare, setActiveLiveShare] = useState(getActiveLiveShareSession());
  const [lastLiveSharePlan, setLastLiveSharePlan] = useState<'free' | 'premium'>(isPremium ? 'premium' : 'free');
  
  // All refs must be declared before any useEffect hooks (Rules of Hooks)
  const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alertTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shakeSOSModalShownRef = useRef(false);
  const hapticIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownAnim = useRef(new Animated.Value(1)).current;

  const cardRows: CategoryCard[][] = [];
  for (let i = 0; i < categoryCards.length; i += 2) {
    cardRows.push(categoryCards.slice(i, i + 2));
  }

  // Check route params for showLoginModal
  useEffect(() => {
    if (route?.params?.showLoginModal) {
      setShowLoginModal(true);
      // Clear the param after showing modal
      navigation.setParams({showLoginModal: undefined});
    }
  }, [route?.params?.showLoginModal, navigation]);

  // Check for SOS trigger from shake gesture - works when app launches or comes to foreground
  useEffect(() => {
    if (Platform.OS === 'android' && isAuthenticated) {
      const checkIntent = async () => {
        try {
          const {NativeModules} = require('react-native');
          const IntentModule = NativeModules.IntentModule;
          if (IntentModule && typeof IntentModule.getInitialIntent === 'function') {
            const intent = await IntentModule.getInitialIntent();
            if (intent?.action === 'com.userapp.TRIGGER_SOS_FROM_SHAKE' || intent?.triggerSource === 'shake') {
              console.log('[HomeScreen] SOS triggered from shake gesture');
              console.log('[HomeScreen] Intent received - navigating to Home and showing modal');
              
              // Only show modal if we haven't already shown it, success screen is not showing, and not currently sending
              if (!shakeSOSModalShownRef.current && !showSuccessScreen && !isSendingSOSFromModal) {
                // Clear the intent to prevent re-triggering
                IntentModule.clearIntent().catch(() => {});
                // Navigate to Home screen if not already there
                if (navigation) {
                  navigation.navigate('Home');
                }
                // Show modern SOS confirmation modal instead of directly sending
                // Add small delay to ensure app is fully loaded and navigation completes
                setTimeout(() => {
                  // Double-check ref, success screen state, and sending state before showing modal
                  if (!shakeSOSModalShownRef.current && !showSuccessScreen && !isSendingSOSFromModal) {
                    shakeSOSModalShownRef.current = true;
                    setShowShakeSOSModal(true);
                  }
                }, 500);
              } else {
                // Intent already processed, success screen is showing, or currently sending - just clear it
                IntentModule.clearIntent().catch(() => {});
                console.log('[HomeScreen] Intent received but modal already shown, success screen active, or sending - ignoring');
              }
            }
          }
        } catch (error) {
          console.warn('[HomeScreen] Could not check intent:', error);
        }
      };
      
      // Check on mount (app launches) - check multiple times to catch intent
      checkIntent(); // Check immediately
      const timeout1 = setTimeout(checkIntent, 300); // Check after 300ms
      const timeout2 = setTimeout(checkIntent, 800); // Check after 800ms
      const timeout3 = setTimeout(checkIntent, 1500); // Check after 1500ms
      
      // Also check when app comes to foreground (app was in background)
      const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
        if (nextAppState === 'active') {
          // App came to foreground - check for new intent multiple times
          checkIntent(); // Check immediately
          setTimeout(checkIntent, 200); // Check after 200ms
          setTimeout(checkIntent, 500); // Check after 500ms
          setTimeout(checkIntent, 1000); // Check after 1000ms
        }
      });
      
      return () => {
        clearTimeout(timeout1);
        clearTimeout(timeout2);
        clearTimeout(timeout3);
        appStateSubscription.remove();
      };
    }
  }, [isAuthenticated]);


  useEffect(() => {
    if (!contactsInitialized) {
      loadContacts().catch(() => {});
    }
  }, [contactsInitialized, loadContacts]);

  // Periodically check for active live share sessions (especially after SOS)
  // This ensures the "Stop live sharing" button appears in the modal
  useEffect(() => {
    // Check immediately on mount and when user changes
    const currentSession = getActiveLiveShareSession();
    if (currentSession) {
      setActiveLiveShare(currentSession);
    }

    // Set up interval to check every 2 seconds for active sessions
    const interval = setInterval(() => {
      const session = getActiveLiveShareSession();
      setActiveLiveShare(session);
    }, 2000);

    return () => clearInterval(interval);
  }, [user?.id]); // Only re-run when user changes

  useEffect(() => {
    let isMounted = true;
    const fetchCommunities = async () => {
      if (!user?.id) {
        setCommunityContacts([]);
        return;
      }
      setCommunityLoading(true);
      try {
        const response = await apiService.getChatGroups(Number(user.id));
        const items = Array.isArray(response) ? response : response?.results || [];
        const mapped = items.map((item: any) => ({
          id: item.id?.toString() || item.community_id || item.name || `${item}`,
          label: item.name || item.community_name || 'Community',
          phone: item.contact_phone || item.phone || item.support_number || null,
        }));
        if (isMounted) {
          setCommunityContacts(mapped);
        }
      } catch (error) {
        console.error('Error loading communities:', error);
        if (isMounted) {
          setCommunityContacts([]);
        }
      } finally {
        if (isMounted) {
          setCommunityLoading(false);
        }
      }
    };
    fetchCommunities();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Geofence monitoring - start/stop based on authentication and premium status
  useEffect(() => {
    if (!isAuthenticated || !user?.id || !isPremium) {
      // Stop monitoring if user is not authenticated, no user ID, or not premium
      stopGeofenceMonitoring();
      return;
    }

    // Start geofence monitoring for premium users
    const userId = parseInt(user.id, 10);
    if (!isNaN(userId)) {
      startGeofenceMonitoring(userId).catch((error) => {
        console.error('Failed to start geofence monitoring:', error);
      });
    }

    // Cleanup on unmount or when conditions change
    return () => {
      stopGeofenceMonitoring();
    };
  }, [isAuthenticated, user?.id, isPremium]);

  // Handle app state changes to refresh geofences when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && isAuthenticated && user?.id && isPremium) {
        // Refresh geofences when app comes to foreground
        const userId = parseInt(user.id, 10);
        if (!isNaN(userId)) {
          refreshGeofences(userId).catch((error) => {
            console.error('Failed to refresh geofences:', error);
          });
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated, user?.id, isPremium]);

  // Permissions are now handled automatically by the system on app start

  const triggerVibration = (duration: number = 200) => {
    try {
      // Use custom vibration module that uses USAGE_NOTIFICATION instead of USAGE_TOUCH
      // This ensures vibrations work even when touch vibrations are disabled
      // Use shorter duration (200ms) for discrete pulses that stop between vibrations
      CustomVibration.vibrate(duration);
    } catch (err) {
      console.error('Vibration error:', err);
      // Fallback to React Native's Vibration API
      try {
        Vibration.vibrate(duration);
      } catch (e) {
        console.error('Vibration fallback failed:', e);
      }
    }
  };

  const handleSOSPressIn = () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    
    setIsButtonPressed(true);
    // Start countdown immediately when button is pressed
      startAlertSequence();
  };

  const handleSOSPressOut = () => {
    // Cancel countdown if user releases button before countdown completes
    if (isSendingAlert && countdown !== null && countdown > 0) {
      // Cancel the alert sequence
      if (alertTimerRef.current) {
        clearInterval(alertTimerRef.current);
        alertTimerRef.current = null;
    }
      resetState();
      return;
    }
    
    // Clear haptic interval
    if (hapticIntervalRef.current) {
      clearInterval(hapticIntervalRef.current);
      hapticIntervalRef.current = null;
    }
    
    // Only cancel if not already in alert sequence
    if (!isSendingAlert) {
      setIsButtonPressed(false);
      setCountdown(null);
    }
  };

  const startAlertSequence = () => {
    // Clear any existing timers
    if (alertTimerRef.current) {
      clearInterval(alertTimerRef.current);
      alertTimerRef.current = null;
    }
    
    setIsSendingAlert(true);
    setCountdown(3);
    
    // Haptic feedback on initial press
    triggerVibration(200);
    
    // Start alert sending countdown (3 to 1, then 0 triggers send)
    alertTimerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev === undefined) {
          return 3;
        }
        
        // Haptic feedback on countdown number change
        triggerVibration(200);
        
        // Animate countdown
        Animated.sequence([
          Animated.timing(countdownAnim, {
            toValue: 0.8,
            duration: 100,
            useNativeDriver: true,
          }),
          Animated.timing(countdownAnim, {
            toValue: 1,
            duration: 100,
            useNativeDriver: true,
          }),
        ]).start();
        
        if (prev <= 1) {
          // Clear interval first
          if (alertTimerRef.current) {
            clearInterval(alertTimerRef.current);
            alertTimerRef.current = null;
          }
          // Send alert after showing "1" briefly
          setTimeout(() => {
            sendAlert();
          }, 500);
          return 0;
        }
        
        return prev - 1;
      });
    }, 1000);
  };

  const sendAlert = async (fromShake: boolean = false) => {
    if (!isAuthenticated) {
      console.warn('[SOS] Cannot send alert - user not authenticated');
      return;
    }

    // If called from shake detection, send alert directly without UI countdown
    // Vibration is already handled by native service on 3rd shake
    if (fromShake) {
      console.log('[SOS SHAKE] Starting SOS dispatch from shake gesture...');
      try {
        const sosMessage = useSettingsStore.getState().sosMessageTemplate || DEFAULT_SOS_TEMPLATE;
        console.log('[SOS SHAKE] Calling dispatchSOSAlert - this will trigger calls and send alerts');
        const sosResult = await dispatchSOSAlert(sosMessage);
        console.log('[SOS SHAKE] dispatchSOSAlert completed, result:', sosResult);
        // Update active live share state with the session from SOS
        if (sosResult?.liveShareSession) {
          setActiveLiveShare(sosResult.liveShareSession);
          console.log('✅ Active live share session set from SOS (shake):', sosResult.liveShareSession);
        } else {
          // Fallback: check for active session
          setActiveLiveShare(getActiveLiveShareSession());
        }
        console.log('✅ SOS alert sent from shake detection - calls should be initiated');
        // Notification and vibration already handled by shakeDetectionService
      } catch (error) {
        console.error('❌ Error dispatching SOS alert from shake:', error);
        setAlertState({
          visible: true,
          title: 'Error',
          message: 'Failed to send SOS alert. Please try again.',
          type: 'error',
        });
      }
      return;
    }

    // Normal UI flow - dispatch SOS alert
    try {
      // Clear intent and reset ref to prevent modal from showing again
      shakeSOSModalShownRef.current = false;
      try {
        const {NativeModules} = require('react-native');
        const IntentModule = NativeModules.IntentModule;
        if (IntentModule && typeof IntentModule.clearIntent === 'function') {
          await IntentModule.clearIntent();
        }
      } catch (e) {
        console.warn('Could not clear intent:', e);
      }
      
      const sosMessage = useSettingsStore.getState().sosMessageTemplate || DEFAULT_SOS_TEMPLATE;
      const sosResult = await dispatchSOSAlert(sosMessage);
      // Update active live share state with the session from SOS
      if (sosResult?.liveShareSession) {
        setActiveLiveShare(sosResult.liveShareSession);
        console.log('✅ Active live share session set from SOS (button):', sosResult.liveShareSession);
      } else {
        // Fallback: check for active session
        setActiveLiveShare(getActiveLiveShareSession());
      }
      
      // Close modal and show success screen after alert is sent
      setShowShakeSOSModal(false);
      setIsSendingSOSFromModal(false);
      setShowSuccess(true);
      setIsSendingAlert(false);
      setShowSuccessScreen(true);
    } catch (error) {
      console.error('Error dispatching SOS alert:', error);
      setAlertState({
        visible: true,
        title: 'Error',
        message: 'Failed to send SOS alert. Please try again.',
        type: 'error',
      });
      resetState();
      return;
    }
    // Haptic feedback when alert is sent - use pattern for success
    try {
      // On Android: odd indices = vibration duration, even indices = separation time
      // Pattern: wait 0ms, vibrate 1000ms, wait 200ms, vibrate 1000ms
      CustomVibration.vibratePattern([0, 1000, 200, 1000], -1);
    } catch (err) {
      console.warn('Vibration pattern error:', err);
      // Fallback to simple vibration
      CustomVibration.vibrate(1000);
    }
  };

  const resetState = () => {
    if (countdownTimerRef.current) {
      clearTimeout(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setIsButtonPressed(false);
    setIsSendingAlert(false);
    setShowSuccess(false);
    setShowSuccessScreen(false);
    setCountdown(null);
    countdownAnim.setValue(1);
  };

  const handleBackFromSuccess = () => {
    // Reset shake modal ref and state when success screen is dismissed
    shakeSOSModalShownRef.current = true; // Keep it true so modal doesn't show again
    setShowShakeSOSModal(false);
    setIsSendingSOSFromModal(false);
    resetState();
  };


  // Load settings on mount
  useEffect(() => {
    const loadUserSettings = async () => {
      const {loadSettings} = useSettingsStore.getState();
      await loadSettings();
    };
    loadUserSettings();
  }, []);

  useEffect(() => {
    if (familyActionMode === 'single') {
      if (!selectedFamilyContactId && familyContacts.length > 0) {
        setSelectedFamilyContactId(familyContacts[0].id?.toString() ?? null);
      }
    }
  }, [familyContacts, familyActionMode, selectedFamilyContactId]);

  // Shake detection setup
  useEffect(() => {
    if (shakeToSendSOS && isAuthenticated) {
      // Start shake detection
      shakeDetectionService.start(() => {
        // This callback is called when shake is detected
        console.log('[HomeScreen] Shake detected callback - navigating to Home and showing modal');
        // Only show modal if we haven't already shown it, success screen is not showing, and not currently sending
        if (!shakeSOSModalShownRef.current && !showSuccessScreen && !isSendingSOSFromModal) {
          // Navigate to Home screen if not already there (works when app is running on other pages)
          if (navigation) {
            navigation.navigate('Home');
          }
          // Show modern SOS confirmation modal instead of directly sending
          // Only show if modal is not already visible (prevent duplicates)
          setTimeout(() => {
            // Double-check ref, success screen state, and sending state before showing modal
            if (!shakeSOSModalShownRef.current && !showSuccessScreen && !isSendingSOSFromModal) {
              shakeSOSModalShownRef.current = true;
              setShowShakeSOSModal(true);
            }
          }, 300);
        } else {
          console.log('[HomeScreen] Shake detected but modal already shown, success screen active, or sending - ignoring');
        }
      });
    } else {
      // Stop shake detection only if setting is disabled
      if (!shakeToSendSOS) {
        shakeDetectionService.stop();
      }
    }

    // Cleanup on unmount or when settings change
    return () => {
      // Don't stop if setting is enabled - let it run in background
      if (!shakeToSendSOS) {
        shakeDetectionService.stop();
      }
    };
  }, [sendAlert, shakeToSendSOS, isAuthenticated]);

  useEffect(() => {
    // Test vibration on component mount after a short delay
    const testTimer = setTimeout(() => {
      try {
        CustomVibration.vibrate(500);
      } catch (err) {
        console.error('Vibration test failed:', err);
      }
    }, 1000);
    
    return () => {
      clearTimeout(testTimer);
      if (countdownTimerRef.current) {
        clearTimeout(countdownTimerRef.current);
      }
      if (alertTimerRef.current) {
        clearInterval(alertTimerRef.current);
      }
    };
  }, []);

  const handleCardPress = (card: CategoryCard) => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }

    // Check if premium feature and user is not premium
    if (card.isPremium && !isPremium) {
      promptUpgrade('This safety automation is reserved for Premium members.', {
        onUpgrade: () => navigation.navigate('Billing'),
      });
      return;
    }

    triggerVibration(200);

    if (card.type === 'community') {
      const initialMessage = card.quickMessages?.[0] || '';
      if (card.contacts && card.contacts.length > 0) {
      setSelectedCommunityContact(card.contacts[0]);
      }
      setSelectedQuickMessage(initialMessage);
      setCustomCommunityMessage(initialMessage);
    } else if (card.type === 'sms') {
      setCustomFamilyMessage(card.smsBody || '');
      setFamilyActionMode('single');
      setSelectedFamilyContactId(familyContacts[0]?.id?.toString() ?? null);
    }

    setActionCard(card);
  };

  const showCategories = !isButtonPressed && !isSendingAlert && !showSuccess;

  const closeActionModal = () => {
    setActionCard(null);
    setFamilyActionMode('single');
    setSelectedFamilyContactId(familyContacts[0]?.id?.toString() ?? null);
    setIsSendingCommunityMessage(false);
    setIsSharingCurrentLocation(false);
    setIsStartingLiveShare(false);
  };
  const handleCall = async (phone?: string) => {
    if (!phone) {
      closeActionModal();
      return;
    }

    // Use direct calling (no dialer opens) if available, otherwise fallback to dialer
    try {
      await requestDirectCall(phone);
      console.log(`✅ Direct call initiated to: ${phone}`);
    } catch (error) {
      console.warn('Direct call failed, trying fallback:', error);
      // Fallback: open dialer
      try {
        await Linking.openURL(`tel:${phone}`);
      } catch (fallbackError) {
        console.warn('Failed to initiate call:', fallbackError);
        setAlertState({
          visible: true,
          title: 'Call Failed',
          message: 'Unable to place the call. Please try again from your dialer.',
          type: 'error',
        });
      }
    } finally {
      closeActionModal();
    }
  };

  const handleSendSMS = async (phone?: string | string[], message?: string) => {
    const targets = Array.isArray(phone)
      ? phone.filter((item) => !!item)
      : phone
        ? [phone]
        : [];
    if (targets.length === 0) {
      closeActionModal();
      return;
    }
    
    const messageBody = message || '';
    
    // Use direct SMS sending (no app opens) if available, otherwise fallback to SMS app
    try {
      const success = await sendSmsDirect(targets, messageBody);
      if (success) {
        console.log(`✅ Direct SMS sent to ${targets.length} recipient(s) without opening app`);
        setAlertState({
          visible: true,
          title: 'Message Sent',
          message: `Message sent to ${targets.length} contact(s)`,
          type: 'success',
        });
      }
    } catch (error) {
      console.warn('Failed to send direct SMS:', error);
      // Fallback: open SMS app
      const recipients = targets.join(',');
      const body = messageBody ? `?body=${encodeURIComponent(messageBody)}` : '';
      Linking.openURL(`sms:${recipients}${body}`).catch(() => {});
    }
    
    closeActionModal();
  };

  const ensureLocationPermission = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return true;
    }
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      {
        title: 'Location Permission',
        message: 'SafeTNet needs location access to share your live position with trusted contacts.',
        buttonPositive: 'Allow',
      },
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  };

  const getCurrentPosition = (options = {enableHighAccuracy: true, timeout: 15000}) =>
    new Promise<{latitude: number; longitude: number}>((resolve, reject) => {
      Geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => reject(error),
        options,
      );
    });

  const getEnhancedPosition = () =>
    new Promise<{latitude: number; longitude: number}>((resolve, reject) => {
      GeolocationService.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        (error) => reject(error),
        {
          enableHighAccuracy: true,
          timeout: 15000,
          forceRequestLocation: true,
          showLocationDialog: true,
        },
      );
    });

  const fetchLocationWithFallback = async () => {
    try {
      return await getCurrentPosition();
    } catch (primaryError: any) {
      if (Platform.OS === 'android') {
        try {
          return await getEnhancedPosition();
        } catch (enhancedError) {
          throw enhancedError;
        }
      }
      throw primaryError;
    }
  };

  const buildGoogleMapsUrl = (latitude: number, longitude: number) =>
    `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;

  const shareTextMessage = async (message: string) => {
    try {
      await Share.share({message});
    } catch (error) {
      console.warn('Share dialog dismissed or failed:', error);
    }
  };

  const handleLiveShareTermination = useCallback(
    (reason: 'user' | 'limit' | 'expired' | 'error', extraMessage?: string) => {
      let message = extraMessage || 'Live location sharing stopped.';
      let alertType: 'success' | 'info' = 'success';
      
      if (reason === 'limit') {
        message =
          extraMessage ||
          'You have reached the free live sharing limit. Upgrade to Premium for longer live sessions.';
        alertType = 'info';
      } else if (reason === 'expired') {
        message = extraMessage || 'Live location session has ended.';
        alertType = 'info';
      } else if (reason === 'error') {
        message = extraMessage || 'Live sharing ended due to a connection issue.';
        alertType = 'info';
      } else if (reason === 'user') {
        message = 'Live location sharing has been stopped successfully.';
        alertType = 'success';
      }
      
      setActiveLiveShare(null);
      const isForeground = AppState.currentState === 'active';
      
      if (isForeground) {
        // Use modern ThemedAlert instead of basic Alert
        setLiveShareStopAlert({
          visible: true,
          message: message,
          type: alertType,
        });
      } else {
        sendLiveShareNotification('Live location sharing', message);
      }
    },
    [],
  );

  const handleAutoLiveShareEnd = useCallback(
    (payload: {reason: 'expired' | 'error'; message?: string}) => {
      if (payload.reason === 'error') {
        handleLiveShareTermination('error', payload.message);
        return;
      }
      const reason = lastLiveSharePlan === 'free' ? 'limit' : 'expired';
      handleLiveShareTermination(reason, payload.message);
    },
    [handleLiveShareTermination, lastLiveSharePlan],
  );

  const handleShareCurrentLocation = async () => {
    if (!isAuthenticated) {
      setShowLoginModal(true);
      return;
    }
    const hasPermission = await ensureLocationPermission();
    if (!hasPermission) {
      setAlertState({
        visible: true,
        title: 'Permission needed',
        message: 'Enable location permission to share your current location.',
        type: 'warning',
      });
      return;
    }
    setIsSharingCurrentLocation(true);
    try {
      const coords = await fetchLocationWithFallback();
      const mapsUrl = buildGoogleMapsUrl(coords.latitude, coords.longitude);
      const message = `Here is my current location:\n${mapsUrl}`;
      await shareTextMessage(message);
      closeActionModal();
    } catch (error: any) {
      console.error('Unable to fetch current location:', error);
      setAlertState({
        visible: true,
        title: 'Location unavailable',
        message: 'Please ensure GPS is enabled and try again.',
        type: 'error',
      });
    } finally {
      setIsSharingCurrentLocation(false);
    }
  };

  const handleStopLiveShare = async () => {
    try {
      await stopLiveLocationShareUpdates();
      setActiveLiveShare(null);
      handleLiveShareTermination('user');
    } catch (error) {
      console.warn('Failed to stop live share session:', error);
    } finally {
      setActiveLiveShare(getActiveLiveShareSession());
    }
  };

  const handleShareLiveLocation = async () => {
    if (!isAuthenticated || !user?.id) {
      setShowLoginModal(true);
      return;
    }
    setIsStartingLiveShare(true);
    try {
      const userId = typeof user.id === 'string' ? parseInt(user.id, 10) : user.id;
      const durationMinutes = isPremium ? 1440 : 15;

      // Check location permission
      const hasPermission = await ensureLocationPermission();
      if (!hasPermission) {
        setAlertState({
          visible: true,
          title: 'Permission needed',
          message: 'Enable location permission to share your live location.',
          type: 'warning',
        });
        return;
      }

      // Get current location
      const coords = await fetchLocationWithFallback();

      // Create live location share session
      const response = await apiService.startLiveLocationShare(userId, durationMinutes);
      const session = response?.session;
      const sessionId = session?.id;

      if (!sessionId) {
        throw new Error('Could not start live share session');
      }

      const shareToken = session?.share_token || session?.shareToken;
      const sessionPlanType = session?.plan_type === 'premium' ? 'premium' : 'free';

      // Construct share URL
      const liveShareBaseUrl = getLiveShareBaseUrl();
      const normalizedBase = liveShareBaseUrl.endsWith('/')
        ? liveShareBaseUrl.slice(0, -1)
        : liveShareBaseUrl;

      const shareUrl = shareToken
        ? `${normalizedBase}/${shareToken}/`
        : buildGoogleMapsUrl(coords.latitude, coords.longitude);

      // Start live location updates
      await startLiveLocationShareUpdates(userId, sessionId, coords, {
        onSessionEnded: handleAutoLiveShareEnd,
        shareUrl,
        shareToken,
        planType: sessionPlanType,
        expiresAt: session?.expires_at || session?.expiresAt || null,
      });

      // Update UI state
      setLastLiveSharePlan(sessionPlanType);
      setActiveLiveShare(getActiveLiveShareSession());

      // Construct location message
      const locationMessage = isPremium
        ? `I'm sharing my live location. Track me here until I stop sharing:\n${shareUrl}`
        : `I'm sharing my live location for the next 15 minutes. Track me here:\n${shareUrl}`;

      // Share the message via native share sheet
      await shareTextMessage(locationMessage);
      closeActionModal();
    } catch (error: any) {
      console.error('Unable to start live sharing:', error);
      setAlertState({
        visible: true,
        title: 'Live sharing failed',
        message: error?.message || 'Please try again in a moment.',
        type: 'warning',
      });
    } finally {
      setIsStartingLiveShare(false);
    }
  };

  const handleSendCommunityMessage = async () => {
    const message = customCommunityMessage.trim() || selectedQuickMessage;
    
    if (!message) {
      setAlertState({
        visible: true,
        title: 'Message Required',
        message: 'Please enter a message to send.',
        type: 'warning',
      });
      return;
    }

    if (!user?.id) {
      setAlertState({
        visible: true,
        title: 'Error',
        message: 'User not found. Please login again.',
        type: 'error',
      });
      return;
    }

    // Get available chat groups (community contacts are already chat groups)
    const availableGroups =
      actionCard && actionCard.contacts && actionCard.contacts.length > 0
        ? actionCard.contacts
        : communityContacts;

    if (!availableGroups.length) {
      setAlertState({
        visible: true,
        title: 'No Groups Available',
        message: 'Create a community group first to send messages.',
        type: 'warning',
      });
      return;
    }

    setIsSendingCommunityMessage(true);

    try {
      // If "All Groups" is selected (selectedCommunityContact is null), send to all groups
      if (!selectedCommunityContact) {
        if (availableGroups.length === 0) {
          setAlertState({
            visible: true,
            title: 'No Groups Available',
            message: 'Create a community group first to send messages.',
            type: 'warning',
          });
          setIsSendingCommunityMessage(false);
          return;
        }

        // Send to all groups
        const sendPromises = availableGroups.map(async (group: any) => {
          if (group?.id) {
            const groupId = parseInt(group.id, 10);
            return apiService.sendChatMessage(Number(user.id), groupId, message);
          }
          return Promise.resolve();
        });

        await Promise.all(sendPromises);
        
        setAlertState({
          visible: true,
          title: 'Messages Sent',
          message: `Message sent to all ${availableGroups.length} group(s)`,
          type: 'success',
        });
        closeActionModal();
        return;
      }

      // If a specific group is selected, send to that group only
      if (selectedCommunityContact && selectedCommunityContact.id) {
        const groupId = parseInt(selectedCommunityContact.id, 10);
        await apiService.sendChatMessage(Number(user.id), groupId, message);
        setAlertState({
          visible: true,
          title: 'Message Sent',
          message: `Message sent to ${selectedCommunityContact.label}`,
          type: 'success',
        });
        closeActionModal();
        return;
      }
    } catch (error: any) {
      console.error('Error sending community message:', error);
      setAlertState({
        visible: true,
        title: 'Error',
        message: error.message || 'Failed to send message. Please try again.',
        type: 'error',
      });
    } finally {
      setIsSendingCommunityMessage(false);
    }
  };

  const selectedFamilyContact = familyContacts.find(
    (contact) => contact.id?.toString() === selectedFamilyContactId,
  );

  const handleFamilyCallAction = () => {
    if (!selectedFamilyContact || !selectedFamilyContact.phone) {
      setAlertState({
        visible: true,
        title: 'Select a contact',
        message: 'Please choose a family contact before calling.',
        type: 'warning',
      });
      return;
    }
    handleCall(selectedFamilyContact.phone!);
  };

  const handleFamilyMessageAction = () => {
    const messageBody = customFamilyMessage.trim() || actionCard?.smsBody || DEFAULT_SOS_TEMPLATE;
    if (familyActionMode === 'single') {
      if (!selectedFamilyContact || !selectedFamilyContact.phone) {
        setAlertState({
          visible: true,
          title: 'Select a contact',
          message: 'Please choose a family contact before messaging.',
          type: 'warning',
        });
        return;
      }
      handleSendSMS(selectedFamilyContact.phone, messageBody);
      return;
    }

    if (!familyContacts.length) {
      setAlertState({
        visible: true,
        title: 'No contacts',
        message: 'Please add at least one family contact first.',
        type: 'warning',
      });
      return;
    }

    const phones = familyContacts
      .map((contact) => contact.phone)
      .filter((phone) => !!phone);
    handleSendSMS(phones, messageBody);
  };

  const renderActionContent = () => {
    if (!actionCard) {
      return null;
    }

    const contactsLoading = !contactsInitialized;
    const hasFamilyContacts = familyContacts.length > 0;

    const cancelButtonStyle = [
      styles.modalButton,
      {
        backgroundColor: softSurface,
        borderColor: withAlpha(colors.border, isDarkMode ? 0.7 : 1),
      },
    ];

    const cancelButtonTextStyle = [styles.modalCancelText, {color: colors.text}];

    const primaryButtonStyle = [
      styles.modalButton,
      {backgroundColor: colors.primary, borderColor: colors.primary},
    ];

    if (actionCard.key === 'family') {
      const modeOptions: Array<{key: 'single' | 'all'; label: string}> = [
        {key: 'single', label: 'Single contact'},
        {key: 'all', label: 'All contacts'},
      ];

      return (
        <>
          <View style={styles.actionHeader}>
            <MaterialIcons name={actionCard.icon} size={32} color={actionCard.iconColor} />
            <Text style={[styles.actionTitle, {color: colors.text}]}>{actionCard.title}</Text>
          </View>
          <Text style={[styles.actionDescription, {color: mutedTextColor}]}>
            Choose who should receive your update.
          </Text>
          <View style={styles.familyModeRow}>
            {modeOptions.map((option) => {
              const isActive = familyActionMode === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  style={[
                    styles.familyModeOption,
                    {borderColor: withAlpha(colors.border, isDarkMode ? 0.6 : 1)},
                    isActive && {backgroundColor: colors.primary, borderColor: colors.primary},
                  ]}
                  onPress={() => {
                    setFamilyActionMode(option.key);
                    if (option.key === 'single' && familyContacts.length > 0) {
                      setSelectedFamilyContactId(familyContacts[0].id?.toString() ?? null);
                    }
                  }}
                  activeOpacity={0.8}>
                  <Text
                    style={[
                      styles.familyModeLabel,
                      {color: isActive ? '#FFFFFF' : colors.text},
                    ]}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {contactsLoading ? (
            <Text style={[styles.familyAllNote, {color: mutedTextColor}]}>Loading contacts…</Text>
          ) : familyActionMode === 'single' ? (
            hasFamilyContacts ? (
              <View style={styles.familyList}>
                {familyContacts.map((contact) => {
                  const contactId = contact.id?.toString() ?? '';
                  const isSelected = selectedFamilyContactId === contactId;
                  return (
                    <TouchableOpacity
                      key={contactId || contact.phone}
                      style={[
                        styles.familyContactRow,
                        {
                          borderColor: withAlpha(colors.border, isDarkMode ? 0.6 : 1),
                          backgroundColor: isSelected
                            ? withAlpha(colors.primary, isDarkMode ? 0.35 : 0.15)
                            : inputSurface,
                        },
                      ]}
                      onPress={() => setSelectedFamilyContactId(contactId)}
                      activeOpacity={0.8}>
                      <View>
                        <Text style={[styles.familyContactName, {color: colors.text}]}>
                          {contact.name || 'Unknown'}
                        </Text>
                        <Text style={[styles.familyContactPhone, {color: mutedTextColor}]}>
                          {contact.phone || 'No number'}
                        </Text>
                      </View>
                      {isSelected && (
                        <MaterialIcons
                          name="check-circle"
                          size={20}
                          color={isDarkMode ? '#A7F3D0' : '#047857'}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <Text style={[styles.emptyContactsText, {color: mutedTextColor}]}>
                No family contacts found. Add one in Emergency Contacts.
              </Text>
            )
          ) : hasFamilyContacts ? (
            <Text style={[styles.familyAllNote, {color: mutedTextColor}]}>
              All {familyContacts.length} contacts will receive the SMS.
            </Text>
          ) : (
            <Text style={[styles.emptyContactsText, {color: mutedTextColor}]}>
              No family contacts found. Add one in Emergency Contacts.
            </Text>
          )}

          <TextInput
            style={[
              styles.actionInput,
              {
                marginTop: 16,
                backgroundColor: inputSurface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            multiline
            numberOfLines={3}
            value={customFamilyMessage}
            onChangeText={setCustomFamilyMessage}
            placeholder="Type your emergency message"
            placeholderTextColor={placeholderColor}
          />

          <View style={styles.wideButtonColumn}>
            {familyActionMode === 'single' && (
              <TouchableOpacity
                style={[styles.wideButton, styles.wideButtonPrimary]}
                onPress={handleFamilyCallAction}
                activeOpacity={0.85}>
                <MaterialIcons name="call" size={20} color="#FFFFFF" />
                <Text style={[styles.wideButtonText, styles.wideButtonTextPrimary]}>Call</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonPrimary]}
              onPress={handleFamilyMessageAction}
              activeOpacity={0.85}>
              <MaterialIcons name="sms" size={20} color="#FFFFFF" />
              <Text style={[styles.wideButtonText, styles.wideButtonTextPrimary]}>
                {familyActionMode === 'single' ? 'Message' : 'Message all'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonGhost, {borderColor: withAlpha(colors.border, isDarkMode ? 0.6 : 1)}]}
              onPress={closeActionModal}
              activeOpacity={0.8}>
              <MaterialIcons name="close" size={20} color={colors.text} />
              <Text style={[styles.wideButtonText, {color: colors.text}]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (actionCard.key === 'security') {
      return (
        <>
          <View style={styles.actionHeader}>
            <MaterialIcons name={actionCard.icon} size={32} color={actionCard.iconColor} />
            <Text style={[styles.actionTitle, {color: colors.text}]}>{actionCard.title}</Text>
          </View>
          <Text style={[styles.actionDescription, {color: mutedTextColor}]}>
            Choose how you want to reach the security team.
          </Text>
          <View style={styles.wideButtonColumn}>
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonPrimary]}
              onPress={() => {
                handleCall(actionCard.phone);
              }}
              activeOpacity={0.85}>
              <MaterialIcons name="call" size={20} color="#FFFFFF" />
              <Text style={[styles.wideButtonText, styles.wideButtonTextPrimary]}>Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonPrimary]}
              onPress={() => handleSendSMS(actionCard.phone, actionCard.smsBody)}
              activeOpacity={0.85}>
              <MaterialIcons name="sms" size={20} color="#FFFFFF" />
              <Text style={[styles.wideButtonText, styles.wideButtonTextPrimary]}>Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonGhost, {borderColor: withAlpha(colors.border, isDarkMode ? 0.6 : 1)}]}
              onPress={closeActionModal}
              activeOpacity={0.8}>
              <MaterialIcons name="close" size={20} color={colors.text} />
              <Text style={[styles.wideButtonText, {color: colors.text}]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (actionCard.key === 'location') {
      return (
        <>
          <View style={styles.actionHeader}>
            <MaterialIcons name={actionCard.icon} size={32} color={actionCard.iconColor} />
            <Text style={[styles.actionTitle, {color: colors.text}]}>{actionCard.title}</Text>
          </View>
          <Text style={[styles.actionDescription, {color: mutedTextColor}]}>
            Choose how you’d like to share your location with trusted contacts.
          </Text>
          <View style={styles.wideButtonColumn}>
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonPrimary]}
              onPress={handleShareCurrentLocation}
              activeOpacity={0.85}
              disabled={isSharingCurrentLocation}>
              {isSharingCurrentLocation ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <MaterialIcons name='my-location' size={20} color="#FFFFFF" />
              )}
              <Text style={[styles.wideButtonText, styles.wideButtonTextPrimary]}>
                Share current location
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonPrimary, {backgroundColor: '#1F2937'}]}
              onPress={handleShareLiveLocation}
              activeOpacity={0.85}
              disabled={isStartingLiveShare}>
              {isStartingLiveShare ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <MaterialIcons name='share-location' size={20} color="#FFFFFF" />
              )}
              <Text style={[styles.wideButtonText, styles.wideButtonTextPrimary]}>
                Share live location
              </Text>
            </TouchableOpacity>
            {activeLiveShare && (
              <TouchableOpacity
                style={[styles.wideButton, styles.wideButtonPrimary, {backgroundColor: '#DC2626', borderColor: '#DC2626'}]}
                onPress={handleStopLiveShare}
                activeOpacity={0.85}>
                <MaterialIcons name='stop-circle' size={20} color="#FFFFFF" />
                <Text style={[styles.wideButtonText, styles.wideButtonTextPrimary]}>
                  Stop live sharing
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonGhost, {borderColor: withAlpha(colors.border, isDarkMode ? 0.6 : 1)}]}
              onPress={closeActionModal}
              activeOpacity={0.85}>
              <MaterialIcons name="close" size={20} color={colors.text} />
              <Text style={[styles.wideButtonText, {color: colors.text}]}>Cancel</Text>
            </TouchableOpacity>
            {!isPremium && (
              <Text style={[styles.helperText, {color: subtleTextColor}]}>
                Free plan shares live location for 15 minutes. Upgrade for unlimited live tracking.
              </Text>
            )}
          </View>
        </>
      );
    }

    if (actionCard.type === 'call') {
      return (
        <>
          <View style={styles.actionHeader}>
            <MaterialIcons name={actionCard.icon} size={32} color={actionCard.iconColor} />
            <Text style={[styles.actionTitle, {color: colors.text}]}>{actionCard.title}</Text>
          </View>
          <Text style={[styles.actionDescription, {color: mutedTextColor}]}>Are you sure you want to call {actionCard.title.toLowerCase()} at {actionCard.phone}?</Text>
          <View style={styles.actionButtonRow}>
            <TouchableOpacity style={cancelButtonStyle} onPress={closeActionModal} activeOpacity={0.7}>
              <Text style={cancelButtonTextStyle}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={primaryButtonStyle}
              onPress={() => {
                handleCall(actionCard.phone);
              }}
              activeOpacity={0.7}>
              <Text style={styles.primaryButtonText}>Call</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (actionCard.type === 'sms') {
      return (
        <>
          <View style={styles.actionHeader}>
            <MaterialIcons name={actionCard.icon} size={32} color={actionCard.iconColor} />
            <Text style={[styles.actionTitle, {color: colors.text}]}>{actionCard.title}</Text>
          </View>
          <Text style={[styles.actionDescription, {color: mutedTextColor}]}>Send a quick update to your family contact.</Text>
          <TextInput
            style={[
              styles.actionInput,
              {
                backgroundColor: inputSurface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            multiline
            numberOfLines={3}
            value={customFamilyMessage}
            onChangeText={setCustomFamilyMessage}
            placeholder="Type your emergency message"
            placeholderTextColor={placeholderColor}
          />
          <View style={styles.wideButtonColumn}>
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonPrimary]}
              onPress={() => handleSendSMS(actionCard.phone, customFamilyMessage.trim() || actionCard.smsBody)}
              activeOpacity={0.85}>
              <MaterialIcons name="sms" size={20} color="#FFFFFF" />
              <Text style={[styles.wideButtonText, styles.wideButtonTextPrimary]}>Send Message</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.wideButton, styles.wideButtonGhost, {borderColor: withAlpha(colors.border, isDarkMode ? 0.6 : 1)}]}
              onPress={closeActionModal}
              activeOpacity={0.8}>
              <MaterialIcons name="close" size={20} color={colors.text} />
              <Text style={[styles.wideButtonText, {color: colors.text}]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    if (actionCard.type === 'community') {
      const communityOptions =
        actionCard.contacts && actionCard.contacts.length > 0
          ? actionCard.contacts
          : communityContacts;
      const hasCommunityOptions = communityOptions.length > 0;

      return (
        <>
          <View style={styles.actionHeader}>
            <MaterialIcons name={actionCard.icon} size={32} color={actionCard.iconColor} />
            <Text style={[styles.actionTitle, {color: colors.text}]}>{actionCard.title}</Text>
          </View>
          <Text style={[styles.actionDescription, {color: mutedTextColor}]}>Choose a community group to send your message.</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.communityChipRow}>
            {communityLoading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : hasCommunityOptions ? (
              <>
                <TouchableOpacity
                  style={[
                    styles.communityChip,
                    {borderColor: '#D1D5DB'},
                    !selectedCommunityContact && styles.communityChipActive,
                  ]}
                  onPress={() => setSelectedCommunityContact(null)}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.communityChipText,
                      !selectedCommunityContact && styles.communityChipTextActive,
                    ]}>
                    All Groups
                  </Text>
                </TouchableOpacity>
                {communityOptions.map((contact) => {
                  const isActive = selectedCommunityContact && contact.id === selectedCommunityContact.id;
                  return (
                    <TouchableOpacity
                      key={contact.id}
                      style={[
                        styles.communityChip,
                        {borderColor: '#D1D5DB'},
                        isActive && styles.communityChipActive,
                      ]}
                      onPress={() => {
                        setSelectedCommunityContact(contact);
                      }}
                      activeOpacity={0.7}>
                      <Text
                        style={[
                          styles.communityChipText,
                          isActive && styles.communityChipTextActive,
                        ]}>
                        {contact.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <Text style={[styles.emptyContactsText, {color: mutedTextColor}]}>
                No community groups available. Create a group first.
              </Text>
            )}
          </ScrollView>
          <Text style={[styles.quickTitle, {color: mutedTextColor}]}>Quick messages</Text>
          <View
            style={[
              styles.quickMessagesBox,
              {backgroundColor: quickBoxBackground, borderColor: quickBorderColor},
            ]}>
            {actionCard.quickMessages.map((message) => {
              const isActive = message === selectedQuickMessage;
              return (
                <TouchableOpacity
                  key={message}
                  style={[
                    styles.quickMessageButton,
                    {
                      backgroundColor: isActive ? colors.primary : colors.card,
                      borderColor: isActive ? colors.primary : quickBorderColor,
                    },
                  ]}
                  onPress={() => {
                    setSelectedQuickMessage(message);
                    setCustomCommunityMessage(message);
                  }}
                  activeOpacity={0.7}>
                  <Text
                    style={[
                      styles.quickMessageText,
                      {color: isActive ? '#FFFFFF' : colors.text},
                    ]}>
                    {message}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <Text style={[styles.quickTitle, {marginTop: 16, color: mutedTextColor}]}>
            Custom message
          </Text>
          <TextInput
            style={[
              styles.actionInput,
              {
                marginTop: 8,
                backgroundColor: inputSurface,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            multiline
            numberOfLines={3}
            value={customCommunityMessage}
            onChangeText={(text) => {
              setCustomCommunityMessage(text);
              setSelectedQuickMessage(text);
            }}
            placeholder="Custom message to your community"
            placeholderTextColor={placeholderColor}
          />
          <View style={styles.communityButtonRow}>
            <TouchableOpacity
              style={[styles.communityButton, styles.communityGhostButton, {borderColor: withAlpha(colors.border, isDarkMode ? 0.6 : 1)}]}
              onPress={closeActionModal}
              activeOpacity={0.8}>
              <MaterialIcons name="close" size={20} color={colors.text} />
              <Text style={[styles.communityButtonText, {color: colors.text}]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.communityButton,
                styles.communityPrimaryButton,
                isSendingCommunityMessage && styles.communityButtonDisabled,
              ]}
              onPress={handleSendCommunityMessage}
              activeOpacity={0.85}
              disabled={isSendingCommunityMessage}>
              {isSendingCommunityMessage ? (
                <ActivityIndicator size="small" color="#FFFFFF" style={{marginRight: 8}} />
              ) : (
                <MaterialIcons name="send" size={20} color="#FFFFFF" />
              )}
              <Text style={[styles.communityButtonText, styles.communityButtonTextPrimary]}>
                {isSendingCommunityMessage ? 'Sending...' : 'Send'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      );
    }

    return null;
  };

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}> 
      {/* Top SOS Section */}
      <View style={styles.sosSection}>
        {/* Fixed position SOS Button */}
        <TouchableOpacity
          style={[
            styles.sosButton,
            {
              borderColor: colors.border,
              shadowColor: cardShadowColor,
            },
          ]}
          onPressIn={handleSOSPressIn}
          onPressOut={handleSOSPressOut}
          activeOpacity={0.8}
          disabled={showSuccess}>
          <Animated.Text
            style={[
              styles.sosText,
              {
                transform: [{scale: isSendingAlert && countdown !== null ? countdownAnim : 1}],
              },
            ]}>
            SOS
          </Animated.Text>
        </TouchableOpacity>

        {/* Fixed position text container below button */}
        <View style={styles.messageContainer}>
          {!isSendingAlert && !showSuccess && !isButtonPressed && (
            <Text style={[styles.instructionText, {color: colors.text}]}>Press and hold to send an alert.</Text>
          )}

          {isSendingAlert && !showSuccess && countdown !== null && countdown > 0 && (
            <>
              <Text style={[styles.countdownLabel, {color: colors.text}]}>
                SOS will be sent in
            </Text>
              <Animated.Text 
                style={[
                  styles.countdownNumber, 
                  {color: '#B91C1C'},
                  {
                    transform: [{scale: countdownAnim}],
                  }
                ]}>
                {countdown}
              </Animated.Text>
            </>
          )}
          
          {isSendingAlert && !showSuccess && countdown === 0 && (
            <Text style={[styles.alertMessageText, {color: '#B91C1C'}]}>Sending alert...</Text>
          )}
        </View>
      </View>


      {/* Success Screen Modal */}
      {showSuccessScreen && (
        <Modal
          visible={showSuccessScreen}
          transparent={false}
          animationType="fade"
          onRequestClose={handleBackFromSuccess}>
          <View style={[styles.successScreenContainer, {backgroundColor: colors.background}]}>
            <View style={styles.successScreenContent}>
              <View style={[styles.successIconContainer, {backgroundColor: '#ECFDF5'}]}>
                <MaterialIcons name="check-circle" size={80} color="#10B981" />
              </View>
              <Text style={[styles.successScreenTitle, {color: colors.text}]}>
                SOS Alert Sent
              </Text>
              <Text style={[styles.successScreenMessage, {color: colors.text}]}>
                Your SOS alert has been sent successfully.
              </Text>
              {(() => {
                const {contacts} = useContactStore.getState();
                const hasFamilyContacts = contacts.length > 0;
                
                if (!hasFamilyContacts) {
                  return (
                    <>
                      <Text style={[styles.successScreenSubMessage, {color: mutedTextColor}]}>
                        Since you don't have family contacts added, your SOS has been sent to:
                      </Text>
                      <View style={styles.recipientList}>
                        <View style={styles.recipientItem}>
                          <MaterialIcons name="local-police" size={20} color={colors.primary} />
                          <Text style={[styles.recipientText, {color: colors.text}]}>Police</Text>
            </View>
                        <View style={styles.recipientItem}>
                          <MaterialIcons name="security" size={20} color={colors.primary} />
                          <Text style={[styles.recipientText, {color: colors.text}]}>Security Officer</Text>
        </View>
      </View>
                      <Text style={[styles.successScreenHelpText, {color: mutedTextColor}]}>
                        Help is on the way. Stay calm and wait for assistance.
                      </Text>
                    </>
                  );
                } else {
                  return (
                    <>
                      <Text style={[styles.successScreenSubMessage, {color: mutedTextColor}]}>
                        Help is on the way. Your family contacts and emergency services have been notified.
                      </Text>
                      <Text style={[styles.successScreenHelpText, {color: mutedTextColor}]}>
                        Stay calm and wait for assistance. Your location has been shared with responders.
                      </Text>
                    </>
                  );
                }
              })()}
              <TouchableOpacity
                style={[styles.backButton, {backgroundColor: colors.primary}]}
                onPress={handleBackFromSuccess}
                activeOpacity={0.8}>
                <Text style={styles.backButtonText}>Back to Home</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* Bottom Categories Section - Hide when countdown or alert is active */}
      {showCategories && (
        <View style={styles.categoriesSection}>
          {cardRows.map((rowCards, rowIndex) => (
            <View key={rowIndex} style={styles.row}>
              {rowCards.map((card) => (
                <TouchableOpacity
                  key={card.key}
                  style={[
                    styles.categoryCard,
                    {
                      backgroundColor: isDarkMode ? withAlpha(card.iconColor, 0.15) : card.lightBackground,
                      borderColor: isDarkMode ? withAlpha(card.iconColor, 0.35) : card.lightBorder,
                      shadowColor: cardShadowColor,
                    },
                  ]}
                  onPress={() => handleCardPress(card)}
                  activeOpacity={0.85}>
                  <View
                    style={[
                      styles.cardIconContainer,
                      {
                        backgroundColor: isDarkMode
                          ? withAlpha(card.iconColor, 0.25)
                          : 'rgba(255,255,255,0.75)',
                      },
                    ]}>
                    <MaterialIcons name={card.icon} size={20} color={card.iconColor} />
                  </View>
                  <View style={styles.cardTextContainer}>
                    <Text style={[styles.cardTitle, {color: colors.text}]}>{card.title}</Text>
                    {card.isPremium && !isPremium && (
                      <View style={styles.premiumBadge}>
                        <MaterialIcons name="workspace-premium" size={12} color="#F59E0B" />
                        <Text style={styles.premiumBadgeText}>Premium</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
              {rowCards.length < 2 && <View style={{width: CARD_WIDTH}} />}
            </View>
          ))}
        </View>
      )}

      {/* Footer with Logo - Hide when countdown or alert is active */}
      {showCategories && (
        <View style={styles.footer}>
          <MaterialIcons name="security" size={20} color={colors.notification} />
          <Text style={[styles.footerText, {color: colors.notification}]}>Safe T Net</Text>
        </View>
      )}

      <Modal
        visible={actionCard !== null}
        transparent
        animationType="fade"
        onRequestClose={closeActionModal}>
        <View style={[styles.actionOverlay, {backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)'}]}>
          <View style={[styles.actionContainer, {backgroundColor: colors.card, borderColor: colors.border}]}>{renderActionContent()}</View>
        </View>
      </Modal>

      {/* Modern Login Modal */}
      <Modal
        visible={showLoginModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowLoginModal(false)}>
        <View style={[styles.modalOverlay, {backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.5)'}]}>
          <View style={[styles.modalContent, {backgroundColor: colors.card, borderColor: colors.border}]}>
            <View
              style={[
                styles.modalIconContainer,
                {backgroundColor: withAlpha(colors.primary, isDarkMode ? 0.2 : 0.1)},
              ]}>
              <MaterialIcons name="lock" size={48} color={colors.primary} />
            </View>
            <Text style={[styles.modalTitle, {color: colors.text}]}>Login Required</Text>
            <Text style={[styles.modalMessage, {color: colors.notification}]}>Login to use this feature</Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalCancelButton,
                  {
                    backgroundColor: softSurface,
                    borderColor: withAlpha(colors.border, isDarkMode ? 0.7 : 1),
                  },
                ]}
                onPress={() => setShowLoginModal(false)}
                activeOpacity={0.7}>
                <Text style={[styles.modalCancelText, {color: colors.text}]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalLoginButton, {backgroundColor: colors.primary}]}
                onPress={async () => {
                  setShowLoginModal(false);
                  // Navigate to Login screen by clearing auth state
                  // This will switch to AuthNavigator which starts at Login screen
                  const {logout} = useAuthStore.getState();
                  await logout();
                }}
                activeOpacity={0.7}>
                <Text style={styles.modalLoginText}>Login</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Themed Alert Modal */}
      <ThemedAlert
        visible={alertState.visible}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
        buttons={[
          {
            text: 'OK',
            onPress: () => setAlertState({...alertState, visible: false}),
          },
        ]}
        onDismiss={() => setAlertState({...alertState, visible: false})}
      />
      
      {/* Modern Live Share Stop Alert */}
      <ThemedAlert
        visible={liveShareStopAlert.visible}
        title="Live Location Sharing"
        message={liveShareStopAlert.message}
        type={liveShareStopAlert.type}
        buttons={[
          {
            text: 'Got it',
            onPress: () => setLiveShareStopAlert({...liveShareStopAlert, visible: false}),
            style: 'default',
          },
        ]}
        onDismiss={() => setLiveShareStopAlert({...liveShareStopAlert, visible: false})}
      />

      {/* Modern Shake SOS Confirmation Modal */}
      <Modal
        visible={showShakeSOSModal && !showSuccessScreen}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          if (!isSendingSOSFromModal) {
            shakeSOSModalShownRef.current = true; // Mark as shown so it won't show again
            setShowShakeSOSModal(false);
          }
        }}>
        <View style={[styles.modalOverlay, {backgroundColor: isDarkMode ? 'rgba(0, 0, 0, 0.8)' : 'rgba(0, 0, 0, 0.6)'}]}>
          <View style={[styles.modalContent, {backgroundColor: colors.card, borderColor: colors.border}]}>
            <View
              style={[
                styles.modalIconContainer,
                {backgroundColor: withAlpha('#B91C1C', isDarkMode ? 0.2 : 0.1)},
              ]}>
              <MaterialIcons name="emergency" size={56} color="#B91C1C" />
            </View>
            <Text style={[styles.modalTitle, {color: colors.text}]}>Shake Detected</Text>
            <Text style={[styles.modalMessage, {color: colors.notification}]}>
              Do you want to send SOS alert?
            </Text>
            <Text style={[styles.modalSubMessage, {color: mutedTextColor}]}>
              This will trigger the same countdown and alert sequence as the SOS button.
            </Text>
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalCancelButton,
                  {borderColor: colors.border, backgroundColor: softSurface},
                ]}
                onPress={() => {
                  shakeSOSModalShownRef.current = false;
                  setShowShakeSOSModal(false);
                }}
                activeOpacity={0.7}>
                <Text style={[styles.modalCancelText, {color: colors.text}]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalSOSButton, 
                  {backgroundColor: isSendingSOSFromModal ? '#9B1A1A' : '#B91C1C'},
                  isSendingSOSFromModal && {opacity: 0.8}
                ]}
                onPress={async () => {
                  if (isSendingSOSFromModal) return; // Prevent multiple clicks
                  
                  setIsSendingSOSFromModal(true);
                  // Clear intent and ref to prevent modal from showing again
                  shakeSOSModalShownRef.current = true; // Mark as shown so it won't show again
                  try {
                    const {NativeModules} = require('react-native');
                    const IntentModule = NativeModules.IntentModule;
                    if (IntentModule && typeof IntentModule.clearIntent === 'function') {
                      await IntentModule.clearIntent();
                    }
                  } catch (e) {
                    console.warn('Could not clear intent:', e);
                  }
                  // Directly send SOS without countdown
                  await sendAlert();
                  // Modal will be closed when success screen appears
                }}
                activeOpacity={0.8}
                disabled={isSendingSOSFromModal}>
                {isSendingSOSFromModal ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" style={{marginRight: 8}} />
                    <Text style={styles.modalSOSText}>Sending...</Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="send" size={20} color="#FFFFFF" style={{marginRight: 8}} />
                    <Text style={styles.modalSOSText}>Send SOS</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const CARD_HORIZONTAL_PADDING = 20;
const CARD_GAP = 12;
const CARD_WIDTH = (width - CARD_HORIZONTAL_PADDING * 2 - CARD_GAP) / 2;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    justifyContent: 'space-between',
  },
  sosSection: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'relative',
    paddingTop: 60,
  },
  sosButton: {
    width: width * 0.5,
    height: width * 0.5,
    borderRadius: (width * 0.5) / 2,
    backgroundColor: '#B91C1C',
    borderWidth: 4,
    borderColor: '#9CA3AF',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  messageContainer: {
    width: '100%',
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 20,
  },
  sosText: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: 'bold',
  },
  instructionText: {
    color: '#374151',
    fontSize: 16,
    textAlign: 'center',
  },
  successMessageText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
    textAlign: 'center',
  },
  alertMessageText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#B91C1C',
    textAlign: 'center',
  },
  countdownLabel: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  countdownNumber: {
    fontSize: 72,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
  },
  countdownLabel: {
    fontSize: 18,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 20,
    marginBottom: 8,
  },
  countdownNumber: {
    fontSize: 72,
    fontWeight: 'bold',
    textAlign: 'center',
    letterSpacing: 2,
  },
  successContainer: {
    alignItems: 'center',
  },
  quoteText: {
    fontSize: 14,
    fontStyle: 'italic',
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
  },
  successScreenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successScreenContent: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
  },
  successIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  successScreenTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 16,
  },
  successScreenMessage: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  successScreenSubMessage: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  successScreenHelpText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 48,
    lineHeight: 20,
    fontStyle: 'italic',
  },
  backButton: {
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  recipientList: {
    marginVertical: 16,
    gap: 12,
  },
  recipientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
  },
  recipientText: {
    fontSize: 16,
    fontWeight: '600',
  },
  categoriesSection: {
    paddingHorizontal: CARD_HORIZONTAL_PADDING,
    paddingBottom: 32,
    gap: CARD_GAP,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: CARD_GAP,
  },
  categoryCard: {
    width: CARD_WIDTH,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.07,
    shadowRadius: 2.5,
    elevation: 2,
    minHeight: 88,
  },
  cardIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  premiumBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  premiumBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#F59E0B',
    marginLeft: 4,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 16,
    flexShrink: 1,
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 16,
  },
  actionOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionContainer: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 12,
  },
  actionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  actionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  actionDescription: {
    fontSize: 14,
    color: '#4B5563',
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  actionInput: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    padding: 12,
    minHeight: 80,
    textAlignVertical: 'top',
    fontSize: 14,
    color: '#111827',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F3F4F6',
  },
  chipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  chipText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  communityChipRow: {
    paddingVertical: 12,
    gap: 8,
  },
  communityChip: {
    borderWidth: 1.5,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
    backgroundColor: '#F3F4F6',
  },
  communityChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  communityChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  communityChipTextActive: {
    color: '#FFFFFF',
  },
  quickTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
  },
  quickMessagesBox: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    padding: 10,
    gap: 8,
  },
  quickMessageButton: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  quickMessageText: {
    fontSize: 13,
    fontWeight: '600',
  },
  communityButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  communityButton: {
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
  },
  communityGhostButton: {
    backgroundColor: 'transparent',
  },
  communityPrimaryButton: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  communityButtonDisabled: {
    opacity: 0.6,
  },
  communityButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  communityButtonTextPrimary: {
    color: '#FFFFFF',
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
  },
  primaryButton: {
    backgroundColor: '#2563EB',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  familyModeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  familyModeOption: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  familyModeLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  familyList: {
    marginTop: 16,
    gap: 10,
  },
  familyContactRow: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  familyContactName: {
    fontSize: 15,
    fontWeight: '600',
  },
  familyContactPhone: {
    fontSize: 13,
    marginTop: 2,
  },
  familyAllNote: {
    marginTop: 16,
    fontSize: 13,
  },
  wideButtonColumn: {
    gap: 12,
    marginTop: 16,
  },
  wideButton: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1,
  },
  wideButtonPrimary: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  wideButtonGhost: {
    backgroundColor: 'transparent',
  },
  wideButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  wideButtonTextPrimary: {
    color: '#FFFFFF',
  },
  helperText: {
    fontSize: 13,
    textAlign: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingBottom: 24,
  },
  footerText: {
    color: '#374151',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    letterSpacing: -0.2,
    marginLeft: 8,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    borderRadius: 20,
    padding: 24,
    width: '85%',
    maxWidth: 400,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  modalMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  modalLoginButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    backgroundColor: '#2563EB',
    alignItems: 'center',
  },
  modalLoginText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  modalSubMessage: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 8,
    lineHeight: 20,
  },
  modalSOSButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    minWidth: 100,
    shadowColor: '#B91C1C',
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  modalSOSText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

export default HomeScreen;
