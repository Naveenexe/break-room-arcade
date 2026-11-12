import { supabase, isSupabaseConfigured } from './supabase';

export interface SyncSample {
  offset: number;
  rtt: number;
}

export interface SyncStatus {
  offset: number;
  rtt: number;
  lastSyncedAt: number;
  status: 'synced' | 'slow' | 'reconnecting' | 'unconfigured';
}

class TimeSyncManager {
  private offset: number = 0;
  private lastRtt: number = 0;
  private lastSyncedAt: number = 0;
  private isSyncing: boolean = false;
  private intervalId: number | null = null;
  private listeners: Set<(status: SyncStatus) => void> = new Set();

  constructor() {
    // Initial sync
    if (typeof window !== 'undefined') {
      this.sync();
      // Recalibrate every 60 seconds (TM-1)
      this.intervalId = window.setInterval(() => {
        this.sync();
      }, 60_000);
    }
  }

  public subscribe(callback: (status: SyncStatus) => void): () => void {
    this.listeners.add(callback);
    callback(this.getStatus());
    return () => {
      this.listeners.delete(callback);
    };
  }

  private notify(): void {
    const status = this.getStatus();
    this.listeners.forEach((cb) => cb(status));
  }

  public getStatus(): SyncStatus {
    let status: SyncStatus['status'] = 'synced';
    if (!isSupabaseConfigured) {
      status = 'unconfigured';
    } else if (this.isSyncing && this.lastSyncedAt === 0) {
      status = 'reconnecting';
    } else if (this.lastRtt > 800) {
      status = 'slow';
    }

    return {
      offset: this.offset,
      rtt: this.lastRtt,
      lastSyncedAt: this.lastSyncedAt,
      status,
    };
  }

  /**
   * TM-1: Calls server_now() 5 times, computes offset = server_time - (t_send + t_recv)/2,
   * picks the median of the 3 lowest-RTT samples.
   */
  public async sync(): Promise<SyncStatus> {
    if (!isSupabaseConfigured) {
      return this.getStatus();
    }

    if (this.isSyncing) return this.getStatus();
    this.isSyncing = true;
    this.notify();

    const samples: SyncSample[] = [];

    try {
      for (let i = 0; i < 5; i++) {
        const tSend = Date.now();
        const { data, error } = await supabase.rpc('server_now');
        const tRecv = Date.now();

        if (error || !data) {
          continue;
        }

        const serverTime = new Date(data).getTime();
        const rtt = tRecv - tSend;
        const estimatedClientNow = (tSend + tRecv) / 2;
        const sampleOffset = serverTime - estimatedClientNow;

        samples.push({
          offset: sampleOffset,
          rtt,
        });

        // Small pause between samples
        await new Promise((r) => setTimeout(r, 40));
      }

      if (samples.length >= 3) {
        // Sort by RTT ascending to find the 3 lowest-RTT samples
        samples.sort((a, b) => a.rtt - b.rtt);
        const lowestThree = samples.slice(0, 3);

        // Sort those 3 by offset to find the median
        lowestThree.sort((a, b) => a.offset - b.offset);
        const medianSample = lowestThree[1]; // middle element

        this.offset = Math.round(medianSample.offset);
        this.lastRtt = Math.round(medianSample.rtt);
        this.lastSyncedAt = Date.now();
      } else if (samples.length > 0) {
        this.offset = Math.round(samples[0].offset);
        this.lastRtt = Math.round(samples[0].rtt);
        this.lastSyncedAt = Date.now();
      }
    } catch (err) {
      console.error('Time sync error:', err);
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return this.getStatus();
  }

  /**
   * TM-2: correctedNow() = Date.now() + offset
   */
  public correctedNow(): number {
    return Date.now() + this.offset;
  }

  /**
   * Calculates remaining ms until phase_ends_at using correctedNow()
   */
  public getRemainingMs(phaseEndsAtIso: string | null): number {
    if (!phaseEndsAtIso) return 0;
    const target = new Date(phaseEndsAtIso).getTime();
    return Math.max(0, target - this.correctedNow());
  }

  public getOffset(): number {
    return this.offset;
  }

  public setSimulatedOffset(offset: number): void {
    this.offset = offset;
    this.notify();
  }

  public destroy(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
    }
  }
}

export const timeSync = new TimeSyncManager();
export const correctedNow = () => timeSync.correctedNow();
export const getRemainingMs = (phaseEndsAt: string | null) => timeSync.getRemainingMs(phaseEndsAt);

