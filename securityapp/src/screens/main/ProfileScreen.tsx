import React, { useState, useEffect, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors } from '../../utils/colors';
import { typography, spacing, shadows } from '../../utils';
import { profileService } from '../../api/services/profileService';
import { authService } from '../../api/services';
import { SecurityOfficer } from '../../types/user.types';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';
import { useAppDispatch } from '../../store/hooks';
import { logout } from '../../store/slices/authSlice';

export const ProfileScreen = () => {
  const navigation = useNavigation();
  const colors = useColors();
  const dispatch = useAppDispatch();
  const [officer, setOfficer] = useState<SecurityOfficer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Log officer state changes
  useEffect(() => {
    console.log("Officer state changed:", officer);
  }, [officer]);

  // Fetch profile data when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('🔄 ProfileScreen focused, fetching fresh data...');
      fetchProfile();
    }, [])
  );

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log('🔄 Fetching profile data...');
      const profileData = await profileService.getProfile('');
      console.log('✅ Profile data loaded:', profileData);
      console.log("Officer state before setting:", officer);
      setOfficer(profileData);
      console.log("Officer state after setting:", profileData);
    } catch (error: any) {
      console.error('❌ Failed to fetch profile:', error);
      setError(error.message || 'Failed to load profile');
      // Set a default officer object to prevent crashes
      setOfficer({
        id: 0,
        security_id: 'N/A',
        name: 'Unknown Officer',
        email_id: 'N/A',
        mobile: '',
        security_role: 'guard',
        geofence_id: '',
        status: 'active',
        badge_number: 'N/A',
        shift_schedule: 'Day Shift',
        stats: {
          total_responses: 0,
          avg_response_time: 0,
          active_hours: 0,
          area_coverage: 0,
        },
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🚪 Logging out from ProfileScreen...');
              
              // Call backend logout service if available
              try {
                await authService.logout();
                console.log('✅ Backend logout successful');
              } catch (backendError) {
                console.warn('⚠️ Backend logout failed, proceeding with local logout:', backendError);
              }
              
              // Dispatch Redux logout action
              dispatch(logout());
              console.log('✅ Redux logout dispatched');
              
              // Navigate to Auth stack and replace navigation stack
              (navigation as any).reset({
                index: 0,
                routes: [{ name: 'Auth' }],
              });
              console.log('✅ Navigated to Auth stack (Login screen)');
              
            } catch (error) {
              console.error('❌ Logout error:', error);
              // Even if there's an error, proceed with logout to prevent user being stuck
              dispatch(logout());
              (navigation as any).reset({
                index: 0,
                routes: [{ name: 'Auth' }],
              });
            }
          },
        },
      ]
    );
  };

  const handleEditProfile = () => {
    // Navigate to UpdateProfileScreen
    (navigation as any).navigate('UpdateProfile');
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      marginTop: spacing.md,
      fontSize: 16,
    },
    errorText: {
      fontSize: 16,
      textAlign: 'center',
      marginVertical: spacing.md,
    },
    retryButton: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderRadius: 8,
      marginTop: spacing.md,
    },
    retryButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    scrollContent: {
      paddingBottom: spacing.xl,
    },
    profileHeader: {
      paddingVertical: spacing.xl,
      alignItems: 'center',
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
      ...shadows.md,
    },
    profilePictureContainer: {
      position: 'relative',
      marginBottom: spacing.md,
    },
    profilePicture: {
      width: 100,
      height: 100,
      borderRadius: 50,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 3,
      ...shadows.sm,
    },
    profilePictureText: {
      ...typography.appTitle,
      fontSize: 36,
    },
    profileName: {
      ...typography.screenHeader,
      marginTop: spacing.sm,
    },
    profileId: {
      ...typography.body,
      marginTop: spacing.xs,
    },
    roleBadge: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 20,
      marginTop: spacing.md,
    },
    roleText: {
      ...typography.bodyMedium,
      textTransform: 'capitalize',
    },
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: -spacing.lg,
      paddingHorizontal: spacing.base,
    },
    statItem: {
      alignItems: 'center',
      borderRadius: 12,
      padding: spacing.md,
      minWidth: 90,
      ...shadows.md,
    },
    statNumber: {
      ...typography.screenHeader,
      marginBottom: spacing.xs,
    },
    statLabel: {
      ...typography.caption,
      textAlign: 'center',
    },
    cardsContainer: {
      padding: spacing.base,
      marginTop: spacing.md,
    },
    card: {
      borderRadius: 12,
      padding: spacing.base,
      marginBottom: spacing.md,
      ...shadows.sm,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    cardHeaderRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    cardTitle: {
      ...typography.sectionHeader,
    },
    cardSubtitle: {
      ...typography.bodyMedium,
      marginLeft: spacing.xs,
    },
    body: {
      ...typography.body,
      marginBottom: spacing.xs,
    },
    statusText: {
      ...typography.bodyMedium,
      textTransform: 'capitalize',
    },
    activeStatus: {
      color: '#10B981',
    },
    inactiveStatus: {
      color: '#EF4444',
    },
    updateProfileButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      padding: spacing.base,
      marginHorizontal: spacing.base,
      marginTop: spacing.lg,
      gap: spacing.sm,
    },
    updateProfileButtonText: {
      ...typography.buttonMedium,
    },
    logoutButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 12,
      padding: spacing.base,
      marginHorizontal: spacing.base,
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    logoutButtonText: {
      ...typography.buttonMedium,
    },
  });

  // Loading state
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.lightGrayBg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.mediumText }]}>Loading profile...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.lightGrayBg }]}>
        <Icon name="error" size={48} color={colors.emergencyRed} />
        <Text style={[styles.errorText, { color: colors.emergencyRed }]}>{error}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={fetchProfile}
          activeOpacity={0.7}
        >
          <Text style={[styles.retryButtonText, { color: colors.white }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // No profile data
  if (!officer) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.lightGrayBg }]}>
        <Icon name="person" size={48} color={colors.mediumText} />
        <Text style={[styles.errorText, { color: colors.emergencyRed }]}>No profile data available</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={fetchProfile}
          activeOpacity={0.7}
        >
          <Text style={[styles.retryButtonText, { color: colors.white }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScreenWrapper
      backgroundColor={colors.lightGrayBg}
      contentContainerStyle={styles.scrollContent}
    >
      {/* Profile Header */}
      <View style={[styles.profileHeader, { backgroundColor: colors.primary }]}>
        <View style={styles.profilePictureContainer}>
          <View style={[styles.profilePicture, { backgroundColor: colors.white, borderColor: colors.white }]}>
            <Text style={[styles.profilePictureText, { color: colors.primary }]}>
              {officer.name ? officer.name.split(' ').map(n => n[0]).join('').toUpperCase() : 'U'}
            </Text>
          </View>
        </View>
        <Text style={[styles.profileName, { color: colors.white }]}>{officer.name || 'Unknown Officer'}</Text>
        <Text style={[styles.profileId, { color: colors.white, opacity: 0.8 }]}>{officer.security_id}</Text>
        <View style={[styles.roleBadge, { backgroundColor: colors.white }]}>
          <Text style={[styles.roleText, { color: colors.primary }]}>{officer.security_role}</Text>
        </View>
      </View>

      {/* Stats Container */}
      <View style={styles.statsContainer}>
        <View style={[styles.statItem, { backgroundColor: colors.white }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>{officer.stats?.total_responses ?? 'N/A'}</Text>
          <Text style={styles.statLabel}>Responses</Text>
        </View>
        <View style={[styles.statItem, { backgroundColor: colors.white }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>{officer.stats?.avg_response_time !== undefined ? `${officer.stats.avg_response_time}m` : 'N/A'}</Text>
          <Text style={styles.statLabel}>Avg. Response</Text>
        </View>
        <View style={[styles.statItem, { backgroundColor: colors.white }]}>
          <Text style={[styles.statNumber, { color: colors.primary }]}>{officer.stats?.active_hours !== undefined ? `${officer.stats.active_hours}h` : 'N/A'}</Text>
          <Text style={styles.statLabel}>Active Hours</Text>
        </View>
      </View>

      {/* Cards Container */}
      <View style={styles.cardsContainer}>
        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.darkText }]}>Contact Information</Text>
          </View>
          <Text style={[styles.body, { color: colors.darkText }]}>Email: {officer.email_id}</Text>
          <Text style={[styles.body, { color: colors.darkText }]}>Mobile: {officer.mobile}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.darkText }]}>Work Details</Text>
          </View>
          <Text style={[styles.body, { color: colors.darkText }]}>Badge Number: {officer.badge_number}</Text>
          <Text style={[styles.body, { color: colors.darkText }]}>Shift: {officer.shift_schedule || 'Day Shift'}</Text>
          <Text style={[styles.body, { color: colors.darkText }]}>Geofence: {officer.assigned_geofence?.name || officer.geofence_name || 'Not Assigned'}</Text>
          <Text style={[styles.body, { color: colors.darkText }]}>Role: {officer.security_role}</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.white }]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, { color: colors.darkText }]}>Status</Text>
            <View style={styles.cardHeaderRight}>
              <Text style={[styles.statusText, officer.status === 'active' ? styles.activeStatus : styles.inactiveStatus]}>
                {officer.status}
              </Text>
            </View>
          </View>
          <Text style={[styles.body, { color: colors.darkText }]}>Member since: {officer.date_joined ? new Date(officer.date_joined).toLocaleDateString() : 'N/A'}</Text>
          <Text style={[styles.body, { color: colors.darkText }]}>Last login: {officer.last_login ? new Date(officer.last_login).toLocaleDateString() : 'N/A'}</Text>
        </View>
      </View>

      {/* Update Profile Button */}
      <TouchableOpacity style={[styles.updateProfileButton, { backgroundColor: colors.primary }]} onPress={handleEditProfile}>
        <Icon name="edit" size={20} color={colors.white} />
        <Text style={[styles.updateProfileButtonText, { color: colors.white }]}>Update Profile</Text>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.logoutButton, { backgroundColor: colors.emergencyRed }]} onPress={handleLogout}>
        <Text style={[styles.logoutButtonText, { color: colors.white }]}>Logout</Text>
      </TouchableOpacity>
    </ScreenWrapper>
  );
};
