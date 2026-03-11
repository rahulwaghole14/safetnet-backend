import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Image,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authService, testBackendConnectivity } from '../../api/services/authService';
import { useAppDispatch } from '../../store/hooks';
import { loginSuccess } from '../../store/slices/authSlice';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../contexts/ThemeContext';
import { typography, spacing } from '../../utils';
import type { SecurityOfficer } from '../../types/user.types';

type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  ForgotPassword: undefined;
};

type AuthNavigationProp = NativeStackNavigationProp<AuthStackParamList>;

// Safe logo loading - will use image if file exists, otherwise fallback to emoji
let logoSource = null;
try {
  logoSource = require('../../assets/images/safetnet-logo.png');
} catch (e) {
  logoSource = null;
}

export const LoginScreen = () => {
  const { colors } = useTheme();
  const { width, height } = Dimensions.get('window');

  // Animation values
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      flexGrow: 1,
    },
    // Premium gradient header
    header: {
      height: height * 0.35,
      paddingTop: 50,
      paddingBottom: 16,
      paddingHorizontal: 24,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: colors.primary,
      borderBottomLeftRadius: 30,
      borderBottomRightRadius: 30,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 6,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    logoContainer: {
      alignItems: 'center',
      marginBottom: 8, // Reduced from 24 to make everything tighter
      zIndex: 1,
    },
    logo: {
      width: 100, // Further increased size
      height: 100,
      borderRadius: 25,
      backgroundColor: 'transparent',
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 0, // No space between icon and title
      borderWidth: 0,
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    logoText: {
      fontSize: 64, // Much larger icon
      fontWeight: 'bold',
      color: '#FFFFFF',
      marginBottom: 8,
      textShadowColor: 'rgba(0, 0, 0, 0.6)', // Stronger shadow
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    },
    appName: {
      fontSize: 28,
      fontWeight: '800', // Extra bold
      color: '#FFFFFF',
      marginBottom: 0, // Remove space between title lines
      letterSpacing: 1.5,
      textShadowColor: 'rgba(0, 0, 0, 0.4)',
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
      textAlign: 'center', // Center the text
    },
    subtitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#FFE4B5', // Light orange
      textAlign: 'center',
      letterSpacing: 0.8,
      textShadowColor: 'rgba(0, 0, 0, 0.3)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
      marginTop: 0, // No margin since it's part of the title
    },
    // Premium form container
    formContainer: {
      backgroundColor: colors.white,
      borderTopLeftRadius: 30, // Smaller radius
      borderTopRightRadius: 30,
      marginTop: -30,
      paddingTop: 24, // Reduced padding
      paddingHorizontal: 24, // Reduced padding
      paddingBottom: 24, // Reduced padding
      flex: 1,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: -6 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 6,
    },
    formHeader: {
      alignItems: 'center',
      marginBottom: 20, // Reduced margin
    },
    welcomeText: {
      fontSize: 22, // Further reduced
      fontWeight: 'bold',
      color: colors.darkText,
      marginBottom: 4,
      textAlign: 'center',
    },
    welcomeSubtext: {
      fontSize: 12, // Further reduced
      fontWeight: '400',
      color: colors.mediumText,
      textAlign: 'center',
      marginBottom: 20, // Reduced margin
      lineHeight: 16,
    },
    inputContainer: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.darkText,
      marginBottom: 6,
      marginLeft: 4,
    },
    inputWrapper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.inputBackground,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: colors.inputBorder,
      paddingHorizontal: 16,
      paddingVertical: 2,
      height: 44,
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    inputFocused: {
      borderColor: colors.primary,
      backgroundColor: colors.white,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.2,
      shadowRadius: 8,
      elevation: 4,
    },
    input: {
      flex: 1,
      fontSize: 14, // Reduced
      color: colors.darkText,
      paddingVertical: 10, // Reduced padding
      paddingLeft: 6,
      paddingRight: 6,
      textAlignVertical: 'center',
      lineHeight: 18, // Reduced line height
      includeFontPadding: false,
    },
    inputIcon: {
      marginRight: 12,
    },
    passwordContainer: {
      position: 'relative',
    },
    passwordInput: {
      flex: 1,
      fontSize: 14, // Reduced
      color: colors.darkText,
      paddingVertical: 10, // Reduced padding
      paddingLeft: 6,
      paddingRight: 6,
      textAlignVertical: 'center',
      lineHeight: 18, // Reduced line height
      includeFontPadding: false,
    },
    togglePassword: {
      padding: 8,
    },
    // Premium button
    loginButton: {
      backgroundColor: colors.primary,
      borderRadius: 16,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 16,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    loginButtonText: {
      color: colors.white,
      fontSize: 14, // Reduced
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    forgotPasswordContainer: {
      alignItems: 'center',
      marginTop: 8, // Reduced
      marginBottom: 16, // Reduced
    },
    forgotPassword: {
      fontSize: 12, // Reduced
      color: colors.primary,
      fontWeight: '600',
    },
    footer: {
      alignItems: 'center',
      marginTop: 20,
    },
    versionText: {
      fontSize: 10, // Reduced
      color: colors.mediumText,
      textAlign: 'center',
      marginTop: 4,
    },
    logoImage: {
      width: 100, // Increased size
      height: 100,
      borderRadius: 25,
    },
    logoFallback: {
      fontSize: 64, // Larger icon
      color: '#FFFFFF',
      textShadowColor: 'rgba(0, 0, 0, 0.6)', // Stronger shadow
      textShadowOffset: { width: 0, height: 2 },
      textShadowRadius: 4,
    },
    eyeIcon: {
      padding: 8,
    },
    eyeIconText: {
      fontSize: 16,
      color: colors.mediumText,
    },
    // Loading overlay
    loadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(255, 255, 255, 0.9)',
      justifyContent: 'center',
      alignItems: 'center',
      zIndex: 1000,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
    // Security badge
    securityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      paddingHorizontal: 8, // Reduced
      paddingVertical: 4, // Reduced
      borderRadius: 12, // Reduced
      marginTop: 8, // Reduced
      alignSelf: 'center',
    },
    securityBadgeText: {
      fontSize: 10, // Reduced
      color: colors.success,
      fontWeight: '600',
      marginLeft: 4,
    },
    form: {
      flex: 1,
    },
  });

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const passwordInputRef = useRef<TextInput>(null);
  const dispatch = useAppDispatch();
  const navigation = useNavigation<AuthNavigationProp>();

  // Animation effect
  useEffect(() => {
    const startAnimations = () => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 100,
          friction: 8,
          useNativeDriver: true,
        }),
      ]).start();
    };

    startAnimations();
  }, []);


  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter email and password');
      return;
    }

    try {
      setIsLoading(true);

      // Make login request
      const res = await authService.login({
        email,
        password,
        device_type: Platform.OS === 'ios' ? 'ios' : 'android'
      });

      // Check if login was successful
      if (!res.access || !res.user) {
        throw new Error('Invalid login response');
      }

      // Extract tokens and user data (optimized - minimal processing)
      const accessToken = res.access;
      const refreshToken = res.refresh;
      const user = res.user || {
        id: 0,
        username: '',
        email: '',
        role: '',
        first_name: '',
        last_name: '',
        mobile: '',
        geofence_id: '',
        user_image: '',
        status: ''
      };

      if (!accessToken) {
        throw new Error("Access token not received from server");
      }

      const normalizedRole: SecurityOfficer['security_role'] = (() => {
        switch ((user.role || '').toLowerCase()) {
          case 'admin':
            return 'admin';
          case 'supervisor':
            return 'supervisor';
          case 'guard':
            return 'guard';
          case 'security_officer':
          case 'security':
          default:
            return 'guard';
        }
      })();

      const normalizedStatus: SecurityOfficer['status'] =
        (user.status || '').toLowerCase() === 'inactive' ? 'inactive' : 'active';

      const officer: SecurityOfficer = {
        id: user.id,  // ✅ REQUIRED (numeric backend ID)
        security_id: String(user.id), // optional string version
        name: user.username,
        email_id: user.email,
        mobile: user.mobile || "",
        security_role: "guard" as const,
        geofence_id: user.geofence_id || "",
        user_image: user.user_image || "",
        status: "active" as const
      };

      // Debug log
      console.log("LOGIN OFFICER OBJECT:", officer);

      // Persist tokens to AsyncStorage for session management
      try {
        await AsyncStorage.setItem('token', accessToken);
        if (refreshToken) {
          await AsyncStorage.setItem('refresh_token', refreshToken);
        }
        console.log('✅ Tokens persisted to AsyncStorage');
      } catch (storageError) {
        console.error('⚠️ Failed to persist tokens:', storageError);
        // Continue with login even if storage fails
      }

      // Dispatch login success - navigation will automatically switch to MainNavigator
      dispatch(loginSuccess({ token: accessToken, officer, navigateToSOS: false }));

      // Immediately fetch alerts and geofence data for Dashboard
      try {
        const { useAlertsStore } = await import('../../store/alertsStore');
        useAlertsStore.getState().fetchAlerts();

        // Fetch assigned geofence data after successful login
        const { useGeofenceStore } = await import('../../store/geofenceStore');
        const geofenceStore = useGeofenceStore.getState();

        console.log('🎯 Post-login geofence check:');
        console.log('   Officer geofence_id:', officer.geofence_id);

        // Fetch geofences if officer has geofence_id assigned
        if (officer.geofence_id) {
          console.log('✅ Officer has geofence assigned, fetching geofence data...');
          await geofenceStore.fetchAssignedGeofence(String(officer.id));
          await geofenceStore.fetchGeofences(String(officer.id));
        } else {
          console.log('⚠️ No geofence assigned to this officer');
        }
      } catch (error) {
        console.warn('Could not fetch post-login data:', error);
      }

      setIsLoading(false); // Clear loading state immediately
    } catch (err: any) {
      setIsLoading(false); // Clear loading state on error

      // Improved error logging as requested
      console.error("Login error:", err.message);
      console.error("Error code:", err.code);
      console.error("Error config URL:", err.config?.url);
      console.error("Error response status:", err.response?.status);
      console.error("Error response data:", err.response?.data);

      const status = err.response && err.response.status ? err.response.status : undefined;
      const isNetworkError = err.code === 'ERR_NETWORK' || err.message === 'Network Error' || !err.response;
      let errorMessage = 'Invalid Credentials';

      // Handle network errors (no response from server)
      if (isNetworkError) {
        errorMessage = 'Cannot reach server. The backend service may be sleeping (Render free tier takes 30-90 seconds to wake up). Please wait 1-2 minutes and try again.';
      } else if (status === 502) {
        // Bad Gateway - Render service is down or sleeping
        errorMessage = 'Backend service is not responding. The service may be sleeping (Render free tier takes 30-90 seconds to wake up). Please wait and try again, or check Render dashboard.';
      } else if (status === 503) {
        errorMessage = 'Service temporarily unavailable. The server is starting up or overloaded. Please wait 1-2 minutes and try again.';
      } else if (status === 400) {
        // 400 Bad Request - show backend's specific error message
        // Handle Django REST Framework error formats
        const backendError = err.response && err.response.data ? err.response.data : null;

        if (backendError) {
          // Format: { "non_field_errors": ["Invalid credentials."] }
          if (backendError.non_field_errors && Array.isArray(backendError.non_field_errors)) {
            errorMessage = backendError.non_field_errors[0];
          }
          // Format: { "message": "Invalid credentials" }
          else if (backendError.message) {
            errorMessage = backendError.message;
          }
          // Format: { "error": "Invalid credentials" }
          else if (backendError.error) {
            errorMessage = backendError.error;
          }
          // Format: { "detail": "Invalid credentials" }
          else if (backendError.detail) {
            errorMessage = backendError.detail;
          }
          // Format: string
          else if (typeof backendError === 'string') {
            errorMessage = backendError;
          }
          // Fallback
          else {
            errorMessage = err.message || 'Invalid credentials. Please check your username and password.';
          }
        } else {
          errorMessage = err.message || 'Invalid credentials. Please check your username and password.';
        }

        // Log full error details for debugging
        console.error("400 Error Details:", JSON.stringify(backendError, null, 2));
      } else if (status === 401) {
        errorMessage = 'Invalid username or password. Please try again.';
      } else if (status === 503) {
        errorMessage = 'Service temporarily unavailable. The server is down or overloaded. Please try again later.';
      } else if (status >= 500) {
        errorMessage = 'Server error. Please try again later.';
      } else if (!err.response) {
        errorMessage = 'Network error. Please check your internet connection.';
      } else {
        errorMessage = (err.response && err.response.data && err.response.data.message) || (err.response && err.response.data && err.response.data.error) || err.message || 'Invalid Credentials';
      }

      Alert.alert('Login Failed', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <View style={styles.scrollContent}>
        {/* Premium Header Section */}
        <Animated.View
          style={[
            styles.header,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <View style={styles.logoContainer}>
              <View style={styles.logo}>
                {logoSource ? (
                  <Image
                    source={logoSource}
                    style={styles.logoImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.logoFallback}>🛡️</Text>
                )}
              </View>
            </View>
            <Text style={styles.appName}>SafeTNet</Text>
            <Text style={styles.subtitle}>Security Officer Portal</Text>
          </Animated.View>
        </Animated.View>

        {/* Premium Form Section */}
        <Animated.View
          style={[
            styles.formContainer,
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }]
            }
          ]}
        >
          <View style={styles.formHeader}>
            <Text style={styles.welcomeText}>Welcome Back</Text>
            <Text style={styles.welcomeSubtext}>Sign in to access your security dashboard</Text>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Badge ID or Email</Text>
            <View style={[styles.inputWrapper, emailFocused && styles.inputFocused]}>
              <Icon name="badge" size={18} color={emailFocused ? colors.primary : colors.mediumText} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Enter your badge ID or email"
                value={email}
                onChangeText={setEmail}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholderTextColor={colors.mediumText}
                returnKeyType="next"
                onSubmitEditing={() => {
                  if (passwordInputRef.current) {
                    passwordInputRef.current.focus();
                  }
                }}
              />
            </View>
          </View>

          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Password</Text>
            <View style={[styles.inputWrapper, passwordFocused && styles.inputFocused]}>
              <Icon name="lock" size={18} color={passwordFocused ? colors.primary : colors.mediumText} style={styles.inputIcon} />
              <TextInput
                ref={passwordInputRef}
                style={[styles.input, styles.passwordInput]}
                placeholder="Enter your password"
                value={password}
                onChangeText={setPassword}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                secureTextEntry={!showPassword}
                placeholderTextColor={colors.mediumText}
                returnKeyType="go"
                onSubmitEditing={handleLogin}
                blurOnSubmit={false}
              />
              <TouchableOpacity
                style={styles.togglePassword}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Icon
                  name={showPassword ? 'visibility-off' : 'visibility'}
                  size={18}
                  color={colors.mediumText}
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.forgotPasswordContainer}
            onPress={() => navigation.navigate('ForgotPassword')}
          >
            <Text style={styles.forgotPassword}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginButton}
            onPress={handleLogin}
            disabled={isLoading}
          >
            <Text style={styles.loginButtonText}>
              {isLoading ? 'SIGNING IN...' : 'SIGN IN'}
            </Text>
          </TouchableOpacity>

          {/* Security Badge */}
          <View style={styles.securityBadge}>
            <Icon name="verified-user" size={14} color={colors.success} />
            <Text style={styles.securityBadgeText}>Secure Connection</Text>
          </View>

          <Text style={styles.versionText}>Version 2.2.0</Text>
        </Animated.View>
      </View>

      {/* Loading Overlay */}
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Authenticating...</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

export default LoginScreen;
