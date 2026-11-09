import {
  accelerometer,
  magnetometer,
  SensorTypes,
  setUpdateIntervalForType,
} from 'react-native-sensors';
import {
  CompassGuidanceVector,
  DEG_TO_RAD,
  DeviceOrientationState,
  LookAngles,
  RAD_TO_DEG,
} from '../../shared';

export interface OrientationOptions {
  updateIntervalMs?: number;
  lowPassAlpha?: number;
  alignmentToleranceDeg?: number;
}

/**
 * Sensor fusion and orientation guidance service for Assisted Compass Mode (RF-07).
 */
export class OrientationService {
  private static lastOrientation: DeviceOrientationState = {
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    timestampMs: Date.now(),
  };

  /**
   * Calculates shortest angular difference in [-180, 180] degrees.
   */
  public static normalizeAngleDiff(angleDeg: number): number {
    const diff = ((angleDeg % 360) + 540) % 360 - 180;
    if (diff === -180 && angleDeg > 0) return 180;
    return diff;
  }

  /**
   * Applies low-pass exponential filter to angular value handling 0/360 wrap-around.
   */
  public static filterAngle(prevAngleDeg: number, newAngleDeg: number, alpha: number): number {
    const diff = OrientationService.normalizeAngleDiff(newAngleDeg - prevAngleDeg);
    let filtered = prevAngleDeg + alpha * diff;
    if (filtered < 0) filtered += 360;
    if (filtered >= 360) filtered -= 360;
    return filtered;
  }

  /**
   * Computes 3D angular separation between two look vectors on the celestial sphere.
   */
  public static computeAngularSeparation(
    az1Deg: number,
    el1Deg: number,
    az2Deg: number,
    el2Deg: number,
  ): number {
    const el1Rad = el1Deg * DEG_TO_RAD;
    const el2Rad = el2Deg * DEG_TO_RAD;
    const deltaAzRad = (az2Deg - az1Deg) * DEG_TO_RAD;

    const cosGamma =
      Math.sin(el1Rad) * Math.sin(el2Rad) +
      Math.cos(el1Rad) * Math.cos(el2Rad) * Math.cos(deltaAzRad);

    const clamped = Math.max(-1, Math.min(1, cosGamma));
    return Math.acos(clamped) * RAD_TO_DEG;
  }

  /**
   * Generates guidance vector indicating how to align the phone with the satellite (RF-07).
   */
  public static calculateGuidance(
    orientation: DeviceOrientationState,
    targetLookAngles: LookAngles,
    alignmentToleranceDeg = 5.0,
  ): CompassGuidanceVector {
    const targetAz = targetLookAngles.azimuthDeg;
    const targetEl = targetLookAngles.elevationDeg;
    const currentHeading = orientation.headingDeg;
    const currentPitch = orientation.pitchDeg;

    // Delta azimuth: positive means rotate device right / clockwise; negative means turn left
    const deltaAzimuthDeg = OrientationService.normalizeAngleDiff(targetAz - currentHeading);

    // Delta elevation: positive means tilt device up; negative means tilt down
    const deltaElevationDeg = targetEl - currentPitch;

    // Total 3D angular separation between boresight and satellite
    const angularSeparationDeg = OrientationService.computeAngularSeparation(
      currentHeading,
      currentPitch,
      targetAz,
      targetEl,
    );

    const isAligned = angularSeparationDeg <= alignmentToleranceDeg;

    return {
      targetAzimuthDeg: targetAz,
      targetElevationDeg: targetEl,
      currentHeadingDeg: currentHeading,
      currentPitchDeg: currentPitch,
      deltaAzimuthDeg,
      deltaElevationDeg,
      angularSeparationDeg,
      isAligned,
    };
  }

  /**
   * Subscribes to device sensors and streams smoothed orientation updates.
   */
  public static startOrientationUpdates(
    callback: (state: DeviceOrientationState) => void,
    options?: OrientationOptions,
  ): () => void {
    const intervalMs = options?.updateIntervalMs ?? 100;
    const alpha = options?.lowPassAlpha ?? 0.25;

    try {
      setUpdateIntervalForType(SensorTypes.magnetometer, intervalMs);
      setUpdateIntervalForType(SensorTypes.accelerometer, intervalMs);
    } catch {
      // Platform fallback if update interval setting fails
    }

    let lastAccel = { x: 0, y: 0, z: 9.8 };
    let filteredHeading = OrientationService.lastOrientation.headingDeg;
    let filteredPitch = OrientationService.lastOrientation.pitchDeg;
    let filteredRoll = OrientationService.lastOrientation.rollDeg;

    const accelSub = accelerometer.subscribe({
      next: data => {
        lastAccel = data;
      },
    });

    const magSub = magnetometer.subscribe({
      next: mag => {
        // Calculate raw pitch and roll from gravity vector
        const normAccel = Math.sqrt(
          lastAccel.x * lastAccel.x + lastAccel.y * lastAccel.y + lastAccel.z * lastAccel.z,
        );

        let pitchDeg = 0;
        let rollDeg = 0;

        if (normAccel > 0.1) {
          const ax = lastAccel.x / normAccel;
          const ay = lastAccel.y / normAccel;
          const az = lastAccel.z / normAccel;

          // Pitch (tilt up/down): 0 deg when device is flat on table, 90 deg when upright portrait
          pitchDeg = Math.atan2(ay, Math.sqrt(ax * ax + az * az)) * RAD_TO_DEG;
          rollDeg = Math.atan2(-ax, az) * RAD_TO_DEG;
        }

        // Tilt-compensated magnetic heading
        const pitchRad = pitchDeg * DEG_TO_RAD;
        const rollRad = rollDeg * DEG_TO_RAD;

        const xh = mag.x * Math.cos(pitchRad) + mag.z * Math.sin(pitchRad);
        const yh =
          mag.x * Math.sin(rollRad) * Math.sin(pitchRad) +
          mag.y * Math.cos(rollRad) -
          mag.z * Math.sin(rollRad) * Math.cos(pitchRad);

        let rawHeading = Math.atan2(-yh, xh) * RAD_TO_DEG;
        if (rawHeading < 0) rawHeading += 360;

        // Apply low pass filter
        filteredHeading = OrientationService.filterAngle(filteredHeading, rawHeading, alpha);
        filteredPitch = filteredPitch + alpha * (pitchDeg - filteredPitch);
        filteredRoll = filteredRoll + alpha * (rollDeg - filteredRoll);

        const state: DeviceOrientationState = {
          headingDeg: filteredHeading,
          pitchDeg: filteredPitch,
          rollDeg: filteredRoll,
          timestampMs: Date.now(),
        };

        OrientationService.lastOrientation = state;
        callback(state);
      },
    });

    return () => {
      accelSub.unsubscribe();
      magSub.unsubscribe();
    };
  }

  /**
   * Returns the most recent orientation reading.
   */
  public static getLastOrientation(): DeviceOrientationState {
    return OrientationService.lastOrientation;
  }
}
