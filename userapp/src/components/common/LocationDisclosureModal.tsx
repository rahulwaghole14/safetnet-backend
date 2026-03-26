import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useTheme} from '@react-navigation/native';

interface LocationDisclosureModalProps {
  visible: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

/**
 * Prominent Disclosure Modal for Background Location Access
 * Required by Google Play Console User Data Policy
 */
export const LocationDisclosureModal: React.FC<LocationDisclosureModalProps> = ({
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
            <MaterialIcons name="my-location" size={32} color="#2563EB" />
          </View>
          
          <Text style={[styles.title, {color: colors.text}]}>
            Background Location Access
          </Text>
          
          <Text style={[styles.message, {color: colors.text}]}>
            SafeTNet collects location data to enable the following features even when the app is closed or not in use:
          </Text>
          
          <View style={styles.featureList}>
            <View style={styles.featureItem}>
              <MaterialIcons name="emergency-share" size={20} color="#DC2626" />
              <Text style={[styles.featureText, {color: colors.text}]}>
                <Text style={styles.boldText}>SOS Alerts:</Text> Shares your live location with emergency contacts when you trigger an SOS.
              </Text>
            </View>
            
            <View style={styles.featureItem}>
              <MaterialIcons name="notifications-active" size={20} color="#047857" />
              <Text style={[styles.featureText, {color: colors.text}]}>
                <Text style={styles.boldText}>Geofence Monitoring:</Text> Notifies you and your contacts when you enter or exit safe zones.
              </Text>
            </View>
          </View>
          
          <Text style={[styles.footerText, {color: colors.text}]}>
            This data is only used for your safety and is never shared for advertising. You can change this in settings at any time.
          </Text>
          
          <View style={styles.actions}>
            <TouchableOpacity 
              style={[styles.secondaryBtn, {borderColor: colors.border}]} 
              onPress={onDecline}
            >
              <Text style={[styles.secondaryText, {color: dark ? '#F8FAFC' : '#0F172A'}]}>
                No, thanks
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={styles.primaryBtn} 
              onPress={onAccept}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryText}>Accept & Continue</Text>
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

export default LocationDisclosureModal;
