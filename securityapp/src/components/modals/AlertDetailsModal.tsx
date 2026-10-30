import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ActivityIndicator, ScrollView } from 'react-native';
import { CustomAlert } from '../common/CustomAlert';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useColors } from '../../utils/colors';
import { typography, spacing, shadows } from '../../utils';
import { Alert } from '../../types/alert.types';
import { formatExactTime, formatRelativeTime } from '../../utils/helpers';

interface AlertDetailsModalProps {
  visible: boolean;
  alert: Alert | null;
  onClose: () => void;
  onAccept: () => Promise<void>;
  isLoading?: boolean;
}

export const AlertDetailsModal: React.FC<AlertDetailsModalProps> = ({
  visible,
  alert,
  onClose,
  onAccept,
  isLoading = false,
}) => {
  const colors = useColors();
  const [isAccepting, setIsAccepting] = useState(false);

  if (!alert) return null;

  // Determine alert type styling
  const isEmergency = alert.original_alert_type === 'emergency' ||
                      alert.alert_type === 'emergency' ||
                      alert.priority?.toLowerCase() === 'high';

  const getAlertTypeIcon = () => {
    if (isEmergency) return 'warning';
    return 'notifications';
  };

  const getAlertTypeColor = () => {
    if (isEmergency) return colors.emergencyRed;
    return colors.primary;
  };

  const handleAcceptPress = async () => {
    CustomAlert.alert(
      'Accept Alert',
      'Are you sure you want to accept this alert and start responding?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          style: 'default',
          onPress: async () => {
            setIsAccepting(true);
            try {
              await onAccept();
              CustomAlert.alert('Success', 'Alert accepted successfully!', [{ text: 'OK' }], { type: 'success' });
              onClose();
            } catch (error: any) {
              CustomAlert.alert('Error', error?.message || 'Failed to accept alert. Please try again.', [{ text: 'OK' }], { type: 'error' });
            } finally {
              setIsAccepting(false);
            }
          },
        },
      ],
      { type: 'warning' }
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={[styles.overlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
        <View style={[styles.container, { backgroundColor: colors.white }]}>
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <View style={styles.headerContent}>
              <View style={[styles.headerIcon, { backgroundColor: getAlertTypeColor() }]}>
                <Icon name={getAlertTypeIcon()} size={24} color={colors.white} />
              </View>
              <View style={styles.headerText}>
                <Text style={[styles.headerTitle, { color: colors.darkText }]}>
                  Alert Details
                </Text>
                <Text style={[styles.headerSubtitle, { color: colors.mediumGray }]}>
                  {alert.status ? alert.status.toUpperCase() : 'PENDING'}
                </Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Icon name="close" size={24} color={colors.darkText} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* Alert Type & Priority */}
            <View style={[styles.infoSection, { backgroundColor: 'rgba(37, 99, 235, 0.05)' }]}>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.mediumGray }]}>Alert Type</Text>
                <Text style={[styles.infoValue, { color: colors.darkText }]}>
                  {(alert.original_alert_type || alert.alert_type || 'normal').charAt(0).toUpperCase() + (alert.original_alert_type || alert.alert_type || 'normal').slice(1)}
                </Text>
              </View>
              {alert.priority && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.mediumGray }]}>Priority</Text>
                  <Text style={[styles.infoValue, { color: getAlertTypeColor() }]}>
                    {alert.priority.toUpperCase()}
                  </Text>
                </View>
              )}
            </View>

            {/* User Information */}
            <View style={[styles.infoSection, { backgroundColor: 'rgba(37, 99, 235, 0.05)' }]}>
              <Text style={[styles.sectionTitle, { color: colors.darkText }]}>Reported By</Text>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.mediumGray }]}>Name</Text>
                <Text style={[styles.infoValue, { color: colors.darkText }]}>
                  {alert.user_name || 'Unknown User'}
                </Text>
              </View>
              {alert.user_phone && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.mediumGray }]}>Phone</Text>
                  <Text style={[styles.infoValue, { color: colors.darkText }]}>
                    {alert.user_phone}
                  </Text>
                </View>
              )}
              {alert.user_email && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.mediumGray }]}>Email</Text>
                  <Text style={[styles.infoValue, { color: colors.darkText }]}>
                    {alert.user_email}
                  </Text>
                </View>
              )}
            </View>

            {/* Alert Message */}
            <View style={[styles.infoSection, { backgroundColor: 'rgba(37, 99, 235, 0.05)' }]}>
              <Text style={[styles.sectionTitle, { color: colors.darkText }]}>Message</Text>
              <Text style={[styles.messageText, { color: colors.darkText }]}>
                {alert.message || 'No message provided'}
              </Text>
            </View>

            {/* Location */}
            {alert.location && (
              <View style={[styles.infoSection, { backgroundColor: 'rgba(37, 99, 235, 0.05)' }]}>
                <Text style={[styles.sectionTitle, { color: colors.darkText }]}>Location</Text>
                {typeof alert.location === 'object' && (
                  <>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.mediumGray }]}>Latitude</Text>
                      <Text style={[styles.infoValue, { color: colors.darkText }]}>
                        {(alert.location.latitude || 'N/A').toString()}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={[styles.infoLabel, { color: colors.mediumGray }]}>Longitude</Text>
                      <Text style={[styles.infoValue, { color: colors.darkText }]}>
                        {(alert.location.longitude || 'N/A').toString()}
                      </Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Timestamps */}
            <View style={[styles.infoSection, { backgroundColor: 'rgba(37, 99, 235, 0.05)' }]}>
              <Text style={[styles.sectionTitle, { color: colors.darkText }]}>Timeline</Text>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, { color: colors.mediumGray }]}>Created</Text>
                <View>
                  <Text style={[styles.infoValue, { color: colors.darkText }]}>
                    {formatExactTime(alert.created_at || alert.timestamp)}
                  </Text>
                  <Text style={[styles.infoSubtext, { color: colors.mediumGray }]}>
                    {formatRelativeTime(alert.created_at || alert.timestamp)}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <TouchableOpacity
              style={[styles.cancelButton, { borderColor: colors.border }]}
              onPress={onClose}
              disabled={isAccepting}
            >
              <Text style={[styles.cancelButtonText, { color: colors.mediumGray }]}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.acceptButton, { backgroundColor: getAlertTypeColor() }]}
              onPress={handleAcceptPress}
              disabled={isAccepting}
              activeOpacity={0.8}
            >
              {isAccepting ? (
                <ActivityIndicator color={colors.white} size="small" />
              ) : (
                <>
                  <Icon name="check-circle" size={18} color={colors.white} />
                  <Text style={[styles.acceptButtonText, { color: colors.white }]}>
                    Accept Alert
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    ...shadows.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    ...typography.sectionHeader,
    marginBottom: 4,
  },
  headerSubtitle: {
    ...typography.caption,
    fontSize: 12,
  },
  closeButton: {
    padding: spacing.sm,
    marginLeft: spacing.sm,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  infoSection: {
    backgroundColor: 'rgba(37, 99, 235, 0.05)',
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.buttonMedium,
    marginBottom: spacing.sm,
    fontSize: 13,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.sm,
  },
  infoLabel: {
    ...typography.caption,
    fontSize: 12,
    flex: 0.4,
  },
  infoValue: {
    ...typography.body,
    flex: 0.6,
    textAlign: 'right',
    fontWeight: '500',
  },
  infoSubtext: {
    ...typography.caption,
    fontSize: 11,
    marginTop: 2,
    textAlign: 'right',
  },
  messageText: {
    ...typography.body,
    lineHeight: 22,
    marginVertical: spacing.sm,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  cancelButtonText: {
    ...typography.buttonMedium,
    fontSize: 14,
  },
  acceptButton: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    ...shadows.md,
  },
  acceptButtonText: {
    ...typography.buttonMedium,
    fontSize: 14,
  },
});
