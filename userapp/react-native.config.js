module.exports = {
  project: {
    android: {
      packageName: 'com.safetnet.userapp',
    },
  },
  dependencies: {
    '@react-native-community/geolocation': {
      platforms: {
        android: null,
      },
    },
    'react-native-iap': {
      platforms: {
        android: null,
      },
    },
  },
};
