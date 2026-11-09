import {
  ANTIMERIDIAN_JUMP_THRESHOLD_DEG,
  GroundTrackPoint,
  GroundTrackSegment,
} from '../../shared';
import { Sgp4Propagator } from './Sgp4Propagator';

export interface GroundTrackOptions {
  stepSeconds?: number;
  orbitsPast?: number;
  orbitsFuture?: number;
}

/**
 * Calculates sampled ground track points and splits polylines at the antimeridian (+/- 180 deg) (RF-11).
 */
export class GroundTrackCalc {
  /**
   * Generates continuous ground track segments cleanly split at the antimeridian.
   */
  public static computeSegments(
    propagator: Sgp4Propagator,
    baseTimeMs = Date.now(),
    options?: GroundTrackOptions,
  ): GroundTrackSegment[] {
    const periodMinutes = propagator.getOrbitalPeriodMinutes();
    const stepSeconds = options?.stepSeconds ?? (periodMinutes > 200 ? 120 : 45);
    const orbitsPast = options?.orbitsPast ?? 1;
    const orbitsFuture = options?.orbitsFuture ?? 1;

    const pastDurationMs = periodMinutes * 60 * 1000 * orbitsPast;
    const futureDurationMs = periodMinutes * 60 * 1000 * orbitsFuture;

    const startMs = baseTimeMs - pastDurationMs;
    const endMs = baseTimeMs + futureDurationMs;
    const stepMs = stepSeconds * 1000;

    // 1. Collect all raw sampled points
    const samples: GroundTrackPoint[] = [];

    for (let t = startMs; t <= endMs; t += stepMs) {
      const state = propagator.propagateAt(t);
      if (state) {
        samples.push({
          latitudeDeg: state.subsatellitePoint.latitudeDeg,
          longitudeDeg: state.subsatellitePoint.longitudeDeg,
          altitudeKm: state.subsatellitePoint.altitudeKm,
          timestampMs: t,
          isFuture: t >= baseTimeMs,
        });
      }
    }

    if (samples.length === 0) return [];

    // 2. Split into continuous segments at the antimeridian crossing (+/- 180 deg)
    const segments: GroundTrackSegment[] = [];
    let currentCoords: Array<{ latitude: number; longitude: number }> = [];
    let currentIsFuture = samples[0].isFuture;
    let segmentIndex = 0;

    const finalizeSegment = () => {
      if (currentCoords.length > 0) {
        segments.push({
          id: `seg_${segmentIndex++}_${currentIsFuture ? 'future' : 'past'}`,
          isFuture: currentIsFuture,
          coordinates: currentCoords,
        });
        currentCoords = [];
      }
    };

    currentCoords.push({
      latitude: samples[0].latitudeDeg,
      longitude: samples[0].longitudeDeg,
    });

    for (let i = 1; i < samples.length; i++) {
      const prev = samples[i - 1];
      const curr = samples[i];

      // Check for past-to-future boundary transition
      const crossedPresent = !prev.isFuture && curr.isFuture;

      const lonDiff = curr.longitudeDeg - prev.longitudeDeg;
      const isAntimeridianCrossing = Math.abs(lonDiff) > ANTIMERIDIAN_JUMP_THRESHOLD_DEG;

      if (crossedPresent) {
        // Cut at current point so past and future have distinct polyline styling
        currentCoords.push({
          latitude: curr.latitudeDeg,
          longitude: curr.longitudeDeg,
        });
        finalizeSegment();
        currentIsFuture = true;
        currentCoords.push({
          latitude: curr.latitudeDeg,
          longitude: curr.longitudeDeg,
        });
        continue;
      }

      if (isAntimeridianCrossing) {
        // Interpolate boundary point at +/- 180 degrees
        // Direction check: if moving eastward across antimeridian (+lon -> -lon) or westward (-lon -> +lon)
        const signPrev = prev.longitudeDeg > 0 ? 1 : -1;
        const distToPrev180 = 180 - Math.abs(prev.longitudeDeg);
        const distToCurr180 = 180 - Math.abs(curr.longitudeDeg);
        const totalDist = distToPrev180 + distToCurr180;
        const fraction = totalDist > 0 ? distToPrev180 / totalDist : 0.5;

        const boundaryLat = prev.latitudeDeg + fraction * (curr.latitudeDeg - prev.latitudeDeg);

        // Terminate previous segment at +/- 180
        currentCoords.push({
          latitude: boundaryLat,
          longitude: signPrev * 180,
        });
        finalizeSegment();

        // Start new segment at the other edge (-/+ 180)
        currentCoords.push({
          latitude: boundaryLat,
          longitude: -signPrev * 180,
        });
      }

      currentCoords.push({
        latitude: curr.latitudeDeg,
        longitude: curr.longitudeDeg,
      });
    }

    finalizeSegment();
    return segments;
  }
}
