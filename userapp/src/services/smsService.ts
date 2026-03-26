import {Alert, Linking, NativeModules, Platform} from 'react-native';

type SmsNativeModule = {
  sendDirectSms: (phone: string, message: string) => Promise<boolean>;
};

const {SmsModule} = NativeModules as {SmsModule?: SmsNativeModule};

const buildSmsUrl = (phone: string, message: string) => `sms:${phone}?body=${encodeURIComponent(message)}`;

export const sendSmsDirect = async (recipients: string[], message: string, forceDirect: boolean = false): Promise<boolean> => {
  if (recipients.length === 0) {
    console.warn('⚠️ No recipients provided for SMS');
    return false;
  }

  console.log(`📤 Triggering SMS intent for ${recipients.length} recipient(s)`);

  // On Android, we use the custom native module which uses ACTION_SENDTO
  // This is Play Store compliant as it opens the SMS app for user confirmation.
  if (Platform.OS === 'android' && SmsModule?.sendDirectSms) {
    try {
      // NOTE: For multiple recipients, we'll trigger the first one and rely on user
      // or the backend triggerSOS for silent multiple-recipient alerts.
      // Opening multiple Intents in a loop is usually blocked or bad UX.
      const recipient = recipients[0].trim();
      return await SmsModule.sendDirectSms(recipient, message);
    } catch (error) {
      console.error('⚠️ Native SMS module failed:', error);
    }
  }

  // Fallback / iOS: Open default SMS app via Linking
  try {
    const url = buildSmsUrl(recipients[0], message);
    await Linking.openURL(url);
    return true;
  } catch (error) {
    console.error('❌ Failed to open SMS app:', error);
    Alert.alert('Unable to open SMS', 'Please try again.');
    return false;
  }
};
