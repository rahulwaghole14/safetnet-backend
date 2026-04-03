import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { DashboardScreenWithBottomNav } from '../screens/main/DashboardScreenWithBottomNav';
import { ProfileScreen } from '../screens/main/ProfileScreen';
import { AlertsScreenWithBottomNav } from '../screens/main/AlertsScreenWithBottomNav';
import { ProfileScreenWithBottomNav } from '../screens/main/ProfileScreenWithBottomNav';
import { GeofenceManagementScreenWithBottomNav } from '../screens/main/GeofenceManagementScreenWithBottomNav';
import { BroadcastScreen } from '../screens/main/BroadcastScreen';
import { AlertResponseScreen } from '../screens/main/AlertResponseScreen';
import { AlertsMapScreen } from '../screens/main/AlertsMapScreen';
import { AlertRespondMapScreen } from '../screens/main/AlertRespondMapScreen';
import { SettingsScreen } from '../screens/settings/SettingsScreen';
import { NotificationSettingsScreen } from '../screens/settings/NotificationSettingsScreen';
import { PrivacyScreen } from '../screens/settings/PrivacyScreen';
import { SearchScreen } from '../screens/common/SearchScreen';
import { OfflineScreen } from '../screens/common/OfflineScreen';
import { APITestScreen } from '../screens/test/APITestScreen';
import { UpdateProfileScreen } from '../screens/main/UpdateProfileScreen';
import { ChangePasswordScreen } from '../screens/settings/ChangePasswordScreen';
import SOSPage from '../components/common/SOSPage';

const Stack = createNativeStackNavigator();

export const MainNavigator = () => {
  return (
    <Stack.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen
        name="Home"
        component={DashboardScreenWithBottomNav}
      />
      <Stack.Screen
        name="Alerts"
        component={AlertsScreenWithBottomNav}
      />
      <Stack.Screen
        name="GeofenceManagement"
        component={GeofenceManagementScreenWithBottomNav}
      />
      <Stack.Screen
        name="Profile"
        component={ProfileScreenWithBottomNav}
      />
      <Stack.Screen
        name="Broadcast"
        component={BroadcastScreen}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
      />
      <Stack.Screen
        name="NotificationSettings"
        component={NotificationSettingsScreen}
      />
      <Stack.Screen
        name="Privacy"
        component={PrivacyScreen}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
      />
      <Stack.Screen
        name="AlertResponse"
        component={AlertResponseScreen}
      />
      <Stack.Screen
        name="AlertsMap"
        component={AlertsMapScreen}
      />
      <Stack.Screen
        name="AlertRespondMap"
        component={AlertRespondMapScreen}
      />
      <Stack.Screen
        name="UpdateProfile"
        component={UpdateProfileScreen}
      />
      <Stack.Screen
        name="Search"
        component={SearchScreen}
      />
      <Stack.Screen
        name="Offline"
        component={OfflineScreen}
      />
      <Stack.Screen
        name="SOS"
        component={SOSPage}
      />
      <Stack.Screen
        name="APITest"
        component={APITestScreen}
      />
    </Stack.Navigator>
  );
};