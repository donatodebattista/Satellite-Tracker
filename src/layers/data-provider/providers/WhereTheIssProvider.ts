import {
  CatalogCategory,
  DataSourceId,
  ExternalValidationSample,
  ISS_NORAD_ID,
  ObserverLocation,
  OrbitalElementSet,
  PROVIDER_RATE_LIMITS,
} from '../../../shared';
import { CredentialVault } from '../../../shared/security/CredentialVault';
import { DataProvider } from '../interfaces/DataProvider';
import { RateLimiter } from '../resilience/RateLimiter';
import { executeWithRetry } from '../resilience/RetryQueue';

export class WhereTheIssProvider implements DataProvider {
  public readonly id: DataSourceId = 'wheretheiss';
  public readonly name = 'Where the ISS at?';
  private rateLimiter = new RateLimiter('wheretheiss', PROVIDER_RATE_LIMITS.wheretheiss);

  public async isAvailable(): Promise<boolean> {
    return true; // No credentials required
  }

  public async getCatalog(category: CatalogCategory): Promise<OrbitalElementSet[]> {
    if (category !== 'stations') {
      return [];
    }
    const iss = await this.getOrbitalData(ISS_NORAD_ID);
    return iss ? [iss] : [];
  }

  public async getOrbitalData(noradId: number): Promise<OrbitalElementSet | null> {
    if (noradId !== ISS_NORAD_ID) {
      return null;
    }

    const proxy = await CredentialVault.getProxyConfig();

    return await this.rateLimiter.execute(async () => {
      return await executeWithRetry(
        async () => {
          let url = 'https://api.wheretheiss.at/v1/satellites/25544/tles';
          if (proxy.enabled) {
            url = `${proxy.baseUrl}/api/wheretheiss/tles`;
          }

          const response = await fetch(url);
          if (!response.ok) return null;

          const data = await response.json();
          if (!data || !data.line1 || !data.line2) return null;

          const elementSet: OrbitalElementSet = {
            noradId: ISS_NORAD_ID,
            name: 'ISS (ZARYA)',
            objectId: '1998-067A',
            epochIso: new Date().toISOString(),
            epochTimestampMs: Date.now(),
            category: 'stations',
            source: 'wheretheiss',
            fetchedAtMs: Date.now(),
            tle: {
              name: 'ISS (ZARYA)',
              line1: data.line1,
              line2: data.line2,
            },
          };

          return elementSet;
        },
        { maxRetries: 2, initialDelayMs: 1000 },
      );
    });
  }

  /**
   * Real-time position query for ISS cross-validation (RF-15).
   */
  public async getValidationPosition(
    noradId: number,
    _observer?: ObserverLocation,
  ): Promise<ExternalValidationSample | null> {
    if (noradId !== ISS_NORAD_ID) {
      return null;
    }

    const proxy = await CredentialVault.getProxyConfig();

    return await this.rateLimiter.execute(async () => {
      let url = 'https://api.wheretheiss.at/v1/satellites/25544';
      if (proxy.enabled) {
        url = `${proxy.baseUrl}/api/wheretheiss/position`;
      }

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      if (!data || typeof data.latitude !== 'number') return null;

      return {
        provider: 'wheretheiss',
        noradId: ISS_NORAD_ID,
        satelliteName: 'ISS (ZARYA)',
        timestampMs: Number(data.timestamp) * 1000,
        position: {
          latitudeDeg: Number(data.latitude),
          longitudeDeg: Number(data.longitude),
          altitudeKm: Number(data.altitude),
        },
        velocityKmPerSec: Number(data.velocity) / 3600, // km/h to km/s
      };
    });
  }
}
