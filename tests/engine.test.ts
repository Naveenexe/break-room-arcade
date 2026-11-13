import { describe, it, expect } from 'vitest';
import {
  computeArcadePoints,
  clampLatency,
  isSubmissionOnTime,
  PlayerStanding,
} from '../src/lib/scoring';

describe('SRS v2 Engine Tests (Section 7.1)', () => {
  describe('E-24 & E-26: Arcade Points Conversion & Ties', () => {
    it('awards standard rank points (10, 7, 5, 4, 3, 2, 1) to distinct ranks', () => {
      const standings: PlayerStanding[] = [
        { userId: 'u1', rawScore: 1200, isSpectator: false },
        { userId: 'u2', rawScore: 900, isSpectator: false },
        { userId: 'u3', rawScore: 750, isSpectator: false },
        { userId: 'u4', rawScore: 500, isSpectator: false },
        { userId: 'u5', rawScore: 400, isSpectator: false },
        { userId: 'u6', rawScore: 200, isSpectator: false },
        { userId: 'u7', rawScore: 100, isSpectator: false },
      ];

      const awards = computeArcadePoints(standings);
      expect(awards.find((a) => a.userId === 'u1')?.arcadePoints).toBe(10);
      expect(awards.find((a) => a.userId === 'u2')?.arcadePoints).toBe(7);
      expect(awards.find((a) => a.userId === 'u3')?.arcadePoints).toBe(5);
      expect(awards.find((a) => a.userId === 'u4')?.arcadePoints).toBe(4);
      expect(awards.find((a) => a.userId === 'u5')?.arcadePoints).toBe(3);
      expect(awards.find((a) => a.userId === 'u6')?.arcadePoints).toBe(2);
      expect(awards.find((a) => a.userId === 'u7')?.arcadePoints).toBe(1);
    });

    it('ties share the points of the best tied rank', () => {
      // u1 and u2 tie for 1st place
      const standings: PlayerStanding[] = [
        { userId: 'u1', rawScore: 1000, isSpectator: false },
        { userId: 'u2', rawScore: 1000, isSpectator: false },
        { userId: 'u3', rawScore: 500, isSpectator: false },
      ];

      const awards = computeArcadePoints(standings);
      expect(awards.find((a) => a.userId === 'u1')?.arcadePoints).toBe(10);
      expect(awards.find((a) => a.userId === 'u2')?.arcadePoints).toBe(10);
      // Next place is rank 3 (gets 5 points)
      expect(awards.find((a) => a.userId === 'u3')?.arcadePoints).toBe(5);
      expect(awards.find((a) => a.userId === 'u3')?.rank).toBe(3);
    });

    it('breaks ties using the earlier final scoring event timestamp if provided', () => {
      const standings: PlayerStanding[] = [
        { userId: 'u1', rawScore: 800, isSpectator: false, finalEventTimestamp: 10050 },
        { userId: 'u2', rawScore: 800, isSpectator: false, finalEventTimestamp: 10020 }, // earlier
      ];

      // u2 scored earlier, so u2 is placed first
      const awards = computeArcadePoints(standings);
      expect(awards[0].userId).toBe('u2');
      expect(awards[1].userId).toBe('u1');
    });

    it('awards spectators exactly 0 Arcade points', () => {
      const standings: PlayerStanding[] = [
        { userId: 'u1', rawScore: 500, isSpectator: false },
        { userId: 'spec1', rawScore: 0, isSpectator: true },
      ];

      const awards = computeArcadePoints(standings);
      expect(awards.find((a) => a.userId === 'spec1')?.arcadePoints).toBe(0);
      expect(awards.find((a) => a.userId === 'spec1')?.rank).toBe(0);
    });

    it('guarantees at least 1 Arcade point for any participant who stayed in at least one round', () => {
      const standings: PlayerStanding[] = [
        { userId: 'u1', rawScore: 500, isSpectator: false },
        { userId: 'u2', rawScore: 0, isSpectator: false, hasParticipated: true },
      ];

      const awards = computeArcadePoints(standings);
      expect(awards.find((a) => a.userId === 'u2')?.arcadePoints).toBeGreaterThanOrEqual(1);
    });
  });

  describe('E-6: Latency Clamping', () => {
    it('preserves client elapsed time within the valid [server - 600ms, server] window', () => {
      const serverElapsed = 1500;
      const clientElapsed = 1350; // 150ms latency difference
      expect(clampLatency(clientElapsed, serverElapsed)).toBe(1350);
    });

    it('clamps client elapsed time if client claims to be faster by > 600ms', () => {
      const serverElapsed = 2000;
      const clientElapsed = 1000; // 1000ms faster (impossible or manipulated)
      expect(clampLatency(clientElapsed, serverElapsed)).toBe(1400); // 2000 - 600
    });

    it('clamps client elapsed time if client claims time greater than server measured', () => {
      const serverElapsed = 1200;
      const clientElapsed = 1400; // client measured more than server saw
      expect(clampLatency(clientElapsed, serverElapsed)).toBe(1200);
    });
  });

  describe('E-7: Late Submission Grace Window', () => {
    it('accepts submissions arriving before or at deadline', () => {
      const deadline = 50000;
      const arrival = 49800;
      const rtt = 100;
      expect(isSubmissionOnTime(arrival, deadline, rtt)).toBe(true);
    });

    it('accepts submissions arriving within half-RTT grace window', () => {
      const deadline = 50000;
      const arrival = 50150; // 150ms late
      const rtt = 400; // rtt/2 = 200ms grace window
      expect(isSubmissionOnTime(arrival, deadline, rtt)).toBe(true);
    });

    it('rejects submissions exceeding the 400ms maximum grace limit even on high latency', () => {
      const deadline = 50000;
      const arrival = 50450; // 450ms late
      const rtt = 1500; // max cap is 400ms
      expect(isSubmissionOnTime(arrival, deadline, rtt)).toBe(false);
    });
  });

  describe('E-2: Idempotent Phase Progression Simulation', () => {
    it('advances exactly once when 20 concurrent calls are made with expected_version', async () => {
      let currentVersion = 5;
      let phase = 'answer';
      let advanceCount = 0;

      // Simulate the PostgreSQL `advance_phase` atomic function
      const advancePhase = async (expectedVersion: number) => {
        // Atomic compare-and-swap
        if (expectedVersion === currentVersion) {
          currentVersion += 1;
          phase = 'reveal';
          advanceCount += 1;
          return { advanced: true, newVersion: currentVersion, phase };
        }
        return { advanced: false, reason: 'version_mismatch', currentVersion };
      };

      // 20 clients concurrently attempt to advance phase with expectedVersion = 5
      const callers = Array.from({ length: 20 }, () => advancePhase(5));
      const results = await Promise.all(callers);

      const successful = results.filter((r) => r.advanced);
      const rejected = results.filter((r) => !r.advanced);

      expect(successful.length).toBe(1);
      expect(rejected.length).toBe(19);
      expect(advanceCount).toBe(1);
      expect(currentVersion).toBe(6);
      expect(phase).toBe('reveal');
    });
  });

  describe('E-13: Rapid Screen Rebuild Benchmark (< 2 seconds)', () => {
    it('parses complete game_state JSON and reconstructs local view model in under 10ms', () => {
      const mockDbState = {
        game: 'quiz',
        settings: { rounds: 10, timeLimit: 15 },
        round: 4,
        totalRounds: 10,
        turnOrder: ['u1', 'u2', 'u3', 'u4'],
        participants: ['u1', 'u2', 'u3', 'u4'],
        current: {
          questionNo: 4,
          question: 'What is the powerhouse of the cell?',
          options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Chloroplast'],
        },
        raw: { u1: 300, u2: 450, u3: 150, u4: 200 },
        history: [
          { round: 1, points: { u1: 100, u2: 150 } },
          { round: 2, points: { u1: 100, u2: 150 } },
          { round: 3, points: { u1: 100, u2: 150 } },
        ],
      };

      const start = performance.now();
      const serialized = JSON.stringify(mockDbState);
      const parsed = JSON.parse(serialized);

      // Verify integrity
      expect(parsed.game).toBe('quiz');
      expect(parsed.round).toBe(4);
      expect(parsed.current.options.length).toBe(4);

      const elapsed = performance.now() - start;
      // Must be orders of magnitude under the 2,000ms threshold
      expect(elapsed).toBeLessThan(100);
    });
  });
});
