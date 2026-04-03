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
  toggleNotifications,
  setNotificationPermissionGranted,
  toggleQuietHours,
  toggleDoNotDisturb,
  toggleVibration,
  toggleSound,
} from '../../store/slices/settingsSlice';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../utils';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';

export const NotificationSettingsScreen = () => {
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
    permissionItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: spacing.md,
    },
    permissionInfo: {
      flex: 1,
    },
    permissionTitle: {
      ...typography.body,
      color: colors.darkText,
      fontWeight: '500',
    },
    permissionStatus: {
      ...typography.caption,
      marginTop: 2,
    },
    grantButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: 12,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    grantButtonText: {
      ...typography.buttonSmall,
      color: colors.textOnPrimary,
      fontWeight: '600',
    },
  });

  const handleToggleNotifications = () => {
    if (!settings.notificationsEnabled && !settings.notificationPermissionGranted) {
      // If notifications are disabled and permission not granted, show alert
      Alert.alert(
        'Enable Notifications',
        'Notifications are currently disabled. Would you like to enable them?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Enable',
            onPress: () => {
              dispatch(setNotificationPermissionGranted(true));
              dispatch(toggleNotifications());
            },
          },
        ]
      );
    } else {
      dispatch(toggleNotifications());
    }
  };

  const renderSettingItem = (item: {
    title: string;
    subtitle?: string;
    value?: boolean;
    onToggle?: () => void;
    onPress?: () => void;
    type: 'toggle' | 'navigation';
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
      </View>
    );
  };

  return (
    <ScreenWrapper scrollable={false} backgroundColor={colors.background}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <Icon name="arrow-back" size={24} color={colors.darkText} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notification Settings</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {/* General Settings */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="notifications" size={28} color={colors.white} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>General</Text>
            </View>
            <View style={styles.sectionContent}>
              {renderSettingItem({
                title: 'Push Notifications',
                subtitle: 'Receive alerts and updates',
                type: 'toggle',
                value: settings.notificationsEnabled,
                onToggle: handleToggleNotifications,
              })}
              {renderSettingItem({
                title: 'Emergency Alerts',
                subtitle: 'Critical security notifications',
                type: 'toggle',
                value: settings.notificationsEnabled, // Could be separate setting
                onToggle: handleToggleNotifications,
              })}
            </View>
          </View>

          {/* Alert Types */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="warning" size={28} color={colors.white} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Alert Types</Text>
            </View>
            <View style={styles.sectionContent}>
              {renderSettingItem({
                title: 'Security Alerts',
                subtitle: 'Intrusion and breach notifications',
                type: 'toggle',
                value: settings.notificationsEnabled,
                onToggle: handleToggleNotifications,
              })}
              {renderSettingItem({
                title: 'Location Updates',
                subtitle: 'Geofence entry/exit alerts',
                type: 'toggle',
                value: settings.notificationsEnabled,
                onToggle: handleToggleNotifications,
              })}
              {renderSettingItem({
                title: 'System Status',
                subtitle: 'Service availability updates',
                type: 'toggle',
                value: settings.notificationsEnabled,
                onToggle: handleToggleNotifications,
              })}
            </View>
          </View>

          {/* Schedule */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="schedule" size={28} color={colors.white} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Schedule</Text>
            </View>
            <View style={styles.sectionContent}>
              {renderSettingItem({
                title: 'Quiet Hours',
                subtitle: 'Disable notifications 10 PM - 6 AM',
                type: 'toggle',
                value: settings.quietHoursEnabled,
                onToggle: () => dispatch(toggleQuietHours()),
              })}
              {renderSettingItem({
                title: 'Do Not Disturb',
                subtitle: 'Temporarily silence all notifications',
                type: 'toggle',
                value: settings.doNotDisturbEnabled,
                onToggle: () => dispatch(toggleDoNotDisturb()),
              })}
            </View>
          </View>

          {/* Advanced */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="settings" size={28} color={colors.white} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Advanced</Text>
            </View>
            <View style={styles.sectionContent}>
              {renderSettingItem({
                title: 'Vibration',
                subtitle: 'Vibrate for notifications',
                type: 'toggle',
                value: settings.vibrationEnabled,
                onToggle: () => dispatch(toggleVibration()),
              })}
              {renderSettingItem({
                title: 'Sound',
                subtitle: 'Play notification sounds',
                type: 'toggle',
                value: settings.soundEnabled,
                onToggle: () => dispatch(toggleSound()),
              })}
            </View>
          </View>

          {/* Permission Status */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="security" size={28} color={colors.white} style={styles.sectionIcon} />
              <Text style={styles.sectionTitle}>Permission Status</Text>
            </View>
            <View style={styles.sectionContent}>
              <View style={styles.permissionItem}>
                <View style={styles.permissionInfo}>
                  <Text style={styles.permissionTitle}>Notification Permission</Text>
                  <Text style={[styles.permissionStatus, {
                    color: settings.notificationPermissionGranted ? colors.success : colors.error
                  }]}>
                    {settings.notificationPermissionGranted ? 'Granted' : 'Not Granted'}
                  </Text>
                </View>
                {!settings.notificationPermissionGranted && (
                  <TouchableOpacity
                    style={styles.grantButton}
                    onPress={() => {
                      dispatch(setNotificationPermissionGranted(true));
                      Alert.alert('Success', 'Notification permissions granted!');
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.grantButtonText}>Grant</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </ScreenWrapper>
  );
};