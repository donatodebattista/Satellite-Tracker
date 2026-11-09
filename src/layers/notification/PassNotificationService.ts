import notifee, {
  AndroidImportance,
  TimestampTrigger,
  TriggerType,
} from '@notifee/react-native';
import {
  DEFAULT_NOTIFICATION_LEAD_MINUTES,
  SatellitePassWindow,
} from '../../shared';

export class PassNotificationService {
  private static channelId = 'satellite-passes';
  private static channelInitialized = false;

  /**
   * Initializes notification channel on Android.
   */
  public static async initChannel(): Promise<string> {
    if (this.channelInitialized) return this.channelId;

    const id = await notifee.createChannel({
      id: this.channelId,
      name: 'Pases Satelitales Visibles',
      description: 'Recordatorios previos a ventanas de visibilidad satelital (AOS)',
      importance: AndroidImportance.HIGH,
      vibration: true,
    });

    this.channelInitialized = true;
    return id;
  }

  /**
   * Schedules a local notification N minutes before satellite AOS (RF-06).
   */
  public static async schedulePassNotification(
    pass: SatellitePassWindow,
    leadMinutes = DEFAULT_NOTIFICATION_LEAD_MINUTES,
  ): Promise<string> {
    await notifee.requestPermission();
    await this.initChannel();

    const triggerTimeMs = pass.aosTimeMs - leadMinutes * 60 * 1000;
    const now = Date.now();

    // If trigger time already passed, fire immediately or throw
    const triggerTimestamp = Math.max(now + 1000, triggerTimeMs);

    const trigger: TimestampTrigger = {
      type: TriggerType.TIMESTAMP,
      timestamp: triggerTimestamp,
    };

    const notificationId = `pass_alert_${pass.noradId}_${pass.aosTimeMs}`;

    await notifee.createTriggerNotification(
      {
        id: notificationId,
        title: `🛰 Pase visible de ${pass.satelliteName}`,
        body: `El satélite iniciará su pase (AOS) en ${leadMinutes} min. Elevación máxima: ${Math.round(
          pass.maxElevationDeg,
        )}°`,
        android: {
          channelId: this.channelId,
          importance: AndroidImportance.HIGH,
          pressAction: {
            id: 'default',
          },
        },
      },
      trigger,
    );

    return notificationId;
  }

  /**
   * Cancels a specific scheduled pass alert.
   */
  public static async cancelNotification(id: string): Promise<void> {
    await notifee.cancelNotification(id);
  }

  /**
   * Cancels all scheduled pass alerts.
   */
  public static async cancelAllNotifications(): Promise<void> {
    await notifee.cancelAllNotifications();
  }

  /**
   * Lists all active pending trigger notification IDs.
   */
  public static async getPendingNotificationIds(): Promise<string[]> {
    return await notifee.getTriggerNotificationIds();
  }
}
