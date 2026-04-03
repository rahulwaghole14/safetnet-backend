import React, { useState, useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAppSelector } from '../../store/hooks';
import { useGeofenceStore } from '../../store/geofenceStore';
import { LeafletMap } from '../../components/maps/LeafletMap';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';
import { colors } from '../../utils/colors';
import { typography, spacing } from '../../utils';
import { calculateDistance } from '../../utils/helpers';

type AlertsMapScreenParams = {
  alert: {
    id: string;
    location: {
      latitude: number;
      longitude: number;
      address?: string;
    };
    alert_type: string;
    priority: string;
    message: string;
  };
};

type AlertsMapScreenRouteProp = RouteProp<Record<string, AlertsMapScreenParams>, string>;

export const AlertsMapScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<AlertsMapScreenRouteProp>();
  const { alert } = route.params || {};

  // Safety check for alert parameter
  if (!alert) {
    console.error('No alert parameter provided to AlertsMapScreen');
    navigation.goBack();
    return null;
  }

  // Get officer data from Redux store
  const officer = useAppSelector(state => state.auth.officer);
  
  // Location slice was removed from Redux, use default location for demo
  const officerLocation = {
    latitude: 18.5204, // Default officer location for demo
    longitude: 73.8567,
  };

  const [isLoading, setIsLoading] = useState(false);

  // Use geofence store
  const { geofences, isLoading: geofenceLoading, fetchGeofences } = useGeofenceStore();

  // Fetch officer assigned geofences
  useEffect(() => {
    const officerId = officer?.id;
    console.log("CORRECT OFFICER ID:", officerId);
    
    if (!officerId) {
      console.error('❌ Officer ID not found in auth store');
      return;
    }
    
    console.log('🔍 useEffect triggered - fetching geofences...');
    fetchGeofences(officerId.toString());
  }, [officer?.id, fetchGeofences]);

  // Add logging when geofences change
  useEffect(() => {
    console.log("UI RECEIVED:", geofences);
  }, [geofences]);

  // Calculate distance between officer and alert location
  const distance = calculateDistance(
    officerLocation.latitude,
    officerLocation.longitude,
    alert.location.latitude,
    alert.location.longitude
  );

  const handleGetDirections = () => {
    // This would integrate with navigation apps
    Alert.alert(
      'Get Directions',
      'Open directions to alert location?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open Maps',
          onPress: () => {
            // This would open external maps app with directions
            console.log('Opening directions to alert location');
          },
        },
      ]
    );
  };

  const handleCallBackup = () => {
    Alert.alert(
      'Request Backup',
      'Send backup request to nearby officers?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Request Backup',
          onPress: () => {
            // This would send backup request
            console.log('Backup requested');
          },
        },
      ]
    );
  };

  const generateMapHTML = () => `
    <!DOCTYPE html>
    <html>
    <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
            integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
            crossorigin=""/>
        <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
            integrity="sha256-20nQCchB9co0qIjJZRGuk2/4K9+sSLHVQuyUFHCiDQ="
            crossorigin=""></script>
        <style>
            body { margin: 0; padding: 0; }
            #map { width: 100%; height: 100vh; }
            .alert-marker {
                background-color: #dc3545;
                border: 2px solid white;
                border-radius: 50% 50% 50% 0;
                transform: rotate(-45deg);
                box-shadow: 0 0 10px rgba(0,0,0,0.3);
            }
            .officer-marker {
                background-color: #28a745;
                border: 2px solid white;
                border-radius: 50%;
                box-shadow: 0 0 10px rgba(0,0,0,0.3);
            }
        </style>
    </head>
    <body>
        <div id="map"></div>
        <script>
            const map = L.map('map').setView([${alert.location.latitude}, ${alert.location.longitude}], 15);

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            // Alert location marker (red)
            const alertIcon = L.divIcon({
                className: 'alert-marker',
                html: '<div style="width: 20px; height: 20px;"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 20]
            });

            L.marker([${alert.location.latitude}, ${alert.location.longitude}], { icon: alertIcon })
                .addTo(map)
                .bindPopup('<b>Alert Location</b><br>${alert.alert_type}<br>Priority: ${alert.priority}')
                .openPopup();

            // Officer location marker (green)
            const officerIcon = L.divIcon({
                className: 'officer-marker',
                html: '<div style="width: 16px; height: 16px;"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            });

            L.marker([${officerLocation.latitude}, ${officerLocation.longitude}], { icon: officerIcon })
                .addTo(map)
                .bindPopup('<b>Your Location</b><br>Security Officer');

            // Fit map to show both markers
            const group = new L.featureGroup([
                L.marker([${alert.location.latitude}, ${alert.location.longitude}]),
                L.marker([${officerLocation.latitude}, ${officerLocation.longitude}])
            ]);
            map.fitBounds(group.getBounds().pad(0.1));
        </script>
    </body>
    </html>`;

  return (
    <ScreenWrapper
      backgroundColor={colors.primary}
      scrollable={false}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color={colors.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Alert Map</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Map Container */}
      <View style={styles.mapContainer}>
        <LeafletMap
          latitude={alert.location.latitude}
          longitude={alert.location.longitude}
          officerLatitude={officerLocation.latitude}
          officerLongitude={officerLocation.longitude}
          zoom={15}
          height={500}
          markerTitle={`Alert: ${alert.alert_type}`}
          showMarker={false} // We'll use custom markers in the HTML
          multiplePolygons={geofences.map((gf: any) => ({
            id: gf.id,
            name: gf.name,
            coordinates: Array.isArray(gf.polygon_json) 
              ? gf.polygon_json.map(([lat, lng]: [number, number]) => ({
                  latitude: lat,
                  longitude: lng
                }))
              : [],
            color: '#2563eb' // Blue for officer zones
          }))}
        />
      </View>

      {/* Info Panel */}
      <View style={styles.infoPanel}>
        <View style={styles.locationInfo}>
          <View style={styles.locationRow}>
            <View style={[styles.markerIndicator, { backgroundColor: colors.emergencyRed }]} />
            <View style={styles.locationDetails}>
              <Text style={styles.locationTitle}>Alert Location</Text>
              <Text style={styles.locationAddress}>
                {alert.location.address || `${alert.location.latitude.toFixed(6)}, ${alert.location.longitude.toFixed(6)}`}
              </Text>
            </View>
          </View>

          <View style={styles.locationRow}>
            <View style={[styles.markerIndicator, { backgroundColor: colors.successGreen }]} />
            <View style={styles.locationDetails}>
              <Text style={styles.locationTitle}>Your Location</Text>
              <Text style={styles.locationAddress}>
                {officerLocation.latitude.toFixed(6)}, {officerLocation.longitude.toFixed(6)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.distanceInfo}>
          <Text style={styles.distanceText}>
            Distance: {distance.toFixed(1)} km
          </Text>
          <Text style={styles.alertType}>
            Alert: {alert.alert_type} ({alert.priority})
          </Text>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, styles.primaryButton]}
            onPress={handleGetDirections}
            activeOpacity={0.7}
          >
            <Icon name="directions" size={20} color={colors.white} />
            <Text style={styles.primaryButtonText}>Get Directions</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.secondaryButton]}
            onPress={handleCallBackup}
            activeOpacity={0.7}
          >
            <Icon name="group-add" size={20} color={colors.primary} />
            <Text style={styles.secondaryButtonText}>Request Backup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.lg,
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  backButton: {
    padding: spacing.sm,
  },
  headerTitle: {
    ...typography.screenHeader,
    color: colors.white,
    fontWeight: '600',
  },
  placeholder: {
    width: 40, // Match back button width
  },
  mapContainer: {
    flex: 1,
    backgroundColor: colors.lightGrayBg,
  },
  infoPanel: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
  },
  locationInfo: {
    marginBottom: spacing.lg,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  markerIndicator: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: spacing.md,
  },
  locationDetails: {
    flex: 1,
  },
  locationTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.darkText,
    marginBottom: 2,
  },
  locationAddress: {
    ...typography.caption,
    color: colors.mediumText,
  },
  distanceInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.lightGrayBg,
    borderRadius: 8,
  },
  distanceText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primary,
  },
  alertType: {
    ...typography.caption,
    color: colors.mediumText,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    gap: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.primary,
  },
  secondaryButton: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  primaryButtonText: {
    ...typography.buttonSmall,
    color: colors.white,
    fontWeight: '600',
  },
  secondaryButtonText: {
    ...typography.buttonSmall,
    color: colors.primary,
    fontWeight: '600',
  },
});