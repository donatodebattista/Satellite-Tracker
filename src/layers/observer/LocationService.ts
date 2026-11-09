import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { DEFAULT_OBSERVER_LOCATION, ObserverLocation } from '../../shared';

export interface LocationOptions {
  timeoutMs?: number;
  highAccuracy?: boolean;
}

/**
 * Observer Geolocation Service (RF-03).
 * Resolves user GPS coordinates with fallback to Concepción del Uruguay (FCyT)
 * and manual override support.
 */
export class LocationService {
  private static manualLocation: ObserverLocation | null = null;
  private static cachedLocation: ObserverLocation | null = null;

  /**
   * Sets manual location override (e.g. for deterministic testing or custom ground station).
   */
  public static setManualLocation(location: ObserverLocation): void {
    this.manualLocation = { ...location, isManual: true };
  }

  /**
   * Clears manual location override, restoring GPS usage.
   */
  public static clearManualLocation(): void {
    this.manualLocation = null;
  }

  /**
   * Returns active manual location, if set.
   */
  public static getManualLocation(): ObserverLocation | null {
    return this.manualLocation;
  }

  /**
   * Requests geolocation runtime permissions across platforms.
   */
  public static async requestPermissions(): Promise<boolean> {
    if (Platform.OS === 'ios') {
      const auth = await Geolocation.requestAuthorization('whenInUse');
      return auth === 'granted';
    }

    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Permiso de Ubicación para Satellite Tracker',
            message:
              'La aplicación requiere su geolocalización para calcular los ángulos de azimut/elevación y las ventanas de visibilidad de los satélites.',
            buttonNeutral: 'Preguntar luego',
            buttonNegative: 'Cancelar',
            buttonPositive: 'Aceptar',
          },
        );
        return granted === PermissionsAndroid.RESULTS.GRANTED;
      } catch {
        return false;
      }
    }

    return true;
  }

  /**
   * Retrieves the current observer position.
   * Falls back to default coordinates if GPS is unavailable or permissions are denied.
   */
  public static async getCurrentLocation(
    options?: LocationOptions,
  ): Promise<ObserverLocation> {
    if (this.manualLocation) {
      return this.manualLocation;
    }

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) {
      return this.cachedLocation ?? DEFAULT_OBSERVER_LOCATION;
    }

    return new Promise(resolve => {
      Geolocation.getCurrentPosition(
        position => {
          const loc: ObserverLocation = {
            latitudeDeg: position.coords.latitude,
            longitudeDeg: position.coords.longitude,
            altitudeMeters: position.coords.altitude ?? 25,
            label: 'Ubicación GPS Actual',
            isManual: false,
          };
          this.cachedLocation = loc;
          resolve(loc);
        },
        _error => {
          // GPS error or timeout, return cached or default fallback
          resolve(this.cachedLocation ?? DEFAULT_OBSERVER_LOCATION);
        },
        {
          enableHighAccuracy: options?.highAccuracy ?? true,
          timeout: options?.timeoutMs ?? 10000,
          maximumAge: 30000,
        },
      );
    });
  }

  /**
   * Watches observer position changes continuously.
   * Returns an unsubscribe function.
   */
  public static watchLocation(
    callback: (location: ObserverLocation) => void,
  ): () => void {
    if (this.manualLocation) {
      callback(this.manualLocation);
      return () => {};
    }

    const watchId = Geolocation.watchPosition(
      position => {
        const loc: ObserverLocation = {
          latitudeDeg: position.coords.latitude,
          longitudeDeg: position.coords.longitude,
          altitudeMeters: position.coords.altitude ?? 25,
          label: 'Ubicación GPS Dinámica',
          isManual: false,
        };
        this.cachedLocation = loc;
        callback(loc);
      },
      () => {
        // Fallback
        callback(this.cachedLocation ?? DEFAULT_OBSERVER_LOCATION);
      },
      {
        enableHighAccuracy: true,
        distanceFilter: 10, // 10 meters
      },
    );

    return () => {
      Geolocation.clearWatch(watchId);
    };
  }
}
