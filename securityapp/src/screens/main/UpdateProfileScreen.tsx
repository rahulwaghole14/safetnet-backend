import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
} from 'react-native';
import { useAppSelector, useAppDispatch } from '../../store/hooks';
import { updateOfficerProfile } from '../../store/slices/authSlice';
import { profileService } from '../../api/services/profileService';
import { useColors } from '../../utils/colors';
import { shadows, spacing, typography } from '../../utils';
import Icon from 'react-native-vector-icons/MaterialIcons';

export const UpdateProfileScreen = ({ navigation, route }: any) => {
  const colors = useColors();
  const officer = useAppSelector((state) => state.auth.officer);
  const dispatch = useAppDispatch();
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [badgeNumber, setBadgeNumber] = useState('');
  const [shiftSchedule, setShiftSchedule] = useState('');

  // Load profile data when component mounts
  useEffect(() => {
    const loadProfileData = async () => {
      if (!(officer && officer.security_id)) return;

      try {
        setIsLoading(true);
        const profile: any = await profileService.getProfile(officer.security_id);
        
        // Extract and set form values
        setName(
          profile.officer_name ||
          profile.name ||
          (profile.first_name && profile.last_name 
            ? `${profile.first_name} ${profile.last_name}`.trim() 
            : '') ||
          profile.first_name ||
          officer.name ||
          ''
        );
        setEmail(profile.email_id || profile.email || profile.officer_email || officer.email_id || '');
        
        // Extract phone number - API returns it in 'phone' field, profileService maps to 'mobile'
        const phoneNumber = profile.mobile || profile.phone || officer.mobile || '';
        
        console.log('[UpdateProfileScreen] Phone number extraction:', {
          'profile.mobile': profile.mobile,
          'profile.phone': profile.phone,
          'officer.mobile': officer.mobile,
          'extracted_phone': phoneNumber,
        });
        
        setMobile(phoneNumber);
        setBadgeNumber(profile.badge_number || profile.badge_id || officer.badge_number || '');
        setShiftSchedule(profile.shift_schedule || profile.shift || officer.shift_schedule || '');
      } catch (error: any) {
        console.error('[UpdateProfileScreen] Error loading profile:', error);
        // Use existing officer data as fallback
        setName(officer.name || '');
        setEmail(officer.email_id || '');
        setMobile(officer.mobile || '');
        setBadgeNumber(officer.badge_number || '');
        setShiftSchedule(officer.shift_schedule || '');
      } finally {
        setIsLoading(false);
      }
    };

    loadProfileData();
  }, [officer && officer.security_id]);

  const handleSave = async () => {
    if (!(officer && officer.security_id)) {
      Alert.alert('Error', 'Officer ID not found');
      return;
    }

    // Basic validation
    if (!name.trim()) {
      Alert.alert('Validation Error', 'Name is required');
      return;
    }

    if (!email.trim()) {
      Alert.alert('Validation Error', 'Email is required');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      Alert.alert('Validation Error', 'Please enter a valid email address');
      return;
    }

    setIsSaving(true);

    try {
      console.log('[UpdateProfileScreen] Starting profile update...');
      console.log('[UpdateProfileScreen] Officer data:', officer);
      
      const updateData = {
        name: name.trim(),
        email: email.trim(),
        phone: mobile.trim(),  // Send as 'phone' field for backend
        badge_number: badgeNumber.trim(),
        shift_schedule: shiftSchedule.trim() || '',
      };
      
      console.log('[UpdateProfileScreen] Sending update data:', JSON.stringify(updateData, null, 2));

      await profileService.updateProfile(officer.security_id, updateData);
      
      // Update local Redux store
      dispatch(updateOfficerProfile({
        name: name.trim(),
        email_id: email.trim(),
        mobile: mobile.trim(),
        badge_number: badgeNumber.trim(),
        shift_schedule: shiftSchedule.trim(),
      }));
      
      console.log('[UpdateProfileScreen] Update successful!');

      Alert.alert('Success', 'Profile updated successfully', [
        { 
          text: 'OK', 
          onPress: () => {
            // Navigate back and trigger refresh
            navigation.goBack();
          }
        }
      ]);

    } catch (error: any) {
      console.error('[UpdateProfileScreen] Error updating profile:', error);
      const errorMessage = error?.response?.data?.message ||
                          error?.message ||
                          'Failed to update profile';
      
      Alert.alert('Update Failed', errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.cardBackground, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Icon name="arrow-back" size={24} color={colors.darkText} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.darkText }]}>Update Profile</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Name Field */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: '#1F2937' }]}>Full Name *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', color: '#1F2937' }]}
            placeholder="Enter your full name"
            placeholderTextColor="#9CA3AF"
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
          />
        </View>

        {/* Email Field */}
        <View style={styles.section}>
          <Text style={[styles.label, { color: '#1F2937' }]}>Email *</Text>
          <TextInput
            style={[styles.input, { backgroundColor: '#F9FAFB', borderColor: '#E5E7EB', color: '#1F2937' }]}
            placeholder="Enter your email"
            placeholderTextColor="#9CA3AF"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        {/* Phone Field */}
        <View style={styles.section}>
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your phone number"
            placeholderTextColor="#6B7280"
            value={mobile}
            onChangeText={setMobile}
            keyboardType="phone-pad"
          />
        </View>

        {/* Badge Number Field */}
        <View style={styles.section}>
          <Text style={styles.label}>Badge Number</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter badge number"
            placeholderTextColor="#6B7280"
            value={badgeNumber}
            onChangeText={setBadgeNumber}
            autoCapitalize="characters"
          />
        </View>

        {/* Shift Schedule Field */}
        <View style={styles.section}>
          <Text style={styles.label}>Shift Schedule</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., Morning Shift (6 AM - 2 PM)"
            placeholderTextColor="#6B7280"
            value={shiftSchedule}
            onChangeText={setShiftSchedule}
            multiline
            numberOfLines={2}
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={[styles.saveButton, { backgroundColor: isSaving ? '#E5E7EB' : '#2563EB' }, isSaving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving}
          activeOpacity={0.8}
        >
          {isSaving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={[styles.saveButtonText, { color: '#FFFFFF' }]}>SAVE CHANGES</Text>
          )}
        </TouchableOpacity>

        {/* Cancel Button */}
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.cancelButtonText}>CANCEL</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1F2937',
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    ...shadows.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.screenHeader,
    color: '#1F2937',
    fontSize: 18,
  },
  placeholder: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  section: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  saveButton: {
    height: 52,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 12,
    ...shadows.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  cancelButton: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    letterSpacing: 0.5,
  },
});

