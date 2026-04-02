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
  mode?: 'foreground' | 'background';
}

/**
 * Prominent Disclosure Modal for Location Access
 * Required by Google Play Console User Data Policy
 */
export const LocationDisclosureModal: React.FC<LocationDisclosureModalProps> = ({
  visible,
  onAccept,
  onDecline,
  mode = 'background',
}) => {
  const {colors, dark} = useTheme();

  if (!visible) {
    return null;
  }

  const isBackground = mode === 'background';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDecline}>
      <View style={styles.overlay}>
        <View style={[styles.container, {backgroundColor: colors.card}]}>
          <View style={styles.iconWrapper}>
            <MaterialIcons name={isBackground ? "my-location" : "location-on"} size={32} color="#2563EB" />
          </View>
          
          <Text style={[styles.title, {color: colors.text}]}>
            {isBackground ? 'Background Location Access' : 'Location Permission'}
          </Text>
          
          <Text style={[styles.message, {color: colors.text}]}>
            {isBackground 
              ? 'SafeTNet collects location data to enable SOS Alerts and Geofence Monitoring even when the app is closed or not in use.' 
              : 'SafeTNet collects location data to show nearby security officers and help centers while you are using the app.'}
          </Text>
          
          <View style={styles.featureList}>
            {isBackground ? (
              <>
                <View style={styles.featureItem}>
                  <MaterialIcons name="emergency-share" size={20} color="#DC2626" />
                  <Text style={[styles.featureText, {color: colors.text}]}>
                    <Text style={styles.boldText}>SOS Alerts:</Text> Automatically shares your live location with emergency contacts when an SOS is triggered, even if the app is in the background.
                  </Text>
                </View>
                
                <View style={styles.featureItem}>
                  <MaterialIcons name="notifications-active" size={20} color="#047857" />
                  <Text style={[styles.featureText, {color: colors.text}]}>
                    <Text style={styles.boldText}>Geofence Monitoring:</Text> Tracks your entry and exit from safe zones to notify your contacts in real-time, requiring background access.
                  </Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.featureItem}>
                  <MaterialIcons name="security" size={20} color="#047857" />
                  <Text style={[styles.featureText, {color: colors.text}]}>
                    <Text style={styles.boldText}>Nearby Officers:</Text> Shows you the nearest security officers and help centers on the map.
                  </Text>
                </View>
                
                <View style={styles.featureItem}>
                  <MaterialIcons name="sos" size={20} color="#DC2626" />
                  <Text style={[styles.featureText, {color: colors.text}]}>
                    <Text style={styles.boldText}>Precise SOS:</Text> Accurately identifies your current location when you send an SOS.
                  </Text>
                </View>
              </>
            )}
          </View>
          
          <Text style={[styles.footerText, {color: colors.text}]}>
            Your location data is encrypted and used only for your personal safety. It is never shared with third parties for advertising.
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
                {isBackground ? 'Allow all the time' : 'Accept & Continue'}
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

export default LocationDisclosureModal;
