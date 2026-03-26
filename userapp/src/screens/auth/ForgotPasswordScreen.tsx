import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Image,
  Alert,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useAuthStore} from '../../stores/authStore';
import {useNavigation} from '@react-navigation/native';

const ForgotPasswordScreen = () => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState(1); // 1: Email, 2: OTP & New Password
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  
  const requestReset = useAuthStore((state) => state.requestPasswordReset);
  const resetPassword = useAuthStore((state) => state.resetPassword);
  const navigation = useNavigation<any>();

  useEffect(() => {
    let timer: any;
    if (countdown > 0) {
      timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleRequestOTP = async () => {
    if (!email) {
      setError('Please enter your email address');
      return;
    }

    if (countdown > 0) {
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await requestReset(email);
      setStep(2);
      setCountdown(120); // 2 minutes cooldown
      Alert.alert(
        'OTP Sent', 
        'An OTP has been sent to your email. Please wait up to 2 minutes for it to arrive before requesting again.'
      );
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleResetPassword = async () => {
    if (!otp || !newPassword || !confirmPassword) {
      setError('Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await resetPassword(email, otp, newPassword);
      Alert.alert('Success', 'Password has been reset successfully.', [
        {text: 'Login', onPress: () => navigation.navigate('Login')},
      ]);
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please check the OTP or try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#2563eb" />
      
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
        <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          
          <View style={styles.contentWrapper}>
            <View style={styles.logoSection}>
              <View style={styles.logoImageContainer}>
                <Image
                  source={require('../../assets/images/app_logo.png')}
                  style={styles.logoImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.welcomeText}>
                {step === 1 ? 'Forgot Password?' : 'Reset Password'}
              </Text>
              <Text style={styles.subtitleText}>
                {step === 1 
                  ? 'Enter your email to receive a password reset OTP'
                  : 'Enter the 6-digit OTP sent to your email and your new password'
                }
              </Text>
            </View>

            <View style={styles.formSection}>
              {step === 1 ? (
                <>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="email" size={20} color="#6B7280" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Email Address"
                      placeholderTextColor="#9CA3AF"
                      value={email}
                      onChangeText={(text) => {
                        setEmail(text);
                        setError(null);
                      }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  
                  {error && (
                    <View style={styles.errorContainer}>
                      <MaterialIcons name="error" size={16} color="#EF4444" style={styles.errorIcon} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={handleRequestOTP}
                    disabled={loading || countdown > 0}
                    style={[styles.actionButton, (loading || countdown > 0) && styles.buttonDisabled]}>
                    <Text style={styles.actionButtonText}>
                      {loading 
                        ? 'SENDING...' 
                        : countdown > 0 
                          ? `RESEND IN ${formatCountdown(countdown)}` 
                          : 'SEND OTP'
                      }
                    </Text>
                  </TouchableOpacity>

                  {countdown > 0 && (
                    <Text style={styles.waitMessage}>
                      Email might take 1-2 minutes to arrive. Please check your spam folder.
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <View style={styles.inputContainer}>
                    <MaterialIcons name="vpn-key" size={20} color="#6B7280" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="6-Digit OTP"
                      placeholderTextColor="#9CA3AF"
                      value={otp}
                      onChangeText={(text) => {
                        setOtp(text);
                        setError(null);
                      }}
                      keyboardType="number-pad"
                      maxLength={6}
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <MaterialIcons name="lock" size={20} color="#6B7280" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="New Password"
                      placeholderTextColor="#9CA3AF"
                      value={newPassword}
                      onChangeText={(text) => {
                        setNewPassword(text);
                        setError(null);
                      }}
                      secureTextEntry
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <MaterialIcons name="lock" size={20} color="#6B7280" style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Confirm New Password"
                      placeholderTextColor="#9CA3AF"
                      value={confirmPassword}
                      onChangeText={(text) => {
                        setConfirmPassword(text);
                        setError(null);
                      }}
                      secureTextEntry
                    />
                  </View>

                  {error && (
                    <View style={styles.errorContainer}>
                      <MaterialIcons name="error" size={16} color="#EF4444" style={styles.errorIcon} />
                      <Text style={styles.errorText}>{error}</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    onPress={handleResetPassword}
                    disabled={loading}
                    style={[styles.actionButton, loading && styles.buttonDisabled]}>
                    <Text style={styles.actionButtonText}>
                      {loading ? 'RESETTING...' : 'RESET PASSWORD'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity 
                    onPress={() => setStep(1)} 
                    style={styles.backToStep1}>
                    <Text style={styles.backToStep1Text}>Change Email</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2563eb',
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 20,
    left: 20,
    zIndex: 10,
    padding: 8,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  contentWrapper: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  logoSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoImageContainer: {
    width: 100,
    height: 100,
    marginBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  welcomeText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitleText: {
    color: '#E0E7FF',
    fontSize: 14,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  formSection: {
    width: '100%',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 12,
    height: 52,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  errorIcon: {
    marginRight: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  actionButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backToStep1: {
    alignItems: 'center',
    marginTop: 20,
  },
  backToStep1Text: {
    color: '#FFFFFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  waitMessage: {
    color: '#E0E7FF',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
  },
});

export default ForgotPasswordScreen;
