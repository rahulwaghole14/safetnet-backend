import React, {useState, useEffect, useRef} from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  Linking,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '@react-navigation/native';
import {useSettingsStore, DEFAULT_SOS_MESSAGES} from '../../stores/settingsStore';
import type {ThemeMode, SosAudience} from '../../stores/settingsStore';
import {shakeDetectionService} from '../../services/shakeDetectionService';
import { PRIVACY_POLICY_URL } from '../../constants/links';

const SettingsScreen = () => {
  const shakeToSendSOS = useSettingsStore((state) => state.shakeToSendSOS);
  const setShakeToSendSOS = useSettingsStore((state) => state.setShakeToSendSOS);
  const themeMode = useSettingsStore((state) => state.themeMode);
  const setThemeMode = useSettingsStore((state) => state.setThemeMode);
  const sosMessages = useSettingsStore((state) => state.sosMessages);
  const setSosMessage = useSettingsStore((state) => state.setSosMessage);
  const resetSosMessage = useSettingsStore((state) => state.resetSosMessage);
  const [isAccelerometerAvailable, setIsAccelerometerAvailable] = useState(false);
  const [activeAudience, setActiveAudience] = useState<SosAudience>('family');
  const [draftMessage, setDraftMessage] = useState(sosMessages.family);
  const [customizeModalVisible, setCustomizeModalVisible] = useState(false);
  const messageInputRef = useRef<TextInput>(null);
  const theme = useTheme();

  useEffect(() => {
    // Check if accelerometer is available immediately
    const checkAvailability = () => {
      const available = shakeDetectionService.isAccelerometerAvailable();
      setIsAccelerometerAvailable(available);
      return available;
    };

    // Initial check
    checkAvailability();

    // Retry checking after a delay in case module loads later
    const retryInterval = setInterval(() => {
      if (checkAvailability()) {
        clearInterval(retryInterval); // Stop retrying once available
      }
    }, 2000); // Check every 2 seconds

    // Stop retrying after 10 seconds
    const timeout = setTimeout(() => {
      clearInterval(retryInterval);
    }, 10000);

    return () => {
      clearInterval(retryInterval);
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    setDraftMessage(sosMessages[activeAudience]);
  }, [activeAudience, sosMessages]);

  const handleSaveMessage = async () => {
    const trimmed = draftMessage.trim();
    if (!trimmed) {
      Alert.alert('Message required', 'Please enter a message before saving.');
      return;
    }
    await setSosMessage(activeAudience, trimmed);
  };

  const handleResetMessage = async () => {
    await resetSosMessage(activeAudience);
  };

  const themeOptions: {mode: ThemeMode; label: string; icon: string}[] = [
    {mode: 'light', label: 'Light', icon: 'light-mode'},
    {mode: 'dark', label: 'Dark', icon: 'dark-mode'},
    {mode: 'system', label: 'System', icon: 'settings'},
  ];

  const sosTabs: {key: SosAudience; label: string; icon: string}[] = [
    {key: 'family', label: 'Family', icon: 'favorite'},
    {key: 'police', label: 'Police', icon: 'local-police'},
    {key: 'security', label: 'Security', icon: 'security'},
  ];
  const anyCustom = sosTabs.some(
    (item) => sosMessages[item.key] !== DEFAULT_SOS_MESSAGES[item.key],
  );

  const openCustomizeModal = () => setCustomizeModalVisible(true);
  const closeCustomizeModal = () => setCustomizeModalVisible(false);

  return (
    <ScrollView
      style={[styles.container, {backgroundColor: theme.colors.background}]}
      contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, {color: theme.colors.text}]}>Safety</Text>
        <View
          style={[
            styles.settingItem,
            {backgroundColor: theme.colors.card, borderColor: theme.colors.border},
          ]}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="vibration" size={24} color="#2563EB" />
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, {color: theme.colors.text}]}>Send SOS by shaking phone 3 times</Text>
              <Text style={[styles.settingDescription, {color: theme.colors.notification}]}>Enable shake gesture to quickly send SOS alerts</Text>
              {!isAccelerometerAvailable && (
                <Text style={styles.warningText}>
                  Accelerometer not available. Please rebuild the app.
                </Text>
              )}
            </View>
          </View>
          <Switch
            value={shakeToSendSOS && isAccelerometerAvailable}
            onValueChange={async (value) => {
              if (isAccelerometerAvailable) {
                await setShakeToSendSOS(value);
                // Start/stop service based on setting
                if (value) {
                  shakeDetectionService.start(() => {
                    // This will be handled by HomeScreen
                  });
                } else {
                  shakeDetectionService.stop();
                }
              }
            }}
            disabled={!isAccelerometerAvailable}
            trackColor={{false: '#D1D5DB', true: '#93C5FD'}}
            thumbColor={shakeToSendSOS && isAccelerometerAvailable ? '#2563EB' : '#F3F4F6'}
            ios_backgroundColor="#D1D5DB"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, {color: theme.colors.text}]}>Appearance</Text>
        <View style={styles.themeOptionsContainer}>
          {themeOptions.map((option) => {
            const isActive = option.mode === themeMode;
            return (
              <TouchableOpacity
                key={option.mode}
                onPress={() => setThemeMode(option.mode)}
                activeOpacity={0.85}
                style={[
                  styles.themeOption,
                  {
                    backgroundColor: isActive ? '#2563EB' : theme.colors.card,
                    borderColor: isActive ? '#2563EB' : theme.colors.border,
                  },
                ]}>
                <MaterialIcons
                  name={option.icon}
                  size={22}
                  color={isActive ? '#FFFFFF' : theme.colors.text}
                />
                <Text
                  style={[
                    styles.themeOptionLabel,
                    {color: isActive ? '#FFFFFF' : theme.colors.text},
                  ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.themeHint, {color: theme.colors.notification}]}>System matches your device theme automatically.</Text>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionTitle, {color: theme.colors.text}]}>SOS Messages</Text>
        <Text style={[styles.sectionDescription, {color: theme.colors.notification}]}>
          These messages are sent to your trusted contacts whenever you trigger SOS.
        </Text>
        <View
          style={[
            styles.sosCard,
            {backgroundColor: theme.colors.card, borderColor: theme.colors.border},
          ]}>
          <View style={styles.sosCardHeader}>
            <View>
              <Text style={[styles.sosCardTitle, {color: theme.colors.text}]}>SOS Message Setup</Text>
              <Text style={[styles.sosCardSubtitle, {color: theme.colors.notification}]}>
                Family, police, and security get their own message.
              </Text>
              <Text style={[styles.sosStatusText, {color: anyCustom ? '#047857' : theme.colors.notification}]}>
                {anyCustom ? 'Custom templates are active' : 'Currently using default templates'}
              </Text>
            </View>
            <TouchableOpacity style={styles.customizeBtn} onPress={openCustomizeModal}>
              <Text style={styles.customizeBtnText}>Customize</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <Modal
        transparent
        animationType="slide"
        visible={customizeModalVisible}
        onRequestClose={closeCustomizeModal}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, {backgroundColor: theme.colors.card}]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, {color: theme.colors.text}]}>
                Customize SOS messages
              </Text>
              <TouchableOpacity onPress={closeCustomizeModal}>
                <MaterialIcons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <Text style={[styles.sectionDescription, {color: theme.colors.notification}]}>
              Choose which group to edit, then write the message they should receive.
            </Text>
            <ScrollView
              style={styles.modalBody}
              contentContainerStyle={{paddingBottom: 20}}
              showsVerticalScrollIndicator={false}>
              <View style={styles.audienceTabs}>
                {sosTabs.map((audience) => {
                  const isActive = audience.key === activeAudience;
                  return (
                    <TouchableOpacity
                      key={audience.key}
                      style={[
                        styles.audienceTab,
                        {
                          backgroundColor: isActive ? '#2563EB' : theme.colors.card,
                          borderColor: isActive ? '#2563EB' : theme.colors.border,
                        },
                      ]}
                      onPress={() => setActiveAudience(audience.key)}
                      activeOpacity={0.85}>
                      <MaterialIcons
                        name={audience.icon}
                        size={18}
                        color={isActive ? '#FFFFFF' : theme.colors.text}
                      />
                      <Text
                        style={[
                          styles.audienceTabLabel,
                          {color: isActive ? '#FFFFFF' : theme.colors.text},
                        ]}>
                        {audience.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View
                style={[
                  styles.messageEditor,
                  {backgroundColor: theme.colors.card, borderColor: theme.colors.border},
                ]}>
                <TextInput
                  ref={messageInputRef}
                  style={[styles.messageInput, {color: theme.colors.text}]}
                  multiline
                  value={draftMessage}
                  editable
                  onChangeText={setDraftMessage}
                  placeholder="Type what should be sent for this group when you trigger SOS..."
                  placeholderTextColor={theme.colors.notification}
                />
                <Text style={[styles.characterCount, {color: theme.colors.notification}]}>
                  {draftMessage.length} characters
                </Text>
              </View>
              <View style={styles.messageActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryAction]}
                  activeOpacity={0.85}
                  onPress={handleResetMessage}>
                  <Text style={[styles.actionText, {color: '#111827'}]}>Reset to default</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionButton, styles.primaryAction]}
                  activeOpacity={0.85}
                  onPress={handleSaveMessage}>
                  <Text style={[styles.actionText, {color: '#FFFFFF'}]}>Save message</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, {color: theme.colors.text}]}>About & Legal</Text>
        <TouchableOpacity
          style={[
            styles.settingItem,
            {backgroundColor: theme.colors.card, borderColor: theme.colors.border},
          ]}
          onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
          <View style={styles.settingInfo}>
            <MaterialIcons name="security" size={24} color="#2563EB" />
            <View style={styles.settingTextContainer}>
              <Text style={[styles.settingTitle, {color: theme.colors.text}]}>Privacy Policy</Text>
              <Text style={[styles.settingDescription, {color: theme.colors.notification}]}>View our commitment to your privacy</Text>
            </View>
          </View>
          <MaterialIcons name="chevron-right" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        
        <View style={styles.appVersionContainer}>
          <Text style={[styles.appVersionText, {color: theme.colors.notification}]}>Version 1.0.1 (Build 2)</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  section: {
    marginTop: 24,
    gap: 12,
  },
  sectionDescription: {
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 16,
    gap: 12,
  },
  settingTextContainer: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  warningText: {
    fontSize: 12,
    color: '#EF4444',
    marginTop: 4,
    fontStyle: 'italic',
  },
  themeOptionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  themeOption: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  themeOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  themeHint: {
    fontSize: 12,
    marginTop: 4,
  },
  sosCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 16,
  },
  sosCardHeader: {
    flexDirection: 'column',
    gap: 12,
  },
  sosCardTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  sosCardSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  customizeBtn: {
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  customizeBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  sosStatusText: {
    fontSize: 12,
    marginTop: 8,
    fontWeight: '600',
  },
  audienceTabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  audienceTab: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  audienceTabLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  messageEditor: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  messageInput: {
    minHeight: 100,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  messageActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryAction: {
    backgroundColor: '#2563EB',
  },
  secondaryAction: {
    backgroundColor: '#E5E7EB',
  },
  actionText: {
    fontSize: 15,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  modalBody: {
    marginTop: 8,
  },
  appVersionContainer: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  appVersionText: {
    fontSize: 12,
    opacity: 0.7,
  },
});

export default SettingsScreen;

