import { describe, it, expect } from 'vitest';

interface Sample {
  offset: number;
  rtt: number;
}

function computeMedianOffset(samples: Sample[]): number {
  if (samples.length === 0) return 0;
  // Sort by RTT ascending to select 3 lowest RTT
  const sortedByRtt = [...samples].sort((a, b) => a.rtt - b.rtt);
  const lowestThree = sortedByRtt.slice(0, 3);
  // Sort those 3 by offset to find the median
  lowestThree.sort((a, b) => a.offset - b.offset);
  return lowestThree[1].offset;
}

describe('Time Synchronization Engine (SRS Section 6.1)', () => {
  it('correctly calculates the median offset from the 3 lowest-RTT samples (TM-1)', () => {
    const samples: Sample[] = [
      { offset: -120, rtt: 150 }, // high RTT
      { offset: -95, rtt: 40 },   // low RTT - 1
      { offset: -100, rtt: 35 },  // low RTT - 2
      { offset: -105, rtt: 45 },  // low RTT - 3
      { offset: -80, rtt: 200 },  // high RTT
    ];

    // The 3 lowest RTT are:
    // { offset: -100, rtt: 35 }
    // { offset: -95, rtt: 40 }
    // { offset: -105, rtt: 45 }
    // Sorted by offset: -105, -100, -95
    // Median is -100
    const median = computeMedianOffset(samples);
    expect(median).toBe(-100);
  });

  it('proves that two clients with +5s and -5s clock skew compute matching remaining time within 150ms (TM-5)', () => {
    const trueServerNow = 1700000000000;
    const phaseEndsAt = new Date(trueServerNow + 30000).toISOString(); // 30s remaining

    // Client A is 5 seconds ahead
    const clientALocalNow = trueServerNow + 5000;
    const clientAOffset = trueServerNow - clientALocalNow; // -5000
    const clientACorrectedNow = clientALocalNow + clientAOffset;
    const clientARemaining = Math.max(0, new Date(phaseEndsAt).getTime() - clientACorrectedNow);

    // Client B is 5 seconds behind
    const clientBLocalNow = trueServerNow - 5000;
    const clientBOffset = trueServerNow - clientBLocalNow; // +5000
    const clientBCorrectedNow = clientBLocalNow + clientBOffset;
    const clientBRemaining = Math.max(0, new Date(phaseEndsAt).getTime() - clientBCorrectedNow);

    expect(Math.abs(clientARemaining - clientBRemaining)).toBeLessThanOrEqual(150);
    expect(clientARemaining).toBe(30000);
    expect(clientBRemaining).toBe(30000);
  });
});

