import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '@react-navigation/native';

interface AudioDisclosureModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Prominent Disclosure Modal for Microphone Access
 * Required by Google Play Console User Data Policy
 */
export const AudioDisclosureModal: React.FC<AudioDisclosureModalProps> = ({
  visible,
  onAccept,
  onDecline,
}) => {
  const {colors, dark} = useTheme();

  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={[styles.container, {backgroundColor: colors.card}]}>
          <View style={styles.iconWrapper}>
            <MaterialIcons name="mic" size={32} color="#2563EB" />
          </View>
          
          <Text style={[styles.title, {color: colors.text}]}>
            Microphone Access
          </Text>
          
          <Text style={[styles.message, {color: colors.text}]}>
            SafeTNet needs access to your microphone to capture audio during emergency SOS alerts and video reports.
          </Text>
          
          <View style={styles.featureList}>
                <View style={styles.featureItem}>
                  <MaterialIcons name="emergency" size={20} color="#DC2626" />
                  <Text style={[styles.featureText, {color: colors.text}]}>
                    <Text style={styles.boldText}>SOS Evidence:</Text> Records audio when an SOS is triggered to provide critical evidence to emergency responders.
                  </Text>
                </View>
                
                <View style={styles.featureItem}>
                  <MaterialIcons name="videocam" size={20} color="#047857" />
                  <Text style={[styles.featureText, {color: colors.text}]}>
                    <Text style={styles.boldText}>Voice Reports:</Text> Allows you to record voice descriptions when submitting safety reports or community alerts.
                  </Text>
                </View>
          </View>
          
          <Text style={[styles.footerText, {color: colors.text}]}>
            Your audio data is only recorded during active SOS events or when you explicitly start a recording. It is never used for advertising.
          </Text>
          
          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.secondaryBtn, {borderColor: colors.border}]} 
              onPress={onDecline}
            >
              <Text style={[styles.secondaryText, {color: dark ? '#F1F5F9' : '#475569'}]}>
                No, thanks
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.primaryBtn} 
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryText}>
                Accept & Continue
              </Text>
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
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  iconWrapper: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  message: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    opacity: 0.9,
  },
  featureList: {
    marginBottom: 20,
    gap: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  featureText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  boldText: {
    fontWeight: '700',
  },
  footerText: {
    fontSize: 13,
    textAlign: 'center',
    fontStyle: 'italic',
    marginBottom: 24,
    opacity: 0.7,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  secondaryText: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryBtn: {
    flex: 2,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

export default AudioDisclosureModal;
