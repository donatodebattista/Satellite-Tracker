import * as Keychain from 'react-native-keychain';

export interface SpaceTrackCredentials {
  identity: string; // Space-Track username/email
  password: string;
}

export interface N2yoCredentials {
  apiKey: string;
}

export interface ProxyConfig {
  enabled: boolean;
  baseUrl: string;
}

const SERVICE_SPACETRACK = 'com.satellitetracker.spacetrack';
const SERVICE_N2YO = 'com.satellitetracker.n2yo';
const SERVICE_PROXY = 'com.satellitetracker.proxy';

export class CredentialVault {
  /**
   * Stores Space-Track credentials in device keychain.
   */
  public static async setSpaceTrackCredentials(
    creds: SpaceTrackCredentials,
  ): Promise<boolean> {
    const result = await Keychain.setGenericPassword(
      creds.identity,
      creds.password,
      {
        service: SERVICE_SPACETRACK,
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      },
    );
    return Boolean(result);
  }

  /**
   * Retrieves Space-Track credentials from keychain.
   */
  public static async getSpaceTrackCredentials(): Promise<SpaceTrackCredentials | null> {
    const entry = await Keychain.getGenericPassword({
      service: SERVICE_SPACETRACK,
    });
    if (!entry) return null;
    return {
      identity: entry.username,
      password: entry.password,
    };
  }

  /**
   * Clears Space-Track credentials.
   */
  public static async clearSpaceTrackCredentials(): Promise<boolean> {
    return Keychain.resetGenericPassword({ service: SERVICE_SPACETRACK });
  }

  /**
   * Stores N2YO API key.
   */
  public static async setN2yoApiKey(apiKey: string): Promise<boolean> {
    const result = await Keychain.setGenericPassword('n2yo_user', apiKey, {
      service: SERVICE_N2YO,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return Boolean(result);
  }

  /**
   * Retrieves N2YO API key.
   */
  public static async getN2yoApiKey(): Promise<string | null> {
    const entry = await Keychain.getGenericPassword({ service: SERVICE_N2YO });
    if (!entry) return null;
    return entry.password;
  }

  /**
   * Clears N2YO credentials.
   */
  public static async clearN2yoApiKey(): Promise<boolean> {
    return Keychain.resetGenericPassword({ service: SERVICE_N2YO });
  }

  /**
   * Stores proxy configuration.
   */
  public static async setProxyConfig(config: ProxyConfig): Promise<boolean> {
    const serialized = JSON.stringify(config);
    const result = await Keychain.setGenericPassword(
      'proxy_setting',
      serialized,
      {
        service: SERVICE_PROXY,
      },
    );
    return Boolean(result);
  }

  /**
   * Retrieves proxy configuration. Defaults to disabled.
   */
  public static async getProxyConfig(): Promise<ProxyConfig> {
    const entry = await Keychain.getGenericPassword({ service: SERVICE_PROXY });
    if (!entry) {
      return {
        enabled: false,
        baseUrl: 'http://10.0.2.2:3000', // Standard Android emulator localhost host mapping
      };
    }
    try {
      return JSON.parse(entry.password) as ProxyConfig;
    } catch {
      return { enabled: false, baseUrl: 'http://10.0.2.2:3000' };
    }
  }
}
