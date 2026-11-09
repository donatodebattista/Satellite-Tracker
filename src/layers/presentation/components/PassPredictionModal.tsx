import React, { useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LookAngles, SatellitePassWindow } from '../../../shared';
import { SkyChartSvg } from './SkyChartSvg';

export interface PassPredictionModalProps {
  visible: boolean;
  onClose: () => void;
  satelliteName: string;
  passes: SatellitePassWindow[];
  currentLookAngles?: LookAngles | null;
  onScheduleNotification?: (pass: SatellitePassWindow) => void;
}

/**
 * Upcoming Visibility Passes and Polar Sky Chart Modal (RF-04, RF-05, RF-06).
 */
export const PassPredictionModal: React.FC<PassPredictionModalProps> = ({
  visible,
  onClose,
  satelliteName,
  passes,
  currentLookAngles,
  onScheduleNotification,
}) => {
  const [selectedPass, setSelectedPass] = useState<SatellitePassWindow | null>(
    passes[0] ?? null,
  );

  // Sync selected pass if passes change
  React.useEffect(() => {
    if (passes.length > 0 && (!selectedPass || !passes.find(p => p.id === selectedPass.id))) {
      setSelectedPass(passes[0]);
    }
  }, [passes, selectedPass]);

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop} testID="pass-prediction-modal">
        <View style={styles.sheetContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Próximos Pases Visibles</Text>
              <Text style={styles.subtitle}>{satelliteName} — Ventanas AOS/LOS</Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Sky Chart View for Selected Pass (RF-05) */}
          {selectedPass ? (
            <View style={styles.skyChartWrapper}>
              <SkyChartSvg
                pass={selectedPass}
                currentLookAngles={currentLookAngles ?? undefined}
                size={270}
              />
            </View>
          ) : (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No se detectaron pases visibles con elevación &gt; 10° en las próximas 24 horas.
              </Text>
            </View>
          )}

          {/* Pass List (RF-04) */}
          <Text style={styles.listSectionTitle}>LISTADO DE VENTANAS</Text>
          <FlatList
            data={passes}
            keyExtractor={item => item.id}
            renderItem={({ item }) => {
              const isSelected = selectedPass?.id === item.id;
              const aosDate = new Date(item.aosTimeMs);
              const dateStr = aosDate.toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });
              const timeStr = aosDate.toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <TouchableOpacity
                  style={[styles.passCard, isSelected && styles.selectedPassCard]}
                  onPress={() => setSelectedPass(item)}
                  activeOpacity={0.7}
                >
                  <View style={styles.passCardHeader}>
                    <Text style={styles.passDateText}>
                      {dateStr} a las {timeStr}
                    </Text>
                    <View style={styles.elevationBadge}>
                      <Text style={styles.elevationBadgeText}>
                        Max {Math.round(item.maxElevationDeg)}°
                      </Text>
                    </View>
                  </View>

                  <View style={styles.passDetailsRow}>
                    <Text style={styles.passDetailItem}>
                      AOS: {Math.round(item.aosAzimuthDeg)}° (Inicio)
                    </Text>
                    <Text style={styles.passDetailItem}>
                      LOS: {Math.round(item.losAzimuthDeg)}° (Fin)
                    </Text>
                    <Text style={styles.passDetailItem}>
                      Duración: {Math.floor(item.durationSeconds / 60)}m{' '}
                      {item.durationSeconds % 60}s
                    </Text>
                  </View>

                  {/* Notification reminder trigger (RF-06) */}
                  {onScheduleNotification && (
                    <TouchableOpacity
                      style={styles.notifyBtn}
                      onPress={() => onScheduleNotification(item)}
                    >
                      <Text style={styles.notifyBtnText}>🔔 Programar Alerta (-10 min)</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              );
            }}
            style={styles.passList}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    height: '90%',
    backgroundColor: '#0a0e1a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  subtitle: {
    color: '#00e5ff',
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  skyChartWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
  },
  listSectionTitle: {
    color: '#90a4ae',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    marginTop: 8,
    marginBottom: 6,
  },
  passList: {
    flex: 1,
  },
  passCard: {
    backgroundColor: '#0f172a',
    borderColor: '#1e293b',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  selectedPassCard: {
    borderColor: '#00e5ff',
    backgroundColor: 'rgba(0, 229, 255, 0.08)',
  },
  passCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  passDateText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  elevationBadge: {
    backgroundColor: '#ffb300',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  elevationBadgeText: {
    color: '#000000',
    fontSize: 10,
    fontWeight: 'bold',
  },
  passDetailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  passDetailItem: {
    color: '#94a3b8',
    fontSize: 11,
  },
  notifyBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(0, 229, 255, 0.15)',
    borderColor: '#00e5ff',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  notifyBtnText: {
    color: '#00e5ff',
    fontSize: 11,
    fontWeight: '600',
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
  },
});
