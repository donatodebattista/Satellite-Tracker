import React, { useEffect, useState } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  CompassGuidanceVector,
  DeviceOrientationState,
  LookAngles,
} from '../../../shared';
import { OrientationService } from '../../observer/OrientationService';

export interface CompassOverlayProps {
  visible: boolean;
  onClose: () => void;
  satelliteName: string;
  targetLookAngles: LookAngles | null;
}

/**
 * Interactive Assisted Compass Mode Overlay (RF-07).
 * Guides the user to point their device directly at the satellite.
 */
export const CompassOverlay: React.FC<CompassOverlayProps> = ({
  visible,
  onClose,
  satelliteName,
  targetLookAngles,
}) => {
  const [orientation, setOrientation] = useState<DeviceOrientationState>({
    headingDeg: 0,
    pitchDeg: 0,
    rollDeg: 0,
    timestampMs: Date.now(),
  });

  useEffect(() => {
    if (!visible) return;

    const unsubscribe = OrientationService.startOrientationUpdates(
      newOrientation => {
        setOrientation(newOrientation);
      },
      { updateIntervalMs: 80, lowPassAlpha: 0.3 },
    );

    return () => unsubscribe();
  }, [visible]);

  if (!visible) return null;

  const defaultLookAngles: LookAngles = {
    azimuthDeg: 0,
    elevationDeg: 45,
    rangeKm: 800,
    isVisible: true,
  };

  const activeAngles = targetLookAngles ?? defaultLookAngles;
  const guidance: CompassGuidanceVector = OrientationService.calculateGuidance(
    orientation,
    activeAngles,
    5.0, // 5 degree alignment tolerance
  );

  // Position offset for the target blip inside the boresight reticle
  const maxPixelOffset = 80;
  const xOffset = Math.max(
    -maxPixelOffset,
    Math.min(maxPixelOffset, guidance.deltaAzimuthDeg * 2),
  );
  const yOffset = Math.max(
    -maxPixelOffset,
    Math.min(maxPixelOffset, -guidance.deltaElevationDeg * 2),
  );

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop} testID="compass-overlay">
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>MODO BRÚJULA ASISTIDA</Text>
            <Text style={styles.satName}>{satelliteName}</Text>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Target Coordinates Banner */}
        <View style={styles.targetBanner}>
          <Text style={styles.targetBannerText}>
            Objetivo: Azimut {activeAngles.azimuthDeg.toFixed(1)}° | Elevación{' '}
            {activeAngles.elevationDeg.toFixed(1)}°
          </Text>
        </View>

        {/* Center Boresight Reticle */}
        <View style={styles.reticleContainer}>
          <View
            style={[
              styles.outerRing,
              guidance.isAligned && styles.alignedRing,
            ]}
          >
            <View style={styles.innerRing}>
              {/* Crosshairs */}
              <View style={styles.crosshairH} />
              <View style={styles.crosshairV} />

              {/* Target Satellite Blip */}
              <View
                style={[
                  styles.targetBlip,
                  {
                    transform: [{ translateX: xOffset }, { translateY: yOffset }],
                  },
                  guidance.isAligned && styles.alignedBlip,
                ]}
              >
                <Text style={styles.blipIcon}>🛰</Text>
              </View>

              {/* Center boresight dot */}
              <View
                style={[
                  styles.centerDot,
                  guidance.isAligned && styles.alignedDot,
                ]}
              />
            </View>
          </View>

          {/* Alignment Status Banner */}
          {guidance.isAligned ? (
            <View style={styles.alignedBanner}>
              <Text style={styles.alignedBannerText}>
                ✓ APUNTADO CORRECTO — SATÉLITE EN LÍNEA DE VISTA
              </Text>
            </View>
          ) : (
            <View style={styles.unalignedBanner}>
              <Text style={styles.unalignedBannerText}>
                Sep. Angular: {guidance.angularSeparationDeg.toFixed(1)}°
              </Text>
            </View>
          )}
        </View>

        {/* Directional Guidance Cards */}
        <View style={styles.guidanceCardsRow}>
          {/* Azimuth Guidance */}
          <View style={styles.guidanceCard}>
            <Text style={styles.cardHeader}>AZIMUT (HORIZONTAL)</Text>
            {Math.abs(guidance.deltaAzimuthDeg) <= 5 ? (
              <Text style={styles.alignedText}>✓ Alineado</Text>
            ) : guidance.deltaAzimuthDeg > 0 ? (
              <Text style={styles.turnRightText}>
                ⟳ Girar a la DERECHA (+{guidance.deltaAzimuthDeg.toFixed(0)}°)
              </Text>
            ) : (
              <Text style={styles.turnLeftText}>
                ⟲ Girar a la IZQUIERDA ({guidance.deltaAzimuthDeg.toFixed(0)}°)
              </Text>
            )}
          </View>

          {/* Elevation Guidance */}
          <View style={styles.guidanceCard}>
            <Text style={styles.cardHeader}>ELEVACIÓN (VERTICAL)</Text>
            {Math.abs(guidance.deltaElevationDeg) <= 5 ? (
              <Text style={styles.alignedText}>✓ Alineado</Text>
            ) : guidance.deltaElevationDeg > 0 ? (
              <Text style={styles.tiltUpText}>
                ↑ Inclinar ARRIBA (+{guidance.deltaElevationDeg.toFixed(0)}°)
              </Text>
            ) : (
              <Text style={styles.tiltDownText}>
                ↓ Inclinar ABAJO ({guidance.deltaElevationDeg.toFixed(0)}°)
              </Text>
            )}
          </View>
        </View>

        {/* Bottom Sensor Telemetry */}
        <View style={styles.footerTelemetry}>
          <Text style={styles.footerText}>
            Rumbo Actual: {orientation.headingDeg.toFixed(1)}°
          </Text>
          <Text style={styles.footerText}>
            Inclinación Actual: {orientation.pitchDeg.toFixed(1)}°
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5, 8, 18, 0.96)',
    paddingTop: 48,
    paddingHorizontal: 20,
    justifyContent: 'space-between',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#90a4ae',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  satName: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  targetBanner: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  targetBannerText: {
    color: '#00e5ff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  reticleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  outerRing: {
    width: 240,
    height: 240,
    borderRadius: 120,
    borderColor: 'rgba(0, 229, 255, 0.4)',
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
  },
  alignedRing: {
    borderColor: '#00e676',
    backgroundColor: 'rgba(0, 230, 118, 0.1)',
  },
  innerRing: {
    width: 170,
    height: 170,
    borderRadius: 85,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 1,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crosshairH: {
    position: 'absolute',
    width: '100%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  crosshairV: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  centerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00e5ff',
  },
  alignedDot: {
    backgroundColor: '#00e676',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  targetBlip: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 152, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  alignedBlip: {
    backgroundColor: 'rgba(0, 230, 118, 0.9)',
  },
  blipIcon: {
    fontSize: 16,
  },
  alignedBanner: {
    backgroundColor: '#00e676',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: 18,
  },
  alignedBannerText: {
    color: '#000000',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  unalignedBanner: {
    backgroundColor: '#1e293b',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 18,
  },
  unalignedBannerText: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  guidanceCardsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  guidanceCard: {
    width: '48%',
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  cardHeader: {
    color: '#64748b',
    fontSize: 9,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  turnRightText: {
    color: '#ffb74d',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  turnLeftText: {
    color: '#ffb74d',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tiltUpText: {
    color: '#64b5f6',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  tiltDownText: {
    color: '#64b5f6',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  alignedText: {
    color: '#00e676',
    fontSize: 12,
    fontWeight: 'bold',
  },
  footerTelemetry: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopColor: '#1e293b',
    borderTopWidth: 1,
    paddingTop: 12,
  },
  footerText: {
    color: '#64748b',
    fontSize: 11,
  },
});
