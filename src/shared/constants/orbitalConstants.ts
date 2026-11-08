import { CatalogCategory, ObserverLocation } from '../types/orbital';

/**
 * Astrophysical & Geodetic constants (WGS84 / SGP4 standard).
 */
export const EARTH_RADIUS_KM = 6371.0088;
export const EARTH_EQUATORIAL_RADIUS_KM = 6378.137;
export const EARTH_GM_KM3_S2 = 398600.4418;
export const MINUTES_PER_DAY = 1440;
export const SECONDS_PER_DAY = 86400;
export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

/**
 * Reference NORAD Catalog IDs.
 */
export const ISS_NORAD_ID = 25544;
export const TIANGONG_NORAD_ID = 48274;
export const HUBBLE_NORAD_ID = 20580;
export const NOAA_19_NORAD_ID = 33591;

/**
 * Default observer location:
 * FCyT - UADER Sede Concepción del Uruguay, Entre Ríos, Argentina.
 */
export const DEFAULT_OBSERVER_LOCATION: ObserverLocation = {
  latitudeDeg: -32.4833,
  longitudeDeg: -58.2333,
  altitudeMeters: 25,
  label: 'Concepción del Uruguay, ER (FCyT)',
  isManual: false,
};

/**
 * Operational & UI defaults.
 */
export const DEFAULT_MIN_ELEVATION_DEG = 10;
export const DEFAULT_CACHE_TTL_HOURS = 12;
export const STALE_EPOCH_WARNING_HOURS = 24;
export const REALTIME_REFRESH_INTERVAL_MS = 2000;
export const CONSTELLATION_REFRESH_INTERVAL_MS = 4000;
export const DEFAULT_CONSTELLATION_MAX_SATELLITES = 60;
export const DEFAULT_PASS_PREDICTION_HOURS = 24;
export const DEFAULT_NOTIFICATION_LEAD_MINUTES = 10;
export const ANTIMERIDIAN_JUMP_THRESHOLD_DEG = 180;

/**
 * Rate limit configurations per API provider (PRD Section 4.2).
 */
export const PROVIDER_RATE_LIMITS = {
  celestrak: {
    maxRequestsPerMinute: 10,
    maxRequestsPerHour: 60,
    minIntervalMs: 2000,
    recommendedTtlHours: 12,
  },
  spacetrack: {
    // Space-Track guideline: < 30 requests/min and < 300/hour
    maxRequestsPerMinute: 25,
    maxRequestsPerHour: 250,
    minIntervalMs: 2000,
    recommendedTtlHours: 12,
  },
  n2yo: {
    // N2YO: 1000 tx/hour (positions/TLE), 100 tx/hour (passes/above)
    maxRequestsPerMinute: 15,
    maxRequestsPerHour: 90,
    minIntervalMs: 1000,
    recommendedTtlHours: 12,
  },
  wheretheiss: {
    // Where the ISS at?: ~1 request/s
    maxRequestsPerMinute: 45,
    maxRequestsPerHour: 1000,
    minIntervalMs: 1100,
    recommendedTtlHours: 1,
  },
} as const;

/**
 * Catalog categories metadata for RF-08 and CelesTrak GP / SupGP endpoints.
 */
export interface CatalogCategoryMeta {
  id: CatalogCategory;
  label: string;
  description: string;
  celestrakUrl: string;
  isSupplemental?: boolean;
}

export const CATALOG_CATEGORIES: Record<CatalogCategory, CatalogCategoryMeta> = {
  stations: {
    id: 'stations',
    label: 'Estaciones Espaciales (ISS)',
    description: 'ISS (ZARYA), CSS (Tiangong) y misiones tripuladas LEO',
    celestrakUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
  },
  'starlink-sup': {
    id: 'starlink-sup',
    label: 'Starlink (SupGP)',
    description:
      'Datos orbitales suplementarios derivados de efemérides de SpaceX vía CelesTrak',
    celestrakUrl:
      'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json',
    isSupplemental: true,
  },
  'gps-ops': {
    id: 'gps-ops',
    label: 'GPS Operacionales (MEO)',
    description: 'Constelación GNSS NAVSTAR GPS en órbita media (~20.200 km)',
    celestrakUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json',
  },
  weather: {
    id: 'weather',
    label: 'Meteorológicos (LEO/GEO)',
    description: 'Satélites NOAA, METOP y GOES de observación climática',
    celestrakUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=json',
  },
  active: {
    id: 'active',
    label: 'Catálogo Activo Destacado',
    description: 'Satélites científicos y de telecomunicaciones destacados',
    celestrakUrl:
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=json',
  },
};
