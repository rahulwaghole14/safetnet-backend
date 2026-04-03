import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert as RNAlert, Linking, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Alert } from '../../types/alert.types';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';
import { colors } from '../../utils/colors';
import { typography, spacing, shadows } from '../../utils';
import { calculateDistance, formatRelativeTime } from '../../utils/helpers';

export const AlertResponseScreen = ({ route }: any) => {
  const { alert } = route.params as { alert: Alert };
  const navigation = useNavigation();

  // Handle case where alert is not provided
  if (!alert) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.errorContainer}>
          <Icon name="error" size={48} color={colors.emergencyRed} />
          <Text style={styles.errorText}>
            Alert not found
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.primary }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>
              Go Back
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const [estimatedArrival, setEstimatedArrival] = useState<number | null>(null);

  // Mock officer location for demo
  const officerLocation = {
    latitude: 37.7749,
    longitude: -122.4194,
  };

  // Get alert type description
  const getAlertTypeDescription = (): { type: string; description: string } => {
    const isHighPriority = alert.priority?.toLowerCase?.() === 'high';

    if (isHighPriority) {
      return {
        type: 'Emergency Alert',
        description: 'Critical alert requiring immediate response and action'
      };
    }

    const displayType = alert.original_alert_type || alert.alert_type || 'normal';

    const typeInfoMap: Record<string, { type: string; description: string }> = {
      general: {
        type: 'General Notice',
        description: 'Informational alert for general updates and announcements'
      },
      warning: {
        type: 'Warning',
        description: 'Cautionary alert requiring attention and immediate awareness'
      },
      emergency: {
        type: 'Emergency',
        description: 'Critical alert requiring immediate response and action'
      },
      normal: {
        type: 'Normal Alert',
        description: 'Standard alert for routine notifications'
      }
    };

    return typeInfoMap[displayType] || typeInfoMap.normal;
  };

  const getAlertTypeIcon = () => {
    const isHighPriority = alert.priority?.toLowerCase?.() === 'high';
    const alertType = alert.original_alert_type || alert.alert_type;

    if (isHighPriority || alertType === 'emergency') return 'warning';
    if (alertType === 'warning') return 'warning';
    return 'notifications';
  };

  const alertTypeInfo = getAlertTypeDescription();
  const alertTypeColor = alert.priority?.toLowerCase?.() === 'high' || alert.original_alert_type === 'emergency'
    ? colors.emergencyRed
    : alert.original_alert_type === 'warning'
    ? colors.warningOrange
    : colors.primary;

  const handleAccept = async () => {
    RNAlert.alert(
      'Respond to Alert',
      'Are you sure you want to respond to this alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Respond',
          onPress: () => {
            // Navigate to alert respond map screen with alert ID
            (navigation as any).navigate('AlertRespondMap', { alertId: alert.id });
          }
        }
      ]
    );
  };

  const handleReject = () => {
    RNAlert.alert('Reject Alert', 'Alert rejected.');
    navigation.goBack();
  };

  const handleCall = () => {
    const phoneNumber = alert.user_phone || '911';
    const url = `tel:${phoneNumber}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) {
        Linking.openURL(url);
      } else {
        RNAlert.alert('Error', 'Unable to make phone call');
      }
    });
  };

  const handleOpenMaps = () => {
    const { latitude, longitude } = alert.location;
    const url = Platform.OS === 'ios'
      ? `http://maps.apple.com/?daddr=${latitude},${longitude}`
      : `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

    Linking.openURL(url).catch(() => {
      RNAlert.alert('Error', 'Unable to open maps application');
    });
  };

  return (
    <ScreenWrapper
      backgroundColor={colors.background}
    >
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={24} color={colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textOnPrimary }]}>Alert Details</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.contentWrapper}>
        {/* Static Map Display */}
        <View style={styles.mapContainer}>
          <View style={[styles.mapPlaceholder, { backgroundColor: colors.lightGrayBg }]}>
            <Icon name="location-on" size={48} color={colors.primary} />
            <Text style={[styles.mapTitle, { color: colors.darkText }]}>Alert Location</Text>
            <Text style={[styles.mapAddress, { color: colors.mediumText }]}>{alert.location?.address || 'Location not available'}</Text>

            {officerLocation && (
              <View style={styles.routeInfo}>
                <Icon name="directions" size={20} color={colors.secondary} />
                <Text style={styles.routeText}>
                  Distance: {calculateDistance(
                    officerLocation.latitude,
                    officerLocation.longitude,
                    alert.location.latitude,
                    alert.location.longitude
                  ).toFixed(1)} km away
                </Text>
              </View>
            )}

            <TouchableOpacity
              style={styles.openMapButton}
              onPress={handleOpenMaps}
            >
              <Icon name="map" size={16} color={colors.white} />
              <Text style={styles.openMapText}>Open in Maps</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Details card overlaid on top of map */}
        <View style={[styles.detailsCard, { backgroundColor: colors.surface }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          nestedScrollEnabled={true}
          bounces={false}
        >
          {/* Compact Alert Header - No Card */}
          <View style={styles.emergencyHeaderContainer}>
            <Icon
              name={getAlertTypeIcon()}
              size={16}
              color={alertTypeColor}
            />
            <Text style={[styles.emergencyType, { color: alertTypeColor }]}>
              {alertTypeInfo.type}
            </Text>
          </View>

          <Text style={[styles.alertTitle, { color: colors.darkText }]}>
            {alert.message}
          </Text>

          <Text style={[styles.alertDescription, { color: colors.mediumText }]}>
            {alertTypeInfo.description}
          </Text>

          {/* User Info Card */}
          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.cardHeader}>
              <Icon name="person" size={20} color={colors.primary} />
              <Text style={styles.cardTitle}>User Information</Text>
            </View>
            <Text style={styles.cardText}>Name: {alert.user_name}</Text>
            <Text style={styles.cardText}>Phone: {alert.user_phone}</Text>
            <Text style={styles.cardText}>Email: {alert.user_email}</Text>
          </View>

          {/* Location Info Card */}
          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.cardHeader}>
              <Icon name="location-on" size={20} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.darkText }]}>Location Details</Text>
            </View>
            <Text style={styles.cardText}>Address: {alert.location?.address}</Text>
            <Text style={styles.cardText}>
              Coordinates: {alert.location?.latitude.toFixed(6)}, {alert.location?.longitude.toFixed(6)}
            </Text>
            <Text style={styles.cardText}>
              Distance: {alert.distance?.toFixed(1)} km away
            </Text>
          </View>

          {/* Alert Info Card */}
          <View style={[styles.card, { backgroundColor: colors.cardBackground }]}>
            <View style={styles.cardHeader}>
              <Icon name="info" size={20} color={colors.primary} />
              <Text style={[styles.cardTitle, { color: colors.darkText }]}>Alert Information</Text>
            </View>
            <Text style={styles.cardText}>
              Priority: {alert.priority || 'normal'}
            </Text>
            <Text style={styles.cardText}>
              Type: {alert.original_alert_type || alert.alert_type || 'normal'}
            </Text>
            <Text style={styles.cardText}>
              Time: {formatRelativeTime(alert.timestamp)}
            </Text>
            <Text style={styles.cardText}>
              Alert ID: {alert.log_id}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.callButton]}
              onPress={handleCall}
            >
              <Icon name="call" size={20} color={colors.white} />
              <Text style={styles.buttonText}>Call User</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.rejectButton]}
              onPress={handleReject}
            >
              <Icon name="close" size={20} color={colors.white} />
              <Text style={styles.buttonText}>Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.acceptButton]}
              onPress={handleAccept}
            >
              <Icon name="check" size={20} color={colors.white} />
              <Text style={styles.buttonText}>Respond</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
        </View>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightGrayBg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingBottom: spacing.md,
    backgroundColor: colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
    zIndex: 1000,
  },
  backButton: {
    padding: spacing.xs,
  },
  headerTitle: {
    ...typography.screenHeader,
    color: colors.white,
  },
  headerSpacer: {
    width: 40,
  },
  contentWrapper: {
    flex: 1,
    position: 'relative',
  },
  mapContainer: {
    height: 200,
    backgroundColor: colors.lightGrayBg,
    borderRadius: 12,
    overflow: 'hidden',
    margin: spacing.base,
    ...shadows.sm,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  mapTitle: {
    ...typography.sectionHeader,
    color: colors.darkText,
    marginTop: 10,
    marginBottom: 5,
  },
  mapAddress: {
    ...typography.body,
    color: colors.mediumGray,
    textAlign: 'center',
    marginBottom: 15,
  },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    marginBottom: 15,
    ...shadows.sm,
  },
  routeText: {
    ...typography.caption,
    color: colors.secondary,
    marginLeft: 5,
  },
  openMapButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    ...shadows.sm,
  },
  openMapText: {
    ...typography.buttonSmall,
    color: colors.white,
    marginLeft: 5,
  },
  detailsCard: {
    backgroundColor: colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    flex: 1,
    ...shadows.lg,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  emergencyHeaderContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emergencyType: {
    ...typography.caption,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  emergencyTypbuttonText: {
    ...typography.body,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  alertTitle: {
    ...typography.sectionHeader,
    color: colors.darkText,
    marginBottom: spacing.sm,
  },
  alertDescription: {
    ...typography.body,
    color: colors.mediumGray,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.lightGrayBg,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    ...typography.bodyMedium,
    color: colors.darkText,
    fontWeight: '600',
    marginLeft: spacing.xs,
  },
  cardText: {
    ...typography.body,
    color: colors.mediumGray,
    marginBottom: spacing.xs,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.md,
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 12,
    marginHorizontal: spacing.xs,
  },
  callButton: {
    backgroundColor: colors.successGreen,
  },
  rejectButton: {
    backgroundColor: colors.emergencyRed,
  },
  acceptButton: {
    backgroundColor: colors.primary,
  },
  buttonText: {
    ...typography.buttonMedium,
    color: colors.white,
    marginLeft: spacing.xs,
  },
  // Error handling styles
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
    color: colors.emergencyRed,
  },
  backButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.white,
  },
});