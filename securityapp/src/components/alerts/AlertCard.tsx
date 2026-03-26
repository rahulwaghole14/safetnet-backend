import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert as RNAlert } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Alert } from '../../types/alert.types';
import { useColors } from '../../utils/colors';
import { shadows } from '../../utils';
import { formatRelativeTime, formatExactTime } from '../../utils/helpers';

interface AlertCardProps {
  alert: Alert;
  onRespond: (alert: Alert) => void;
  onDelete?: (alert: Alert) => void;
  onSolve?: (alert: Alert) => void;
  onUpdate?: (alert: Alert) => void;
  onViewLocation?: (alert: Alert) => void;
}

export const AlertCard: React.FC<AlertCardProps> = ({ alert, onRespond, onDelete, onSolve, onUpdate, onViewLocation }) => {
  const colors = useColors();
  // Check if emergency based on original_alert_type or alert_type
  const isEmergency = alert.original_alert_type === 'emergency' ||
                      alert.original_alert_type === 'warning' ||
                      alert.alert_type === 'emergency';

  // Check if alert is completed or resolved
  const alertStatus = alert.status ? String(alert.status).toLowerCase() : '';
  const isCompleted = alertStatus === 'completed' || alertStatus === 'resolved';
  const isAccepted = alert.status === 'accepted';

  // Check if alert was created by officer (hide Respond button for officer-created alerts)
  const isOfficerCreated = alert.created_by_role === 'OFFICER';

  const handleDelete = () => {
    console.log('🗑️ AlertCard: Delete button pressed for alert:', alert.id);
    // Directly call onDelete without showing RNAlert - let the parent handle confirmation
    onDelete && onDelete(alert);
  };

  // Get alert type description
  const getAlertTypeDescription = (): { type: string; description: string } => {
    // Check if this is a high priority alert
    const isHighPriority = alert.priority?.toLowerCase() === 'high';

    if (isHighPriority) {
      return {
        type: 'Emergency Alert',
        description: 'Critical alert requiring immediate response and action'
      };
    }

    // Prefer original_alert_type if available
    const displayType = alert.original_alert_type || alert.alert_type || 'normal';

    const typeInfoMap: Record<string, { type: string; description: string }> = {
      general: {
        type: 'General Notice',
        description: 'Informational alert for general updates and announcements'
      },
      warning: {
        type: 'Warning',
        description: 'Cautionary alert requiring attention and immediate awareness'
      },
      emergency: {
        type: 'Emergency',
        description: 'Critical alert requiring immediate response and action'
      },
      normal: {
        type: 'Normal Alert',
        description: 'Standard alert for routine notifications'
      },
      security: {
        type: 'Security Alert',
        description: 'Security-related alert requiring security personnel attention'
      },
    };

    const safeDisplayType = typeof displayType === 'string' ? displayType : 'normal';
    return typeInfoMap[safeDisplayType] || {
      type: safeDisplayType.charAt(0).toUpperCase() + safeDisplayType.slice(1) + ' Alert',
      description: 'Alert notification'
    };
  };

  const getBadgeStyle = () => {
    if (isEmergency) {
      return {
        backgroundColor: '#FEE2E2',
        text: '🚨 EMERGENCY',
        textColor: '#DC2626',
      };
    }
    if (isCompleted) {
      return {
        backgroundColor: '#D1FAE5',
        text: '✓ SOLVED',
        textColor: '#34C759',
      };
    }
    return {
      backgroundColor: '#DBEAFE',
      text: '🔔 ACTIVE',
      textColor: '#3B82F6',
    };
  };

  const badgeStyle = getBadgeStyle();

  const getLeftAccentColor = () => {
    // Emergency alerts get red
    if (isEmergency) {
      return colors.emergencyRed;
    }
    
    // Completed/resolved alerts get green
    if (isCompleted) {
      return colors.successGreen;
    }
    
    // Accepted alerts get orange
    if (isAccepted) {
      return colors.warningOrange;
    }
    
    // Different colors based on alert type
    switch (alert.alert_type) {
      case 'security':
        return colors.infoBlue;  // Blue for security
      case 'area_user_alert':
        return '#8B5CF6';  // Purple for area alerts
      case 'normal':
        return '#6B7280';  // Gray for normal
      default:
        return colors.infoBlue;  // Default blue
    }
  };

  // Get officer display name with fallbacks
  const getOfficerDisplayName = (): string => {
    // Priority 1: Check if alert has first_name and last_name from backend
    if (alert.first_name && alert.last_name) {
      const firstName = alert.first_name.trim();
      const lastName = alert.last_name.trim();
      if (firstName && lastName) {
        return `${firstName} ${lastName}`;
      }
    }
    
    // Priority 2: Check if alert has a single name field
    if (alert.first_name && !alert.last_name) {
      const firstName = alert.first_name.trim();
      if (firstName) {
        return firstName;
      }
    }
    
    // Priority 3: user_name (should contain full name like "John Doe" or "Sam karan")
    if (alert.user_name && typeof alert.user_name === 'string' && alert.user_name.trim()) {
      const name = alert.user_name.trim();
      // Check if it looks like a real name (not just numbers)
      if (!/^\d+$/.test(name)) {
        return name;
      }
    }
    
    // Priority 4: Extract from email but format as proper name
    if (alert.user_email && typeof alert.user_email === 'string') {
      const emailName = alert.user_email.split('@')[0];
      if (emailName && !/^\d+$/.test(emailName)) {
        // Convert username to proper name format
        const formattedName = emailName
          .replace(/[_-]/g, ' ')
          .replace(/\b\w/g, l => l.toUpperCase());
        return formattedName;
      }
    }
    
    // Priority 5: user_id if it's not just numbers
    if (alert.user_id && typeof alert.user_id === 'string' && alert.user_id.trim() && !/^\d+$/.test(alert.user_id.trim())) {
      const id = alert.user_id.trim();
      // Format as proper name
      const formattedName = id
        .replace(/[_-]/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
      return formattedName;
    }
    
    // Last resort - show a generic officer name
    return 'Security Officer';
  };

  return (
    <View
      style={[
        { backgroundColor: colors.cardBackground },
        styles(colors).card,
      ]}
    >
      <View
        style={[
          styles(colors).leftAccent,
          {
            backgroundColor: getLeftAccentColor(),
          },
        ]}
      />

      <View style={styles(colors).cardContent}>
        {/* Status Badge */}
        <View style={[styles(colors).badge, { backgroundColor: badgeStyle.backgroundColor }]}>
          <Text style={[styles(colors).badgeText, { color: badgeStyle.textColor }]}>
            {badgeStyle.text}
          </Text>
        </View>

        <View style={styles(colors).content}>
          {/* Alert Type Details */}
          <View style={styles(colors).alertDetailsRow}>
            <View style={styles(colors).alertTypeContainer}>
              <Icon
                name={
                  isEmergency
                    ? 'warning'
                    : alert.alert_type === 'security'
                      ? 'security'
                      : 'notifications'
                }
                size={14}
                color={isEmergency ? colors.emergencyRed : colors.infoBlue}
              />
              <View style={styles(colors).alertTypeInfo}>
                <Text style={[styles(colors).alertTypeText, isCompleted && styles(colors).completedText]}>
                  {getAlertTypeDescription().type}
                </Text>
                <Text style={[styles(colors).alertTypeDescription, isCompleted && styles(colors).completedText]} numberOfLines={1}>
                  {getAlertTypeDescription().description}
                </Text>
              </View>
            </View>
            {alert.priority && (
              <View style={[
                styles(colors).priorityBadge,
                alert.priority === 'high' && styles(colors).priorityHigh,
                alert.priority === 'medium' && styles(colors).priorityMedium,
                alert.priority === 'low' && styles(colors).priorityLow,
              ]}>
                <Text style={styles(colors).priorityText}>{alert.priority.toUpperCase()}</Text>
              </View>
            )}
          </View>

          <Text style={[styles(colors).userName, isCompleted && styles(colors).completedText]}>
            {getOfficerDisplayName()}
          </Text>
          
          {/* Location indicator removed - frontend no longer displays GPS coordinates */}
          <Text style={[styles(colors).message, isCompleted && styles(colors).completedText]} numberOfLines={2}>
            {alert.message}
          </Text>

          <Text style={[styles(colors).timestamp, isCompleted && styles(colors).completedText]}>
            {formatExactTime(alert.created_at || alert.timestamp)}
          </Text>
          <Text style={[styles(colors).relativeTime, isCompleted && styles(colors).completedText]}>
            {formatRelativeTime(alert.created_at || alert.timestamp)}
          </Text>
        </View>

        {/* Bottom buttons section */}
        {isCompleted ? (
          <View style={styles(colors).completedActions}>
            <View style={styles(colors).solvedBadge}>
              <Icon name="check-circle" size={18} color={colors.successGreen} />
              <Text style={styles(colors).solvedBadgeText}>SOLVED</Text>
            </View>
          </View>
        ) : isAccepted ? (
          <View style={styles(colors).acceptedActions}>
            <View style={styles(colors).respondButtonContainer}>
              {onSolve && !isOfficerCreated ? (
                <TouchableOpacity
                  style={styles(colors).solveButtonSmall}
                  onPress={() => onSolve(alert)}
                  activeOpacity={0.7}
                >
                  <Icon name="check-circle" size={18} color={colors.white} />
                  <Text style={styles(colors).solveButtonText}>MARK SOLVED</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles(colors).acceptedBadge}>
                  <Icon name="check-circle" size={18} color={colors.successGreen} />
                  <Text style={styles(colors).acceptedText}>ACCEPTED</Text>
                </View>
              )}
              
              {onViewLocation && !isOfficerCreated && (
                <TouchableOpacity
                  style={styles(colors).mapButtonBottom}
                  onPress={() => onViewLocation(alert)}
                  activeOpacity={0.7}
                >
                  <Icon name="map" size={18} color={colors.white} />
                  <Text style={styles(colors).mapButtonBottomText}>MAP</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : (
          <>
            {/* Top row: Delete button only - Hide for officer-created alerts if we want NO buttons */}
            <View style={styles(colors).topButtonsContainer}>
              {onDelete && !isOfficerCreated && (
                <TouchableOpacity
                  style={styles(colors).deleteButtonTop}
                  onPress={handleDelete}
                  activeOpacity={0.7}
                >
                  <Icon name="delete" size={18} color={colors.emergencyRed} />
                  <Text style={styles(colors).deleteButtonTextTop}>DELETE</Text>
                </TouchableOpacity>
              )}
            </View>
            
            {/* Bottom row: Respond and Map buttons - Show for all pending alerts (unless officer created) */}
            {!isOfficerCreated && (
              <View style={styles(colors).respondButtonContainer}>
                <TouchableOpacity
                  style={[
                    styles(colors).respondButtonBottom,
                    isEmergency && styles(colors).respondButtonBottomEmergency,
                  ]}
                  onPress={() => onRespond(alert)}
                  activeOpacity={0.7}
                >
                  <Text style={styles(colors).respondButtonBottomText}>RESPOND</Text>
                </TouchableOpacity>
                
                {onViewLocation && (
                  <TouchableOpacity
                    style={styles(colors).mapButtonBottom}
                    onPress={() => onViewLocation(alert)}
                    activeOpacity={0.7}
                  >
                    <Icon name="map" size={18} color={colors.white} />
                    <Text style={styles(colors).mapButtonBottomText}>MAP</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
};

const styles = (colors: any) => StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    marginHorizontal: 16,
    ...shadows.md,
  },
  emergencyCard: {
    ...shadows.emergency,
  },
  completedCard: {
    // Remove opacity reduction to keep visual consistency
    // opacity: 0.6,
  },
  leftAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
  cardContent: {
    flex: 1,
    paddingLeft: 4,
  },
  content: {
    flex: 1,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  alertDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  alertTypeContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    flex: 1,
  },
  alertTypeInfo: {
    flex: 1,
  },
  alertTypeText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.darkText,
    marginBottom: 2,
  },
  alertTypeDescription: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.lightText,
    lineHeight: 14,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: colors.lightGrayBg,
  },
  priorityHigh: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  priorityMedium: {
    backgroundColor: 'rgba(251, 191, 36, 0.15)',
  },
  priorityLow: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.darkText,
    letterSpacing: 0.5,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.darkText,
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.lightText,
    lineHeight: 20,
    marginBottom: 6,
  },
  timestamp: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.lightText,
  },
  relativeTime: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.lightText,
    marginTop: 2,
    // Remove opacity reduction for visual consistency
    // opacity: 0.8,
  },
  completedText: {
    // Remove opacity reduction to keep visual consistency
    // opacity: 0.7,
  },
  bottomButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  respondButtonBottom: {
    flex: 1,
    height: 44,
    backgroundColor: '#2563EB',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  respondButtonBottomEmergency: {
    backgroundColor: '#DC2626',
  },
  respondButtonBottomText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  mapButtonBottom: {
    flex: 0.4, // Map button is smaller than Respond button
    height: 44,
    backgroundColor: colors.primary,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  mapButtonBottomText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
    letterSpacing: 0.5,
  },
  deleteButtonBottom: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#DC2626',
    gap: 6,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  updateButtonBottom: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#D97706',
    gap: 6,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  updateButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  // New layout styles
  topButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#6B7280',
  },
  updateButtonTop: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#F59E0B',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#D97706',
    gap: 6,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  updateButtonTextTop: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  deleteButtonTop: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#DC2626',
    gap: 6,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  deleteButtonTextTop: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  respondButtonContainer: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 12,
  },
  completedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  solvedBadge: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  solvedBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  acceptedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  acceptedBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
  },
  acceptedText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10B981',
    letterSpacing: 0.5,
  },
  solveButton: {
    width: '100%',
    height: 44,
    backgroundColor: '#10B981',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...shadows.md,
  },
  solveButtonSmall: {
    flex: 1,
    height: 44,
    backgroundColor: '#10B981',
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    ...shadows.md,
  },
  solveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.darkText,
    letterSpacing: 0.5,
  },
});