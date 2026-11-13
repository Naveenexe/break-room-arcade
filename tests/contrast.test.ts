import { describe, it, expect } from 'vitest';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return [r, g, b];
}

function channelLuminance(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * channelLuminance(r) +
    0.7152 * channelLuminance(g) +
    0.0722 * channelLuminance(b)
  );
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const brighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (brighter + 0.05) / (darker + 0.05);
}

describe('SRS v2 Section 5.2 Contrast Audit (WCAG AA Compliance)', () => {
  describe('Dark Theme ("Rooftop night")', () => {
    const bg = '#0A2E36';
    const surface = '#11414B';
    const surfaceRaised = '#18535F';
    const text = '#F2FBF8';
    const textMuted = '#9CC9C6';
    const primary = '#FFB627';
    const ink = '#06222A';

    it('primary text on bg has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(text, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('primary text on surface has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(text, surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('primary text on surface-raised has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(text, surfaceRaised);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('text-muted on bg has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(textMuted, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('ink text on primary button (Marigold) has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(ink, primary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('Light Theme ("Rooftop day")', () => {
    const bg = '#F1FAF7';
    const surface = '#FFFFFF';
    const text = '#0B2A31';
    const textMuted = '#4C7078';
    const primary = '#F2A100';
    const ink = '#06222A';

    it('primary text on bg has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(text, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('primary text on surface has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(text, surface);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('text-muted on bg has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(textMuted, bg);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });

    it('ink text on light theme primary button has contrast >= 4.5:1', () => {
      const ratio = contrastRatio(ink, primary);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });
});

