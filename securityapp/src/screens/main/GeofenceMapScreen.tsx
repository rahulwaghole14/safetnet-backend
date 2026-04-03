import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { LeafletMap } from '../../components/maps/LeafletMap';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';
import { useColors } from '../../utils/colors';
import { typography, spacing } from '../../utils';
import Icon from 'react-native-vector-icons/MaterialIcons';
import apiClient from '../../api/apiClient';

// Real geolocation API usage

interface GeofenceData {
  id: number;
  name: string;
  description?: string;
  polygon_json: {
    type: string;
    coordinates: number[][][];
  };
  organization: number;
  organization_name: string;
  active: boolean;
  created_by_username?: string;
  created_at: string;
  updated_at: string;
  center_point?: any;
}

export const GeofenceMapScreen = () => {
  // ALL HOOKS MUST BE DECLARED AT THE TOP LEVEL, BEFORE ANY CONDITIONAL LOGIC
  const navigation = useNavigation();
  const colors = useColors();

  // State hooks
  const [geofence, setGeofence] = useState<GeofenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [areaUsers, setAreaUsers] = useState<any[]>([]);
  const [polling, setPolling] = useState(false);

  // Ref hooks
  const webViewRef = useRef<any>(null);
  const wasInsideRef = useRef<boolean | null>(null); // Track previous inside/outside state for hysteresis

  // IMPORTANT: When using isOfficerInsideGeofence(), remember to update wasInsideRef.current = result.isInside
  // after processing the result to maintain hysteresis state for next check

  // Callback hooks
  const startLocationTracking = useCallback(() => {
    console.log('🎯 Starting real geolocation tracking');

    // TODO: Implement real React Native geolocation API
    // Location tracking is ready for implementation - no mock data
    // Future: Use @react-native-community/geolocation or similar package

    // Return empty cleanup function
    return () => {
      console.log('🛑 Location tracking cleanup (no-op)');
    };
  }, []);

  // Effect hooks
  useEffect(() => {
    fetchGeofence();
  }, []);

  // Poll for area users once geofence is loaded
  useEffect(() => {
    let interval: any;
    if (geofence?.id) {
      fetchAreaUsers(); // Initial fetch
      interval = setInterval(() => {
        fetchAreaUsers();
      }, 30000); // Every 30 seconds
    }
    return () => clearInterval(interval);
  }, [geofence?.id]);




  // ===== HELPER FUNCTIONS =====
  // These must be defined before useMemo hooks that reference them

  // Haversine formula to calculate distance between two coordinates in meters
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in meters
  };

  // Point-in-polygon algorithm using ray casting
  const isPointInPolygon = (point: {latitude: number, longitude: number}, polygon: Array<{latitude: number, longitude: number}>): boolean => {
    const x = point.longitude;
    const y = point.latitude;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].longitude;
      const yi = polygon[i].latitude;
      const xj = polygon[j].longitude;
      const yj = polygon[j].latitude;

      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }

    return inside;
  };

  // Check if officer is inside geofence with hysteresis
  const isOfficerInsideGeofence = (
    officerLocation: {latitude: number, longitude: number},
    geofence: GeofenceData,
    hysteresisBuffer: number = 10
  ): { isInside: boolean; radius: number; distance: number } => {
    if (!geofence?.polygon_json?.coordinates?.[0]) {
      return { isInside: false, radius: 0, distance: 0 };
    }

    const center = getGeofenceCenter();
    const distance = calculateDistance(
      officerLocation.latitude,
      officerLocation.longitude,
      center.latitude,
      center.longitude
    );

    // For polygon geofences, use point-in-polygon (simplified hysteresis)
    if (geofence.polygon_json.coordinates[0].length > 3) {
      const polygonCoords = geofence.polygon_json.coordinates[0].map((coord: number[]) => ({
        latitude: coord[1],
        longitude: coord[0]
      }));
      const rawIsInside = isPointInPolygon(officerLocation, polygonCoords);

      // Apply simple hysteresis for polygons (expand/shrink polygon boundary)
      const wasInside = wasInsideRef.current; // Track previous state for hysteresis
      let isInside = rawIsInside;

      if (wasInside === null) {
        isInside = rawIsInside;
      } else if (wasInside && !rawIsInside) {
        // Currently inside but raw check says outside - require confirmation
        // For polygons, we use distance-based hysteresis as fallback
        isInside = distance < 15; // Stay inside if within 15m of boundary
      } else if (!wasInside && rawIsInside) {
        // Currently outside but raw check says inside - require confirmation
        isInside = distance < 5; // Only enter if clearly inside (within 5m of boundary)
      }

      return { isInside, radius: 0, distance };
    }

    // For circular geofences, calculate radius and use hysteresis
    const coords = getGeofenceCoordinates();
    let radius = 500; // Default fallback radius

    if (coords.length >= 3) {
      let maxDistance = 0;
      coords.forEach(coord => {
        const dist = calculateDistance(center.latitude, center.longitude, coord.latitude, coord.longitude);
        maxDistance = Math.max(maxDistance, dist);
      });
      radius = maxDistance;
    }

    // Use hysteresis: different thresholds for enter/exit
    const enterThreshold = radius - hysteresisBuffer; // Enter when distance <= radius - buffer
    const exitThreshold = radius + hysteresisBuffer;   // Exit when distance >= radius + buffer

    // Determine if currently inside based on previous state
    const wasInside = wasInsideRef.current; // Track previous state for hysteresis
    let isInside: boolean;

    if (wasInside === null) {
      // First check - use standard threshold
      isInside = distance <= radius;
    } else if (wasInside) {
      // Currently inside - only exit if beyond exit threshold
      isInside = distance < exitThreshold;
    } else {
      // Currently outside - only enter if within enter threshold
      isInside = distance <= enterThreshold;
    }

    return { isInside, radius, distance };
  };

  // Calculate center point of geofence
  const getGeofenceCenter = () => {
    if (!geofence?.polygon_json?.coordinates?.[0]) {
      console.log('Using default center - no geofence coordinates');
      return { latitude: 18.6472, longitude: 73.7845 }; // Default to Pune area
    }

    try {
      const coordinates = geofence.polygon_json.coordinates[0];

      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        console.warn('Invalid coordinates array:', coordinates);
        return { latitude: 18.6472, longitude: 73.7845 };
      }

      let latSum = 0, lngSum = 0;
      let validCoords = 0;

      coordinates.forEach((coord: number[]) => {
        if (Array.isArray(coord) && coord.length >= 2 && typeof coord[0] === 'number' && typeof coord[1] === 'number') {
          lngSum += coord[0]; // longitude
          latSum += coord[1]; // latitude
          validCoords++;
        }
      });

      if (validCoords === 0) {
        console.warn('No valid coordinates found');
        return { latitude: 18.6472, longitude: 73.7845 };
      }

      const center = {
        latitude: latSum / validCoords,
        longitude: lngSum / validCoords,
      };

      console.log('Calculated geofence center:', center);
      return center;
    } catch (error) {
      console.error('Error calculating geofence center:', error);
      return { latitude: 18.6472, longitude: 73.7845 };
    }
  };

  // Get geofence coordinates for display
  const getGeofenceCoordinates = () => {
    if (!geofence?.polygon_json?.coordinates?.[0]) {
      console.log('No geofence coordinates found');
      return [];
    }

    try {
      const coords = geofence.polygon_json.coordinates[0];
      console.log('Processing geofence coordinates:', coords);

      if (!Array.isArray(coords) || coords.length < 3) {
        console.warn('Invalid geofence coordinates:', coords);
        return [];
      }

      const processedCoords = coords.map((coord: number[], index: number) => {
        if (!Array.isArray(coord) || coord.length < 2) {
          console.warn('Invalid coordinate at index', index, ':', coord);
          return null;
        }

        return {
          id: index + 1,
          latitude: coord[1], // GeoJSON: [lng, lat]
          longitude: coord[0],
          label: `Point ${index + 1}`
        };
      }).filter(coord => coord !== null);

      console.log('Processed coordinates:', processedCoords);
      return processedCoords;
    } catch (error) {
      console.error('Error processing geofence coordinates:', error);
      return [];
    }
  };

  // Calculate appropriate zoom level based on geofence size
  const getOptimalZoom = () => {
    const coords = getGeofenceCoordinates(); // Use local calculation, not memoized version
    if (!coords || coords.length < 3) return 15;

    // Calculate bounding box
    let minLat = coords[0].latitude;
    let maxLat = coords[0].latitude;
    let minLng = coords[0].longitude;
    let maxLng = coords[0].longitude;

    coords.forEach(coord => {
      minLat = Math.min(minLat, coord.latitude);
      maxLat = Math.max(maxLat, coord.latitude);
      minLng = Math.min(minLng, coord.longitude);
      maxLng = Math.max(maxLng, coord.longitude);
    });

    // Calculate diagonal distance in degrees (rough approximation)
    const latDiff = maxLat - minLat;
    const lngDiff = maxLng - minLng;
    const diagonal = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);

    // Adjust zoom based on geofence size
    // Smaller geofence = higher zoom, larger geofence = lower zoom
    if (diagonal < 0.001) return 17; // Very small area (< 100m)
    if (diagonal < 0.005) return 16; // Small area (< 500m)
    if (diagonal < 0.01) return 15;  // Medium area (< 1km)
    if (diagonal < 0.02) return 14;  // Large area (< 2km)
    return 13; // Very large area (> 2km)
  };

  // Memo hooks (now can reference the helper functions defined above)
  const geofenceCenter = useMemo(() => getGeofenceCenter(), [geofence]);
  const coordinates = useMemo(() => getGeofenceCoordinates(), [geofence]);
  const optimalZoom = useMemo(() => getOptimalZoom(), [coordinates]);

  // Function to center map on geofence area
  const centerOnGeofence = () => {
    console.log('🎯 Center button pressed');

    if (!geofence) {
      console.log('❌ No geofence loaded yet - cannot center');
      Alert.alert('Geofence Not Loaded', 'Please wait for the geofence to load before centering the map.');
      return;
    }

    if (!webViewRef.current) {
      console.log('❌ WebView ref not available');
      Alert.alert('Map Not Ready', 'Please wait for the map to load before centering.');
      return;
    }

    console.log('✅ Geofence center:', geofenceCenter);
    console.log('✅ Optimal zoom:', optimalZoom);

    // Store current map position for fallback
    const fallbackCenter = geofenceCenter;
    const fallbackZoom = optimalZoom;

    try {
      const message = JSON.stringify({
        type: 'centerOnGeofence',
        center: fallbackCenter,
        zoom: fallbackZoom
      });

      webViewRef.current.postMessage(message);
      console.log('📡 Sent center message to WebView:', message);

      // Provide user feedback
      console.log('🎯 Map should now center on geofence area');

    } catch (error) {
      console.error('❌ Error sending center message:', error);
      Alert.alert('Error', 'Failed to center map on geofence area.');
    }
  };

  // Default map center (general city view) - geofence center is handled via messaging
  const defaultCenter = { latitude: 18.6472, longitude: 73.7845 }; // General Pune area
  const defaultZoom = 12; // City-level zoom

  // Use default center - geofence centering is handled via messaging
  const currentCenter = defaultCenter;
  const currentZoom = defaultZoom;

  // Debug logging (only in development)
  if (__DEV__) {
    console.log('GeofenceMapScreen render:', {
      geofence: geofence ? 'loaded' : 'null',
      coordinates: coordinates?.length || 0,
      currentCenter,
      officerLocation: 'disabled' // Location tracking removed
    });
  }

  const fetchGeofence = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiClient.get('/geofence/');

      // Handle API response - check if geofence exists
      console.log('Geofence API response:', response.data);

      if (response.data && response.data.data === null) {
        // No geofence assigned - this is now a 200 response with empty data
        console.log('No geofence assigned to officer');
        setGeofence(null);
      } else if (response.data && response.data.polygon_json) {
        // Geofence data exists
        console.log('Geofence data loaded:', response.data);
        console.log('Polygon coordinates:', response.data.polygon_json?.coordinates);
        setGeofence(response.data);
      } else {
        // Fallback for unexpected response format
        console.warn('Unexpected geofence API response format:', response);
        setGeofence(null);
      }
    } catch (error: any) {
      console.error('Error fetching geofence:', error);
      let errorMessage = 'Unable to load geofence data';

      if (error.response?.status === 500) {
        errorMessage = 'Server temporarily unavailable. Please try again later.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Geofence service not available.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Authentication required. Please log in again.';
      } else if (error.code === 'NETWORK_ERROR' || !error.response) {
        errorMessage = 'Network connection issue. Check your internet connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      setError(errorMessage);
      // Set geofence to null so the UI shows fallback state
      setGeofence(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchAreaUsers = async () => {
    if (!geofence?.id) return;
    
    try {
      setPolling(true);
      const response = await apiClient.get(`/geofence/${geofence.id}/users/`);
      if (Array.isArray(response.data)) {
        setAreaUsers(response.data);
        console.log(`📍 Found ${response.data.length} users in area`);
      }
    } catch (error) {
      console.error('Error fetching area users:', error);
    } finally {
      setPolling(false);
    }
  };

  // Location tracking functions with simulated 1-second updates

  // Send officer location to backend
  const sendLocationToBackend = async (latitude: number, longitude: number) => {
    try {
      // TODO: Create API endpoint /api/officer/location/ for live location updates
      // await apiClient.post('/officer/location/', {
      //   latitude,
      //   longitude,
      //   accuracy: position.coords.accuracy,
      //   speed: position.coords.speed,
      //   timestamp: new Date().toISOString(),
      // });

      console.log('📡 Live location update:', {
        latitude: latitude.toFixed(6),
        longitude: longitude.toFixed(6),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Failed to send location to backend:', error);
      // Don't show error to user for location updates to avoid spam
    }
  };

  // ===== CONDITIONAL EARLY RETURNS =====
  // These come AFTER all hooks and helper functions

  // Show loading state
  if (loading) {
    return (
      <ScreenWrapper
        backgroundColor={colors.lightGrayBg}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.darkText }]}>Loading geofence...</Text>
        <Text style={[styles.loadingText, { fontSize: 12, marginTop: 8, opacity: 0.7, color: colors.darkText }]}>
          Fetching assigned security area
        </Text>
      </ScreenWrapper>
    );
  }

  // Show error state
  if (error) {
    return (
      <ScreenWrapper
        backgroundColor={colors.lightGrayBg}
      >
        <Icon name="location-off" size={48} color={colors.emergencyRed} />
        <Text style={[styles.errorText, { color: colors.emergencyRed }]}>Geofence Error</Text>
        <Text style={[styles.errorDescription, { color: colors.mediumText }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={fetchGeofence}
          activeOpacity={0.7}
        >
          <Text style={[styles.retryButtonText, { color: colors.white }]}>Retry</Text>
        </TouchableOpacity>
      </ScreenWrapper>
    );
  }

  // Show no geofence assigned state
  if (geofence === null && !loading && !error) {
    return (
      <ScreenWrapper
        backgroundColor={colors.lightGrayBg}
      >
        <Icon name="location-off" size={48} color={colors.mediumText} />
        <Text style={[styles.errorText, { color: colors.darkText }]}>No Geofence Assigned</Text>
        <Text style={[styles.errorDescription, { color: colors.mediumText }]}>
          No security patrol area has been assigned to your account yet.
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={fetchGeofence}
          activeOpacity={0.7}
        >
          <Text style={[styles.retryButtonText, { color: colors.white }]}>Check Again</Text>
        </TouchableOpacity>
      </ScreenWrapper>
    );
  }


  return (
    <ScreenWrapper
      backgroundColor={colors.background}
      scrollable={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.titleContainer}>
          <Icon name="map" size={28} color={colors.primary} style={styles.titleIcon} />
          <Text style={[styles.title, { color: colors.darkText }]}>Geofence Map</Text>
        </View>
      </View>

      {/* Map Section (70% of screen) */}
      <View style={styles.mapSection}>
        <LeafletMap
          ref={webViewRef}
          latitude={currentCenter.latitude}
          longitude={currentCenter.longitude}
          zoom={currentZoom}
          height={400}
          markerTitle={geofence?.name || "Security Area"}
          polygonCoordinates={coordinates && coordinates.length >= 3 ? coordinates.map(coord => ({
            latitude: coord.latitude,
            longitude: coord.longitude
          })) : undefined}
          userMarkers={areaUsers.map(user => ({
            id: String(user.user_id),
            username: user.user_name || user.user_email || 'User',
            latitude: user.current_latitude,
            longitude: user.current_longitude,
            updated_at: user.last_seen
          }))}
        />

        {/* Floating Action Button - Top Right */}
        <View style={[styles.fabContainer, styles.fabTopRight]}>
          <TouchableOpacity
            style={[
              styles.centerButton,
              {
                backgroundColor: geofence ? colors.primary : colors.mediumText,
                shadowColor: geofence ? colors.primary : colors.mediumText
              }
            ]}
            onPress={centerOnGeofence}
            activeOpacity={0.7}
            disabled={!geofence}
          >
            <Icon name="my-location" size={24} color={colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Details Section (20% of screen) */}
      <View style={[styles.detailsSection, { backgroundColor: colors.white }]}>
        <View style={styles.sectionHeader}>
          <Icon name="info" size={20} color={colors.primary} style={styles.sectionIcon} />
          <Text style={[styles.sectionTitle, { color: colors.darkText }]}>Geofence Details</Text>
          {polling && <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />}
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.mediumText }]}>Users In Area:</Text>
          <Text style={[styles.detailValue, { color: colors.primary, fontWeight: '700' }]}>
            {areaUsers.length} Active Users
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.mediumText }]}>Name:</Text>
          <Text style={[styles.detailValue, { color: colors.darkText }]}>{geofence?.name || 'Unnamed Geofence'}</Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.mediumText }]}>Location:</Text>
          <Text style={[styles.detailValue, { color: colors.darkText }]}>
            {geofenceCenter.latitude.toFixed(4)}, {geofenceCenter.longitude.toFixed(4)}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.mediumText }]}>Organization:</Text>
          <Text style={[styles.detailValue, { color: colors.darkText }]}>
            {geofence?.organization_name || 'Unknown'}
          </Text>
        </View>

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: colors.mediumText }]}>Created:</Text>
          <Text style={[styles.detailValue, { color: colors.darkText }]}>
            {geofence?.created_at ? new Date(geofence.created_at).toLocaleDateString() : 'Unknown'}
          </Text>
        </View>
      </View>
    </ScreenWrapper>
  );
};

