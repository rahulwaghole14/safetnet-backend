
import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Alert } from '../../types/alert.types';
import { useAlertsStore } from '../../store/alertsStore';
import { AlertCard } from '../../components/alerts/AlertCard';
import { EmptyState } from '../../components/common/EmptyState';
import { AlertRespondModal } from '../../components/common/AlertRespondModal';
import { useColors } from '../../utils/colors';
import { typography, spacing } from '../../utils';
import { locationService } from '../../api/services/geofenceService';

interface AlertsScreenProps {}

interface AlertsScreenRef {
  fetchAlertsWithRetry: () => void;
}

export const AlertsScreen = forwardRef<AlertsScreenRef, AlertsScreenProps>((props, ref) => {
  const colors = useColors();
  const navigation = useNavigation();

  // Use Zustand alerts store
  const {
    alerts,
    isLoading,
    error,
    fetchAlerts,
    createAlert: storeCreateAlert,
    updateAlert: storeUpdateAlert,
    deleteAlert: storeDeleteAlert
    // resolveAlert: storeResolveAlert // TODO: Enable once TypeScript issue resolved
  } = useAlertsStore();

  const [selectedFilter, setSelectedFilter] = useState<'all' | 'emergency' | 'pending' | 'accepted' | 'completed'>('all');

  // Create alert modal state (local to this screen)
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [creatingAlert, setCreatingAlert] = useState(false);
  const [alertType, setAlertType] = useState<'emergency' | 'security' | 'general' | 'area_user_alert'>('security');
  const [alertMessage, setAlertMessage] = useState('');
  const [alertDescription, setAlertDescription] = useState('');
  // Location state removed - frontend no longer handles location
  
  // Area-based alert specific state
  const [alertExpiry, setAlertExpiry] = useState<string>('');
  
  // Location input removed - frontend no longer handles location data

  // Delete confirmation modal state
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [alertToDelete, setAlertToDelete] = useState<Alert | null>(null);
  const [deletingAlert, setDeletingAlert] = useState(false);

  // Update alert modal state
  const [updateModalVisible, setUpdateModalVisible] = useState(false);
  const [alertToUpdate, setAlertToUpdate] = useState<Alert | null>(null);
  const [updatingAlert, setUpdatingAlert] = useState(false);
  const [updatedAlertMessage, setUpdatedAlertMessage] = useState('');
  const [_updatedAlertDescription, setUpdatedAlertDescription] = useState('');
  const [updatedAlertType, setUpdatedAlertType] = useState<'emergency' | 'security' | 'normal'>('security');

  // Toast message state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');

  // Respond modal state - using AlertRespondModal component
  const [showRespondModal, setShowRespondModal] = useState(false);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);

  // Reset filter and fetch alerts when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      console.log('🚨 AlertsScreen: Screen focused, resetting filter and fetching fresh alerts...');
      console.log('🔍 Current alerts in store:', alerts.length);
      console.log('🔍 Store last updated:', useAlertsStore.getState().lastUpdated);
      
      // Force fetch fresh data with backend-authoritative filtering
      fetchAlerts();
    }, [])
  );

  // Handle filter changes - always refetch for fresh data
  useEffect(() => {
    console.log('🔄 Filter changed, fetching fresh alerts...');
    fetchAlerts();
  }, [selectedFilter]);

  // Expose refresh function to parent component
  useImperativeHandle(ref, () => ({
    fetchAlertsWithRetry: () => {
      console.log('🔄 Refreshing alerts list from parent component');
      fetchAlerts();
    }
  }));

  // Aggressive retry logic to fetch real data
  const onRefresh = useCallback(async () => {
    console.log('🔄 Pull-to-refresh: Force fetching fresh alerts...');
    try {
      // Force multiple fetch attempts to ensure fresh data
      await fetchAlerts();
      // Small delay and fetch again to be absolutely sure
      setTimeout(() => {
        console.log('🔄 Second fetch attempt for freshness...');
        fetchAlerts();
      }, 500);
    } catch (refreshError: any) {
      console.error('❌ Pull-to-refresh failed:', refreshError);
    }
  }, [fetchAlerts]);

  const handleRespond = async (alert: Alert) => {
    console.log('📱 Opening alert response modal for alert:', alert.id);
    
    // Validate alert data before showing modal
    if (!alert || !alert.id) {
      console.error('❌ Invalid alert data:', alert);
      showToast('Invalid alert data. Please refresh and try again.', 'error');
      return;
    }
    
    setSelectedAlertId(String(alert.id));
    setShowRespondModal(true);
  };

  const handleViewLocation = (alert: Alert) => {
    console.log('📍 AlertsScreen: Navigating to map for alert:', alert.id);
    (navigation as any).navigate('AlertRespondMap', { alertId: String(alert.id) });
  };

  // Modal handlers
  const handleCloseRespondModal = () => {
    setShowRespondModal(false);
    setSelectedAlertId(null);
  };

  const handleResponseAccepted = () => {
    // Refresh alerts after accepting response
    fetchAlerts();
  };

  const handleDelete = (alert: Alert) => {
    console.log('📱 AlertsScreen: Showing delete confirmation for alert:', alert.id);
    setAlertToDelete(alert);
    setDeleteModalVisible(true);
  };

  const handleUpdate = (alert: Alert) => {
    console.log('📱 AlertsScreen: Opening update modal for alert:', alert.id);
    setAlertToUpdate(alert);
    setUpdatedAlertMessage(alert.message || '');
    setUpdatedAlertDescription(''); // Initialize empty since description field doesn't exist
    
    // Set alert type - map to allowed types
    let responseAlertType: 'emergency' | 'security' | 'normal' = 'security';
    if (alert.original_alert_type === 'emergency' || alert.original_alert_type === 'warning') {
      responseAlertType = 'emergency';
    } else if (alert.original_alert_type === 'general') {
      responseAlertType = 'normal'; // Map 'general' to 'normal'
    } else if (alert.alert_type === 'emergency') {
      responseAlertType = 'emergency';
    } else if (alert.alert_type === 'security') {
      responseAlertType = 'security';
    } else {
      responseAlertType = 'normal'; // Default to 'normal'
    }
    
    setUpdatedAlertType(responseAlertType);
    setUpdateModalVisible(true);
  };

  const confirmDelete = async () => {
    if (!alertToDelete) return;

    try {
      console.log('📱 AlertsScreen: Confirming delete for alert:', alertToDelete.id);
      setDeletingAlert(true);
      await storeDeleteAlert(alertToDelete.id);
      console.log('✅ AlertsScreen: Alert deleted successfully');
      setDeleteModalVisible(false);
      setAlertToDelete(null);
      showToast('Alert deleted successfully!', 'success');
    } catch (deleteError: any) {
      console.error('❌ AlertsScreen: Failed to delete alert:', deleteError);
      
      // Handle specific 404 error - alert already deleted
      if (deleteError?.status === 404 || deleteError?.message?.includes('No SOSAlert matches the given query')) {
        console.log('✅ Alert was already deleted - updating UI');
        setDeleteModalVisible(false);
        setAlertToDelete(null);
        showToast('Alert was already removed', 'success');
        // Refresh alerts to ensure UI is in sync
        fetchAlerts();
        return;
      }
      
      // Handle network or other errors
      const errorMessage = deleteError?.message || 'Failed to delete alert. Please try again.';
      showToast(errorMessage, 'error');
    } finally {
      setDeletingAlert(false);
    }
  };

  const cancelDelete = () => {
    console.log('📱 AlertsScreen: Cancelled delete for alert:', alertToDelete?.id);
    setDeleteModalVisible(false);
    setAlertToDelete(null);
  };

  const confirmUpdate = async () => {
    if (!alertToUpdate) return;

    try {
      console.log('📱 AlertsScreen: Confirming update for alert:', alertToUpdate.id);
      setUpdatingAlert(true);
      
      // Set priority based on alert type
      let priority: 'high' | 'medium' | 'low' = 'medium';
      console.log('🎯 Alert Update Priority Debug:');
      console.log(`   updatedAlertType: "${updatedAlertType}"`);
      
      if (updatedAlertType === 'emergency') {
        priority = 'high';
        console.log('   → Set priority to HIGH for emergency');
      } else if (updatedAlertType === 'security') {
        priority = 'medium';
        console.log('   → Set priority to MEDIUM for security');
      } else if (updatedAlertType === 'normal') {
        priority = 'low';
        console.log('   → Set priority to LOW for normal (general)');
      } else {
        console.log(`   → Unknown alert type "${updatedAlertType}", defaulting to medium`);
      }
      
      console.log(`   Final priority: "${priority}"`);
      
      // Update the alert with the new message, type, and priority
      await storeUpdateAlert(alertToUpdate.id, {
        message: updatedAlertMessage.trim(),
        alert_type: updatedAlertType,
        original_alert_type: updatedAlertType === 'emergency' ? 'emergency' : 
                           updatedAlertType === 'security' ? 'warning' : 'general',
        priority: priority,
      });
      
      console.log('✅ AlertsScreen: Alert updated successfully with priority:', priority);
      setUpdateModalVisible(false);
      setAlertToUpdate(null);
      setUpdatedAlertMessage('');
      setUpdatedAlertDescription('');
      setUpdatedAlertType('security');
      showToast('Alert updated successfully!', 'success');
    } catch (updateError: any) {
      console.error('❌ AlertsScreen: Failed to update alert:', updateError);
      const errorMessage = updateError?.message || 'Failed to update alert. Please try again.';
      showToast(errorMessage, 'error');
    } finally {
      setUpdatingAlert(false);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
    
    // Auto-hide after 2 seconds
    setTimeout(() => {
      setToastVisible(false);
    }, 2000);
  };

  const handleSolve = async (alert: Alert) => {
    console.log('🔧 AlertsScreen: Solve button pressed for alert:', alert.id);
    try {
      await useAlertsStore.getState().resolveAlert(alert.id);
      console.log('✅ Alert resolved successfully');
      showToast('Alert marked as solved!', 'success');
    } catch (resolveError: any) {
      console.error('❌ Failed to resolve alert:', resolveError);
      showToast('Failed to mark alert as solved. Please try again.', 'error');
    }
  };

  // Create new alert function
  const handleCreateAlert = async () => {
    if (!alertMessage.trim()) {
      showToast('Please enter an alert message', 'error');
      return;
    }

    setCreatingAlert(true);
    console.log('🚨 AlertsScreen: Capturing GPS for new alert...');

    try {
      // Step 1: Request location permission and capture GPS
      const hasPermission = await locationService.requestPermission();
      if (!hasPermission) {
        throw new Error('Location permission is required to create an alert');
      }

      const location = await locationService.getCurrentLocation();
      if (!location) {
        throw new Error('Failed to acquire GPS lock. Please ensure your location is enabled.');
      }

      console.log('📍 AlertsScreen: GPS captured:', location.latitude, location.longitude);

      // Step 2: Create alert with captured GPS
      const alertData = {
        alert_type: alertType,
        message: alertMessage.trim(),
        description: alertDescription.trim(),
        priority: (alertType === 'emergency' ? 'high' : alertType === 'security' ? 'medium' : 'low') as 'high' | 'medium' | 'low',
        location_lat: location.latitude,
        location_long: location.longitude,
        expires_at: alertExpiry || undefined
      };

      console.log('📤 Sending alert data to store:', alertData);
      await storeCreateAlert(alertData);

      console.log('✅ Alert created successfully with GPS');

      // Reset form and close modal
      setAlertMessage('');
      setAlertDescription('');
      setAlertType('security');
      setAlertExpiry('');
      setCreateModalVisible(false);

      // Refresh alerts list
      await fetchAlerts();

      showToast('Alert created successfully!', 'success');

    } catch (createError: any) {
      console.error('❌ Failed to create alert:', createError);
      const errorMessage = createError?.message || 'Failed to create alert. Please try again.';
      showToast(errorMessage, 'error');
    } finally {
      setCreatingAlert(false);
    }
  };

  // Filter alerts based on selected section
  const getFilteredAlerts = () => {
    // CRITICAL: Log exact counts for debugging
    console.log('🔍 CRITICAL DEBUG - AlertsScreen Analysis:');
    console.log(`   📊 Total alerts in alertsStore: ${alerts.length}`);
    console.log(`   📊 Selected filter: ${selectedFilter}`);
    
    // Log each alert's status and type for debugging
    alerts.forEach((alert, index) => {
      console.log(`    Alert ${index + 1}: id=${alert.id}, status='${alert.status}', alert_type='${alert.alert_type}', priority='${alert.priority}'`);
    });
    
    if (selectedFilter === 'all') {
      console.log(`   📊 All filter: returning all ${alerts.length} alerts`);
      return alerts;
    }
    
    if (selectedFilter === 'emergency') {
      const filtered = alerts.filter(alert => 
        (alert.alert_type === 'emergency' || alert.priority === 'high') &&
        alert.status !== 'completed' && 
        alert.status !== 'resolved'
      );
      console.log(`   📊 Emergency filtered count: ${filtered.length}`);
      console.log(`   📊 Emergency alerts: ${filtered.map(a => a.id).join(', ')}`);
      return filtered;
    }
    
    if (selectedFilter === 'pending') {
      const filtered = alerts.filter(alert => alert.status === 'pending' || !alert.status);
      console.log(`   📊 Pending filtered count: ${filtered.length}`);
      console.log(`   📊 Pending alerts: ${filtered.map(a => a.id).join(', ')}`);
      return filtered;
    }
    
    if (selectedFilter === 'accepted') {
      const filtered = alerts.filter(alert => 
        alert.status === 'accepted'
      );
      console.log(`   📊 Accepted filtered count: ${filtered.length}`);
      console.log(`   📊 Accepted alerts: ${filtered.map(a => a.id).join(', ')}`);
      return filtered;
    }
    
    if (selectedFilter === 'completed') {
      const filtered = alerts.filter(alert => 
        alert.status === 'completed' || alert.status === 'resolved'
      );
      console.log(`   📊 Completed filtered count: ${filtered.length}`);
      console.log(`   📊 Completed alerts: ${filtered.map(a => a.id).join(', ')}`);
      return filtered;
    }
    
    console.log(`   📊 Default filter: returning all ${alerts.length} alerts`);
    return alerts;
  };

  const renderAlertItem = ({ item }: { item: Alert }) => (
    <AlertCard
      alert={item}
      onRespond={handleRespond}
      onDelete={handleDelete}
      onSolve={handleSolve}
      onUpdate={handleUpdate}
      onViewLocation={handleViewLocation}
    />
  );

  // Show loading state
  if (isLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.lightGrayBg }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { color: colors.darkText }]}>Loading alerts...</Text>
        <Text style={[styles.loadingText, styles.loadingSubtext, { color: colors.darkText }]}>
          Connecting to SafeTNet backend
        </Text>
      </View>
    );
  }

  // Show error state with network-aware messaging
  if (error && alerts.length === 0) {
    const isNetworkError = error.includes('SSL connection') || error.includes('Network Error') || error.includes('timeout') || error.includes('ECONNREFUSED');
    const errorTitle = isNetworkError ? 'Backend Server Unavailable' : 'Error Loading Alerts';
    const errorMessage = isNetworkError
      ? 'SafeTNet backend server is currently unavailable.\n\nPlease ensure the Django server is running.'
      : error;

    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.lightGrayBg }]}>
        <Icon name={isNetworkError ? 'wifi-off' : 'error'} size={48} color={colors.emergencyRed} />
        <Text style={[styles.errorTitle, { color: colors.emergencyRed }]}>{errorTitle}</Text>
        <Text style={[styles.errorText, styles.errorTextCentered, { color: colors.mediumText }]}>{errorMessage}</Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          onPress={onRefresh}
          activeOpacity={0.7}
        >
          <Text style={[styles.retryButtonText, { color: colors.white }]}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.lightGrayBg }]}>
      <View style={[styles.header, styles.headerShadow, {
        backgroundColor: colors.white,
      }]}>
        <View style={styles.headerContent}>
          <View style={styles.headerLeft}>
            <View style={[styles.headerIcon, { backgroundColor: colors.primary }]}>
              <Icon name="notifications" size={20} color={colors.white} />
            </View>
            <View>
              <Text style={[styles.headerTitle, { color: colors.darkText }]}>Security Alerts</Text>
              <Text style={[styles.headerSubtitle, { color: colors.mediumText }]}>Monitor and respond</Text>
            </View>
          </View>
          <View style={styles.headerStats}>
            <View style={[styles.statBadge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.statText, { color: colors.white }]}>{alerts.length}</Text>
            </View>
            {/* Hard reset button */}
            <TouchableOpacity 
              style={[styles.statBadge, styles.hardResetButton]}
              onPress={async () => {
                console.log('🔥 HARD RESET: Clearing alerts cache only...');
                try {
                  // Clear only alerts-related cache, preserve authentication
                  const keysToRemove = [
                    'cached_alerts',
                    'alerts_timestamp',
                    'alerts_last_fetch',
                    'recent_alerts_cache'
                  ];
                  
                  await AsyncStorage.multiRemove(keysToRemove);
                  
                  // Flush Redux persistor (don't purge auth)
                  const { persistor } = require('../../store/store');
                  if (persistor) {
                    await persistor.flush();
                  }
                  
                  await fetchAlerts();
                  console.log('✅ Hard reset complete (auth preserved)');
                } catch (resetError: any) {
                  console.error('❌ Hard reset failed:', resetError);
                }
              }}
            >
              <Icon name="refresh" size={12} color={colors.white} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Filter Sections - Horizontal Scrollable */}
      <View style={[styles.filterSection, styles.filterBorder, {
        backgroundColor: colors.lightGrayBg,
        borderColor: colors.border
      }]}>
        <View style={styles.filterHeader}>
          <Icon name="filter-list" size={16} color={colors.darkText} />
          <Text style={[styles.filterTitle, { color: colors.darkText }]}>Filter by Status</Text>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={styles.filterContainer}
        >
        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'all' && styles.filterButtonActive, {
            backgroundColor: selectedFilter === 'all' ? colors.primary : 'rgba(59, 130, 246, 0.15)',
            borderColor: selectedFilter === 'all' ? colors.primary : colors.border
          }]}
          onPress={() => setSelectedFilter('all')}
        >
          <Icon name="list" size={16} color={selectedFilter === 'all' ? colors.white : colors.primary} style={styles.filterIcon} />
          <Text style={[styles.filterText, { color: selectedFilter === 'all' ? colors.white : colors.primary }]}>All</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'emergency' && styles.filterButtonActive, {
            backgroundColor: selectedFilter === 'emergency' ? colors.emergencyRed : 'rgba(239, 68, 68, 0.15)',
            borderColor: selectedFilter === 'emergency' ? colors.emergencyRed : colors.border
          }]}
          onPress={() => setSelectedFilter('emergency')}
        >
          <Icon name="warning" size={16} color={selectedFilter === 'emergency' ? colors.white : colors.emergencyRed} style={styles.filterIcon} />
          <Text style={[styles.filterText, { color: selectedFilter === 'emergency' ? colors.white : colors.emergencyRed }]}>Emergency</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'pending' && styles.filterButtonActive, {
            backgroundColor: selectedFilter === 'pending' ? colors.warning : 'rgba(245, 158, 11, 0.15)',
            borderColor: selectedFilter === 'pending' ? colors.warning : colors.border
          }]}
          onPress={() => setSelectedFilter('pending')}
        >
          <Icon name="schedule" size={16} color={selectedFilter === 'pending' ? colors.white : colors.warning} style={styles.filterIcon} />
          <Text style={[styles.filterText, { color: selectedFilter === 'pending' ? colors.white : colors.warning }]}>Pending</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'accepted' && styles.filterButtonActive, {
            backgroundColor: selectedFilter === 'accepted' ? colors.success : 'rgba(16, 185, 129, 0.15)',
            borderColor: selectedFilter === 'accepted' ? colors.success : colors.border
          }]}
          onPress={() => setSelectedFilter('accepted')}
        >
          <Icon name="check-circle" size={16} color={selectedFilter === 'accepted' ? colors.white : colors.success} style={styles.filterIcon} />
          <Text style={[styles.filterText, { color: selectedFilter === 'accepted' ? colors.white : colors.success }]}>Accepted</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterButton, selectedFilter === 'completed' && styles.filterButtonActive, {
            backgroundColor: selectedFilter === 'completed' ? colors.primary : 'rgba(37, 99, 235, 0.15)',
            borderColor: selectedFilter === 'completed' ? colors.primary : colors.border
          }]}
          onPress={() => setSelectedFilter('completed')}
        >
          <Icon name="done-all" size={16} color={selectedFilter === 'completed' ? colors.white : colors.primary} style={styles.filterIcon} />
          <Text style={[styles.filterText, { color: selectedFilter === 'completed' ? colors.white : colors.primary }]}>Completed</Text>
        </TouchableOpacity>

        </ScrollView>
      </View>

      {getFilteredAlerts().length > 0 ? (
        <FlatList
          data={getFilteredAlerts()}
          keyExtractor={(item) => {
            console.log('🔑 FlatList keyExtractor for alert:', item.id, item.message?.substring(0, 30));
            return String(item.id); // Ensure it's always a string
          }}
          renderItem={renderAlertItem}
          refreshControl={
            <RefreshControl
              refreshing={isLoading}
              onRefresh={onRefresh}
              colors={[colors.primary]}
              tintColor={colors.primary}
            />
          }
          contentContainerStyle={styles.listContainer}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon="notifications-off"
            title={alerts.length === 0 ? "No Alerts" : `No ${selectedFilter === 'all' ? 'Alerts' : selectedFilter.charAt(0).toUpperCase() + selectedFilter.slice(1)} Alerts`}
            description={
              alerts.length === 0
                ? "All quiet on the security front!"
                : `No alerts match the "${selectedFilter === 'all' ? 'All Alerts' : selectedFilter.charAt(0).toUpperCase() + selectedFilter.slice(1)}" filter.`
            }
          />
        </View>
      )}

      {/* Create Alert Modal */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
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
              <View style={styles.createAlertTypeContainer}>
                {[
                  { key: 'emergency', label: 'Emergency', color: colors.emergencyRed, icon: 'warning' },
                  { key: 'security', label: 'Security', color: colors.warningOrange, icon: 'security' },
                  { key: 'general', label: 'General', color: colors.primary, icon: 'info' },
                  { key: 'area_user_alert', label: 'Area Evacuation', color: '#8B5CF6', icon: 'people' },
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
                placeholder="Enter detailed description..."
                placeholderTextColor={colors.mediumText}
                value={alertDescription}
                onChangeText={setAlertDescription}
                multiline
                numberOfLines={2}
                maxLength={300}
              />

              {/* Area-based Alert Expiry */}
              {alertType === 'area_user_alert' && (
                <>
                  <Text style={[styles.inputLabel, { color: colors.darkText }]}>
                    Alert Expiry Time *
                  </Text>
                  <Text style={[styles.inputSubLabel, { color: colors.mediumText }]}>
                    Set when this evacuation alert should expire
                  </Text>
                  <TextInput
                    style={[styles.textInput, {
                      borderColor: colors.border,
                      backgroundColor: colors.lightGrayBg,
                      color: colors.darkText
                    }]}
                    placeholder="YYYY-MM-DD HH:MM"
                    placeholderTextColor={colors.mediumText}
                    value={alertExpiry}
                    onChangeText={setAlertExpiry}
                  />
                  <Text style={[styles.helperText, { color: colors.mediumText }]}>
                    Example: 2024-12-31 23:59
                  </Text>
                </>
              )}
            </ScrollView>

            {/* Location error display removed - frontend no longer handles location */}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => setCreateModalVisible(false)}
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

      {/* Delete Confirmation Modal */}
      <Modal
        visible={deleteModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={cancelDelete}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.darkText }]}>Delete Alert</Text>
              <TouchableOpacity
                onPress={cancelDelete}
                style={styles.closeButton}
              >
                <Icon name="close" size={24} color={colors.mediumText} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <View style={styles.deleteConfirmationContainer}>
                <Icon name="warning" size={48} color={colors.emergencyRed} style={styles.deleteWarningIcon} />
                <Text style={[styles.deleteConfirmationText, { color: colors.darkText }]}>
                  Are you sure you want to delete this alert?
                </Text>
                {alertToDelete && (
                  <View style={[styles.alertPreviewContainer, { backgroundColor: colors.inputBackground }]}>
                    <Text style={[styles.alertPreviewLabel, { color: colors.mediumText }]}>
                      Alert Details:
                    </Text>
                    <Text style={[styles.alertPreviewMessage, { color: colors.darkText }]}>
                      {alertToDelete.message?.substring(0, 100)}
                      {alertToDelete.message && alertToDelete.message.length > 100 ? '...' : ''}
                    </Text>
                    <Text style={[styles.alertPreviewMeta, { color: colors.mediumText }]}>
                      Type: {alertToDelete.alert_type} • Status: {alertToDelete.status}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton, { backgroundColor: colors.inputBackground }]}
                  onPress={cancelDelete}
                  disabled={deletingAlert}
                >
                  <Text style={[styles.modalButtonText, { color: colors.darkText }]}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.deleteButton, { backgroundColor: colors.emergencyRed }]}
                  onPress={confirmDelete}
                  disabled={deletingAlert}
                >
                  {deletingAlert ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Text style={[styles.modalButtonText, { color: colors.white }]}>Delete</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Update Alert Modal */}
      <Modal
        visible={updateModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setUpdateModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.cardBackground }]}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.darkText }]}>Update Alert</Text>
              <TouchableOpacity
                style={styles.closeButton}
                onPress={() => setUpdateModalVisible(false)}
              >
                <Icon name="close" size={24} color={colors.mediumText} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* Alert Type Selection */}
              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.darkText }]}>Alert Type *</Text>
                <View style={styles.createAlertTypeContainer}>
                  {[
                    { key: 'emergency', label: '🚨 Emergency', color: colors.emergencyRed },
                    { key: 'security', label: '🛡️ Security', color: colors.warningOrange },
                    { key: 'normal', label: '📢 General', color: colors.infoBlue },
                  ].map((type) => (
                    <TouchableOpacity
                      key={type.key}
                      style={[
                        styles.alertTypeButton,
                        {
                          backgroundColor: updatedAlertType === type.key 
                            ? type.color 
                            : colors.lightGrayBg,
                          borderColor: updatedAlertType === type.key 
                            ? type.color 
                            : colors.border,
                        }
                      ]}
                      onPress={() => setUpdatedAlertType(type.key as 'emergency' | 'security' | 'normal')}
                    >
                      <Text style={[
                        styles.alertTypeButtonText,
                        {
                          color: updatedAlertType === type.key 
                            ? colors.white 
                            : type.color,
                        }
                      ]}>
                        {type.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={[styles.inputLabel, { color: colors.darkText }]}>Alert Message *</Text>
                <TextInput
                  style={[
                    styles.textInput,
                    styles.descriptionInput,
                    styles.textAreaVerticalTop,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.lightGrayBg,
                      color: colors.darkText,
                    }
                  ]}
                  placeholder="Enter alert message..."
                  placeholderTextColor={colors.mediumText}
                  value={updatedAlertMessage}
                  onChangeText={setUpdatedAlertMessage}
                  multiline
                  maxLength={500}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { borderColor: colors.border }]}
                onPress={() => setUpdateModalVisible(false)}
                disabled={updatingAlert}
              >
                <Text style={[styles.modalButtonText, { color: colors.mediumText }]}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.updateButton,
                  {
                    backgroundColor: updatingAlert ? colors.mediumText : colors.warningOrange
                  }
                ]}
                onPress={confirmUpdate}
                disabled={updatingAlert || !updatedAlertMessage.trim()}
              >
                {updatingAlert ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Icon name="edit" size={18} color={colors.white} style={styles.buttonIcon} />
                    <Text style={[styles.modalButtonText, { color: colors.white }]}>Update Alert</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Alert Respond Modal */}
      <AlertRespondModal
        visible={showRespondModal}
        alertId={selectedAlertId || ''}
        onClose={handleCloseRespondModal}
        onResponseAccepted={handleResponseAccepted}
      />

      {/* Toast Message */}
      {toastVisible && (
        <View style={[
          styles.toastContainer,
          { backgroundColor: toastType === 'success' ? colors.successGreen : colors.emergencyRed }
        ]}>
          <Text style={[styles.toastMessage, { color: colors.white }]}>{toastMessage}</Text>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.lg,
    paddingTop: spacing.xl,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  headerTitle: {
    ...typography.screenHeader,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 2,
  },
  headerSubtitle: {
    ...typography.caption,
    fontSize: 12,
    opacity: 0.7,
  },
  headerStats: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '600',
  },
  listContainer: {
    padding: spacing.base,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.body,
    marginTop: spacing.md,
  },
  errorTitle: {
    ...typography.screenHeader,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  errorText: {
    ...typography.body,
    textAlign: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  retryButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  retryButtonText: {
    ...typography.buttonSmall,
    fontWeight: '600',
  },
  filterSection: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.base,
    borderRadius: 12,
    padding: spacing.md,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  filterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  filterTitle: {
    ...typography.caption,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#374151',
  },
  filterButtonActive: {
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
    transform: [{ scale: 1.05 }],
  },
  filterText: {
    ...typography.caption,
    fontWeight: '500',
    fontSize: 10,
    textAlign: 'center',
    lineHeight: 12,
  },
  filterIcon: {
    marginRight: 6,
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    marginRight: spacing.sm,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  createButtonText: {
    ...typography.caption,
    fontWeight: '600',
    fontSize: 12,
    marginLeft: spacing.xs,
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
  },
  inputSubLabel: {
    ...typography.secondary,
    fontSize: 14,
    marginBottom: spacing.xs,
  },
  helperText: {
    ...typography.caption,
    fontSize: 12,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
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
    borderTopColor: '#E2E8F0',
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
  // Respond modal specific styles
  alertDetailSection: {
    marginBottom: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  detailText: {
    ...typography.body,
    fontSize: 16,
    marginBottom: spacing.xs,
  },
  detailLabel: {
    ...typography.captionMedium,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: spacing.xs,
    color: '#64748B',
  },
  respondAlertTypeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  alertTypeText: {
    ...typography.captionMedium,
    fontSize: 12,
    fontWeight: '600',
  },
  cancelButton: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  buttonIcon: {
    marginRight: spacing.xs,
  },
  // Toast styles
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#10B981',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    zIndex: 1000,
  },
  toastMessage: {
    ...typography.body,
    fontWeight: '600',
    fontSize: 14,
  },
  // Missing styles for location inputs
  locationSection: {
    marginBottom: spacing.md,
  },
  locationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    marginBottom: spacing.sm,
  },
  locationToggleText: {
    ...typography.body,
    marginLeft: spacing.sm,
    fontWeight: '500',
  },
  locationInputs: {
    marginTop: spacing.sm,
  },
  locationInputRow: {
    marginBottom: spacing.md,
  },
  locationInput: {
    marginTop: spacing.xs,
  },
  // Missing button styles
  modalButtonText: {
    ...typography.buttonMedium,
    fontWeight: '600',
  },
  // Missing confirmation modal styles
  deleteConfirmationContainer: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  deleteWarningIcon: {
    marginBottom: spacing.md,
  },
  deleteConfirmationText: {
    ...typography.body,
    color: '#0F172A',
    textAlign: 'center',
    marginBottom: spacing.lg,
    lineHeight: 20,
  },
  alertPreviewContainer: {
    backgroundColor: '#F8FAFC',
    padding: spacing.md,
    borderRadius: 8,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  alertPreviewLabel: {
    ...typography.caption,
    color: '#64748B',
    marginBottom: spacing.xs,
    fontWeight: '500',
  },
  alertPreviewMessage: {
    ...typography.body,
    color: '#0F172A',
    marginBottom: spacing.sm,
    fontWeight: '500',
  },
  alertPreviewMeta: {
    ...typography.caption,
    color: '#64748B',
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    width: '100%',
  },
  deleteButton: {
    backgroundColor: '#EF4444',
    flex: 1,
  },
  inputGroup: {
    marginBottom: spacing.md,
  },
  updateButton: {
    backgroundColor: '#F97316',
    flex: 1,
  },
  // Alert type selector styles
  createAlertTypeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  alertTypeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertTypeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Additional styles for create modal
  alertTypeIcon: {
    marginRight: 6,
  },
  detailMessage: {
    ...typography.body,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  detailDescription: {
    ...typography.secondary,
    fontSize: 14,
    lineHeight: 20,
  },
  alertTypeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 6,
    marginRight: spacing.sm,
  },
  priorityText: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 20,
    letterSpacing: -0.1,
    color: '#64748B',
  },
  coordinatesText: {
    fontFamily: 'System',
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    letterSpacing: 0,
    color: '#94A3B8',
    marginTop: spacing.xs,
    fontStyle: 'italic',
  },
  acceptButton: {
    backgroundColor: '#10B981',
  },
  // Inline styles converted to StyleSheet
  loadingSubtext: {
    fontSize: 12,
    marginTop: 8,
    opacity: 0.7,
  },
  errorTextCentered: {
    textAlign: 'center',
    lineHeight: 20,
  },
  headerShadow: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  hardResetButton: {
    backgroundColor: '#FF9800',
    marginLeft: 4,
  },
  filterBorder: {
    borderWidth: 1,
  },
  textAreaVerticalTop: {
    textAlignVertical: 'top',
  },
});
