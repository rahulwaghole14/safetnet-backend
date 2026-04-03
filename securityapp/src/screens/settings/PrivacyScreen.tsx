import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import {
  toggleLocationTracking,
  setNotificationPermissionGranted,
  toggleAnalytics,
  toggleCrashReports,
  togglePerformanceData,
  toggleBiometrics,
  toggleTwoFactor,
} from '../../store/slices/settingsSlice';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../utils';

export const PrivacyScreen = () => {
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings);
  const { colors } = useTheme();

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.base,
      paddingBottom: spacing.md,
      backgroundColor: colors.cardBackground,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 8,
      borderWidth: 1,
      borderBottomWidth: 2,
      borderColor: colors.border,
      borderBottomColor: colors.primary,
    },
    backButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTitle: {
      ...typography.screenHeader,
      color: colors.darkText,
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.5,
    },
    placeholder: {
      width: 40,
    },
    scrollView: {
      flex: 1,
      backgroundColor: colors.background,
    },
    section: {
      paddingHorizontal: spacing.md,
      marginBottom: spacing.lg,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    sectionIcon: {
      width: 32,
      height: 32,
      borderRadius: 16,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: spacing.md,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.primary,
    },
    sectionTitle: {
      ...typography.cardTitle,
      color: colors.darkText,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    sectionContent: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      padding: spacing.md,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 1.5,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    settingItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      borderBottomWidth: 1.5,
      backgroundColor: colors.cardBackground,
      borderBottomColor: colors.border,
    },
    settingContent: {
      flex: 1,
      flexDirection: 'column',
    },
    settingTitle: {
      ...typography.body,
      fontWeight: '600',
      color: colors.darkText,
      fontSize: 16,
      flex: 1,
    },
    settingSubtitle: {
      ...typography.caption,
      marginTop: 4,
      color: colors.mediumText,
      fontSize: 13,
    },
    infoText: {
      ...typography.caption,
      color: colors.mediumText,
      fontWeight: '500',
    },
  });

  const handleToggleLocation = () => {
    if (!settings.locationTrackingEnabled) {
      Alert.alert(
        'Location Permission',
        'This app needs location access to provide geofence alerts and location-based services. Would you like to enable it?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: () => dispatch(toggleLocationTracking()),
          },
        ]
      );
    } else {
      dispatch(toggleLocationTracking());
    }
  };

  const renderSettingItem = (item: {
    title: string;
    subtitle?: string;
    value?: boolean;
    onToggle?: () => void;
    onPress?: () => void;
    type: 'toggle' | 'navigation' | 'info';
  }) => {
    return (
      <View key={item.title} style={styles.settingItem}>
        <View style={styles.settingContent}>
          <Text style={styles.settingTitle}>{item.title}</Text>
          {item.subtitle && (
            <Text style={styles.settingSubtitle}>{item.subtitle}</Text>
          )}
        </View>

        {item.type === 'toggle' && (
          <Switch
            value={item.value}
            onValueChange={item.onToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={item.value ? colors.white : colors.mediumGray}
          />
        )}

        {item.type === 'navigation' && (
          <TouchableOpacity onPress={item.onPress} activeOpacity={0.7}>
            <Icon name="chevron-right" size={24} color={colors.mediumGray} />
          </TouchableOpacity>
        )}

        {item.type === 'info' && (
          <Text style={styles.infoText}>
            {item.value ? 'Enabled' : 'Disabled'}
          </Text>
        )}
      </View>
    );
  };

  return (
    <ScreenWrapper scrollable={true} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color={colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={styles.placeholder} />
      </View>

      <View style={{ flex: 1 }}>
        {/* Location Services */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="location-on" size={28} color={colors.white} style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Location Services</Text>
          </View>
          <View style={styles.sectionContent}>
            {renderSettingItem({
              title: 'Location Tracking',
              subtitle: 'Allow location tracking for geofence alerts',
              type: 'toggle',
              value: settings.locationTrackingEnabled,
              onToggle: handleToggleLocation,
            })}
            {renderSettingItem({
              title: 'Background Location',
              subtitle: 'Continue tracking when app is closed',
              type: 'toggle',
              value: settings.locationTrackingEnabled,
              onToggle: handleToggleLocation,
            })}
            {renderSettingItem({
              title: 'Geofence Alerts',
              subtitle: 'Get notified when entering monitored areas',
              type: 'info',
              value: settings.locationTrackingEnabled,
            })}
          </View>
        </View>

        {/* Data Collection */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="analytics" size={28} color={colors.white} style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Data Collection</Text>
          </View>
          <View style={styles.sectionContent}>
            {renderSettingItem({
              title: 'Analytics',
              subtitle: 'Help improve the app with usage data',
              type: 'toggle',
              value: settings.analyticsEnabled,
              onToggle: () => dispatch(toggleAnalytics()),
            })}
            {renderSettingItem({
              title: 'Crash Reports',
              subtitle: 'Automatically send crash reports',
              type: 'toggle',
              value: settings.crashReportsEnabled,
              onToggle: () => dispatch(toggleCrashReports()),
            })}
            {renderSettingItem({
              title: 'Performance Data',
              subtitle: 'Monitor app performance and speed',
              type: 'toggle',
              value: settings.performanceDataEnabled,
              onToggle: () => dispatch(togglePerformanceData()),
            })}
          </View>
        </View>

        {/* Permissions */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="security" size={28} color={colors.white} style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Permissions</Text>
          </View>
          <View style={styles.sectionContent}>
            {renderSettingItem({
              title: 'Camera Access',
              subtitle: 'Required for photo evidence in alerts',
              type: 'info',
              value: true, // Could check actual permission status
            })}
            {renderSettingItem({
              title: 'Storage Access',
              subtitle: 'Save reports and evidence locally',
              type: 'info',
              value: true, // Could check actual permission status
            })}
            {renderSettingItem({
              title: 'Notification Permission',
              subtitle: 'Receive alerts and updates',
              type: 'info',
              value: settings.notificationPermissionGranted,
            })}
          </View>
        </View>

        {/* Data Management */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="storage" size={28} color={colors.white} style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Data Management</Text>
          </View>
          <View style={styles.sectionContent}>
            {renderSettingItem({
              title: 'Clear Location History',
              subtitle: 'Remove stored location data',
              type: 'navigation',
              onPress: () => {
                Alert.alert(
                  'Clear Location History',
                  'This will permanently delete all stored location data. Are you sure?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        // Clear location history logic
                        Alert.alert('Success', 'Location history cleared');
                      },
                    },
                  ]
                );
              },
            })}
            {renderSettingItem({
              title: 'Export Data',
              subtitle: 'Download your data for backup',
              type: 'navigation',
              onPress: () => {
                Alert.alert('Coming Soon', 'Data export feature will be available soon');
              },
            })}
            {renderSettingItem({
              title: 'Delete Account',
              subtitle: 'Permanently delete your account and data',
              type: 'navigation',
              onPress: () => {
                Alert.alert(
                  'Delete Account',
                  'This action cannot be undone. All your data will be permanently deleted.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete Account',
                      style: 'destructive',
                      onPress: () => {
                        // Delete account logic
                        Alert.alert('Account Deleted', 'Your account has been permanently deleted');
                      },
                    },
                  ]
                );
              },
            })}
          </View>
        </View>

        {/* Security */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="lock" size={28} color={colors.white} style={styles.sectionIcon} />
            <Text style={styles.sectionTitle}>Security</Text>
          </View>
          <View style={styles.sectionContent}>
            {renderSettingItem({
              title: 'Biometric Authentication',
              subtitle: 'Use fingerprint/face unlock',
              type: 'toggle',
              value: settings.biometricEnabled,
              onToggle: () => dispatch(toggleBiometrics()),
            })}
            {renderSettingItem({
              title: 'Two-Factor Authentication',
              subtitle: 'Add extra security layer',
              type: 'toggle',
              value: settings.twoFactorEnabled,
              onToggle: () => dispatch(toggleTwoFactor()),
            })}
            {renderSettingItem({
              title: 'Change Password',
              subtitle: 'Update your account password',
              type: 'navigation',
              onPress: () => {
                navigation.navigate('ChangePassword');
              },
            })}
          </View>
        </View>
      </View>
    </ScreenWrapper>
  );
};