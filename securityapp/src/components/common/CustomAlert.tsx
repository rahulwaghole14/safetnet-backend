import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  DeviceEventEmitter,
  Animated,
  Dimensions,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

export type AlertType = 'info' | 'success' | 'warning' | 'error' | 'emergency';

export interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export interface AlertOptions {
  cancelable?: boolean;
  onDismiss?: () => void;
  type?: AlertType;
}

interface AlertPayload {
  title: string;
  message?: string;
  buttons?: AlertButton[];
  options?: AlertOptions;
}

const ALERT_EVENT = 'SAFENT_CUSTOM_ALERT_EVENT';

/**
 * Imperative controller matching React Native's Alert.alert signature
 */
export const CustomAlert = {
  alert: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ) => {
    DeviceEventEmitter.emit(ALERT_EVENT, {
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
      options,
    });
  },
};

/**
 * CustomAlertRoot - Mount once at the root of App.tsx
 */
export const CustomAlertRoot: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [payload, setPayload] = useState<AlertPayload | null>(null);
  const scaleAnim = React.useRef(new Animated.Value(0.85)).current;
  const opacityAnim = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(ALERT_EVENT, (data: AlertPayload) => {
      setPayload(data);
      setVisible(true);
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          damping: 18,
          stiffness: 220,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    });

    return () => sub.remove();
  }, [scaleAnim, opacityAnim]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(scaleAnim, {
        toValue: 0.85,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      if (payload?.options?.onDismiss) {
        payload.options.onDismiss();
      }
      setPayload(null);
    });
  };

  const handleButtonPress = (btn?: AlertButton) => {
    handleDismiss();
    if (btn?.onPress) {
      setTimeout(() => {
        btn.onPress?.();
      }, 160);
    }
  };

  if (!visible || !payload) return null;

  const titleLower = (payload.title || '').toLowerCase();
  const explicitType = payload.options?.type;

  let alertType: AlertType = explicitType || 'info';
  if (!explicitType) {
    if (titleLower.includes('sos') || titleLower.includes('emergency')) {
      alertType = 'emergency';
    } else if (titleLower.includes('error') || titleLower.includes('fail')) {
      alertType = 'error';
    } else if (titleLower.includes('success')) {
      alertType = 'success';
    } else if (titleLower.includes('warn') || titleLower.includes('caution')) {
      alertType = 'warning';
    }
  }

  const getThemeConfig = () => {
    switch (alertType) {
      case 'emergency':
        return {
          icon: 'warning',
          iconColor: '#DC2626',
          badgeBg: '#FEE2E2',
          borderColor: '#F87171',
          primaryBtnBg: '#DC2626',
        };
      case 'error':
        return {
          icon: 'error-outline',
          iconColor: '#EF4444',
          badgeBg: '#FEF2F2',
          borderColor: '#FCA5A5',
          primaryBtnBg: '#EF4444',
        };
      case 'success':
        return {
          icon: 'check-circle-outline',
          iconColor: '#10B981',
          badgeBg: '#ECFDF5',
          borderColor: '#6EE7B7',
          primaryBtnBg: '#059669',
        };
      case 'warning':
        return {
          icon: 'report-problem',
          iconColor: '#F59E0B',
          badgeBg: '#FFFBEB',
          borderColor: '#FCD34D',
          primaryBtnBg: '#D97706',
        };
      default:
        return {
          icon: 'notifications-active',
          iconColor: '#2563EB',
          badgeBg: '#EFF6FF',
          borderColor: '#93C5FD',
          primaryBtnBg: '#2563EB',
        };
    }
  };

  const cfg = getThemeConfig();
  const buttons = payload.buttons || [{ text: 'OK' }];

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      onRequestClose={() => {
        if (payload.options?.cancelable !== false) {
          handleDismiss();
        }
      }}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.container,
            {
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
              borderColor: cfg.borderColor,
            },
          ]}
        >
          <View style={[styles.iconBadge, { backgroundColor: cfg.badgeBg }]}>
            <MaterialIcons name={cfg.icon} size={32} color={cfg.iconColor} />
          </View>

          <Text style={styles.title}>{payload.title}</Text>
          {payload.message ? <Text style={styles.message}>{payload.message}</Text> : null}

          <View style={[styles.buttonRow, buttons.length > 2 && styles.buttonCol]}>
            {buttons.map((btn, idx) => {
              const isCancel = btn.style === 'cancel';
              const isDestructive = btn.style === 'destructive';

              return (
                <TouchableOpacity
                  key={`btn-${idx}`}
                  activeOpacity={0.8}
                  style={[
                    styles.button,
                    isCancel
                      ? styles.cancelButton
                      : isDestructive
                      ? styles.destructiveButton
                      : { backgroundColor: cfg.primaryBtnBg },
                  ]}
                  onPress={() => handleButtonPress(btn)}
                >
                  <Text
                    style={[
                      styles.buttonText,
                      isCancel && styles.cancelButtonText,
                    ]}
                  >
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    width: Math.min(width - 48, 380),
    backgroundColor: '#0F172A',
    borderRadius: 20,
    borderWidth: 1.5,
    paddingTop: 28,
    paddingBottom: 20,
    paddingHorizontal: 22,
    alignItems: 'center',
    elevation: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F8FAFC',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 24,
  },
  message: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonRow: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 4,
  },
  buttonCol: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  cancelButton: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  destructiveButton: {
    backgroundColor: '#DC2626',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  cancelButtonText: {
    color: '#CBD5E1',
  },
});
