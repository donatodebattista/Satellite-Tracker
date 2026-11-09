import {
  CatalogCategory,
  DataSourceId,
  DEFAULT_OBSERVER_LOCATION,
  ExternalValidationSample,
  ObserverLocation,
  OrbitalElementSet,
  PROVIDER_RATE_LIMITS,
} from '../../../shared';
import { CredentialVault } from '../../../shared/security/CredentialVault';
import { DataProvider } from '../interfaces/DataProvider';
import { RateLimiter } from '../resilience/RateLimiter';
import { executeWithRetry } from '../resilience/RetryQueue';

export class N2yoProvider implements DataProvider {
  public readonly id: DataSourceId = 'n2yo';
  public readonly name = 'N2YO API';
  private rateLimiter = new RateLimiter('n2yo', PROVIDER_RATE_LIMITS.n2yo);

  public async isAvailable(): Promise<boolean> {
    const proxy = await CredentialVault.getProxyConfig();
    if (proxy.enabled) return true;
    const apiKey = await CredentialVault.getN2yoApiKey();
    return Boolean(apiKey && apiKey.length > 5);
  }

  public async getCatalog(_category: CatalogCategory): Promise<OrbitalElementSet[]> {
    // N2YO does not serve full bulk OMM catalogs directly; it provides satellite queries by category or ID.
    // Catalog fetches are directed to CelesTrak / Space-Track per PRD.
    return [];
  }

  public async getOrbitalData(noradId: number): Promise<OrbitalElementSet | null> {
    const proxy = await CredentialVault.getProxyConfig();
    const apiKey = await CredentialVault.getN2yoApiKey();

    if (!proxy.enabled && !apiKey) return null;

    return await this.rateLimiter.execute(async () => {
      return await executeWithRetry(
        async () => {
          let url: string;
          if (proxy.enabled) {
            url = `${proxy.baseUrl}/api/n2yo/tle/${noradId}`;
          } else {
            url = `https://api.n2yo.com/rest/v1/satellite/tle/${noradId}&apiKey=${apiKey}`;
          }

          const response = await fetch(url);
          if (!response.ok) return null;

          const data = await response.json();
          if (!data || !data.tle) return null;

          const lines = String(data.tle).split('\r\n').filter(Boolean);
          if (lines.length < 2) return null;

          const line1 = lines[lines.length - 2].trim();
          const line2 = lines[lines.length - 1].trim();

          const tleRecord: OrbitalElementSet = {
            noradId: Number(data.info?.satid ?? noradId),
            name: String(data.info?.satname ?? `SAT-${noradId}`),
            objectId: '',
            epochIso: new Date().toISOString(),
            epochTimestampMs: Date.now(),
            category: 'active',
            source: 'n2yo',
            fetchedAtMs: Date.now(),
            tle: {
              name: String(data.info?.satname ?? `SAT-${noradId}`),
              line1,
              line2,
            },
          };

          return tleRecord;
        },
        { maxRetries: 2, initialDelayMs: 1000 },
      );
    });
  }

  /**
   * Fetches real-time reference position & look angles for cross-validation (RF-15).
   */
  public async getValidationPosition(
    noradId: number,
    observer: ObserverLocation = DEFAULT_OBSERVER_LOCATION,
  ): Promise<ExternalValidationSample | null> {
    const proxy = await CredentialVault.getProxyConfig();
    const apiKey = await CredentialVault.getN2yoApiKey();

    if (!proxy.enabled && !apiKey) return null;

    return await this.rateLimiter.execute(async () => {
      const lat = observer.latitudeDeg;
      const lng = observer.longitudeDeg;
      const alt = Math.round(observer.altitudeMeters);
      const seconds = 1;

      let url: string;
      if (proxy.enabled) {
        url = `${proxy.baseUrl}/api/n2yo/positions/${noradId}/${lat}/${lng}/${alt}/${seconds}`;
      } else {
        url = `https://api.n2yo.com/rest/v1/satellite/positions/${noradId}/${lat}/${lng}/${alt}/${seconds}&apiKey=${apiKey}`;
      }

      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      if (!data || !data.positions || !Array.isArray(data.positions) || data.positions.length === 0) {
        return null;
      }

      const pos = data.positions[0];

      return {
        provider: 'n2yo',
        noradId,
        satelliteName: String(data.info?.satname ?? `NORAD-${noradId}`),
        timestampMs: Number(pos.timestamp) * 1000,
        position: {
          latitudeDeg: Number(pos.satlatitude),
          longitudeDeg: Number(pos.satlongitude),
          altitudeKm: Number(pos.sataltitude),
        },
        lookAngles: {
          azimuthDeg: Number(pos.azimuth),
          elevationDeg: Number(pos.elevation),
          rangeKm: 0,
          isVisible: Number(pos.elevation) > 0,
        },
      };
    });
  }
}
