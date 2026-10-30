import React, { useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { AlertsScreen } from './AlertsScreen';

type AlertsScreenRef = React.RefObject<{
  fetchAlertsWithRetry: () => void;
}>;
import { BottomTabNavigator } from '../../components/navigation/BottomTabNavigator';
import { colors } from '../../utils/colors';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { typography, spacing } from '../../utils';
import { alertService } from '../../api/services/alertService';
import { useAlertsStore } from '../../store/alertsStore';
import { useSelector } from 'react-redux';
import { RootState } from '../../store/store';
import Toast from 'react-native-root-toast';
import { broadcastService } from '../../api/services/broadcastService';

export const AlertsScreenWithBottomNav = ({ navigation }: any) => {

  // ALL useState hooks must be called first
  // Create alert modal state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creatingAlert, setCreatingAlert] = useState(false);
  const [alertType, setAlertType] = useState<'emergency' | 'security' | 'general'>('security');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertDescription, setAlertDescription] = useState('');

  // Other hooks can be called after all useState hooks
  const { createAlert: storeCreateAlert } = useAlertsStore();
  const officer = useSelector((state: RootState) => state.auth.officer);

  // Ref to access AlertsScreen methods
  const alertsScreenRef = useRef<{
    fetchAlertsWithRetry: () => void;
  }>(null);

  const handleCreateAlert = async () => {
    if (!alertMessage.trim()) {
      Toast.show('Please enter an alert message', {
        duration: Toast.durations.LONG,
        position: Toast.positions.TOP,
        backgroundColor: colors.emergencyRed,
        textColor: 'white',
        shadow: true,
        animation: true,
        hideOnPress: true,
        delay: 0,
      });
      return;
    }

    if (!officer) {
      Toast.show('Officer information not available', {
        duration: Toast.durations.LONG,
        position: Toast.positions.TOP,
        backgroundColor: colors.emergencyRed,
        textColor: 'white',
        shadow: true,
        animation: true,
        hideOnPress: true,
        delay: 0,
      });
      return;
    }

    console.log('🚨 Creating area evacuation alert...');
    console.log('📝 Alert data:', {
      alertType,
      alertMessage: alertMessage.trim(),
      alertDescription: alertDescription.trim() || alertMessage.trim(),
    });
    console.log('👮 Officer data:', {
      security_id: officer.security_id,
      geofence_id: officer.geofence_id,
      name: officer.name
    });

    setCreatingAlert(true);
    try {
      // Use area_user_alert type for officer→user broadcasts
      // Backend will automatically filter recipients by officer's geofence
      const alertData = {
        alert_type: 'area_user_alert' as const,
        message: alertMessage.trim(),
        description: alertDescription.trim() || alertMessage.trim(),
        priority: (alertType === 'emergency' ? 'high' : alertType === 'security' ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      };

      // Create alert using existing SOS endpoint with area_user_alert type
      const alertResult = await storeCreateAlert(alertData);

      console.log('✅ Area evacuation alert created successfully:', alertResult);

      // Reset form and close modal
      setAlertMessage('');
      setAlertDescription('');
      setAlertType('security');
      setCreateModalVisible(false);

      Toast.show('Evacuation alert sent successfully!', {
        duration: Toast.durations.LONG,
        position: Toast.positions.TOP,
        backgroundColor: colors.successGreen,
        textColor: 'white',
        shadow: true,
        animation: true,
        hideOnPress: true,
        delay: 0,
      });
    } catch (error: any) {
      console.error('❌ Failed to create evacuation alert:', error);

      // Handle specific error types
      if (error.message?.includes('geofence') || error.response?.data?.message?.includes('geofence')) {
        Toast.show('Geofence not configured. Please contact administrator.', {
          duration: Toast.durations.LONG,
          position: Toast.positions.TOP,
          backgroundColor: colors.emergencyRed,
          textColor: 'white',
          shadow: true,
          animation: true,
          hideOnPress: true,
          delay: 0,
        });
      } else {
        Toast.show('Failed to send evacuation alert. Please try again.', {
          duration: Toast.durations.LONG,
          position: Toast.positions.TOP,
          backgroundColor: colors.emergencyRed,
          textColor: 'white',
          shadow: true,
          animation: true,
          hideOnPress: true,
          delay: 0,
        });
      }
    } finally {
      setCreatingAlert(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.lightGrayBg }]}>
      <AlertsScreen ref={alertsScreenRef} />
      <BottomTabNavigator />

      {/* Add Alert Button - Similar to Profile Page Logout Button */}
      <TouchableOpacity
        style={[styles.addAlertButton, { backgroundColor: colors.emergencyRed }]}
        onPress={() => setCreateModalVisible(true)}
        activeOpacity={0.8}
      >
        <Icon name="add" size={20} color={colors.white} />
        <Text style={[styles.addAlertButtonText, { color: colors.white }]}>Add Alert</Text>
      </TouchableOpacity>

      {/* Create Alert Modal */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.white }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.darkText }]}>Create New Alert</Text>
              <TouchableOpacity
                onPress={() => setCreateModalVisible(false)}
                style={styles.closeButton}
              >
                <Icon name="close" size={24} color={colors.mediumText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Alert Type Selection */}
              <Text style={[styles.inputLabel, { color: colors.darkText }]}>Alert Type</Text>
              <View style={styles.alertTypeContainer}>
                {[
                  { key: 'emergency', label: 'Emergency', color: colors.emergencyRed, icon: 'warning' },
                  { key: 'security', label: 'Security', color: colors.warningOrange, icon: 'security' },
                  { key: 'general', label: 'General', color: colors.primary, icon: 'info' },
                ].map((type) => (
                  <TouchableOpacity
                    key={type.key}
                    style={[
                      styles.alertTypeButton,
                      {
                        backgroundColor: alertType === type.key ? type.color : colors.lightGrayBg,
                        borderColor: alertType === type.key ? type.color : colors.border,
                      }
                    ]}
                    onPress={() => setAlertType(type.key as any)}
                  >
                    <Icon
                      name={type.icon as any}
                      size={20}
                      color={alertType === type.key ? colors.white : type.color}
                      style={styles.alertTypeIcon}
                    />
                    <Text style={[
                      styles.alertTypeText,
                      { color: alertType === type.key ? colors.white : colors.darkText }
                    ]}>
                      {type.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Alert Message Input */}
              <Text style={[styles.inputLabel, { color: colors.darkText }]}>Alert Message *</Text>
              <TextInput
                style={[styles.textInput, {
                  borderColor: colors.border,
                  backgroundColor: colors.lightGrayBg,
                  color: colors.darkText
                }]}
                placeholder="Enter alert message..."
                placeholderTextColor={colors.mediumText}
                value={alertMessage}
                onChangeText={setAlertMessage}
                multiline
                numberOfLines={3}
                maxLength={200}
              />

              {/* Alert Description Input */}
              <Text style={[styles.inputLabel, { color: colors.darkText }]}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.descriptionInput, {
                  borderColor: colors.border,
                  backgroundColor: colors.lightGrayBg,
                  color: colors.darkText
                }]}
                placeholder="Additional details..."
                placeholderTextColor={colors.mediumText}
                value={alertDescription}
                onChangeText={setAlertDescription}
                multiline
                numberOfLines={4}
                maxLength={500}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => {
                  setCreateModalVisible(false);
                }}
                disabled={creatingAlert}
              >
                <Text style={[styles.modalButtonText, { color: colors.mediumText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.createButton,
                  {
                    backgroundColor: creatingAlert ? colors.mediumText : (
                      alertType === 'emergency' ? colors.emergencyRed :
                      alertType === 'security' ? colors.warningOrange : colors.primary
                    )
                  }
                ]}
                onPress={handleCreateAlert}
                disabled={creatingAlert || !alertMessage.trim()}
              >
                {creatingAlert ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Icon name="send" size={18} color={colors.white} style={styles.buttonIcon} />
                    <Text style={[styles.modalButtonText, { color: colors.white }]}>Create Alert</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative', // Allow absolute positioning of child elements
  },
  addAlertButton: {
    position: 'absolute',
    bottom: 70, // Position above bottom navigation (accounting for nav height ~60px + some padding)
    left: spacing.base,
    right: spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.emergencyRed,
    borderRadius: 12,
    padding: spacing.base,
    gap: spacing.sm,
    elevation: 10, // Higher elevation to appear above navigation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    zIndex: 1000, // Ensure it appears above navigation
  },
  addAlertButtonText: {
    ...typography.buttonMedium,
    color: colors.white,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    ...typography.screenHeader,
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: spacing.xs,
  },
  modalBody: {
    padding: spacing.lg,
    flex: 1,
  },
  inputLabel: {
    ...typography.body,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  alertTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  alertTypeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: 12,
    marginHorizontal: 2,
    borderWidth: 2,
  },
  alertTypeIcon: {
    marginRight: spacing.xs,
  },
  alertTypeText: {
    ...typography.buttonSmall,
    fontWeight: '600',
    fontSize: 12,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    textAlignVertical: 'top',
    ...typography.body,
  },
  descriptionInput: {
    minHeight: 100,
  },
  modalFooter: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.md,
  },
  modalButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 12,
    minHeight: 48,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  createButton: {
    backgroundColor: colors.primary,
  },
  modalButtonText: {
    ...typography.buttonSmall,
    fontWeight: '600',
    fontSize: 14,
  },
  buttonIcon: {
    marginRight: spacing.xs,
  },
});
