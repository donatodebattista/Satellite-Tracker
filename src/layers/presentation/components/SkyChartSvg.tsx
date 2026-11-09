import React from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { DEG_TO_RAD, LookAngles, SatellitePassWindow } from '../../../shared';

export interface SkyChartSvgProps {
  pass: SatellitePassWindow;
  currentLookAngles?: LookAngles;
  size?: number;
}

/**
 * Astronomical Polar Sky Chart in SVG (RF-05).
 * Projects satellite pass trajectories from local horizon (0 deg) to Zenith (90 deg).
 */
export const SkyChartSvg: React.FC<SkyChartSvgProps> = ({
  pass,
  currentLookAngles,
  size = 320,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const maxR = cx - 28;

  /**
   * Projects spherical topocentric coordinates (azimuth, elevation) to 2D canvas (x, y).
   */
  const project = (azimuthDeg: number, elevationDeg: number) => {
    const elClamped = Math.max(0, Math.min(90, elevationDeg));
    const r = maxR * ((90 - elClamped) / 90);
    const azRad = azimuthDeg * DEG_TO_RAD;

    return {
      x: cx + r * Math.sin(azRad),
      y: cy - r * Math.cos(azRad),
    };
  };

  // Build SVG path string from trajectory samples
  const pathData = React.useMemo(() => {
    if (!pass.trajectory || pass.trajectory.length === 0) return '';

    const first = project(
      pass.trajectory[0].azimuthDeg,
      pass.trajectory[0].elevationDeg,
    );
    let d = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`;

    for (let i = 1; i < pass.trajectory.length; i++) {
      const pt = project(
        pass.trajectory[i].azimuthDeg,
        pass.trajectory[i].elevationDeg,
      );
      d += ` L ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    }

    return d;
  }, [pass.trajectory, maxR, cx, cy]);

  const aosPos = project(pass.aosAzimuthDeg, pass.minElevationThresholdDeg);
  const tcaPos = project(pass.tcaAzimuthDeg, pass.maxElevationDeg);
  const losPos = project(pass.losAzimuthDeg, pass.minElevationThresholdDeg);

  const livePos =
    currentLookAngles && currentLookAngles.elevationDeg >= 0
      ? project(currentLookAngles.azimuthDeg, currentLookAngles.elevationDeg)
      : null;

  return (
    <View style={[styles.container, { width: size, height: size }]} testID="sky-chart-svg">
      <Svg width={size} height={size}>
        {/* Background polar circles */}
        <Circle cx={cx} cy={cy} r={maxR} stroke="#2a3b5c" strokeWidth={1.5} fill="#0b1329" />
        <Circle cx={cx} cy={cy} r={maxR * (60 / 90)} stroke="#1e2c47" strokeWidth={1} fill="none" strokeDasharray="4,4" />
        <Circle cx={cx} cy={cy} r={maxR * (30 / 90)} stroke="#1e2c47" strokeWidth={1} fill="none" strokeDasharray="4,4" />
        <Circle cx={cx} cy={cy} r={3} fill="#00e5ff" />

        {/* Cardinal crosshairs */}
        <Line x1={cx} y1={cy - maxR} x2={cx} y2={cy + maxR} stroke="#1e2c47" strokeWidth={1} />
        <Line x1={cx - maxR} y1={cy} x2={cx + maxR} y2={cy} stroke="#1e2c47" strokeWidth={1} />

        {/* Elevation Ring Labels */}
        <SvgText x={cx + 4} y={cy - maxR * (60 / 90) + 10} fill="#607d8b" fontSize={9}>
          30°
        </SvgText>
        <SvgText x={cx + 4} y={cy - maxR * (30 / 90) + 10} fill="#607d8b" fontSize={9}>
          60°
        </SvgText>
        <SvgText x={cx + 4} y={cy + 12} fill="#90a4ae" fontSize={9} fontWeight="bold">
          Z
        </SvgText>

        {/* Cardinal Labels */}
        <SvgText x={cx} y={16} fill="#ffeb3b" fontSize={12} fontWeight="bold" textAnchor="middle">
          N (0°)
        </SvgText>
        <SvgText x={size - 12} y={cy + 4} fill="#ffffff" fontSize={12} fontWeight="bold" textAnchor="middle">
          E
        </SvgText>
        <SvgText x={cx} y={size - 6} fill="#ffffff" fontSize={12} fontWeight="bold" textAnchor="middle">
          S
        </SvgText>
        <SvgText x={12} y={cy + 4} fill="#ffffff" fontSize={12} fontWeight="bold" textAnchor="middle">
          O
        </SvgText>

        {/* Projected Pass Trajectory Curve */}
        {pathData !== '' && (
          <Path
            d={pathData}
            stroke="#00e5ff"
            strokeWidth={3}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* AOS Marker (Green) */}
        <G>
          <Circle cx={aosPos.x} cy={aosPos.y} r={6} fill="#00e676" stroke="#ffffff" strokeWidth={1.5} />
          <SvgText
            x={aosPos.x}
            y={aosPos.y + (aosPos.y < cy ? -10 : 16)}
            fill="#00e676"
            fontSize={10}
            fontWeight="bold"
            textAnchor="middle"
          >
            {`AOS (${Math.round(pass.aosAzimuthDeg)}°)`}
          </SvgText>
        </G>

        {/* TCA / Max Elevation Marker (Gold) */}
        <G>
          <Circle cx={tcaPos.x} cy={tcaPos.y} r={7} fill="#ffd600" stroke="#ffffff" strokeWidth={2} />
          <SvgText
            x={tcaPos.x}
            y={tcaPos.y + (tcaPos.y < cy ? -10 : 16)}
            fill="#ffd600"
            fontSize={11}
            fontWeight="bold"
            textAnchor="middle"
          >
            {`Max ${Math.round(pass.maxElevationDeg)}°`}
          </SvgText>
        </G>

        {/* LOS Marker (Red) */}
        <G>
          <Circle cx={losPos.x} cy={losPos.y} r={6} fill="#ff1744" stroke="#ffffff" strokeWidth={1.5} />
          <SvgText
            x={losPos.x}
            y={losPos.y + (losPos.y < cy ? -10 : 16)}
            fill="#ff1744"
            fontSize={10}
            fontWeight="bold"
            textAnchor="middle"
          >
            {`LOS (${Math.round(pass.losAzimuthDeg)}°)`}
          </SvgText>
        </G>

        {/* Live Satellite Position Marker */}
        {livePos && (
          <G>
            <Circle cx={livePos.x} cy={livePos.y} r={9} fill="rgba(0, 229, 255, 0.4)" />
            <Circle cx={livePos.x} cy={livePos.y} r={5} fill="#00e5ff" stroke="#ffffff" strokeWidth={2} />
          </G>
        )}
      </Svg>

      <View style={styles.legendRow}>
        <RNText style={styles.legendText}>
          Duración: {Math.floor(pass.durationSeconds / 60)}m {pass.durationSeconds % 60}s
        </RNText>
        <RNText style={styles.legendText}>
          Elevación Máx: {Math.round(pass.maxElevationDeg)}°
        </RNText>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0e1a',
    borderRadius: 16,
    padding: 8,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 6,
  },
  legendText: {
    color: '#b0bec5',
    fontSize: 11,
    fontWeight: '600',
  },
});
