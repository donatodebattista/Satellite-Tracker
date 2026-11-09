import {
  DEFAULT_CONSTELLATION_MAX_SATELLITES,
  OrbitalElementSet,
} from '../../shared';
import { Sgp4Propagator } from './Sgp4Propagator';

export interface BatchSatellitePosition {
  noradId: number;
  name: string;
  latitude: number;
  longitude: number;
  altitudeKm: number;
}

/**
 * High-performance batch propagator for dense constellations like Starlink (RF-13).
 */
export class ConstellationBatch {
  private propagatorCache = new Map<number, Sgp4Propagator>();

  /**
   * Clears cached propagators.
   */
  public clear(): void {
    this.propagatorCache.clear();
  }

  /**
   * Retrieves or creates an SGP4 propagator instance for a satellite.
   */
  private getOrCreatePropagator(element: OrbitalElementSet): Sgp4Propagator {
    let prop = this.propagatorCache.get(element.noradId);
    if (!prop) {
      prop = new Sgp4Propagator(element);
      this.propagatorCache.set(element.noradId, prop);
    }
    return prop;
  }

  /**
   * Propagates positions for a batch of satellites at a given timestamp.
   * Limits total processed items to maxSatellites to protect frame rates.
   */
  public propagateBatch(
    elements: OrbitalElementSet[],
    targetDate = new Date(),
    maxSatellites = DEFAULT_CONSTELLATION_MAX_SATELLITES,
  ): BatchSatellitePosition[] {
    const subset = elements.slice(0, maxSatellites);
    const results: BatchSatellitePosition[] = [];

    for (let i = 0; i < subset.length; i++) {
      try {
        const prop = this.getOrCreatePropagator(subset[i]);
        const state = prop.propagateAt(targetDate);
        if (state) {
          results.push({
            noradId: state.noradId,
            name: state.name,
            latitude: state.subsatellitePoint.latitudeDeg,
            longitude: state.subsatellitePoint.longitudeDeg,
            altitudeKm: state.subsatellitePoint.altitudeKm,
          });
        }
      } catch {
        // Skip failed satellite calculations gracefully
      }
    }

    return results;
  }

  /**
   * Async chunked propagation to yield back to JavaScript event loop.
   */
  public async propagateBatchAsync(
    elements: OrbitalElementSet[],
    targetDate = new Date(),
    chunkSize = 25,
    maxSatellites = DEFAULT_CONSTELLATION_MAX_SATELLITES,
  ): Promise<BatchSatellitePosition[]> {
    const subset = elements.slice(0, maxSatellites);
    const results: BatchSatellitePosition[] = [];

    for (let i = 0; i < subset.length; i += chunkSize) {
      const chunk = subset.slice(i, i + chunkSize);
      for (const el of chunk) {
        try {
          const prop = this.getOrCreatePropagator(el);
          const state = prop.propagateAt(targetDate);
          if (state) {
            results.push({
              noradId: state.noradId,
              name: state.name,
              latitude: state.subsatellitePoint.latitudeDeg,
              longitude: state.subsatellitePoint.longitudeDeg,
              altitudeKm: state.subsatellitePoint.altitudeKm,
            });
          }
        } catch {
          // Skip
        }
      }
      // Yield to event loop
      await new Promise<void>(resolve => setTimeout(() => resolve(), 0));
    }

    return results;
  }
}
