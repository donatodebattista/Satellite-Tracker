import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { DataFreshnessMetadata } from '../../../shared';

export interface DataFreshnessBadgeProps {
  metadata: DataFreshnessMetadata | null;
  onRefreshPress?: () => void;
}

/**
 * Visual badge indicating orbital data age and obsolescence alerts (RF-16).
 */
export const DataFreshnessBadge: React.FC<DataFreshnessBadgeProps> = ({
  metadata,
  onRefreshPress,
}) => {
  if (!metadata) return null;

  const isFresh = metadata.level === 'FRESH';
  const isAging = metadata.level === 'AGING';
  const isStale = metadata.level === 'STALE';

  const badgeColor = isFresh ? '#00e676' : isAging ? '#ffb74d' : '#ff1744';
  const ageFormatted =
    metadata.epochAgeHours < 24
      ? `Época: hace ${Math.round(metadata.epochAgeHours)}h`
      : `Época: hace ${(metadata.epochAgeHours / 24).toFixed(1)}d`;

  return (
    <View style={styles.container} testID="data-freshness-badge">
      <TouchableOpacity
        style={[
          styles.badge,
          { borderColor: badgeColor },
          isStale && styles.staleGlow,
        ]}
        onPress={onRefreshPress}
        activeOpacity={0.7}
      >
        <View style={[styles.dot, { backgroundColor: badgeColor }]} />
        <Text style={styles.sourceText}>{metadata.source.toUpperCase()}</Text>
        <Text style={styles.pipeText}>|</Text>
        <Text style={styles.ageText}>{ageFormatted}</Text>

        {metadata.isCacheExpired && (
          <Text style={styles.expiredTag}>[EXPIRADO]</Text>
        )}
      </TouchableOpacity>

      {/* Obsolescence Warning Banner for RF-16 */}
      {metadata.warningMessage && (
        <View style={styles.warningContainer}>
          <Text style={styles.warningIcon}>⚠️</Text>
          <Text style={styles.warningText}>{metadata.warningMessage}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    marginVertical: 4,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 20,
    borderWidth: 1,
  },
  staleGlow: {
    backgroundColor: 'rgba(183, 28, 28, 0.4)',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  sourceText: {
    color: '#90a4ae',
    fontSize: 10,
    fontWeight: 'bold',
  },
  pipeText: {
    color: '#37474f',
    marginHorizontal: 5,
    fontSize: 10,
  },
  ageText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '600',
  },
  expiredTag: {
    color: '#ff9800',
    fontSize: 9,
    fontWeight: 'bold',
    marginLeft: 6,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(211, 47, 47, 0.15)',
    borderColor: '#e53935',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginTop: 4,
  },
  warningIcon: {
    fontSize: 10,
    marginRight: 4,
  },
  warningText: {
    color: '#ef9a9a',
    fontSize: 9,
    fontWeight: '600',
  },
});
