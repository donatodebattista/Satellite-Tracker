import {
  CatalogCategory,
  DataFreshnessMetadata,
  DataSourceId,
  DEFAULT_CACHE_TTL_HOURS,
  ExternalValidationSample,
  ISS_NORAD_ID,
  ObserverLocation,
  OrbitalElementSet,
} from '../../shared';
import { OrbitalCacheManager } from './cache/OrbitalCacheManager';
import { DataProvider } from './interfaces/DataProvider';
import {
  CelestrakProvider,
  SEED_ORBITAL_ELEMENTS,
} from './providers/CelestrakProvider';
import { N2yoProvider } from './providers/N2yoProvider';
import { SpaceTrackProvider } from './providers/SpaceTrackProvider';
import { WhereTheIssProvider } from './providers/WhereTheIssProvider';

export interface CatalogQueryResult {
  elements: OrbitalElementSet[];
  fromCache: boolean;
  isExpired: boolean;
  source: DataSourceId;
  fetchedAtMs: number;
}

/**
 * Central orchestrator with automatic multi-provider fallback and TTL cache (RF-01, RF-08, RF-09, RF-14).
 */
export class DataOrchestrator {
  private primaryProvider: CelestrakProvider;
  private fallbackProvider: SpaceTrackProvider;
  private n2yoProvider: N2yoProvider;
  private whereTheIssProvider: WhereTheIssProvider;

  constructor(
    customPrimary?: CelestrakProvider,
    customFallback?: SpaceTrackProvider,
    customN2yo?: N2yoProvider,
    customIss?: WhereTheIssProvider,
  ) {
    this.primaryProvider = customPrimary ?? new CelestrakProvider();
    this.fallbackProvider = customFallback ?? new SpaceTrackProvider();
    this.n2yoProvider = customN2yo ?? new N2yoProvider();
    this.whereTheIssProvider = customIss ?? new WhereTheIssProvider();
  }

  /**
   * Retrieves a catalog of satellites by category.
   * Flow:
   * 1. Check local cache. If fresh and !forceRefresh, return cached data immediately.
   * 2. Attempt fetch from primary provider (CelesTrak GP/SupGP).
   * 3. On failure, attempt fetch from fallback provider (Space-Track).
   * 4. On total network failure, return expired cache if present.
   * 5. If cache is empty, return built-in offline seed elements.
   */
  public async getCatalog(
    category: CatalogCategory,
    forceRefresh = false,
    ttlHours = DEFAULT_CACHE_TTL_HOURS,
  ): Promise<CatalogQueryResult> {
    const cached = await OrbitalCacheManager.getCatalog(category);

    if (cached && !cached.isExpired && !forceRefresh && cached.elements.length > 0) {
      return {
        elements: cached.elements,
        fromCache: true,
        isExpired: false,
        source: cached.elements[0]?.source ?? 'celestrak',
        fetchedAtMs: cached.fetchedAtMs,
      };
    }

    // Try Primary Provider (CelesTrak)
    try {
      const liveElements = await this.primaryProvider.getCatalog(category);
      if (liveElements && liveElements.length > 0) {
        await OrbitalCacheManager.saveCatalog(category, liveElements, ttlHours);
        return {
          elements: liveElements,
          fromCache: false,
          isExpired: false,
          source: 'celestrak',
          fetchedAtMs: Date.now(),
        };
      }
    } catch (primaryErr) {
      // Primary failed, proceed to fallback
    }

    // Try Fallback Provider (Space-Track)
    try {
      if (await this.fallbackProvider.isAvailable()) {
        const fallbackElements = await this.fallbackProvider.getCatalog(category);
        if (fallbackElements && fallbackElements.length > 0) {
          await OrbitalCacheManager.saveCatalog(category, fallbackElements, ttlHours);
          return {
            elements: fallbackElements,
            fromCache: false,
            isExpired: false,
            source: 'spacetrack',
            fetchedAtMs: Date.now(),
          };
        }
      }
    } catch (fallbackErr) {
      // Fallback failed
    }

    // If cached data exists (even expired), return it in offline mode
    if (cached && cached.elements.length > 0) {
      return {
        elements: cached.elements,
        fromCache: true,
        isExpired: true,
        source: cached.elements[0]?.source ?? 'celestrak',
        fetchedAtMs: cached.fetchedAtMs,
      };
    }

    // Ultimate offline seed fallback
    const seedMatches = SEED_ORBITAL_ELEMENTS.filter(
      el => el.category === category || category === 'active',
    );
    if (seedMatches.length > 0) {
      return {
        elements: seedMatches,
        fromCache: false,
        isExpired: false,
        source: 'local-seed',
        fetchedAtMs: Date.now(),
      };
    }

    return {
      elements: [],
      fromCache: false,
      isExpired: false,
      source: 'celestrak',
      fetchedAtMs: Date.now(),
    };
  }

