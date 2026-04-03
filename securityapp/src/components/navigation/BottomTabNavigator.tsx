import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors, colors } from '../../utils/colors';
import { typography, spacing } from '../../utils';

interface TabItem {
  name: string;
  label: string;
  icon: string;
  activeIcon?: string;
}

const tabs: TabItem[] = [
  { name: 'Home', label: 'Dashboard', icon: 'dashboard', activeIcon: 'dashboard' },
  { name: 'Alerts', label: 'Alerts', icon: 'notifications-none', activeIcon: 'notifications' },
  { name: 'GeofenceManagement', label: 'Geofence', icon: 'location-on', activeIcon: 'location-on' },
  { name: 'Profile', label: 'Profile', icon: 'person-outline', activeIcon: 'person' },
];

export const BottomTabNavigator = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const getActiveRouteName = () => {
    return route.name || '';
  };

  const activeRoute = getActiveRouteName();

  const handleTabPress = (tabName: string) => {
    try {
      // Navigate to the specific screen
      (navigation as any).navigate(tabName);
    } catch (error) {
      console.error('Navigation error:', error);
    }
  };

  // Determine bottom padding - use safe area inset or fallback to standard spacing
  const bottomPadding = Math.max(insets.bottom, spacing.sm);

  return (
    <View style={[styles(colors).container, { paddingBottom: bottomPadding }]}>
      {tabs.map((tab) => {
        // Check if this tab is active
        const isActive = activeRoute === tab.name;

        return (
          <TouchableOpacity
            key={tab.name}
            style={styles(colors).tab}
            onPress={() => handleTabPress(tab.name)}
            activeOpacity={0.7}
          >
            <Icon
              name={(isActive && tab.activeIcon) ? tab.activeIcon : tab.icon}
              size={24}
              color={isActive ? colors.primary : colors.lightText}
              style={styles(colors).icon}
            />
            <Text style={[styles(colors).label, isActive && styles(colors).activeLabel]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles(colors).activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: colors.tabBackground,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.base,
    justifyContent: 'space-around',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 8,
    minHeight: 60, // Ensure a minimum height for the tab bar
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    position: 'relative',
    paddingVertical: spacing.xs,
  },
  icon: {
    marginBottom: spacing.xs / 2,
  },
  label: {
    ...typography.caption,
    color: colors.tabInactive,
    fontSize: 12,
  },
  activeLabel: {
    color: colors.tabActive,
    fontWeight: '600',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -spacing.xs,
    left: '50%',
    marginLeft: -20,
    width: 40,
    height: 3,
    backgroundColor: colors.tabActive,
    borderRadius: 2,
  },
});