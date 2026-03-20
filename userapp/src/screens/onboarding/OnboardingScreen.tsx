import React, {useState, useRef, useMemo} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
  TouchableOpacity,
  StatusBar,
  Image,
  Linking,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {useNavigation, useTheme} from '@react-navigation/native';
import {useAuthStore} from '../../stores/authStore';
import LinearGradient from 'react-native-linear-gradient';
import { PRIVACY_POLICY_URL } from '../../constants/links';

const {width: SCREEN_WIDTH} = Dimensions.get('window');

interface Step {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  isWelcome?: boolean;
}

const OnboardingScreen = () => {
  const navigation = useNavigation<any>();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const [currentPage, setCurrentPage] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const theme = useTheme();
  const {colors, dark} = theme;

  const themeColors = useMemo(
    () => ({
      background: colors.background || (dark ? '#0F172A' : '#F9FAFB'),
      card: colors.card || (dark ? '#1E293B' : '#FFFFFF'),
      text: colors.text || (dark ? '#F8FAFC' : '#111827'),
      textMuted: dark ? 'rgba(248, 250, 252, 0.7)' : '#6B7280',
      primary: colors.primary || '#2563EB',
      border: colors.border || (dark ? 'rgba(148, 163, 184, 0.4)' : '#E5E7EB'),
      overlay: dark ? 'rgba(15, 23, 42, 0.8)' : 'rgba(15, 23, 42, 0.04)',
      navigationBg: dark ? 'rgba(15, 23, 42, 0.92)' : '#F9FAFB',
    }),
    [colors, dark],
  );

  const styles = useMemo(() => createStyles(themeColors), [themeColors]);

  // Steps based on actual app features
  const steps: Step[] = [
    {
      id: 'welcome',
      title: 'Welcome to SafeTNet',
      description: 'Your personal safety companion. Get help instantly when you need it most.',
      icon: 'security',
      color: '#2563EB',
      isWelcome: true,
    },
    {
      id: 'sos',
      title: 'SOS Emergency Button',
      description: 'Press and hold the SOS button to instantly alert emergency services, your contacts, and share your live location. Works even when the app is closed.',
      icon: 'warning',
      color: '#EF4444',
    },
    {
      id: 'shake',
      title: 'Shake to SOS',
      description: 'Shake your device 3 times to trigger an SOS alert. Perfect for emergencies when you can\'t reach your phone. Enable this feature in settings.',
      icon: 'phonelink-ring',
      color: '#F59E0B',
    },
    {
      id: 'contacts',
      title: 'Emergency Contacts',
      description: 'Add your family and friends as emergency contacts. They\'ll receive instant alerts, calls, and your live location when you send an SOS.',
      icon: 'favorite',
      color: '#7C3AED',
    },
    {
      id: 'community',
      title: 'Community Groups',
      description: 'Create or join community groups for your neighborhood, workplace, or any group. Share safety alerts and communicate with members instantly.',
      icon: 'groups',
      color: '#B91C1C',
    },
    {
      id: 'location',
      title: 'Live Location Sharing',
      description: 'Share your real-time location with trusted contacts. They can track your location and receive updates automatically during emergencies.',
      icon: 'my-location',
      color: '#0EA5E9',
    },
    {
      id: 'geofence',
      title: 'Geofencing (Premium)',
      description: 'Get automatic alerts when entering or leaving designated safe zones. Premium users can view all geofences and receive location-based security assistance.',
      icon: 'location-on',
      color: '#10B981',
    },
  ];

  const totalPages = steps.length;
  const isLastPage = currentPage === steps.length - 1;

  const handleSkip = () => {
    // Jump to last page (terms and services)
    const lastPageIndex = totalPages - 1;
    try {
      flatListRef.current?.scrollToIndex({index: lastPageIndex, animated: true});
      setCurrentPage(lastPageIndex);
    } catch (error) {
      flatListRef.current?.scrollToOffset({offset: lastPageIndex * SCREEN_WIDTH, animated: true});
      setCurrentPage(lastPageIndex);
    }
  };

  const handleGetStarted = () => {
    // If user is already authenticated, navigate to Home
    if (isAuthenticated) {
      navigation.reset({
        index: 0,
        routes: [{name: 'Home'}],
      });
    } else {
      // For backward compatibility
      const {login} = useAuthStore.getState();
      login('demo@example.com', 'demo123');
    }
  };

  const onViewableItemsChanged = useRef(({viewableItems}: any) => {
    if (viewableItems && viewableItems.length > 0) {
      const index = viewableItems[0].index;
      if (index !== null && index !== undefined) {
        setCurrentPage(index);
      }
    }
  }).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const goToNext = () => {
    if (currentPage < steps.length - 1) {
      const nextIndex = currentPage + 1;
      try {
        flatListRef.current?.scrollToIndex({index: nextIndex, animated: true});
        setCurrentPage(nextIndex);
      } catch (error) {
        flatListRef.current?.scrollToOffset({offset: nextIndex * SCREEN_WIDTH, animated: true});
        setCurrentPage(nextIndex);
      }
    }
  };

  const renderStep = ({item, index}: {item: Step; index: number}) => {
    if (item.isWelcome) {
      return (
        <View style={[styles.pageContainer, {width: SCREEN_WIDTH}]}>
          <LinearGradient
            colors={['#60A5FA', '#2563EB']}
            style={styles.welcomeContainer}>
            <View style={styles.logoContainer}>
              <Image
                source={require('../../assets/images/app_logo.png')}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </View>
            <Text style={styles.welcomeTitle}>{item.title}</Text>
            <Text style={styles.welcomeSubtitle}>{item.description}</Text>
          </LinearGradient>
        </View>
      );
    }

    return (
      <View style={[styles.pageContainer, {width: SCREEN_WIDTH}]}>
        <View style={styles.contentContainer}>
          <View style={[styles.iconCircle, {backgroundColor: item.color}]}>
            <MaterialIcons name={item.icon as any} size={64} color="#FFFFFF" />
          </View>
          <Text style={styles.stepNumber}>Step {index} of {steps.length - 1}</Text>
          <Text style={styles.stepTitle}>{item.title}</Text>
          <Text style={styles.stepDescription}>{item.description}</Text>
        </View>
      </View>
    );
  };

  const renderPaginationDots = () => {
    return (
      <View style={styles.paginationContainer}>
        {steps.map((_, index) => (
          <View
            key={index}
            style={[
              styles.paginationDot,
              index === currentPage && styles.paginationDotActive,
            ]}
          />
        ))}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={dark ? 'light-content' : 'dark-content'} backgroundColor={themeColors.background} />
      
      {/* Skip Button */}
      {currentPage < totalPages - 1 && !steps[currentPage].isWelcome && (
        <TouchableOpacity
          style={styles.skipButton}
          onPress={handleSkip}
          activeOpacity={0.7}>
          <Text style={styles.skipButtonText}>Skip</Text>
        </TouchableOpacity>
      )}
      
      <FlatList
        ref={flatListRef}
        data={steps}
        renderItem={renderStep}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        onScrollToIndexFailed={(info) => {
          const wait = new Promise((resolve) => setTimeout(() => resolve(null), 500));
          wait.then(() => {
            flatListRef.current?.scrollToIndex({index: info.index, animated: true});
          });
        }}
      />
      
      <View style={styles.paginationWrapper}>
        {renderPaginationDots()}
        {/* Terms and Service Text - Only on last page */}
        {isLastPage && (
          <View style={styles.termsTextContainer}>
            <Text style={styles.termsServiceText}>
              By clicking Get Started, you agree to our{' '}
              <Text style={styles.termsServiceLink}>Terms of Service</Text>
              {' '}and{' '}
              <Text 
                style={styles.termsServiceLink}
                onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}>
                Privacy Policy
              </Text>
            </Text>
          </View>
        )}
      </View>
      
      <View style={[
        styles.navigationContainer,
        steps[currentPage]?.isWelcome && styles.navigationContainerWelcome
      ]}>
        {isLastPage ? (
          // Get Started Button - Always shown on last page
          <TouchableOpacity
            style={styles.continueButton}
            onPress={handleGetStarted}
            activeOpacity={0.8}>
            <Text style={styles.continueButtonText}>Get Started</Text>
            <MaterialIcons name="arrow-forward" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        ) : (
          // Next Button
          <View style={styles.nextButtonContainer}>
            <TouchableOpacity
              style={[
                styles.nextButton,
                steps[currentPage]?.isWelcome && styles.nextButtonWelcome
              ]}
              onPress={goToNext}
              activeOpacity={0.8}>
              <Text style={[
                styles.nextButtonText,
                steps[currentPage]?.isWelcome && styles.nextButtonTextWelcome
              ]}>Next</Text>
              <MaterialIcons 
                name="arrow-forward" 
                size={24} 
                color={steps[currentPage]?.isWelcome ? '#FFFFFF' : themeColors.primary} 
              />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const createStyles = (themeColors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: themeColors.background,
    },
    pageContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    welcomeContainer: {
      flex: 1,
      width: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 40,
      paddingBottom: 60,
    },
    logoContainer: {
      width: 140,
      height: 140,
      marginBottom: 50,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoImage: {
      width: '100%',
      height: '100%',
    },
    welcomeTitle: {
      color: '#FFFFFF',
      fontSize: 32,
      fontWeight: 'bold',
      textAlign: 'center',
      marginBottom: 16,
    },
    welcomeSubtitle: {
      color: '#FFFFFF',
      fontSize: 18,
      textAlign: 'center',
      lineHeight: 26,
      marginTop: 8,
    },
    contentContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
      paddingTop: 80,
      paddingBottom: 120,
    },
    iconCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 32,
      shadowColor: themeColors.primary,
      shadowOffset: {width: 0, height: 4},
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 8,
    },
    stepNumber: {
      fontSize: 14,
      fontWeight: '600',
      color: themeColors.textMuted,
      marginBottom: 16,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    stepTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: themeColors.text,
      textAlign: 'center',
      marginBottom: 16,
    },
    stepDescription: {
      fontSize: 16,
      color: themeColors.textMuted,
      textAlign: 'center',
      lineHeight: 24,
      paddingHorizontal: 16,
      marginBottom: 32,
    },
    paginationWrapper: {
      position: 'absolute',
      bottom: 100,
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    paginationContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 16,
    },
    paginationDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: themeColors.border,
      marginHorizontal: 4,
    },
    paginationDotActive: {
      width: 24,
      backgroundColor: themeColors.primary,
    },
    termsTextContainer: {
      paddingHorizontal: 32,
      paddingBottom: 8,
      alignItems: 'center',
    },
    termsServiceText: {
      fontSize: 12,
      color: themeColors.textMuted,
      textAlign: 'center',
      lineHeight: 16,
    },
    termsServiceLink: {
      color: themeColors.primary,
      fontWeight: '600',
    },
    navigationContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingBottom: 32,
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: themeColors.navigationBg,
      minHeight: 70,
    },
    navigationContainerWelcome: {
      backgroundColor: 'transparent',
    },
    nextButtonContainer: {
      flex: 1,
      alignItems: 'flex-end',
    },
    nextButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 24,
      borderRadius: 12,
      backgroundColor: themeColors.card,
      borderWidth: 1,
      borderColor: themeColors.border,
      gap: 8,
    },
    nextButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: themeColors.primary,
    },
    nextButtonWelcome: {
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    nextButtonTextWelcome: {
      color: '#FFFFFF',
    },
    continueButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 32,
      borderRadius: 12,
      backgroundColor: themeColors.primary,
      gap: 8,
      shadowColor: themeColors.primary,
      shadowOffset: {width: 0, height: 6},
      shadowOpacity: 0.25,
      shadowRadius: 12,
      elevation: 5,
    },
    continueButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    skipButton: {
      position: 'absolute',
      top: 50,
      right: 20,
      zIndex: 1000,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.2)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.3)',
    },
    skipButtonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
  });

export default OnboardingScreen;
