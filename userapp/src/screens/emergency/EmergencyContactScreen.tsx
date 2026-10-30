import React, {useMemo, useState, useEffect} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Linking,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '@react-navigation/native';
import type {Theme} from '@react-navigation/native';
import {useSubscription, FREE_CONTACT_LIMIT} from '../../lib/hooks/useSubscription';
import {useAuthStore} from '../../stores/authStore';
import {useContactStore} from '../../stores/contactStore';
import {apiService} from '../../services/apiService';
import {ThemedAlert} from '../../components/common/ThemedAlert';

type ContactCategory = 'Family' | 'Emergency' | 'Friend';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  type: ContactCategory;
  relationship?: string;
}

const withAlpha = (hex: string, alpha: number) => {
  const sanitized = hex.replace('#', '');
  const expanded =
    sanitized.length === 3
      ? sanitized
          .split('')
          .map((char) => char + char)
          .join('')
      : sanitized;
  const bigint = parseInt(expanded, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type ThemeTokens = {
  mutedTextColor: string;
  secondaryTextColor: string;
  iconMutedColor: string;
  noticeBackground: string;
  noticeBorder: string;
  noticeTextColor: string;
  disabledButtonColor: string;
  softSurfaceColor: string;
  borderColor: string;
  cardShadowColor: string;
  dividerColor: string;
  emptyIconColor: string;
};

const EmergencyContactScreen = () => {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const {colors} = theme;
  const isDarkMode = theme.dark;

  const themeTokens = useMemo<ThemeTokens>(() => ({
    mutedTextColor: isDarkMode ? 'rgba(226, 232, 240, 0.75)' : '#6B7280',
    secondaryTextColor: isDarkMode ? 'rgba(148, 163, 184, 0.85)' : '#9CA3AF',
    iconMutedColor: isDarkMode ? 'rgba(203, 213, 225, 0.85)' : '#6B7280',
    noticeBackground: isDarkMode ? withAlpha('#EF4444', 0.18) : '#FEF2F2',
    noticeBorder: isDarkMode ? withAlpha('#EF4444', 0.35) : '#FECACA',
    noticeTextColor: isDarkMode ? withAlpha('#FCA5A5', 0.88) : '#B91C1C',
    disabledButtonColor: isDarkMode ? withAlpha(colors.primary, 0.35) : '#9CA3AF',
    softSurfaceColor: isDarkMode ? withAlpha(colors.primary, 0.1) : '#F9FAFB',
    borderColor: withAlpha(colors.border, isDarkMode ? 0.7 : 1),
    cardShadowColor: isDarkMode ? 'rgba(15, 23, 42, 0.45)' : '#000000',
    dividerColor: isDarkMode ? withAlpha(colors.border, 0.6) : '#F3F4F6',
    emptyIconColor: isDarkMode ? withAlpha(colors.notification, 0.7) : '#D1D5DB',
  }), [colors, isDarkMode]);

  const styles = useMemo(() => createStyles(colors, themeTokens, isDarkMode), [colors, themeTokens, isDarkMode]);
  const {mutedTextColor, secondaryTextColor, iconMutedColor, noticeTextColor, emptyIconColor} = themeTokens;

  const {isPremium, requirePremium} = useSubscription();
  const user = useAuthStore((state) => state.user);
  const {contacts: storeContacts, loadContacts, addContact, updateContact, deleteContact} = useContactStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Use contacts from store (loaded from API)
  const contacts = storeContacts.map((c: any, index: number) => ({
    id: c.id ? c.id.toString() : `temp_${index}_${c.phone || c.name || index}`,
    name: c.name || c.full_name || '',
    phone: c.phone || c.phone_number || '',
    email: c.email || '',
    type: (c.type || c.contact_type || 'Family') as ContactCategory,
    relationship: c.relationship || '',
  }));
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    relationship: '',
    type: null as ContactCategory | null,
  });
  const [alertVisible, setAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState({
    title: '',
    message: '',
    type: 'info' as 'error' | 'success' | 'info' | 'warning',
    buttons: [] as Array<{text: string; style?: 'default' | 'cancel' | 'destructive'; onPress: () => void}>,
  });
  const [savingContact, setSavingContact] = useState(false);

  // Load contacts from API on mount
  useEffect(() => {
    if (user?.id) {
      loadContactsFromAPI();
    } else {
      setLoading(false);
    }
  }, [user?.id]);

  const loadContactsFromAPI = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      await loadContacts();
    } catch (error) {
      console.error('Error loading contacts:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadContactsFromAPI();
  };

  const maxContacts = useMemo(() => (isPremium ? Infinity : FREE_CONTACT_LIMIT), [isPremium]);
  const reachedFreeLimit = !isPremium && contacts.length >= FREE_CONTACT_LIMIT;

  const handleAddContact = () => {
    if (reachedFreeLimit) {
      requirePremium('Add unlimited emergency contacts with Premium.');
      return;
    }
    setEditingContact(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      relationship: '',
      type: null,
    });
    setShowAddModal(true);
  };

  const handleEditContact = (contact: Contact) => {
    setEditingContact(contact);
    setFormData({
      name: contact.name,
      phone: contact.phone,
      email: contact.email || '',
      relationship: contact.relationship || '',
      type: contact.type,
    });
    setShowAddModal(true);
  };

  const handleDeleteContact = async (id: string) => {
    setAlertConfig({
      title: 'Delete Contact',
      message: 'Are you sure you want to delete this contact?',
      type: 'warning',
      buttons: [
        {text: 'Cancel', style: 'cancel', onPress: () => setAlertVisible(false)},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setAlertVisible(false);
            try {
              const contactId = parseInt(id, 10);
              // Only call backend if it's a real server ID (not a large JS timestamp or NaN)
              if (!isNaN(contactId) && contactId < 100000000000 && user?.id) {
                try {
                  await apiService.deleteFamilyContact(user.id, contactId);
                } catch (apiError: any) {
                  console.warn('Backend delete error (ignoring if already gone):', apiError);
                }
              }
              await deleteContact(id);
              await loadContacts();
            } catch (error) {
              console.error('Error deleting contact:', error);
              // Ensure item is removed locally regardless
              try {
                await deleteContact(id);
                await loadContacts();
              } catch (_) {}
              setAlertConfig({
                title: 'Error',
                message: 'Failed to delete contact. Please try again.',
                type: 'error',
                buttons: [{text: 'OK', onPress: () => setAlertVisible(false)}],
              });
              setAlertVisible(true);
            }
          },
        },
      ],
    });
    setAlertVisible(true);
  };

  const isSaveDisabled = savingContact || !formData.name.trim() || !formData.phone.trim() || !formData.type;

  const handleSaveContact = async () => {
    const nameTrimmed = formData.name.trim();
    const phoneTrimmed = formData.phone.trim();
    
    if (!nameTrimmed || !phoneTrimmed) {
      setAlertConfig({
        title: 'Error',
        message: 'Please fill in name and phone number',
        type: 'error',
        buttons: [{text: 'OK', onPress: () => setAlertVisible(false)}],
      });
      setAlertVisible(true);
      return;
    }

    if (!formData.type) {
      setAlertConfig({
        title: 'Error',
        message: 'Please select the contact type (Family, Emergency, or Friend)',
        type: 'error',
        buttons: [{text: 'OK', onPress: () => setAlertVisible(false)}],
      });
      setAlertVisible(true);
      return;
    }

    if (!user?.id) {
      setAlertConfig({
        title: 'Error',
        message: 'Please login to save contacts',
        type: 'error',
        buttons: [{text: 'OK', onPress: () => setAlertVisible(false)}],
      });
      setAlertVisible(true);
      return;
    }

    setSavingContact(true);
    try {
      const contactData = {
        name: nameTrimmed,
        phone: phoneTrimmed,
        email: formData.email?.trim() || '',
        relationship: formData.relationship?.trim() || '',
        type: formData.type.toLowerCase(),
      };

      if (editingContact) {
        const contactId = parseInt(editingContact.id, 10);
        // If it was stored with a client timestamp or temp id, add as new on backend
        if (isNaN(contactId) || contactId > 100000000000) {
          await apiService.addFamilyContact(user.id, contactData);
          await deleteContact(editingContact.id);
        } else {
          await apiService.updateFamilyContact(user.id, contactId, contactData);
          await updateContact(contactId, {...contactData, type: formData.type});
        }
        await loadContacts();
      } else {
        if (contacts.length >= maxContacts) {
          setSavingContact(false);
          requirePremium('You have reached the contact limit. Upgrade to add more.');
          return;
        }
        const result = await apiService.addFamilyContact(user.id, contactData);
        if (result && result.id) {
          await addContact(result);
        }
        await loadContacts();
      }
      setShowAddModal(false);
      setEditingContact(null);
    } catch (error) {
      console.error('Error saving contact:', error);
      setAlertConfig({
        title: 'Error',
        message: 'Failed to save contact. Please try again.',
        type: 'error',
        buttons: [{text: 'OK', onPress: () => setAlertVisible(false)}],
      });
      setAlertVisible(true);
    } finally {
      setSavingContact(false);
    }
  };

  const handleCall = (phone: string) => {
    try {
      Linking.openURL(`tel:${phone}`);
    } catch (error) {
      console.error('Error initiating call:', error);
      showToast('Unable to start call', ToastAndroid.SHORT);
    }
  };

  const getContactIcon = (type: string) => {
    switch (type) {
      case 'Emergency':
        return 'emergency';
      case 'Family':
        return 'family-restroom';
      case 'Friend':
        return 'people';
      default:
        return 'person';
    }
  };

  const getContactColor = (type: string) => {
    switch (type) {
      case 'Emergency':
        return '#EF4444';
      case 'Family':
        return '#2563EB';
      case 'Friend':
        return '#10B981';
      default:
        return '#6B7280';
    }
  };

  const getContactTint = (type: string, alpha: number) => withAlpha(getContactColor(type), alpha);

  if (loading) {
    return (
      <View style={[styles.container, {backgroundColor: colors.background, paddingTop: insets.top, justifyContent: 'center', alignItems: 'center'}]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <ThemedAlert
        visible={alertVisible}
        title={alertConfig.title}
        message={alertConfig.message}
        type={alertConfig.type}
        buttons={alertConfig.buttons}
        onDismiss={() => setAlertVisible(false)}
      />
    <View style={[styles.container, {backgroundColor: colors.background, paddingTop: insets.top}]}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, {paddingBottom: 24 + insets.bottom}]}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        )}>
        
        {/* Add Contact Button */}
        <TouchableOpacity
          style={[styles.addButton, reachedFreeLimit && styles.addButtonDisabled]}
          onPress={handleAddContact}
          activeOpacity={0.8}
          disabled={reachedFreeLimit}>
          <MaterialIcons name="add" size={24} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Add Contact</Text>
        </TouchableOpacity>
        {reachedFreeLimit && (
          <View style={styles.limitNotice}>
            <MaterialIcons name="workspace-premium" size={18} color={noticeTextColor} />
            <Text style={styles.limitNoticeText}>
              Premium unlocks unlimited emergency contacts and advanced safety automations.
            </Text>
          </View>
        )}

        {/* Contacts List */}
        <View style={styles.limitHeader}>
          <Text style={styles.limitHeaderText}>Emergency Contacts</Text>
          <Text style={styles.limitCount}>
            {Math.min(contacts.length, FREE_CONTACT_LIMIT)} / {isPremium ? '∞' : FREE_CONTACT_LIMIT}
          </Text>
        </View>
        <View style={styles.contactsList}>
          {contacts.map((contact) => (
            <View key={contact.id} style={styles.contactCard}>
              <View style={styles.contactHeader}>
                <View style={[styles.contactIconContainer, {backgroundColor: getContactTint(contact.type, isDarkMode ? 0.32 : 0.12)}]}>
                  <MaterialIcons 
                    name={getContactIcon(contact.type)} 
                    size={28} 
                    color={getContactColor(contact.type)} 
                  />
                </View>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  {contact.relationship && (
                    <Text style={styles.contactRelationship}>{contact.relationship}</Text>
                  )}
                </View>
                <View style={styles.contactTypeBadge}>
                  <View style={[styles.badge, {backgroundColor: getContactTint(contact.type, isDarkMode ? 0.35 : 0.18)}]}>
                    <Text style={[styles.badgeText, {color: getContactColor(contact.type)}]}>
                      {contact.type}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={styles.contactDetails}>
                <TouchableOpacity
                  style={styles.contactDetailRow}
                  onPress={() => handleCall(contact.phone)}
                  activeOpacity={0.7}>
                  <MaterialIcons name="phone" size={20} color={iconMutedColor} />
                  <Text style={styles.contactDetailText}>{contact.phone}</Text>
                  <View style={styles.callAction}>
                  <MaterialIcons name="call" size={20} color={colors.primary} />
                    <Text style={[styles.callActionLabel, {color: colors.primary}]}>
                      Call
                    </Text>
                  </View>
                </TouchableOpacity>

                {contact.email && (
                  <View style={styles.contactDetailRow}>
                    <MaterialIcons name="email" size={20} color={iconMutedColor} />
                    <Text style={styles.contactDetailText}>{contact.email}</Text>
                  </View>
                )}
              </View>

              <View style={styles.contactActions}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleEditContact(contact)}
                  activeOpacity={0.7}>
                  <MaterialIcons name="edit" size={20} color={colors.primary} />
                  <Text style={[styles.actionButtonText, {color: colors.primary}]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={() => handleDeleteContact(contact.id)}
                  activeOpacity={0.7}>
                  <MaterialIcons name="delete" size={20} color="#EF4444" />
                  <Text style={[styles.actionButtonText, {color: '#EF4444'}]}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        {contacts.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialIcons name="contacts" size={64} color={emptyIconColor} />
            <Text style={styles.emptyStateText}>No contacts added yet</Text>
            <Text style={styles.emptyStateSubtext}>Add your first emergency contact</Text>
          </View>
        )}
      </ScrollView>

      {/* Add/Edit Contact Modal */}
      <Modal
        visible={showAddModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAddModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingContact ? 'Edit Contact' : 'Add Contact'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowAddModal(false)}
                style={styles.closeButton}>
                <MaterialIcons name="close" size={24} color={iconMutedColor} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Name *</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="person" size={20} color={iconMutedColor} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter name"
                    placeholderTextColor={secondaryTextColor}
                    value={formData.name}
                    onChangeText={(text) => setFormData({...formData, name: text})}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Phone Number *</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="phone" size={20} color={iconMutedColor} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter phone number"
                    placeholderTextColor={secondaryTextColor}
                    value={formData.phone}
                    onChangeText={(text) => setFormData({...formData, phone: text})}
                    keyboardType="phone-pad"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Email</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="email" size={20} color={iconMutedColor} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter email (optional)"
                    placeholderTextColor={secondaryTextColor}
                    value={formData.email}
                    onChangeText={(text) => setFormData({...formData, email: text})}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Relationship</Text>
                <View style={styles.inputContainer}>
                  <MaterialIcons name="family-restroom" size={20} color={iconMutedColor} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., Father, Mother, Friend"
                    placeholderTextColor={secondaryTextColor}
                    value={formData.relationship}
                    onChangeText={(text) => setFormData({...formData, relationship: text})}
                  />
                </View>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Type *</Text>
                <View style={styles.typeSelector}>
                  {(['Family', 'Emergency', 'Friend'] as const).map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.typeOption,
                        formData.type === type && styles.typeOptionActive,
                        formData.type === type && {backgroundColor: getContactTint(type, isDarkMode ? 0.35 : 0.2), borderColor: getContactColor(type)},
                      ]}
                      onPress={() => setFormData({...formData, type})}
                      activeOpacity={0.7}>
                      <MaterialIcons
                        name={getContactIcon(type)}
                        size={20}
                        color={formData.type === type ? getContactColor(type) : iconMutedColor}
                      />
                      <Text
                        style={[
                          styles.typeOptionText,
                          formData.type === type && {color: getContactColor(type), fontWeight: '600'},
                        ]}>
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {!formData.type && (
                  <Text style={styles.validationText}>Select a contact type to continue</Text>
                )}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAddModal(false)}
                activeOpacity={0.7}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.saveButton,
                  isSaveDisabled && styles.saveButtonDisabled,
                ]}
                onPress={handleSaveContact}
                activeOpacity={0.7}
                disabled={isSaveDisabled}>
                {savingContact ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={styles.saveButtonSpinner} />
                ) : (
                  <MaterialIcons name="save" size={20} color="#FFFFFF" style={styles.saveButtonSpinner} />
                )}
                <Text style={styles.saveButtonText}>
                  {savingContact
                    ? (editingContact ? 'Saving...' : 'Adding...')
                    : editingContact ? 'Save Changes' : 'Add Contact'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
    </>
  );
};

