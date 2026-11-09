import {
  CatalogCategory,
  DataSourceId,
  OmmRecord,
  OrbitalElementSet,
  PROVIDER_RATE_LIMITS,
} from '../../../shared';
import { CredentialVault } from '../../../shared/security/CredentialVault';
import { DataProvider } from '../interfaces/DataProvider';
import { RateLimiter } from '../resilience/RateLimiter';
import { executeWithRetry } from '../resilience/RetryQueue';

export class SpaceTrackProvider implements DataProvider {
  public readonly id: DataSourceId = 'spacetrack';
  public readonly name = 'Space-Track.org';
  private rateLimiter = new RateLimiter('spacetrack', PROVIDER_RATE_LIMITS.spacetrack);
  private authCookie: string | null = null;

  public async isAvailable(): Promise<boolean> {
    const proxy = await CredentialVault.getProxyConfig();
    if (proxy.enabled) return true;
    const creds = await CredentialVault.getSpaceTrackCredentials();
    return Boolean(creds && creds.identity && creds.password);
  }

  /**
   * Performs authentication to obtain session cookie.
   */
  private async authenticate(): Promise<void> {
    const creds = await CredentialVault.getSpaceTrackCredentials();
    if (!creds) {
      throw new Error('Space-Track credentials not configured in CredentialVault.');
    }

    const loginUrl = 'https://www.space-track.org/ajaxauth/login';
    const body = new URLSearchParams({
      identity: creds.identity,
      password: creds.password,
    }).toString();

    const response = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Space-Track login failed with HTTP ${response.status}`);
    }

    const setCookie = response.headers.get('set-cookie');
    if (setCookie) {
      this.authCookie = setCookie.split(';')[0];
    }
  }

  public async getCatalog(category: CatalogCategory): Promise<OrbitalElementSet[]> {
    const proxy = await CredentialVault.getProxyConfig();

    if (proxy.enabled) {
      return await this.rateLimiter.execute(async () => {
        const url = `${proxy.baseUrl}/api/spacetrack/catalog?category=${encodeURIComponent(
          category,
        )}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Proxy SpaceTrack request failed: ${res.status}`);
        const data = await res.json();
        return (data as Record<string, unknown>[]).map(raw =>
          this.normalizeSpaceTrackRecord(raw, category),
        );
      });
    }

    return await this.rateLimiter.execute(async () => {
      return await executeWithRetry(
        async () => {
          if (!this.authCookie) {
            await this.authenticate();
          }

          // Map category to Space-Track query filter
          let queryFilter = 'orderby/NORAD_CAT_ID asc/limit/50/format/json';
          if (category === 'stations') {
            queryFilter = 'NORAD_CAT_ID/25544,48274/format/json';
          }

          const url = `https://www.space-track.org/basicspacedata/query/class/gp/${queryFilter}`;
          const response = await fetch(url, {
            headers: {
              Cookie: this.authCookie || '',
              Accept: 'application/json',
            },
          });

          if (response.status === 401) {
            // Re-authenticate once if cookie expired
            this.authCookie = null;
            await this.authenticate();
            const retryRes = await fetch(url, {
              headers: { Cookie: this.authCookie || '' },
            });
            if (!retryRes.ok) throw new Error('Space-Track query failed after retry');
            const data = await retryRes.json();
            return (data as Record<string, unknown>[]).map(raw =>
              this.normalizeSpaceTrackRecord(raw, category),
            );
          }

          if (!response.ok) {
            throw new Error(`Space-Track query failed: HTTP ${response.status}`);
          }

          const data = await response.json();
          return (data as Record<string, unknown>[]).map(raw =>
            this.normalizeSpaceTrackRecord(raw, category),
          );
        },
        { maxRetries: 2, initialDelayMs: 2000 },
      );
    });
  }

  public async getOrbitalData(noradId: number): Promise<OrbitalElementSet | null> {
    const proxy = await CredentialVault.getProxyConfig();

    if (proxy.enabled) {
      try {
        const res = await fetch(`${proxy.baseUrl}/api/spacetrack/element/${noradId}`);
        if (!res.ok) return null;
        const raw = await res.json();
        return this.normalizeSpaceTrackRecord(raw, 'active');
      } catch {
        return null;
      }
    }

    try {
      return await this.rateLimiter.execute(async () => {
        if (!this.authCookie) await this.authenticate();
        const url = `https://www.space-track.org/basicspacedata/query/class/gp/NORAD_CAT_ID/${noradId}/orderby/EPOCH desc/limit/1/format/json`;
        const res = await fetch(url, {
          headers: { Cookie: this.authCookie || '' },
        });
        if (!res.ok) return null;
        const list = await res.json();
        if (Array.isArray(list) && list.length > 0) {
          return this.normalizeSpaceTrackRecord(list[0], 'active');
        }
        return null;
      });
    } catch {
      return null;
    }
  }

  private normalizeSpaceTrackRecord(
    raw: Record<string, unknown>,
    category: CatalogCategory,
  ): OrbitalElementSet {
    const noradId = Number(raw.NORAD_CAT_ID);
    const epochIso = String(raw.EPOCH);
    const omm: OmmRecord = {
      OBJECT_NAME: String(raw.OBJECT_NAME ?? 'UNKNOWN'),
      OBJECT_ID: String(raw.OBJECT_ID ?? ''),
      EPOCH: epochIso,
      MEAN_MOTION: Number(raw.MEAN_MOTION),
      ECCENTRICITY: Number(raw.ECCENTRICITY),
      INCLINATION: Number(raw.INCLINATION),
      RA_OF_ASC_NODE: Number(raw.RA_OF_ASC_NODE),
      ARG_OF_PERICENTER: Number(raw.ARG_OF_PERICENTER),
      MEAN_ANOMALY: Number(raw.MEAN_ANOMALY),
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: (raw.CLASSIFICATION_TYPE as 'U' | 'C') || 'U',
      NORAD_CAT_ID: noradId,
      ELEMENT_SET_NO: Number(raw.ELEMENT_SET_NO ?? 999),
      REV_AT_EPOCH: Number(raw.REV_AT_EPOCH ?? 0),
      BSTAR: Number(raw.BSTAR ?? 0),
      MEAN_MOTION_DOT: Number(raw.MEAN_MOTION_DOT ?? 0),
      MEAN_MOTION_DDOT: Number(raw.MEAN_MOTION_DDOT ?? 0),
    };

    return {
      noradId,
      name: omm.OBJECT_NAME,
      objectId: omm.OBJECT_ID,
      epochIso,
      epochTimestampMs: new Date(epochIso).getTime(),
      category,
      source: 'spacetrack',
      fetchedAtMs: Date.now(),
      omm,
    };
  }
}
