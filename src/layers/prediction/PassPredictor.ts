import {
  DEFAULT_MIN_ELEVATION_DEG,
  DEFAULT_OBSERVER_LOCATION,
  DEFAULT_PASS_PREDICTION_HOURS,
  LookAngles,
  ObserverLocation,
  SatellitePassWindow,
  SkyTrajectoryPoint,
} from '../../shared';
import { Sgp4Propagator } from '../orbital-engine/Sgp4Propagator';

export interface PassPredictionOptions {
  observer?: ObserverLocation;
  startDate?: Date;
  hoursAhead?: number;
  minElevationDeg?: number;
  coarseStepSeconds?: number;
  maxPasses?: number;
}

/**
 * Coarse-Fine Pass Prediction Engine (RF-04, RF-05).
 * Optimizes CPU utilization by scanning with coarse time steps and refining
 * AOS/TCA/LOS boundaries via binary bisection down to 1-second accuracy.
 */
export class PassPredictor {
  /**
   * Helper to evaluate look angles at an arbitrary epoch.
   */
  public static getLookAnglesAt(
    propagator: Sgp4Propagator,
    timeMs: number,
    observer: ObserverLocation,
  ): LookAngles | null {
    const state = propagator.propagateAt(timeMs, observer);
    return state?.lookAngles ?? null;
  }

  /**
   * Predicts upcoming visible pass windows for a satellite using the coarse-fine algorithm.
   */
  public static findNextPasses(
    propagator: Sgp4Propagator,
    options?: PassPredictionOptions,
  ): SatellitePassWindow[] {
    const observer = options?.observer ?? DEFAULT_OBSERVER_LOCATION;
    const startMs = (options?.startDate ?? new Date()).getTime();
    const hoursAhead = options?.hoursAhead ?? DEFAULT_PASS_PREDICTION_HOURS;
    const minEl = options?.minElevationDeg ?? DEFAULT_MIN_ELEVATION_DEG;
    const coarseStepMs = (options?.coarseStepSeconds ?? 30) * 1000;
    const maxPasses = options?.maxPasses ?? 8;
    const endMs = startMs + hoursAhead * 3600 * 1000;

    const passes: SatellitePassWindow[] = [];

    let t = startMs;
    let prevElevation = -90;

    const initialAngles = PassPredictor.getLookAnglesAt(propagator, t, observer);
    if (initialAngles) {
      prevElevation = initialAngles.elevationDeg;
    }

    while (t < endMs && passes.length < maxPasses) {
      const nextT = t + coarseStepMs;
      const nextAngles = PassPredictor.getLookAnglesAt(propagator, nextT, observer);

      if (!nextAngles) {
        t = nextT;
        continue;
      }

      const currElevation = nextAngles.elevationDeg;

      // 1. Detect AOS transition: crossing from below minElevation to above
      if (prevElevation < minEl && currElevation >= minEl) {
        // Refine AOS via bisection to within 1 second
        let low = t;
        let high = nextT;
        while (high - low > 1000) {
          const mid = Math.round((low + high) / 2);
          const midAngles = PassPredictor.getLookAnglesAt(propagator, mid, observer);
          if (midAngles && midAngles.elevationDeg >= minEl) {
            high = mid;
          } else {
            low = mid;
          }
        }
        const aosMs = high;
        const aosAngles = PassPredictor.getLookAnglesAt(propagator, aosMs, observer);
        const aosAzimuthDeg = aosAngles?.azimuthDeg ?? 0;

        // 2. Track pass to find LOS and coarse peak
        let passCursor = nextT;
        let inPassAngles = nextAngles;
        let maxElevationFound = inPassAngles.elevationDeg;
        let tcaCandidateMs = passCursor;

        while (passCursor < endMs) {
          const aheadT = passCursor + coarseStepMs;
          const aheadAngles = PassPredictor.getLookAnglesAt(propagator, aheadT, observer);

          if (!aheadAngles) {
            passCursor = aheadT;
            continue;
          }

          if (aheadAngles.elevationDeg > maxElevationFound) {
            maxElevationFound = aheadAngles.elevationDeg;
            tcaCandidateMs = aheadT;
          }

          // Check if satellite dropped below minElevation threshold
          if (aheadAngles.elevationDeg < minEl) {
            // Refine LOS via bisection to within 1 second
            let losLow = passCursor;
            let losHigh = aheadT;
            while (losHigh - losLow > 1000) {
              const mid = Math.round((losLow + losHigh) / 2);
              const midAngles = PassPredictor.getLookAnglesAt(propagator, mid, observer);
              if (midAngles && midAngles.elevationDeg >= minEl) {
                losLow = mid;
              } else {
                losHigh = mid;
              }
            }
            const losMs = losLow;
            const losAngles = PassPredictor.getLookAnglesAt(propagator, losMs, observer);
            const losAzimuthDeg = losAngles?.azimuthDeg ?? 0;

            // 3. Refine TCA (Time of Closest Approach / Max Elevation)
            const tcaResult = PassPredictor.refineTca(
              propagator,
              aosMs,
              losMs,
              tcaCandidateMs,
              observer,
            );

            // 4. Sample sky trajectory for RF-05 Sky Chart
            const trajectory = PassPredictor.sampleTrajectory(
              propagator,
              aosMs,
              losMs,
              observer,
            );

            const durationSeconds = Math.max(1, Math.round((losMs - aosMs) / 1000));

            passes.push({
              id: `pass_${propagator.noradId}_${aosMs}`,
              noradId: propagator.noradId,
              satelliteName: propagator.name,
              aosTimeMs: aosMs,
              aosAzimuthDeg,
              tcaTimeMs: tcaResult.timeMs,
              maxElevationDeg: tcaResult.elevationDeg,
              tcaAzimuthDeg: tcaResult.azimuthDeg,
              losTimeMs: losMs,
              losAzimuthDeg,
              durationSeconds,
              minElevationThresholdDeg: minEl,
              trajectory,
            });

            // Advance outer loop to after LOS
            t = aheadT;
            prevElevation = aheadAngles.elevationDeg;
            break;
          }

          passCursor = aheadT;
          inPassAngles = aheadAngles;
        }
      } else {
        t = nextT;
        prevElevation = currElevation;
      }
    }

    return passes;
  }

