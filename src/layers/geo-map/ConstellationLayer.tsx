import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import {
  CONSTELLATION_REFRESH_INTERVAL_MS,
  DEFAULT_CONSTELLATION_MAX_SATELLITES,
  OrbitalElementSet,
} from '../../shared';
import {
  BatchSatellitePosition,
  ConstellationBatch,
} from '../orbital-engine/ConstellationBatch';

export interface ConstellationLayerProps {
  satellites: OrbitalElementSet[];
  visible?: boolean;
  maxCount?: number;
  refreshIntervalMs?: number;
  onSelectSatellite?: (satellite: OrbitalElementSet) => void;
  selectedNoradId?: number;
}

/**
 * Constellation Layer for rendering dense satellite constellations like Starlink (RF-13).
 * Uses batch propagation outside the main render loop with throttling.
 */
export const ConstellationLayer: React.FC<ConstellationLayerProps> = ({
  satellites,
  visible = true,
  maxCount = DEFAULT_CONSTELLATION_MAX_SATELLITES,
  refreshIntervalMs = CONSTELLATION_REFRESH_INTERVAL_MS,
  onSelectSatellite,
  selectedNoradId,
}) => {
  const batcher = useMemo(() => new ConstellationBatch(), []);
  const [positions, setPositions] = useState<BatchSatellitePosition[]>([]);

  useEffect(() => {
    if (!visible || satellites.length === 0) {
      setPositions([]);
      return;
    }

    const update = () => {
      const batch = batcher.propagateBatch(satellites, new Date(), maxCount);
      setPositions(batch);
    };

    update();
    const timer = setInterval(update, refreshIntervalMs);
    return () => clearInterval(timer);
  }, [satellites, visible, maxCount, refreshIntervalMs, batcher]);

  if (!visible || positions.length === 0) {
    return null;
  }

  return (
    <>
      {positions.map(pos => {
        const isSelected = pos.noradId === selectedNoradId;
        return (
          <Marker
            key={`constellation_${pos.noradId}`}
            testID="constellation-marker"
            coordinate={{
              latitude: pos.latitude,
              longitude: pos.longitude,
            }}
            tracksViewChanges={false}
            onPress={() => {
              const found = satellites.find(s => s.noradId === pos.noradId);
              if (found && onSelectSatellite) {
                onSelectSatellite(found);
              }
            }}
            title={pos.name}
            description={`NORAD: ${pos.noradId} | Alt: ${Math.round(pos.altitudeKm)} km`}
          >
            <View
              style={[
                styles.dotMarker,
                isSelected ? styles.selectedDot : styles.normalDot,
              ]}
            >
              {isSelected && <Text style={styles.dotText}>✦</Text>}
            </View>
          </Marker>
        );
      })}
    </>
  );
};

const styles = StyleSheet.create({
  dotMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  normalDot: {
    backgroundColor: 'rgba(0, 229, 255, 0.75)', // Cyan Starlink tone
    borderColor: '#ffffff',
    borderWidth: 1,
  },
  selectedDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#ff9800',
    borderColor: '#ffffff',
    borderWidth: 1.5,
  },
  dotText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: 'bold',
  },
});
