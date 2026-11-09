import BackgroundFetch from 'react-native-background-fetch';
import { DataOrchestrator } from '../data-provider/DataOrchestrator';

/**
 * Background task to periodically refresh expired orbital data and reschedule pass alerts (RF-06, RF-09).
 */
export class BackgroundSyncTask {
  private static isInitialized = false;

  /**
   * Configures background fetch with periodic 15-30 min intervals.
   */
  public static async init(orchestrator?: DataOrchestrator): Promise<void> {
    if (this.isInitialized) return;

    const activeOrchestrator = orchestrator ?? new DataOrchestrator();

    await BackgroundFetch.configure(
      {
        minimumFetchInterval: 15, // 15 minutes
        stopOnTerminate: false,
        startOnBoot: true,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
      },
      async taskId => {
        try {
          // Check and refresh expired categories
          await activeOrchestrator.getCatalog('stations', false);
          await activeOrchestrator.getCatalog('starlink-sup', false);
        } catch {
          // Ignore network errors in background
        } finally {
          BackgroundFetch.finish(taskId);
        }
      },
      async taskId => {
        // Timeout callback
        BackgroundFetch.finish(taskId);
      },
    );

    this.isInitialized = true;
  }

  /**
   * Manually checks background fetch status.
   */
  public static async getStatus(): Promise<number> {
    return await BackgroundFetch.status();
  }
}
