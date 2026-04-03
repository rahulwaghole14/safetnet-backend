import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert as RNAlert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { advancedAlertService } from '../../api/services/advancedAlertService';
import { ScreenWrapper } from '../../components/common/ScreenWrapper';
import { colors } from '../../utils/colors';
import { typography, spacing, shadows } from '../../utils';

interface AlertFormData {
  alert_type: 'emergency' | 'security' | 'normal';
  message: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export const AdvancedAlertCreationScreen: React.FC = () => {
  const navigation = useNavigation();
  
  // Form state
  const [formData, setFormData] = useState<AlertFormData>({
    alert_type: 'security',
    message: '',
    description: '',
    priority: 'medium',
  });
  
  // UI state
  const [isCapturingGPS, setIsCapturingGPS] = useState(false);
  const [isCreatingAlert, setIsCreatingAlert] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<'idle' | 'capturing' | 'success' | 'error'>('idle');
  const [gpsMessage, setGpsMessage] = useState('');
  const [createdAlert, setCreatedAlert] = useState<any>(null);

  // Alert type options
  const alertTypes = [
    { key: 'emergency', label: '🚨 Emergency', color: colors.emergencyRed, description: 'Critical threat requiring immediate response' },
    { key: 'security', label: '🛡️ Security', color: colors.warningOrange, description: 'Security incident requiring attention' },
    { key: 'normal', label: '📢 General', color: colors.infoBlue, description: 'General announcement or notification' },
  ];

  // Priority options
  const priorities = [
    { key: 'high', label: 'High', color: colors.emergencyRed },
    { key: 'medium', label: 'Medium', color: colors.warningOrange },
    { key: 'low', label: 'Low', color: colors.successGreen },
  ];

  const handleCreateAlert = async () => {
    // Validate form
    if (!formData.message.trim()) {
      RNAlert.alert('Error', 'Please enter an alert message');
      return;
    }

    setIsCreatingAlert(true);
    setGpsStatus('capturing');
    setGpsMessage('Capturing GPS location...');

    try {
      console.log('🚨 Creating advanced alert with GPS...');
      
      // Create alert with automatic GPS capture
      const alert = await advancedAlertService.createAlertWithGPS({
        alert_type: formData.alert_type,
        message: formData.message.trim(),
        description: formData.description.trim() || undefined,
        priority: formData.priority,
      });

      setCreatedAlert(alert);
      setGpsStatus('success');
      setGpsMessage(`Alert created at GPS: ${alert.location_lat.toFixed(6)}, ${alert.location_long.toFixed(6)}`);

      console.log('✅ Advanced alert created successfully:', {
        alertId: alert.id,
        location: alert.location,
        type: alert.alert_type,
        priority: alert.priority,
      });

      // Show success message
      RNAlert.alert(
        'Alert Created Successfully',
        `Your ${formData.alert_type} alert has been created and your location has been captured.\n\nAlert ID: ${alert.id}\nLocation: GPS captured`,
        [
          {
            text: 'View on Map',
            onPress: () => {
              // Navigate to tracking screen with the created alert
              (navigation as any).navigate('AlertRespondMap', { alertId: alert.id.toString() });
            },
          },
          {
            text: 'Create Another',
            onPress: () => {
              // Reset form
              setFormData({
                alert_type: 'security',
                message: '',
                description: '',
                priority: 'medium',
              });
              setCreatedAlert(null);
              setGpsStatus('idle');
              setGpsMessage('');
            },
          },
          {
            text: 'Done',
            onPress: () => navigation.goBack(),
            style: 'cancel',
          },
        ]
      );

    } catch (error: any) {
      console.error('❌ Failed to create advanced alert:', error);
      
      setGpsStatus('error');
      setGpsMessage(error.message || 'Failed to create alert');
      
      RNAlert.alert(
        'Error',
        error.message || 'Failed to create alert. Please try again.',
        [
          {
            text: 'Retry',
            onPress: () => {
              setGpsStatus('idle');
              setGpsMessage('');
            },
          },
          {
            text: 'Cancel',
            style: 'cancel',
          },
        ]
      );
    } finally {
      setIsCreatingAlert(false);
    }
  };

  const renderAlertTypeSelector = () => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alert Type</Text>
        <View style={styles.optionsContainer}>
          {alertTypes.map((type) => (
            <TouchableOpacity
              key={type.key}
              style={[
                styles.optionCard,
                formData.alert_type === type.key && { 
                  backgroundColor: type.color + '20',
                  borderColor: type.color,
                },
              ]}
              onPress={() => setFormData({ ...formData, alert_type: type.key as any })}
            >
              <Text style={[styles.optionLabel, { color: type.color }]}>
                {type.label}
              </Text>
              <Text style={styles.optionDescription}>
                {type.description}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderPrioritySelector = () => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Priority Level</Text>
        <View style={styles.priorityContainer}>
          {priorities.map((priority) => (
            <TouchableOpacity
              key={priority.key}
              style={[
                styles.priorityButton,
                formData.priority === priority.key && {
                  backgroundColor: priority.color,
                },
              ]}
              onPress={() => setFormData({ ...formData, priority: priority.key as any })}
            >
              <Text style={[
                styles.priorityText,
                formData.priority === priority.key && {
                  color: colors.white,
                },
              ]}>
                {priority.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderMessageInput = () => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alert Message *</Text>
        <TextInput
          style={styles.textInput}
          value={formData.message}
          onChangeText={(text) => setFormData({ ...formData, message: text })}
          placeholder="Enter alert message..."
          placeholderTextColor={colors.mediumText}
          multiline
          numberOfLines={3}
          maxLength={500}
        />
        <Text style={styles.characterCount}>
          {formData.message.length}/500 characters
        </Text>
      </View>
    );
  };

  const renderDescriptionInput = () => {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Additional Details (Optional)</Text>
        <TextInput
          style={[styles.textInput, styles.textArea]}
          value={formData.description}
          onChangeText={(text) => setFormData({ ...formData, description: text })}
          placeholder="Provide additional details about the alert..."
          placeholderTextColor={colors.mediumText}
          multiline
          numberOfLines={4}
          maxLength={1000}
        />
        <Text style={styles.characterCount}>
          {formData.description.length}/1000 characters
        </Text>
      </View>
    );
  };

  const renderGPSStatus = () => {
    if (gpsStatus === 'idle') return null;

    const getStatusColor = () => {
      switch (gpsStatus) {
        case 'capturing': return colors.infoBlue;
        case 'success': return colors.successGreen;
        case 'error': return colors.emergencyRed;
        default: return colors.mediumText;
      }
    };

    return (
      <View style={[styles.gpsStatusContainer, { borderColor: getStatusColor() }]}>
        <Icon 
          name={
            gpsStatus === 'capturing' ? 'gps-fixed' :
            gpsStatus === 'success' ? 'check-circle' :
            'error'
          }
          size={20}
          color={getStatusColor()}
        />
        <Text style={[styles.gpsStatusText, { color: getStatusColor() }]}>
          {gpsMessage}
        </Text>
        {gpsStatus === 'capturing' && (
          <ActivityIndicator size="small" color={getStatusColor()} />
        )}
      </View>
    );
  };

  if (createdAlert) {
    return (
      <ScreenWrapper
        backgroundColor={colors.lightGrayBg}
      >
        <View style={styles.successContainer}>
          <Icon name="check-circle" size={64} color={colors.successGreen} />
          <Text style={styles.successTitle}>Alert Created Successfully</Text>
          <Text style={styles.successMessage}>
            Your {createdAlert.alert_type} alert has been created and your GPS location has been captured.
          </Text>
          <View style={styles.alertDetails}>
            <Text style={styles.detailText}>Alert ID: {createdAlert.id}</Text>
            <Text style={styles.detailText}>Type: {createdAlert.alert_type}</Text>
            <Text style={styles.detailText}>Priority: {createdAlert.priority}</Text>
            <Text style={styles.detailText}>
              Location: {createdAlert.location_lat.toFixed(6)}, {createdAlert.location_long.toFixed(6)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.viewMapButton}
            onPress={() => {
              (navigation as any).navigate('AlertRespondMap', { alertId: createdAlert.id.toString() });
            }}
          >
            <Text style={styles.viewMapButtonText}>View on Tracking Map</Text>
          </TouchableOpacity>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper
      backgroundColor={colors.lightGrayBg}
      scrollable={false}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Icon name="arrow-back" size={24} color={colors.darkText} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Create Advanced Alert</Text>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {renderAlertTypeSelector()}
        {renderPrioritySelector()}
        {renderMessageInput()}
        {renderDescriptionInput()}
        {renderGPSStatus()}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.createButton,
            isCreatingAlert && styles.createButtonDisabled,
          ]}
          onPress={handleCreateAlert}
          disabled={isCreatingAlert}
        >
          {isCreatingAlert ? (
            <ActivityIndicator size="small" color={colors.white} />
          ) : (
            <>
              <Icon name="add-alert" size={20} color={colors.white} />
              <Text style={styles.createButtonText}>Create Alert with GPS</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.lightGrayBg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    ...shadows.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.lightGrayBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.darkText,
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.darkText,
    marginBottom: spacing.sm,
  },
  optionsContainer: {
    gap: spacing.sm,
  },
  optionCard: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    ...shadows.sm,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 13,
    color: colors.mediumText,
    lineHeight: 18,
  },
  priorityContainer: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  priorityButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  priorityText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.darkText,
  },
  textInput: {
    backgroundColor: colors.white,
    borderRadius: 12,
    padding: spacing.md,
    fontSize: 16,
    color: colors.darkText,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
  textArea: {
    height: 100,
  },
  characterCount: {
    fontSize: 12,
    color: colors.mediumText,
    textAlign: 'right',
    marginTop: 4,
  },
  gpsStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: colors.white,
    borderRadius: 12,
    borderWidth: 2,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  gpsStatusText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    padding: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: 12,
    gap: spacing.sm,
  },
  createButtonDisabled: {
    backgroundColor: colors.mediumText,
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: colors.successGreen,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  successMessage: {
    fontSize: 16,
    color: colors.mediumText,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  alertDetails: {
    backgroundColor: colors.white,
    padding: spacing.md,
    borderRadius: 12,
    width: '100%',
    marginBottom: spacing.lg,
  },
  detailText: {
    fontSize: 14,
    color: colors.darkText,
    marginBottom: 4,
  },
  viewMapButton: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: 12,
  },
  viewMapButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
});