const createStyles = (colors: Theme['colors'], tokens: ThemeTokens, isDarkMode: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingBottom: 24,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      marginHorizontal: 20,
      marginTop: 20,
      marginBottom: 16,
      paddingVertical: 14,
      borderRadius: 12,
      elevation: isDarkMode ? 4 : 2,
      shadowColor: tokens.cardShadowColor,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: isDarkMode ? 0.25 : 0.1,
      shadowRadius: isDarkMode ? 6 : 4,
    },
    addButtonDisabled: {
      backgroundColor: tokens.disabledButtonColor,
    },
    addButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    limitNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: tokens.noticeBackground,
      borderRadius: 12,
      marginHorizontal: 20,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: tokens.noticeBorder,
    },
    limitNoticeText: {
      flex: 1,
      fontSize: 13,
      fontWeight: '500',
      color: tokens.noticeTextColor,
    },
    limitHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    limitHeaderText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    limitCount: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    contactsList: {
      paddingHorizontal: 20,
    },
    contactCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: tokens.borderColor,
      shadowColor: tokens.cardShadowColor,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: isDarkMode ? 0.2 : 0.08,
      shadowRadius: isDarkMode ? 6 : 4,
      elevation: isDarkMode ? 4 : 2,
    },
    contactHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    contactIconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
      backgroundColor: tokens.softSurfaceColor,
    },
    contactInfo: {
      flex: 1,
    },
    contactName: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    contactRelationship: {
      fontSize: 13,
      color: tokens.mutedTextColor,
    },
    contactTypeBadge: {
      marginLeft: 8,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    badgeText: {
      fontSize: 11,
      fontWeight: '600',
      textTransform: 'uppercase',
      color: tokens.iconMutedColor,
    },
    contactDetails: {
      marginBottom: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: tokens.dividerColor,
    },
    contactDetailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      paddingVertical: 4,
    },
    contactDetailText: {
      flex: 1,
      fontSize: 14,
      color: colors.text,
      marginLeft: 12,
    },
    callAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    callActionLabel: {
      fontSize: 14,
      fontWeight: '600',
    },
    contactActions: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: tokens.dividerColor,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      backgroundColor: tokens.softSurfaceColor,
    },
    actionButtonText: {
      fontSize: 14,
      fontWeight: '500',
      marginLeft: 6,
      color: colors.text,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 40,
    },
    emptyStateText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      marginBottom: 4,
    },
    emptyStateSubtext: {
      fontSize: 14,
      color: tokens.secondaryTextColor,
      textAlign: 'center',
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      maxHeight: '90%',
      paddingBottom: 20,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: tokens.borderColor,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
    },
    closeButton: {
      padding: 4,
    },
    modalForm: {
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    inputGroup: {
      marginBottom: 20,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 8,
    },
    inputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: tokens.softSurfaceColor,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.borderColor,
      paddingHorizontal: 12,
      height: 50,
    },
    inputIcon: {
      marginRight: 10,
    },
    input: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 0,
    },
    typeSelector: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
    },
    typeOption: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: tokens.borderColor,
      backgroundColor: tokens.softSurfaceColor,
    },
    typeOptionActive: {
      borderWidth: 2,
    },
    typeOptionText: {
      fontSize: 13,
      fontWeight: '500',
      color: tokens.iconMutedColor,
      marginLeft: 6,
    },
    modalActions: {
      flexDirection: 'row',
      paddingHorizontal: 20,
      paddingTop: 20,
      gap: 12,
    },
    modalButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
    },
    cancelButton: {
      backgroundColor: tokens.softSurfaceColor,
      borderWidth: 1,
      borderColor: tokens.borderColor,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    saveButton: {
      backgroundColor: colors.primary,
      shadowColor: tokens.cardShadowColor,
      shadowOffset: {width: 0, height: 2},
      shadowOpacity: isDarkMode ? 0.25 : 0.1,
      shadowRadius: isDarkMode ? 6 : 4,
      elevation: isDarkMode ? 4 : 2,
    },
    saveButtonSpinner: {
      marginRight: 4,
    },
    saveButtonDisabled: {
      opacity: 0.6,
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    validationText: {
      marginTop: 8,
      fontSize: 12,
      color: '#EF4444',
    },
  });

export default EmergencyContactScreen;
