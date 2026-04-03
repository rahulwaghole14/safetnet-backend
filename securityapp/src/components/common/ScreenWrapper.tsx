import React from 'react';
import { View, StyleSheet, ScrollView, ViewStyle, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../../utils/colors';

interface ScreenWrapperProps {
  children: React.ReactNode;
  style?: ViewStyle;
  contentContainerStyle?: ViewStyle;
  scrollable?: boolean;
  backgroundColor?: string;
  edges?: ('top' | 'bottom' | 'left' | 'right')[];
}

/**
 * ScreenWrapper provides consistent safe area handling for all screens.
 * Especially important for translucent status bars and device notches.
 */
export const ScreenWrapper: React.FC<ScreenWrapperProps> = ({
  children,
  style,
  contentContainerStyle,
  scrollable = true,
  backgroundColor,
  edges = ['top'], // Default to protecting the top
}) => {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  
  const containerStyle: ViewStyle = {
    flex: 1,
    backgroundColor: backgroundColor || colors.background,
    // Add top padding if 'top' edge is requested
    paddingTop: edges.includes('top') ? insets.top : 0,
    // Add bottom padding if 'bottom' edge is requested
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
  };

  if (scrollable) {
    return (
      <View style={[containerStyle, style]}>
        <ScrollView
          contentContainerStyle={contentContainerStyle}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[containerStyle, style]}>
      <View style={[{ flex: 1 }, contentContainerStyle]}>
        {children}
      </View>
    </View>
  );
};
