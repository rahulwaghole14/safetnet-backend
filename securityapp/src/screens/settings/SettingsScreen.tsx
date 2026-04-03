import React, { useState } from 'react';
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
import { toggleNotifications, toggleLocationTracking, setThemeMode } from '../../store/slices/settingsSlice';

interface SettingItem {
  title: string;
  subtitle?: string;
  type: 'toggle' | 'navigation' | 'action' | 'info' | 'theme';
  value?: boolean;
  onToggle?: (value: boolean) => void;
  onPress?: () => void;
  loading?: boolean;
  themeOptions?: { value: string; label: string; icon: string }[];
  selectedTheme?: string;
  onThemeChange?: (theme: string) => void;
}
import { authService } from '../../api/services';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../utils';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';

export const SettingsScreen = ({ navigation }: any) => {
  const dispatch = useAppDispatch();
  const settings = useAppSelector((state) => state.settings);
  const officer = useAppSelector((state) => state.auth.officer);
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
    themeOptionsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: spacing.sm,
    },
    themeOptionContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: 20,
      borderWidth: 2.5,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
      marginHorizontal: 4,
      minHeight: 85,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 3,
    },
    selectedThemeOptionContainer: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      borderWidth: 3,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.4,
      shadowRadius: 15,
      elevation: 8,
      transform: [{ scale: 1.03 }],
    },
    themeOptionIconContainer: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.xs,
      borderWidth: 1.5,
      borderColor: colors.border,
    },
    selectedThemeIconContainer: {
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      borderColor: 'rgba(255, 255, 255, 0.4)',
      borderWidth: 2,
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
    actionButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: 12,
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    actionButtonDisabled: {
      opacity: 0.6,
    },
    actionButtonText: {
      ...typography.buttonSmall,
      color: colors.textOnPrimary,
      fontWeight: '600',
    },
    themeOptions: {
      flexDirection: 'row',
      gap: 0,
    },
    themeContainer: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-around',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.base,
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      marginHorizontal: spacing.base,
      marginVertical: 0,
    },
    themeOptionCard: {
      flex: 1,
      padding: spacing.xs,
      borderRadius: 12,
      alignItems: 'flex-start',
      justifyContent: 'center',
      minHeight: 10,
      backgroundColor: colors.background,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    themeOptionContent: {
      alignItems: 'flex-start',
      gap: 2,
    },
    themeOption: {
      width: 100,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderRadius: 12,
      borderWidth: 1,
      backgroundColor: colors.background,
      alignItems: 'flex-start',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 6,
      elevation: 3,
    },
    themeOptionText: {
      ...typography.caption,
      fontWeight: '600',
      fontSize: 13,
      textAlign: 'center',
    },
    selectedIndicator: {
      position: 'absolute',
      top: 8,
      right: 8,
      borderRadius: 12,
      width: 20,
      height: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 4,
      elevation: 3,
    },
    dropdownContainer: {
      marginHorizontal: 0,
      marginBottom: 0,
      paddingVertical: 0,
    },
    dropdownButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dropdownContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
    dropdownText: {
      ...typography.body,
      color: colors.darkText,
      fontSize: 16,
      fontWeight: '500',
    },
    dropdownArrow: {
      marginLeft: spacing.xs,
    },
    dropdownOptions: {
      backgroundColor: colors.cardBackground,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 4,
      marginTop: spacing.sm,
    },
    dropdownOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.lg,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    selectedDropdownOption: {
      backgroundColor: colors.primary,
    },
    dropdownOptionText: {
      ...typography.body,
      color: colors.darkText,
      fontSize: 16,
      fontWeight: '500',
      flex: 1,
    },
    selectedDropdownOptionText: {
      color: colors.white,
      fontWeight: '600',
    },
    optionCheck: {
      marginLeft: spacing.sm,
    },
    themeSelectorContainer: {
      paddingVertical: spacing.sm,
    },
    sectionDescription: {
      ...typography.caption,
      color: colors.mediumText,
      fontSize: 14,
      marginBottom: spacing.sm,
    },
    themeOptionsContainer: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    themeOptionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
      flex: 1,
    },
    selectedThemeOption: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    themeOptionButtonText: {
      ...typography.caption,
      color: colors.darkText,
      fontSize: 13,
      fontWeight: '600',
      textAlign: 'center',
      letterSpacing: 0.2,
    },
    selectedThemeOptionText: {
      color: colors.white,
      fontWeight: '700',
    },
    themeOptionsInline: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    themeOptionInline: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.cardBackground,
      gap: 4,
    },
    selectedThemeOptionInline: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    themeOptionInlineText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.darkText,
    },
    selectedThemeOptionInlineText: {
      color: colors.white,
      fontWeight: '600',
    },
  });


  const settingsSections = [
    {
      title: 'Appearance',
      icon: 'palette',
      items: [
        {
          title: 'Theme',
          subtitle: 'Choose your preferred app theme',
          type: 'theme' as const,
          themeOptions: [
            { value: 'light', label: 'Light', icon: 'light-mode' },
            { value: 'dark', label: 'Dark', icon: 'dark-mode' },
            { value: 'system', label: 'System', icon: 'settings-system-daydream' },
          ],
          selectedTheme: settings.themeMode,
          onThemeChange: (theme: string) => {
            dispatch(setThemeMode(theme as 'light' | 'dark' | 'system'));
          },
        },
      ],
    },
    {
      title: 'Notifications',
      icon: 'notifications',
      items: [
        {
          title: 'Push Notifications',
          subtitle: 'Receive alerts and updates',
          type: 'toggle' as const,
          value: settings.notificationsEnabled,
          onToggle: (_value: boolean) => {
            dispatch(toggleNotifications());
          },
        },
        {
          title: 'Notification Settings',
          subtitle: 'Customize alert preferences',
          type: 'navigation' as const,
          onPress: () => navigation.navigate('NotificationSettings'),
        },
      ],
    },
    {
      title: 'Location & Privacy',
      icon: 'location-on',
      items: [
        {
          title: 'Location Tracking',
          subtitle: 'Allow location tracking for alerts',
          type: 'toggle' as const,
          value: settings.locationTrackingEnabled,
          onToggle: (_value: boolean) => {
            dispatch(toggleLocationTracking());
          },
        },
        {
          title: 'Privacy Settings',
          subtitle: 'Manage data and permissions',
          type: 'navigation' as const,
          onPress: () => navigation.navigate('Privacy'),
        },
      ],
    },
    {
      title: 'Profile',
      icon: 'person',
      items: [
        {
          title: 'Officer Information',
          subtitle: officer ? 'Security Officer - Active' : 'Not logged in',
          type: 'info' as const,
        },
      ],
    },
  ];

  const renderSettingItem = (item: SettingItem, index: number) => {
    return (
      <View key={index} style={[styles.settingItem, { borderBottomColor: colors.border }]}>
        <View style={styles.settingContent}>
          <Text style={[styles.settingTitle, { color: colors.darkText }]}>{item.title}</Text>
          {item.subtitle && (
            <Text style={[styles.settingSubtitle, { color: colors.mediumText }]}>{item.subtitle}</Text>
          )}
          
          {item.type === 'theme' && item.themeOptions && (
            <View style={styles.themeOptionsRow}>
              {item.themeOptions.map((option, index) => {
                const isSelected = item.selectedTheme === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.themeOptionContainer,
                      isSelected && styles.selectedThemeOptionContainer,
                    ]}
                    onPress={() => item.onThemeChange?.(option.value)}
                    activeOpacity={0.8}
                  >
                    <View style={[
                      styles.themeOptionIconContainer,
                      isSelected && styles.selectedThemeIconContainer,
                    ]}>
                      <Icon 
                        name={option.icon} 
                        size={20} 
                        color={isSelected ? colors.white : colors.primary} 
                      />
                    </View>
                    <Text style={[
                      styles.themeOptionButtonText,
                      isSelected && styles.selectedThemeOptionText
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {item.type === 'toggle' && item.onToggle && (
          <Switch
            value={item.value as boolean}
            onValueChange={item.onToggle}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={(item.value as boolean) ? colors.white : colors.mediumGray}
          />
        )}

        {item.type === 'navigation' && (
          <TouchableOpacity onPress={item.onPress} activeOpacity={0.7}>
            <Icon name="chevron-right" size={24} color={colors.mediumGray} />
          </TouchableOpacity>
        )}

        {item.type === 'action' && (
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.primary }, item.loading && styles.actionButtonDisabled]}
            onPress={item.onPress}
            disabled={item.loading}
            activeOpacity={0.7}
          >
            <Text style={[styles.actionButtonText, { color: colors.textOnPrimary }]}>
              {item.loading ? 'Testing...' : 'Test'}
            </Text>
          </TouchableOpacity>
        )}

      </View>
    );
  };

  return (
    <ScreenWrapper scrollable={false} backgroundColor={colors.background}>
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color={colors.darkText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.darkText }]}>Settings</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {settingsSections.map((section, index) => (
          <View key={index} style={styles.section}>
            <View style={styles.sectionHeader}>
              {section.icon && (
                <Icon name={section.icon} size={28} color={colors.white} style={styles.sectionIcon} />
              )}
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>
            <View style={styles.sectionContent}>
              {section.items.map(renderSettingItem)}
            </View>
          </View>
        ))}
      </ScrollView>
      </View>
    </ScreenWrapper>
  );
};