  /**
   * Retrieves single satellite data by NORAD ID.
   */
  public async getSatellite(
    noradId: number,
    forceRefresh = false,
  ): Promise<OrbitalElementSet | null> {
    const cached = await OrbitalCacheManager.getElement(noradId);
    if (cached && !cached.isExpired && !forceRefresh) {
      return cached.element;
    }

    // Try primary
    try {
      const primaryData = await this.primaryProvider.getOrbitalData(noradId);
      if (primaryData) {
        await OrbitalCacheManager.saveElement(primaryData);
        return primaryData;
      }
    } catch {
      // Ignore
    }

    // Try WhereTheIss if ISS
    if (noradId === ISS_NORAD_ID) {
      try {
        const issData = await this.whereTheIssProvider.getOrbitalData(noradId);
        if (issData) {
          await OrbitalCacheManager.saveElement(issData);
          return issData;
        }
      } catch {
        // Ignore
      }
    }

    // Try N2YO
    try {
      if (await this.n2yoProvider.isAvailable()) {
        const n2yoData = await this.n2yoProvider.getOrbitalData(noradId);
        if (n2yoData) {
          await OrbitalCacheManager.saveElement(n2yoData);
          return n2yoData;
        }
      }
    } catch {
      // Ignore
    }

    // Return expired cached if available
    if (cached) return cached.element;

    // Check seed
    return SEED_ORBITAL_ELEMENTS.find(el => el.noradId === noradId) ?? null;
  }

  /**
   * Searches locally cached satellites by name or NORAD ID (RF-01).
   */
  public async searchSatellites(query: string): Promise<OrbitalElementSet[]> {
    const localMatches = await OrbitalCacheManager.searchLocal(query);
    if (localMatches.length > 0) return localMatches;

    // Filter seed elements
    const clean = query.trim().toLowerCase();
    return SEED_ORBITAL_ELEMENTS.filter(
      el =>
        el.name.toLowerCase().includes(clean) ||
        el.noradId.toString().includes(clean),
    );
  }

  /**
   * Obtains independent reference sample for RF-15 cross validation.
   */
  public async getValidationSample(
    noradId: number,
    observer?: ObserverLocation,
  ): Promise<ExternalValidationSample | null> {
    if (noradId === ISS_NORAD_ID) {
      try {
        const sample = await this.whereTheIssProvider.getValidationPosition(
          noradId,
          observer,
        );
        if (sample) return sample;
      } catch {
        // Try N2yo fallback
      }
    }

    if (await this.n2yoProvider.isAvailable()) {
      return await this.n2yoProvider.getValidationPosition(noradId, observer);
    }

    return null;
  }

  /**
   * Computes freshness & warning level for any orbital element (RF-16).
   */
  public getFreshness(
    element: OrbitalElementSet,
    ttlHours = DEFAULT_CACHE_TTL_HOURS,
  ): DataFreshnessMetadata {
    return OrbitalCacheManager.computeFreshness(element, ttlHours);
  }

  /**
   * Clears local cache.
   */
  public async clearCache(): Promise<void> {
    await OrbitalCacheManager.clearCache();
  }
}
