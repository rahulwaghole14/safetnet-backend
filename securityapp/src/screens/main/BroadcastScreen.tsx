import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  ScrollView,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';
import { useAppSelector } from '../../store/hooks';
import { Button } from '../../components/common/Button';
import { BroadcastProgressModal } from '../../components/modals/BroadcastProgressModal';
import { broadcastService } from '../../api/services/broadcastService';
import { profileService } from '../../api/services/profileService';
import { geofenceService } from '../../api/services/geofenceService';
import { requestLocationPermission } from '../../utils/permissions';
import { useAlerts } from '../../hooks/useAlerts';
import { colors } from '../../utils/colors';
import { typography, spacing } from '../../utils';
import Toast from 'react-native-toast-message';

export const BroadcastScreen = ({ navigation }: any) => {
  const officer = useAppSelector((state) => state.auth.officer);
  const { refreshAlerts } = useAlerts();
  const [message, setMessage] = useState('I need help, some one following me');
  const [alertType, setAlertType] = useState<'general' | 'warning' | 'emergency'>('general');
  const [showProgress, setShowProgress] = useState(false);
  const [broadcastProgress, setBroadcastProgress] = useState(0);
  const [totalUsers] = useState(24);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  // Automatically set high priority for emergency alerts
  const highPriority = alertType === 'emergency';

  const alertTypes = [
    { key: 'general' as const, label: 'General Notice', icon: 'notifications' },
    { key: 'warning' as const, label: 'Warning', icon: 'warning' },
    { key: 'emergency' as const, label: 'Emergency', icon: 'emergency' },
  ];

  const quickTemplates = [
    {
      id: 'suspicious',
      label: 'Suspicious activity',
      message: '⚠️ ALERT: Suspicious activity detected in the area. All personnel please remain vigilant and report any unusual behavior immediately.',
    },
    {
      id: 'secured',
      label: 'Area secured',
      message: '✅ UPDATE: Area has been secured and verified. Normal operations can resume. All clear for regular activities.',
    },
    {
      id: 'shift',
      label: 'Shift change',
      message: '📋 NOTICE: Shift change in progress. Incoming team is taking over patrol duties. All personnel please coordinate handover.',
    },
  ];

  const handleSend = async () => {
    if (!message.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: 'Please enter a message',
      });
      return;
    }

    if (!officer) return;

    setShowProgress(true);
    setBroadcastProgress(0);

    // Simulate progress
    const progressInterval = setInterval(() => {
      setBroadcastProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 10;
      });
    }, 200);

    try {
      // Request location permission first
      const hasPermission = await requestLocationPermission();
      
      if (!hasPermission) {
        Toast.show({
          type: 'error',
          text1: 'Permission Required',
          text2: 'Location permission is required to send alerts',
        });
        clearInterval(progressInterval);
        setShowProgress(false);
        setBroadcastProgress(0);
        return;
      }

      // Get geofence_id - use from officer or fetch from profile/geofence service if empty
      // IMPORTANT: Backend expects numeric geofence_id, not name string
      let geofenceId = officer.geofence_id;
      
      // Check if geofence_id is empty or not numeric
      if (!geofenceId || geofenceId === '' || geofenceId === '0' || isNaN(Number(geofenceId))) {
        console.log('[BroadcastScreen] geofence_id is empty or not numeric, fetching geofence details...');
        try {
          // First try to get geofence name from profile
          const profile = await profileService.getProfile(officer.security_id);
          console.log('[BroadcastScreen] Profile data:', JSON.stringify(profile, null, 2));
          
          const geofenceName = (profile && profile.officer_geofence) ||
                              (profile && profile.geofence_name) ||
                              (profile && profile.assigned_geofence && profile.assigned_geofence.name) ||
                              '';

          // Try to get numeric ID from assigned_geofence object (if profile has it)
          const assignedGeofence = (profile && profile.assigned_geofence);
          if (assignedGeofence && assignedGeofence.id) {
            geofenceId = String(assignedGeofence.id);
            console.log('[BroadcastScreen] ✅ Got numeric geofence_id from assigned_geofence.id:', geofenceId);
          } else if (geofenceName) {
            // If we have geofence name but not ID, fetch geofence details to get the ID
            console.log('[BroadcastScreen] Found geofence name:', geofenceName, '- fetching details to get ID...');
            try {
              const geofenceDetails = await geofenceService.getGeofenceDetails(geofenceName);
              // Extract ID from geofence_id field (should be numeric)
              if (geofenceDetails.geofence_id && !isNaN(Number(geofenceDetails.geofence_id))) {
                geofenceId = String(geofenceDetails.geofence_id);
                console.log('[BroadcastScreen] ✅ Got numeric geofence_id from geofence details:', geofenceId);
              } else {
                console.warn('[BroadcastScreen] ⚠️ Geofence details returned non-numeric ID:', geofenceDetails.geofence_id);
              }
            } catch (geofenceError: any) {
              console.warn('[BroadcastScreen] Failed to fetch geofence details:', geofenceError.message);
              // Check if geofenceService returned data with assigned_geofence
              if (geofenceError && geofenceError.response && geofenceError.response.data && geofenceError.response.data.assigned_geofence && geofenceError.response.data.assigned_geofence.id) {
                geofenceId = String(geofenceError.response.data.assigned_geofence.id);
                console.log('[BroadcastScreen] ✅ Got numeric geofence_id from error response:', geofenceId);
              }
            }
          } else {
            console.warn('[BroadcastScreen] No geofence name found in profile');
          }
        } catch (profileError) {
          console.warn('[BroadcastScreen] Failed to fetch profile for geofence_id:', profileError);
        }
      }
      
      // Final validation
      if (geofenceId && isNaN(Number(geofenceId))) {
        console.warn('[BroadcastScreen] ⚠️ WARNING: geofence_id is still not numeric:', geofenceId);
        console.warn('[BroadcastScreen] Backend might reject this or set geofence to null');
        // Try to extract ID from geofence name by fetching geofence details one more time
        try {
          const geofenceDetails = await geofenceService.getGeofenceDetails(geofenceId);
          if (geofenceDetails.geofence_id && !isNaN(Number(geofenceDetails.geofence_id))) {
            geofenceId = String(geofenceDetails.geofence_id);
            console.log('[BroadcastScreen] ✅ Finally got numeric geofence_id:', geofenceId);
          }
        } catch (finalError) {
          console.error('[BroadcastScreen] Could not convert geofence name to ID:', finalError);
        }
      }
      
      console.log('[BroadcastScreen] Final geofence_id to send:', geofenceId, '(type:', typeof geofenceId, ', isNumeric:', !isNaN(Number(geofenceId)), ')');

      // Send broadcast - location will be fetched by broadcastService if not provided
      const broadcastResult = await broadcastService.sendBroadcast({
        security_id: officer.security_id,
        geofence_id: geofenceId || '',
        message: message.trim(),
        alert_type: alertType,
        priority: highPriority,
        // location_lat and location_long will be fetched by service if not provided
      });

      console.log('[BroadcastScreen] Broadcast sent successfully:', broadcastResult);

      clearInterval(progressInterval);
      setBroadcastProgress(100);

      // Refresh alerts after successful broadcast
      try {
        console.log('[BroadcastScreen] Refreshing alerts after broadcast...');
        await refreshAlerts();
        console.log('[BroadcastScreen] Alerts refreshed');
      } catch (refreshError) {
        console.warn('[BroadcastScreen] Failed to refresh alerts:', refreshError);
        // Don't fail the broadcast if refresh fails
      }

      setTimeout(() => {
        setShowProgress(false);
        Toast.show({
          type: 'success',
          text1: 'Success',
          text2: 'Broadcast sent successfully',
        });
        navigation.goBack();
      }, 500);
    } catch (error: any) {
      clearInterval(progressInterval);
      setShowProgress(false);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: error.message || 'Failed to send broadcast',
      });
    }
  };

  return (
    <ScreenWrapper
      backgroundColor={colors.background}
    >
      <BroadcastProgressModal
        visible={showProgress}
        progress={broadcastProgress}
        totalUsers={totalUsers}
        onCancel={() => {
          setShowProgress(false);
          setBroadcastProgress(0);
        }}
      />
      <View style={[styles.header, { backgroundColor: colors.white, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={[styles.cancelText, { color: colors.primary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.darkText }]}>SEND ALERT</Text>
        <TouchableOpacity>
          <Text style={styles.infoIcon}>ℹ️</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ALERT TYPE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {alertTypes.map((type) => (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.alertTypePill,
                  alertType === type.key && styles.selectedPill,
                ]}
                onPress={() => setAlertType(type.key)}
              >
                <Icon
                  name={type.icon}
                  size={20}
                  color={alertType === type.key ? colors.white : colors.darkText}
                  style={styles.alertTypeIcon}
                />
                <Text
                  style={[
                    styles.alertTypeText,
                    alertType === type.key && styles.selectedPillText,
                  ]}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>MESSAGE</Text>
          <TextInput
            style={[styles.messageInput, { backgroundColor: colors.inputBackground, borderColor: colors.inputBorder, color: colors.darkText }]}
            placeholder="Type your message"
            placeholderTextColor={colors.inputPlaceholder}
            multiline
            numberOfLines={8}
            value={message}
            onChangeText={(text) => {
              setMessage(text);
              // Clear selected template if user manually edits the message
              if (selectedTemplate && text !== (quickTemplates.find(t => t.id === selectedTemplate) || {}).message) {
                setSelectedTemplate(null);
              }
            }}
            maxLength={500}
          />
          <Text style={styles.charCount}>{message.length} / 500</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>QUICK TEMPLATES</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {quickTemplates.map((template) => (
              <TouchableOpacity
                key={template.id}
                style={[
                  styles.templatePill,
                  selectedTemplate === template.id && styles.selectedTemplatePill,
                ]}
                onPress={() => {
                  setMessage(template.message);
                  setSelectedTemplate(template.id);
                }}
              >
                <Text
                  style={[
                    styles.templateText,
                    selectedTemplate === template.id && styles.selectedTemplateText,
                  ]}
                >
                  {template.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          title="SEND BROADCAST"
          onPress={handleSend}
          variant="primary"
          style={styles.sendButton}
          icon={<Text style={styles.sendIcon}>✈️</Text>}
        />
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.footerCancel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderGray,
  },
  cancelText: {
    ...typography.secondary,
    color: colors.primary,
  },
  title: {
    ...typography.sectionHeader,
  },
  infoIcon: {
    fontSize: 20,
    color: colors.primary,
  },
  content: {
    flex: 1,
    padding: spacing.base,
  },
  infoBanner: {
    backgroundColor: colors.badgeBlueBg,
    padding: spacing.md,
    borderRadius: 10,
    marginBottom: spacing.lg,
  },
  infoText: {
    ...typography.secondary,
    color: colors.secondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    ...typography.caption,
    color: colors.lightText,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
    fontWeight: '600',
  },
  alertTypePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.sm,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.borderGray,
    marginRight: spacing.sm,
  },
  selectedPill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  alertTypeIcon: {
    marginRight: spacing.xs,
  },
  alertTypeText: {
    ...typography.buttonLarge,
    color: colors.darkText,
  },
  selectedPillText: {
    color: colors.white,
  },
  messageInput: {
    borderWidth: 1,
    borderColor: colors.borderGray,
    borderRadius: 12,
    padding: spacing.base,
    minHeight: 180,
    ...typography.body,
    textAlignVertical: 'top',
  },
  charCount: {
    ...typography.caption,
    textAlign: 'right',
    marginTop: spacing.xs,
  },
  requiredText: {
    ...typography.caption,
    color: colors.emergencyRed || '#FF0000',
    marginTop: spacing.xs,
    fontSize: 12,
  },
  templatePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.borderGray,
    backgroundColor: colors.white,
    marginRight: spacing.sm,
  },
  selectedTemplatePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  templateText: {
    ...typography.secondary,
    color: colors.darkText,
  },
  selectedTemplateText: {
    color: colors.white,
    fontWeight: '600',
  },
  recipientsCard: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    padding: spacing.base,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderGray,
    marginBottom: spacing.md,
  },
  recipientsIcon: {
    fontSize: 32,
    marginRight: spacing.md,
  },
  recipientsInfo: {
    flex: 1,
  },
  recipientsTitle: {
    ...typography.cardTitle,
    marginBottom: spacing.xs,
  },
  recipientsSubtitle: {
    ...typography.caption,
    color: colors.lightText,
  },
  priorityCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    padding: spacing.base,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderGray,
  },
  priorityLeft: {
    flex: 1,
  },
  priorityTitle: {
    ...typography.secondary,
    marginBottom: spacing.xs,
  },
  prioritySubtitle: {
    ...typography.caption,
    color: colors.lightText,
  },
  footer: {
    padding: spacing.base,
    borderTopWidth: 1,
    borderTopColor: colors.borderGray,
  },
  sendButton: {
    width: '100%',
    marginBottom: spacing.sm,
  },
  sendIcon: {
    fontSize: 18,
  },
  footerCancel: {
    ...typography.secondary,
    textAlign: 'center',
    color: colors.lightText,
  },
});

