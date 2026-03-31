import React, {useState, useEffect, useCallback, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  PermissionsAndroid,
  Platform,
  Dimensions,
  Linking,
  ScrollView,
} from 'react-native';
import Geolocation from '@react-native-community/geolocation';
import GeolocationService from 'react-native-geolocation-service';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {useTheme} from '@react-navigation/native';
import {useAuthStore} from '../../stores/authStore';
import {apiService} from '../../services/apiService';
import {useSubscription} from '../../lib/hooks/useSubscription';
import {ThemedAlert} from '../../components/common/ThemedAlert';
import LeafletMap from '../../components/maps/LeafletMap';
import {LocationDisclosureModal} from '../../components/common/LocationDisclosureModal';
import {permissionService} from '../../services/permissionService';

Geolocation.setRNConfiguration({
  skipPermissionRequests: false,
  authorizationLevel: 'whenInUse',
});

interface Location {
  latitude: number;
  longitude: number;
}

const formatRelativeTime = (timestamp?: string | null) => {
  if (!timestamp) {
    return 'No live ping';
  }

  const diffMs = Date.now() - new Date(timestamp).getTime();
  if (diffMs < 60000) {
    return 'moments ago';
  }
  if (diffMs < 3600000) {
    const minutes = Math.round(diffMs / 60000);
    return `${minutes} min ago`;
  }
  const hours = Math.round(diffMs / 3600000);
  return `${hours} hr${hours > 1 ? 's' : ''} ago`;
};

