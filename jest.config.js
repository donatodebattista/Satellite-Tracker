module.exports = {
  preset: '@react-native/jest-preset',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^satellite\\.js$': '<rootDir>/node_modules/satellite.js/dist/index.js',
    '^#wasm-single-thread$':
      '<rootDir>/node_modules/satellite.js/wasm-build/base-release/index.js',
    '^#wasm-multi-thread$':
      '<rootDir>/node_modules/satellite.js/wasm-build/pthreads-release/index.js',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(jest-)?react-native|@react-native(-community)?|@react-native-async-storage|@notifee|react-native-maps|react-native-svg|react-native-geolocation-service|react-native-sensors|react-native-keychain|react-native-background-fetch|satellite\\.js)/',
  ],
};
