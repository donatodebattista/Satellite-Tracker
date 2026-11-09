import {
  CATALOG_CATEGORIES,
  CatalogCategory,
  DataSourceId,
  DEFAULT_CACHE_TTL_HOURS,
  OmmRecord,
  OrbitalElementSet,
  PROVIDER_RATE_LIMITS,
} from '../../../shared';
import { CredentialVault } from '../../../shared/security/CredentialVault';
import { DataProvider } from '../interfaces/DataProvider';
import { RateLimiter } from '../resilience/RateLimiter';
import { executeWithRetry } from '../resilience/RetryQueue';

/**
 * Seed data for offline bootstrap or when CelesTrak is unreachable on cold start.
 */
export const SEED_ORBITAL_ELEMENTS: OrbitalElementSet[] = [
  {
    noradId: 25544,
    name: 'ISS (ZARYA)',
    objectId: '1998-067A',
    epochIso: '2026-11-08T12:00:00.000000',
    epochTimestampMs: new Date('2026-11-08T12:00:00.000000').getTime(),
    category: 'stations',
    source: 'local-seed',
    fetchedAtMs: Date.now(),
    omm: {
      OBJECT_NAME: 'ISS (ZARYA)',
      OBJECT_ID: '1998-067A',
      EPOCH: '2026-11-08T12:00:00.000000',
      MEAN_MOTION: 15.49812531,
      ECCENTRICITY: 0.0005123,
      INCLINATION: 51.6412,
      RA_OF_ASC_NODE: 124.5123,
      ARG_OF_PERICENTER: 88.2341,
      MEAN_ANOMALY: 271.9124,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: 25544,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 48120,
      BSTAR: 0.0001245,
      MEAN_MOTION_DOT: 0.00006812,
      MEAN_MOTION_DDOT: 0,
    },
    tle: {
      name: 'ISS (ZARYA)',
      line1:
        '1 25544U 98067A   26312.50000000  .00006812  00000+0  12450-3 0  9992',
      line2:
        '2 25544  51.6412 124.5123 0005123  88.2341 271.9124 15.49812531481209',
    },
  },
  {
    noradId: 44714,
    name: 'STARLINK-1008',
    objectId: '2019-074B',
    epochIso: '2026-11-08T10:00:00.000000',
    epochTimestampMs: new Date('2026-11-08T10:00:00.000000').getTime(),
    category: 'starlink-sup',
    source: 'local-seed',
    fetchedAtMs: Date.now(),
    omm: {
      OBJECT_NAME: 'STARLINK-1008',
      OBJECT_ID: '2019-074B',
      EPOCH: '2026-11-08T10:00:00.000000',
      MEAN_MOTION: 15.064219,
      ECCENTRICITY: 0.000142,
      INCLINATION: 53.0531,
      RA_OF_ASC_NODE: 215.3412,
      ARG_OF_PERICENTER: 65.4123,
      MEAN_ANOMALY: 294.6712,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: 44714,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 27123,
      BSTAR: 0.0000452,
      MEAN_MOTION_DOT: 0.0000124,
      MEAN_MOTION_DDOT: 0,
    },
  },
  {
    noradId: 33591,
    name: 'NOAA 19',
    objectId: '2009-005A',
    epochIso: '2026-11-08T08:00:00.000000',
    epochTimestampMs: new Date('2026-11-08T08:00:00.000000').getTime(),
    category: 'weather',
    source: 'local-seed',
    fetchedAtMs: Date.now(),
    omm: {
      OBJECT_NAME: 'NOAA 19',
      OBJECT_ID: '2009-005A',
      EPOCH: '2026-11-08T08:00:00.000000',
      MEAN_MOTION: 14.1245123,
      ECCENTRICITY: 0.001412,
      INCLINATION: 98.7123,
      RA_OF_ASC_NODE: 45.1234,
      ARG_OF_PERICENTER: 112.5123,
      MEAN_ANOMALY: 247.6123,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: 33591,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 59123,
      BSTAR: 0.0000671,
      MEAN_MOTION_DOT: 0.0000021,
      MEAN_MOTION_DDOT: 0,
    },
  },
];

export class CelestrakProvider implements DataProvider {
  public readonly id: DataSourceId = 'celestrak';
  public readonly name = 'CelesTrak (GP & SupGP)';
  private rateLimiter = new RateLimiter('celestrak', PROVIDER_RATE_LIMITS.celestrak);

  /**
   * Normalizes raw CelesTrak JSON objects into domain OrbitalElementSet.
   */
  public normalizeOmmRecord(
    raw: Record<string, unknown>,
    category: CatalogCategory,
  ): OrbitalElementSet {
    const noradId = Number(raw.NORAD_CAT_ID);
    const epochIso = String(raw.EPOCH);
    const epochTimestampMs = new Date(epochIso).getTime();

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
      epochTimestampMs,
      category,
      source: 'celestrak',
      fetchedAtMs: Date.now(),
      omm,
    };
  }

  public async getCatalog(category: CatalogCategory): Promise<OrbitalElementSet[]> {
    const meta = CATALOG_CATEGORIES[category];
    if (!meta) {
      throw new Error(`Unknown catalog category: ${category}`);
    }

    const proxy = await CredentialVault.getProxyConfig();
    let url = meta.celestrakUrl;

    if (proxy.enabled) {
      url = `${proxy.baseUrl}/api/celestrak?category=${encodeURIComponent(category)}`;
    }

    return await this.rateLimiter.execute(async () => {
      return await executeWithRetry(
        async () => {
          const response = await fetch(url, {
            headers: {
              Accept: 'application/json',
              'User-Agent': 'SatelliteTrackerApp/1.0 (FCyT-UADER)',
            },
          });

          if (!response.ok) {
            throw new Error(
              `CelesTrak request failed with status ${response.status}: ${response.statusText}`,
            );
          }

          const data = await response.json();
          if (!Array.isArray(data)) {
            throw new Error('Invalid CelesTrak response format: expected JSON array');
          }

          return data.map(item => this.normalizeOmmRecord(item, category));
        },
        {
          maxRetries: 2,
          initialDelayMs: 1500,
        },
      );
    });
  }

  public async getOrbitalData(noradId: number): Promise<OrbitalElementSet | null> {
    const url = `https://celestrak.org/NORAD/elements/gp.php?CATNR=${noradId}&FORMAT=json`;

    try {
      return await this.rateLimiter.execute(async () => {
        const response = await fetch(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'SatelliteTrackerApp/1.0',
          },
        });

        if (!response.ok) return null;
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          return this.normalizeOmmRecord(data[0], 'active');
        }
        return null;
      });
    } catch {
      return null;
    }
  }

  public async isAvailable(): Promise<boolean> {
    return true;
  }
}