  /**
   * Refines the exact peak elevation (TCA) using local fine search.
   */
  private static refineTca(
    propagator: Sgp4Propagator,
    aosMs: number,
    losMs: number,
    candidateMs: number,
    observer: ObserverLocation,
  ): { timeMs: number; elevationDeg: number; azimuthDeg: number } {
    // Search within +/- 60 seconds of coarse candidate in 2-second steps
    const searchStart = Math.max(aosMs, candidateMs - 60000);
    const searchEnd = Math.min(losMs, candidateMs + 60000);

    let bestTime = candidateMs;
    let bestEl = -90;
    let bestAz = 0;

    for (let time = searchStart; time <= searchEnd; time += 2000) {
      const angles = PassPredictor.getLookAnglesAt(propagator, time, observer);
      if (angles && angles.elevationDeg > bestEl) {
        bestEl = angles.elevationDeg;
        bestTime = time;
        bestAz = angles.azimuthDeg;
      }
    }

    return {
      timeMs: bestTime,
      elevationDeg: bestEl,
      azimuthDeg: bestAz,
    };
  }

  /**
   * Samples polar sky coordinates throughout the pass window for Sky Chart rendering (RF-05).
   */
  private static sampleTrajectory(
    propagator: Sgp4Propagator,
    aosMs: number,
    losMs: number,
    observer: ObserverLocation,
    targetSamples = 24,
  ): SkyTrajectoryPoint[] {
    const trajectory: SkyTrajectoryPoint[] = [];
    const durationMs = losMs - aosMs;
    const intervalMs = Math.max(5000, Math.round(durationMs / targetSamples));

    for (let time = aosMs; time <= losMs; time += intervalMs) {
      const angles = PassPredictor.getLookAnglesAt(propagator, time, observer);
      if (angles) {
        trajectory.push({
          timestampMs: time,
          azimuthDeg: angles.azimuthDeg,
          elevationDeg: Math.max(0, angles.elevationDeg),
          rangeKm: angles.rangeKm,
        });
      }
    }

    // Ensure LOS point is included at the end
    const lastPoint = trajectory[trajectory.length - 1];
    if (!lastPoint || lastPoint.timestampMs !== losMs) {
      const finalAngles = PassPredictor.getLookAnglesAt(propagator, losMs, observer);
      if (finalAngles) {
        trajectory.push({
          timestampMs: losMs,
          azimuthDeg: finalAngles.azimuthDeg,
          elevationDeg: Math.max(0, finalAngles.elevationDeg),
          rangeKm: finalAngles.rangeKm,
        });
      }
    }

    return trajectory;
  }

  /**
   * Asynchronous pass prediction yielding to the event loop between iterations.
   */
  public static async findNextPassesAsync(
    propagator: Sgp4Propagator,
    options?: PassPredictionOptions,
  ): Promise<SatellitePassWindow[]> {
    return new Promise(resolve => {
      // Run prediction on next event tick
      setTimeout(() => {
        const passes = PassPredictor.findNextPasses(propagator, options);
        resolve(passes);
      }, 0);
    });
  }
}
