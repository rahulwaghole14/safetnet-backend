import {Alert, Linking, NativeModules, Platform} from 'react-native';

const directCallModule = NativeModules.DirectCallModule as
  | {startDirectCall(phoneNumber: string): Promise<boolean>}
  | undefined;

export const requestDirectCall = async (phoneNumber: string): Promise<void> => {
  if (!phoneNumber) {
    throw new Error('Missing phone number');
  }

  // Use native module if available (Android uses ACTION_DIAL)
  if (Platform.OS === 'android' && directCallModule?.startDirectCall) {
    try {
      await directCallModule.startDirectCall(phoneNumber);
      return;
    } catch (error) {
      console.warn('Direct call module failed, falling back to Linking:', error);
    }
  }

  // Fallback to Linking.openURL with tel:
  const sanitized = phoneNumber.replace(/\s+/g, '');
  const url = `tel:${sanitized}`;
  const supported = await Linking.canOpenURL(url);

  if (!supported) {
    throw new Error('Calling is not supported on this device');
  }

  try {
    await Linking.openURL(url);
  } catch (error) {
    Alert.alert('Call failed', 'Unable to place the call. Please try again.');
    throw error;
  }
};
