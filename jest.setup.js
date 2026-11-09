/* eslint-env jest */

jest.mock('@react-native-async-storage/async-storage', () => {
  const memoryStorage = new Map();
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async key =>
        memoryStorage.has(key) ? memoryStorage.get(key) : null,
      ),
      setItem: jest.fn(async (key, value) => {
        memoryStorage.set(key, value);
      }),
      removeItem: jest.fn(async key => {
        memoryStorage.delete(key);
      }),
      clear: jest.fn(async () => {
        memoryStorage.clear();
      }),
      getAllKeys: jest.fn(async () => Array.from(memoryStorage.keys())),
      setMany: jest.fn(async entries => {
        for (const [k, v] of Object.entries(entries)) {
          memoryStorage.set(k, v);
        }
      }),
      removeMany: jest.fn(async keys => {
        keys.forEach(k => memoryStorage.delete(k));
      }),
      getMany: jest.fn(async keys => {
        const result = {};
        for (const k of keys) {
          result[k] = memoryStorage.has(k) ? memoryStorage.get(k) : null;
        }
        return result;
      }),
      multiRemove: jest.fn(async keys => {
        keys.forEach(k => memoryStorage.delete(k));
      }),
    },
  };
});

jest.mock('react-native-keychain', () => {
  const keychainStore = new Map();
  return {
    ACCESSIBLE: {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
    },
    setGenericPassword: jest.fn(async (username, password, options) => {
      const service = (options && options.service) || 'default';
      keychainStore.set(service, { username, password, service });
      return { service, storage: 'mock' };
    }),
    getGenericPassword: jest.fn(async options => {
      const service = (options && options.service) || 'default';
      return keychainStore.get(service) || false;
    }),
    resetGenericPassword: jest.fn(async options => {
      const service = (options && options.service) || 'default';
      keychainStore.delete(service);
      return true;
    }),
  };
});

jest.mock('react-native-geolocation-service', () => ({
  __esModule: true,
  default: {
    requestAuthorization: jest.fn(async () => 'granted'),
    getCurrentPosition: jest.fn(success => {
      success({
        coords: {
          latitude: -32.4833,
          longitude: -58.2333,
          altitude: 25,
          accuracy: 5,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: Date.now(),
      });
    }),
    watchPosition: jest.fn(success => {
      success({
        coords: {
          latitude: -32.4833,
          longitude: -58.2333,
          altitude: 25,
          accuracy: 5,
          altitudeAccuracy: 5,
          heading: 0,
          speed: 0,
        },
        timestamp: Date.now(),
      });
      return 1;
    }),
    clearWatch: jest.fn(),
  },
}));

jest.mock('react-native-sensors', () => {
  const createMockObservable = defaultVal => ({
    subscribe: jest.fn(observer => {
      if (typeof observer === 'function') {
        observer(defaultVal);
      } else if (observer && typeof observer.next === 'function') {
        observer.next(defaultVal);
      }
      return { unsubscribe: jest.fn() };
    }),
  });

  return {
    magnetometer: createMockObservable({ x: 0, y: 25, z: 0, timestamp: Date.now() }),
    accelerometer: createMockObservable({ x: 0, y: 4.9, z: 8.5, timestamp: Date.now() }),
    gyroscope: createMockObservable({ x: 0, y: 0, z: 0, timestamp: Date.now() }),
    setUpdateIntervalForType: jest.fn(),
    SensorTypes: {
      accelerometer: 'accelerometer',
      gyroscope: 'gyroscope',
      magnetometer: 'magnetometer',
    },
  };
});

jest.mock('@notifee/react-native', () => ({
  __esModule: true,
  default: {
    requestPermission: jest.fn(async () => ({ authorizationStatus: 1 })),
    createChannel: jest.fn(async () => 'satellite-passes'),
    createTriggerNotification: jest.fn(async () => 'notif-id-1'),
    displayNotification: jest.fn(async () => 'notif-now-1'),
    cancelNotification: jest.fn(async () => undefined),
    cancelAllNotifications: jest.fn(async () => undefined),
    getTriggerNotificationIds: jest.fn(async () => []),
  },
  TriggerType: {
    TIMESTAMP: 0,
  },
  AndroidImportance: {
    HIGH: 4,
    DEFAULT: 3,
  },
}));

jest.mock('react-native-background-fetch', () => ({
  __esModule: true,
  default: {
    configure: jest.fn(async () => 2),
    scheduleTask: jest.fn(async () => true),
    finish: jest.fn(),
    status: jest.fn(async () => 2),
    NETWORK_TYPE_ANY: 1,
  },
}));
