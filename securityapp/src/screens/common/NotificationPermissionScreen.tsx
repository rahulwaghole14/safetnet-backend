import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Linking,
} from 'react-native';
import { CustomAlert } from '../../components/common/CustomAlert';
import { useNavigation } from '@react-navigation/native';
import { useAppDispatch } from '../../store/hooks';
import { setNotificationPermissionGranted } from '../../store/slices/settingsSlice';
import { colors } from '../../utils/colors';
import { typography, spacing } from '../../utils';

export const NotificationPermissionScreen = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(false);

  const handleAllowNotifications = async () => {
    setIsLoading(true);
    try {
      // In a real app, you would request notification permissions here
      // For now, we'll simulate the permission request
      if (Platform.OS === 'ios') {
        // iOS permission request
        CustomAlert.alert(
          'Enable Notifications',
          'Please go to Settings > SafeTNet > Notifications and allow notifications.',
          [
            {
              text: 'Cancel',
              style: 'cancel',
              onPress: () => handleDenyNotifications(),
            },
            {
              text: 'Open Settings',
              onPress: () => {
                Linking.openSettings();
                handleDenyNotifications(); // Navigate away since user needs to go to settings
              },
            },
          ],
          { type: 'info' }
        );
      } else {
        // Android permission request
        // For Android 13+, we'd use PermissionsAndroid
        // For now, we'll assume permission is granted
        await new Promise(resolve => setTimeout(() => resolve(undefined), 1000)); // Simulate permission request
        dispatch(setNotificationPermissionGranted(true));
        navigation.navigate('Home' as never);
      }
    } catch (error) {
      console.error('Notification permission error:', error);
      CustomAlert.alert('Error', 'Failed to request notification permissions', [{ text: 'OK' }], { type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDenyNotifications = () => {
    dispatch(setNotificationPermissionGranted(false));
    navigation.navigate('Home' as never);
  };

  const handleSkipForNow = () => {
    // Allow user to skip and enable later in settings
    dispatch(setNotificationPermissionGranted(false));
    navigation.navigate('Home' as never);
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Text style={styles.icon}>🔔</Text>
        </View>

        <Text style={styles.title}>Stay Alert with Notifications</Text>

        <Text style={styles.description}>
          Enable notifications to receive instant alerts about emergencies,
          security updates, and important messages in your area.
        </Text>

        <View style={styles.featuresContainer}>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🚨</Text>
            <Text style={styles.featureText}>Emergency alerts</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>📍</Text>
            <Text style={styles.featureText}>Location updates</Text>
          </View>
          <View style={styles.featureItem}>
            <Text style={styles.featureIcon}>🛡️</Text>
            <Text style={styles.featureText}>Security notifications</Text>
          </View>
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.primaryButton]}
            onPress={handleAllowNotifications}
            disabled={isLoading}
          >
            <Text style={styles.primaryButtonText}>
              {isLoading ? 'Requesting...' : 'Allow Notifications'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleSkipForNow}
            disabled={isLoading}
          >
            <Text style={styles.secondaryButtonText}>Skip for Now</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.laterButton}
          onPress={handleDenyNotifications}
          disabled={isLoading}
        >
          <Text style={styles.laterButtonText}>Don't Ask Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
  },
  iconContainer: {
    marginBottom: spacing.lg,
  },
  icon: {
    fontSize: 80,
  },
  title: {
    ...typography.screenHeader,
    color: colors.darkText,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  description: {
    ...typography.body,
    color: colors.mediumText,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xl,
  },
  featuresContainer: {
    width: '100%',
    marginBottom: spacing.xl,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  featureText: {
    ...typography.body,
    color: colors.darkText,
    flex: 1,
  },
  buttonContainer: {
    width: '100%',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  button: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
    alignItems: 'center',
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
    ...typography.buttonLarge,
    color: colors.textOnPrimary,
    fontWeight: '600',
  },
  secondaryButtonText: {
    ...typography.buttonLarge,
    color: colors.primary,
    fontWeight: '600',
  },
  laterButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  laterButtonText: {
    ...typography.caption,
    color: colors.mediumText,
    textDecorationLine: 'underline',
  },
});