// Note: Colors are applied inline using useColors() hook
const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  fullScreenMap: {
    flex: 1,
    position: 'relative',
  },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.md,
    paddingBottom: spacing.xl,
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.md,
  },
  errorText: {
    ...typography.screenHeader,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  errorDescription: {
    ...typography.body,
    textAlign: 'center',
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  retryButtonText: {
    ...typography.buttonSmall,
    fontWeight: '600',
  },
  mapSection: {
    marginBottom: spacing.md,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    position: 'relative',
  },
  detailsSection: {
    marginBottom: spacing.md,
    borderRadius: 16,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  header: {
    marginBottom: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 16,
    marginHorizontal: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  titleIcon: {
    marginRight: spacing.sm,
  },
  title: {
    ...typography.screenHeader,
    fontWeight: '700',
  },
  subtitle: {
    ...typography.caption,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  mapContainer: {
    marginBottom: spacing.lg,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    marginHorizontal: spacing.sm,
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.08)',
  },
  mapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  mapHeaderText: {
    ...typography.body,
    fontWeight: '700',
    marginLeft: spacing.xs,
    color: '#007AFF',
  },
  mapWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  infoContainer: {
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
    marginHorizontal: spacing.sm,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.05)',
  },
  centeredTitleRow: {
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
    marginBottom: 4,
  },
  centeredTitle: {
    ...typography.sectionHeader,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  infoLabel: {
    ...typography.body,
    fontWeight: '500',
    flex: 1,
  },
  infoValue: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  topHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 20,
    paddingBottom: 15,
    zIndex: 10,
  },
  fabContainer: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 10,
  },
  fabTopRight: {
    top: 20,
    right: 20,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 20,
    paddingVertical: 15,
    paddingBottom: 30, // Account for home indicator
  },
  panelContent: {
    flexDirection: 'column',
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 10,
    textAlign: 'center',
  },
  panelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  panelLabel: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    color: '#e2e8f0',
  },
  panelValue: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  centerButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 12,
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    backgroundColor: '#007AFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0, 0, 0, 0.08)',
  },
  sectionIcon: {
    marginRight: spacing.sm,
  },
  sectionTitle: {
    ...typography.sectionHeader,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
    marginBottom: 4,
  },
  detailLabel: {
    ...typography.body,
    fontWeight: '500',
    flex: 1,
  },
  detailValue: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
});

export default GeofenceMapScreen;