const AreaMapScreen = () => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {colors} = theme;
  const user = useAuthStore((state) => state.user);
  const {isPremium} = useSubscription();
  
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);
  const [geofences, setGeofences] = useState<any[]>([]);
  const [securityOfficers, setSecurityOfficers] = useState<any[]>([]);
  const [loadingOfficers, setLoadingOfficers] = useState(false);
  const [locationProvider, setLocationProvider] = useState<'gps' | 'enhanced' | null>(null);
  const [showLocationDisclosure, setShowLocationDisclosure] = useState(false);
  const [pendingLocationAction, setPendingLocationAction] = useState<(() => void) | null>(null);
  const [pollingInterval, setPollingInterval] = useState<any>(null);
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{
    title: string;
    message: string;
    type: 'error' | 'success' | 'info' | 'warning';
    buttons: Array<{text: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive'}>;
  }>({
    title: '',
    message: '',
    type: 'info',
    buttons: [],
  });

  const locationRequestOptions = useMemo(() => ({
    enableHighAccuracy: true,
    timeout: 25000,
    maximumAge: 15000,
    distanceFilter: 0,
  }), []);

  const loadSecurityOfficers = useCallback(async (location: Location, isInitialLoad = false) => {
    if (!location) return;
    // Only show loading on first load, not on polling updates
    if (isInitialLoad) {
      setLoadingOfficers(true);
    }
    try {
      const response = await apiService.getSecurityOfficers(location.latitude, location.longitude);
      const officers = Array.isArray(response?.officers) ? response.officers : [];
      setSecurityOfficers(officers);
    } catch (error) {
      console.error('Failed to load security officers:', error);
      // Don't clear officers on error, keep showing last known data
    } finally {
      setLoadingOfficers(false);
    }
  }, []);

  // Poll for live location updates every 5 seconds (reduced frequency for better performance)
  useEffect(() => {
    if (!userLocation) return;
    
    // Initial load with loading indicator
    loadSecurityOfficers(userLocation, true);
    
    // Then poll every 5 seconds (reduced from 2s to reduce load) without loading indicator
    const interval = setInterval(() => {
      loadSecurityOfficers(userLocation, false);
    }, 5000);
    
    setPollingInterval(interval);
    
    return () => {
      clearInterval(interval);
    };
  }, [userLocation?.latitude, userLocation?.longitude, loadSecurityOfficers]);

  const loadGeofences = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const data = await apiService.getGeofences(parseInt(user.id, 10));
      const transformedGeofences = Array.isArray(data)
        ? data.map((geo: any) => ({
            id: geo.id?.toString() || geo.name,
            name: geo.name,
            radius: geo.radius_meters || geo.radius,
            center: geo.center_location ? {
              lat: geo.center_location.latitude || geo.center_location.lat,
              lng: geo.center_location.longitude || geo.center_location.lng,
            } : {lat: 0, lng: 0},
            isActive: geo.is_active !== false,
          }))
        : [];
      setGeofences(transformedGeofences);
    } catch (error) {
      console.error('Failed to load geofences:', error);
      setGeofences([]);
    }
  }, [user?.id]);

  const handleLocationSuccess = useCallback(
    (location: Location, providerLabel: 'gps' | 'enhanced') => {
      setUserLocation(location);
      setLocationProvider(providerLabel);
      
      // Load security officers in background (non-blocking) - they'll appear as they load
      loadSecurityOfficers(location, true).catch(err => console.warn('Failed to load officers:', err));
      if (user?.id && isPremium) {
        loadGeofences().catch(err => console.warn('Failed to load geofences:', err));
      }
    },
    [isPremium, loadGeofences, loadSecurityOfficers, user?.id],
  );

  const getCurrentLocation = useCallback(
    (provider: 'legacy' | 'enhanced') =>
      new Promise<Location>((resolve, reject) => {
        const getter =
          provider === 'enhanced'
            ? GeolocationService.getCurrentPosition
            : Geolocation.getCurrentPosition;

        getter(
          (position) => {
            resolve({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          },
          (error) => reject({...error, provider}),
          {
            ...locationRequestOptions,
            forceRequestLocation: provider === 'enhanced',
            showLocationDialog: provider === 'enhanced',
          },
        );
      }),
    [locationRequestOptions],
  );

  const showPermissionAlert = useCallback((config: {
    title: string;
    message: string;
    buttons: Array<{text: string; style?: 'default' | 'cancel' | 'destructive'; onPress: () => void}>;
    type?: 'error' | 'success' | 'info' | 'warning';
  }) => {
    setAlertConfig({
      title: config.title,
      message: config.message,
      type: config.type ?? 'warning',
      buttons: config.buttons,
    });
    setAlertVisible(true);
  }, []);

  const loadOfficersWithDefault = useCallback(() => {
    const defaultLocation = { latitude: 20.5937, longitude: 78.9629 };
    loadSecurityOfficers(defaultLocation, true).catch(() => {});
  }, [loadSecurityOfficers]);

  const fetchLocation = useCallback(() => {
    Promise.race([
      getCurrentLocation('enhanced').catch(() => getCurrentLocation('legacy')),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Location timeout')), 10000))
    ]).catch((err) => {
      console.warn('Location fetch failed or timed out:', err);
      loadOfficersWithDefault();
    });
  }, [getCurrentLocation, loadOfficersWithDefault]);

  const requestLocationPermission = useCallback(async () => {
    if (Platform.OS === 'android') {
      const isGranted = await permissionService.checkPermission('location');
      if (isGranted) {
        setLocationPermissionGranted(true);
        fetchLocation();
        return;
      }

      // Show disclosure
      setShowLocationDisclosure(true);
      setPendingLocationAction(() => async () => {
        const granted = await permissionService.requestPermission('location');
        if (granted) {
          setLocationPermissionGranted(true);
          fetchLocation();
        } else {
          setLocationPermissionGranted(false);
          loadOfficersWithDefault();
        }
      });
    } else {
      // iOS
      try {
        const authStatus = await (Geolocation.requestAuthorization() as any);
        if (authStatus === 'granted' || authStatus === 'restricted' || !authStatus) {
          setLocationPermissionGranted(true);
          fetchLocation();
        } else {
          loadOfficersWithDefault();
        }
      } catch (err) {
        console.warn('Location authorization error:', err);
        loadOfficersWithDefault();
      }
    }
  }, [fetchLocation, loadOfficersWithDefault]);

  const handleLocationFailure = useCallback(
    async (error: any) => {
      console.error('Location error:', error);

      if (Platform.OS === 'android') {
        const isGranted = await permissionService.checkPermission('location');

        if (!isGranted && error.code === 1) {
          showPermissionAlert({
            title: 'Location Permission Required',
            message: 'Please enable location permission to see nearby help and geofences.',
            buttons: [
              {text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false)},
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.openSettings();
                  setAlertVisible(false);
                },
              },
              {text: 'Retry', onPress: () => {
                setAlertVisible(false);
                requestLocationPermission();
              }},
            ],
          });
          return;
        }

        if (error.code === 2) {
          showPermissionAlert({
            title: 'Location Services Off',
            message: 'Turn on device location or GPS for accurate tracking.',
            buttons: [
              {text: 'Dismiss', style: 'cancel', onPress: () => setAlertVisible(false)},
              {
                text: 'Open Settings',
                onPress: () => {
                  Linking.openSettings();
                  setAlertVisible(false);
                },
              },
              {text: 'Retry', onPress: () => {
                setAlertVisible(false);
                requestLocationPermission();
              }},
            ],
          });
          return;
        }
      } else if (error.code === 1) {
        showPermissionAlert({
          title: 'Location Permission Required',
          message: 'Please enable location permission in settings.',
          buttons: [
            {text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false)},
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings();
                setAlertVisible(false);
              },
            },
            {text: 'Retry', onPress: () => {
              setAlertVisible(false);
              requestLocationPermission();
            }},
          ],
        });
        return;
      }

      // Generic warning
      showPermissionAlert({
        title: 'Unable to determine location',
        message: error?.message || 'No location provider available. Please ensure GPS is enabled and try again.',
        buttons: [
          {text: 'OK', style: 'cancel', onPress: () => setAlertVisible(false)},
          {text: 'Retry', onPress: () => {
            setAlertVisible(false);
            requestLocationPermission();
          }},
        ],
        type: 'error',
    });
    },
  [showPermissionAlert, requestLocationPermission]);

  useEffect(() => {
    requestLocationPermission();
    
    // Try to load officers even without user location (they might have geofence centers)
    // Use a default location to fetch officers immediately
    const defaultLocation = { latitude: 20.5937, longitude: 78.9629 }; // India center
    loadSecurityOfficers(defaultLocation, true).catch(() => {});
  }, [requestLocationPermission, loadSecurityOfficers]);

  const handleOfficerPress = (officer: any) => {
    const distanceText = officer.distance_km ? `${officer.distance_km} km away` : null;
    const batteryText =
      typeof officer.battery_level === 'number' ? `Battery ${officer.battery_level}%` : null;
    const lastSeenText = officer.last_seen_at ? `Last seen ${formatRelativeTime(officer.last_seen_at)}` : null;
    const statusText = officer.is_on_duty ? 'On duty' : 'Off duty';

    const message = [statusText, officer.geofence?.name, distanceText, batteryText, lastSeenText]
      .filter(Boolean)
      .join('\n');

    const buttons: Array<{text: string; onPress: () => void; style?: 'default' | 'cancel' | 'destructive'}> = [
      {text: 'Close', style: 'cancel', onPress: () => setAlertVisible(false)},
    ];

    if (officer.contact) {
      buttons.push({
        text: 'Call Officer',
        onPress: () => {
          Linking.openURL(`tel:${officer.contact}`).catch(() => {
            setAlertConfig({
              title: 'Error',
              message: 'Could not start call',
              type: 'error',
              buttons: [{text: 'OK', onPress: () => setAlertVisible(false)}],
            });
            setAlertVisible(true);
          });
          setAlertVisible(false);
        },
      });
    }

    setAlertConfig({
      title: officer.name,
      message,
      type: 'info',
      buttons,
    });
    setAlertVisible(true);
  };

  
  // Prepare markers first to determine map center
  const markers = [
    // User location marker (always show if available)
    ...(userLocation ? [{
      id: 'user-location',
      lat: userLocation.latitude,
      lng: userLocation.longitude,
      title: 'Your Location',
      description: 'You are here',
      icon: 'user'
    }] : []),
    // Security officer markers - use live location, last known, or geofence center
    ...securityOfficers
      .map((officer) => {
        // Priority: live location > last known > geofence center
        let location = null;
        let isLive = false;
        
        if (officer.is_live_sharing && officer.location?.latitude && officer.location?.longitude) {
          location = officer.location;
          isLive = true;
        } else if (officer.location?.latitude && officer.location?.longitude) {
          location = officer.location;
        } else if (officer.geofence?.center) {
          // Fallback to geofence center if available
          location = {
            latitude: officer.geofence.center.latitude || officer.geofence.center.lat,
            longitude: officer.geofence.center.longitude || officer.geofence.center.lng,
          };
        }
        
        if (!location) return null;
        
        return {
          id: `officer-${officer.id}`,
          lat: location.latitude,
          lng: location.longitude,
          title: officer.name,
          description: officer.geofence?.name || 'Security Officer',
          icon: 'shield',
          color: '#F97316',
          isLive: isLive,
        };
      })
      .filter((marker): marker is NonNullable<typeof marker> => marker !== null)
  ];

  // Determine map center - prioritize user location, then first officer, then default
  const mapCenter = userLocation || (markers.length > 0 && markers.find(m => m.icon === 'shield') ? {
    latitude: markers.find(m => m.icon === 'shield')!.lat,
    longitude: markers.find(m => m.icon === 'shield')!.lng,
  } : { latitude: 20.5937, longitude: 78.9629 }); // Default to India center if nothing available

  // Always show map - location will update when available
  // If permission not granted, still show map but request permission
  if (!locationPermissionGranted) {
    // Request permission in background, but show map anyway
    requestLocationPermission();
  }


  // Prepare circles for geofences
  const circles = isPremium ? geofences.map((geo) => {
    if (geo.center.lat === 0 && geo.center.lng === 0) return null;
    return {
      id: geo.id,
      lat: geo.center.lat,
      lng: geo.center.lng,
      radius: geo.radius || 100,
      color: geo.isActive ? colors.primary : colors.notification,
      fillColor: geo.isActive 
        ? `${colors.primary || '#2563EB'}20` 
        : `${colors.notification || '#EF4444'}20`,
      opacity: 0.2
    };
  }).filter((circle): circle is NonNullable<typeof circle> => circle !== null) : [];

  return (
    <>
      <ThemedAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
        onDismiss={() => setAlertVisible(false)}
      />
      <View style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.mapWrapper}>
          <LeafletMap
            initialCenter={mapCenter ? {
              lat: mapCenter.latitude,
              lng: mapCenter.longitude,
            } : {
              lat: 20.5937,
              lng: 78.9629,
          }}
            initialZoom={userLocation ? 15 : 13}
            markers={markers} // Markers array includes user location + officers (as they load)
            circles={circles}
            showUserLocation={!!userLocation}
            userLocation={userLocation ? {
              lat: userLocation.latitude,
              lng: userLocation.longitude,
            } : undefined}
            onMarkerPress={(marker) => {
              // Handle marker press based on marker type
              if (marker.id === 'user-location') return;
              
              const officer = securityOfficers.find(o => `officer-${o.id}` === marker.id);
              if (officer) {
                handleOfficerPress(officer);
                return;
              }
            }}
          />
        </View>

        {/* Officer panel - always show, with loading state inside */}
          <View style={[styles.officerPanel, {backgroundColor: colors.card}]}>
            <View style={styles.officerPanelHeader}>
            <Text style={[styles.officerPanelTitle, {color: colors.text}]}>
              Nearby Security Officers
            </Text>
            <View style={styles.officerPanelHeaderRight}>
              {loadingOfficers && (
                <ActivityIndicator size="small" color={colors.primary} style={styles.officerLoadingSpinner} />
              )}
              {locationProvider && (
                <Text style={styles.providerBadge}>
                  {locationProvider === 'gps' ? 'GPS lock' : 'Enhanced positioning'}
                </Text>
              )}
            </View>
          </View>
          {loadingOfficers && securityOfficers.length === 0 ? (
            <View style={styles.officerLoadingContainer}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.officerLoadingText, {color: colors.text}]}>Loading officers...</Text>
            </View>
          ) : securityOfficers.length > 0 ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.officerChipRow}>
              {securityOfficers.slice(0, 5).map((officer) => (
                <TouchableOpacity
                  key={`officer-chip-${officer.id}`}
                  style={styles.officerChip}
                  activeOpacity={0.8}
                  onPress={() => handleOfficerPress(officer)}>
                  <View style={styles.officerChipIcon}>
                    <MaterialIcons name="shield" size={18} color="#FFFFFF" />
                  </View>
                  <View style={styles.officerChipTextWrapper}>
                    <Text style={styles.officerChipName}>{officer.name}</Text>
                    <Text style={styles.officerChipMeta}>
                      {officer.is_live_sharing ? (
                        <Text style={{color: '#10B981', fontWeight: '600'}}>● Live</Text>
                      ) : (
                        <>
                      {officer.distance_km ? `${officer.distance_km} km` : 'On call'} •{' '}
                      {formatRelativeTime(officer.last_seen_at)}
                        </>
                      )}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.officerEmptyContainer}>
              <Text style={[styles.officerEmptyText, {color: colors.text}]}>No officers nearby</Text>
          </View>
        )}
          </View>
      </View>

      {/* Location Disclosure Modal */}
      <LocationDisclosureModal
        visible={showLocationDisclosure}
        mode="foreground"
        onAccept={async () => {
          setShowLocationDisclosure(false);
          if (pendingLocationAction) {
            await (pendingLocationAction as any)();
            setPendingLocationAction(null);
          }
        }}
        onDecline={() => {
          setShowLocationDisclosure(false);
          setPendingLocationAction(null);
          loadOfficersWithDefault();
        }}
      />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapWrapper: {
    flex: 1,
    minHeight: 360,
  },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    fontSize: 20,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  errorSubtext: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  },
  retryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  legendCard: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    borderRadius: 16,
    padding: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  legendTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  legendItems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
  },
  legendIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendText: {
    fontSize: 13,
  },
  officerPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 5,
  },
  officerPanelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  officerPanelHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  officerLoadingSpinner: {
    marginRight: 4,
  },
  officerPanelTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  providerBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  officerChipRow: {
    gap: 12,
    paddingRight: 16,
  },
  officerChip: {
    minWidth: 200,
    borderRadius: 12,
    backgroundColor: '#111827',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  officerChipIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  officerChipTextWrapper: {
    flex: 1,
  },
  officerChipName: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
  },
  officerChipMeta: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 2,
  },
  officerLoadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  officerLoadingText: {
    fontSize: 12,
  },
  officerEmptyContainer: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  officerEmptyText: {
    fontSize: 14,
    opacity: 0.7,
  },
  fallbackContainer: {
    flex: 1,
  },
  fallbackContent: {
    padding: 16,
  },
  helpListContainer: {
    marginTop: 24,
    gap: 12,
  },
  helpListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  helpListIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  helpListContent: {
    flex: 1,
  },
  helpListName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  helpListAddress: {
    fontSize: 14,
    marginBottom: 2,
  },
  helpListDistance: {
    fontSize: 12,
    opacity: 0.7,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    marginTop: 16,
  },
});

export default AreaMapScreen;
