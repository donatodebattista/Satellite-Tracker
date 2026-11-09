import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CatalogCategory,
  DataFreshnessLevel,
  DataFreshnessMetadata,
  DEFAULT_CACHE_TTL_HOURS,
  OrbitalElementSet,
  STALE_EPOCH_WARNING_HOURS,
} from '../../../shared';

export interface CachedCatalogEnvelope {
  category: CatalogCategory;
  elements: OrbitalElementSet[];
  fetchedAtMs: number;
  ttlHours: number;
}

export interface CachedElementEnvelope {
  element: OrbitalElementSet;
  fetchedAtMs: number;
  ttlHours: number;
}

const PREFIX_CATALOG = '@sat_tracker:catalog:';
const PREFIX_ELEMENT = '@sat_tracker:element:';
const KEY_ACTIVE_CATALOG_LIST = '@sat_tracker:all_categories';

/**
 * Cache manager with TTL enforcement and epoch freshness analysis (RF-09, RF-16).
 */
export class OrbitalCacheManager {
  /**
   * Saves a full catalog category to AsyncStorage.
   */
  public static async saveCatalog(
    category: CatalogCategory,
    elements: OrbitalElementSet[],
    ttlHours = DEFAULT_CACHE_TTL_HOURS,
  ): Promise<void> {
    const envelope: CachedCatalogEnvelope = {
      category,
      elements,
      fetchedAtMs: Date.now(),
      ttlHours,
    };

    await AsyncStorage.setItem(
      `${PREFIX_CATALOG}${category}`,
      JSON.stringify(envelope),
    );

    // Also index individual elements for direct NORAD ID lookups
    const entries: Record<string, string> = {};
    for (const el of elements) {
      entries[`${PREFIX_ELEMENT}${el.noradId}`] = JSON.stringify({
        element: el,
        fetchedAtMs: envelope.fetchedAtMs,
        ttlHours,
      } as CachedElementEnvelope);
    }

    if (Object.keys(entries).length > 0) {
      await AsyncStorage.setMany(entries);
    }
  }

  /**
   * Retrieves a cached catalog category, checking expiration.
   */
  public static async getCatalog(
    category: CatalogCategory,
  ): Promise<{
    elements: OrbitalElementSet[];
    isExpired: boolean;
    fetchedAtMs: number;
  } | null> {
    const raw = await AsyncStorage.getItem(`${PREFIX_CATALOG}${category}`);
    if (!raw) return null;

    try {
      const envelope: CachedCatalogEnvelope = JSON.parse(raw);
      const ageHours = (Date.now() - envelope.fetchedAtMs) / 3_600_000;
      const isExpired = ageHours > (envelope.ttlHours || DEFAULT_CACHE_TTL_HOURS);

      return {
        elements: envelope.elements,
        isExpired,
        fetchedAtMs: envelope.fetchedAtMs,
      };
    } catch {
      return null;
    }
  }

  /**
   * Saves a single orbital element.
   */
  public static async saveElement(
    element: OrbitalElementSet,
    ttlHours = DEFAULT_CACHE_TTL_HOURS,
  ): Promise<void> {
    const envelope: CachedElementEnvelope = {
      element,
      fetchedAtMs: Date.now(),
      ttlHours,
    };
    await AsyncStorage.setItem(
      `${PREFIX_ELEMENT}${element.noradId}`,
      JSON.stringify(envelope),
    );
  }

  /**
   * Retrieves a single element by NORAD ID.
   */
  public static async getElement(
    noradId: number,
  ): Promise<{
    element: OrbitalElementSet;
    isExpired: boolean;
    fetchedAtMs: number;
  } | null> {
    const raw = await AsyncStorage.getItem(`${PREFIX_ELEMENT}${noradId}`);
    if (!raw) return null;

    try {
      const envelope: CachedElementEnvelope = JSON.parse(raw);
      const ageHours = (Date.now() - envelope.fetchedAtMs) / 3_600_000;
      const isExpired = ageHours > (envelope.ttlHours || DEFAULT_CACHE_TTL_HOURS);

      return {
        element: envelope.element,
        isExpired,
        fetchedAtMs: envelope.fetchedAtMs,
      };
    } catch {
      return null;
    }
  }

  /**
   * Searches locally cached satellites by name or NORAD ID across all categories.
   */
  public static async searchLocal(query: string): Promise<OrbitalElementSet[]> {
    const cleanQuery = query.trim().toLowerCase();
    if (!cleanQuery) return [];

    const keys = await AsyncStorage.getAllKeys();
    const catalogKeys = keys.filter(k => k.startsWith(PREFIX_CATALOG));
    const results = new Map<number, OrbitalElementSet>();

    for (const k of catalogKeys) {
      const raw = await AsyncStorage.getItem(k);
      if (!raw) continue;
      try {
        const envelope: CachedCatalogEnvelope = JSON.parse(raw);
        for (const el of envelope.elements) {
          const matchName = el.name.toLowerCase().includes(cleanQuery);
          const matchId = el.noradId.toString().includes(cleanQuery);
          if (matchName || matchId) {
            results.set(el.noradId, el);
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    }

    return Array.from(results.values());
  }

  /**
   * Computes freshness metadata and warning level for RF-16.
   */
  public static computeFreshness(
    element: OrbitalElementSet,
    ttlHours = DEFAULT_CACHE_TTL_HOURS,
    now = Date.now(),
  ): DataFreshnessMetadata {
    const epochAgeHours = Math.max(0, (now - element.epochTimestampMs) / 3_600_000);
    const cacheAgeHours = Math.max(0, (now - element.fetchedAtMs) / 3_600_000);
    const isCacheExpired = cacheAgeHours > ttlHours;

    let level: DataFreshnessLevel = 'FRESH';
    let warningMessage: string | undefined;

    if (epochAgeHours > STALE_EPOCH_WARNING_HOURS * 3) {
      level = 'STALE';
      warningMessage = `Datos orbitales muy antiguos (${Math.round(
        epochAgeHours / 24,
      )} días). Las predicciones SGP4 pueden presentar desvíos > 20 km.`;
    } else if (epochAgeHours > STALE_EPOCH_WARNING_HOURS) {
      level = 'AGING';
      warningMessage = `Época orbital de hace ${Math.round(
        epochAgeHours,
      )} horas. Se recomienda actualizar para mayor precisión.`;
    }

    return {
      epochIso: element.epochIso,
      epochAgeHours,
      cacheAgeHours,
      ttlHours,
      isCacheExpired,
      level,
      source: element.source,
      warningMessage,
    };
  }

  /**
   * Clears all cached catalogs and elements.
   */
  public static async clearCache(): Promise<void> {
    const keys = await AsyncStorage.getAllKeys();
    const trackerKeys = keys.filter(
      k =>
        k.startsWith(PREFIX_CATALOG) ||
        k.startsWith(PREFIX_ELEMENT) ||
        k === KEY_ACTIVE_CATALOG_LIST,
    );
    if (trackerKeys.length > 0) {
      await AsyncStorage.removeMany(trackerKeys);
    }
  }
}
