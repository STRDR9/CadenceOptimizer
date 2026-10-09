// Regression test (2026-10-08): processLocation() called calculateDistance /
// calculateGrade / classifyTerrain through `this`, but they are STATIC, and the
// module exports a singleton instance -> "undefined is not a function" on every
// GPS update after the second. Field test build 27: 30 of 31 location callbacks
// threw. Before FORGE-009c this also cost every route point (the point was
// recorded after the crash), and "Adjust beat on hills" never worked.
import terrainDetector, { TerrainDetector } from '../TerrainDetector';

const at = (lat, lon, altitude, t) => ({ latitude: lat, longitude: lon, altitude, timestamp: t });

describe('TerrainDetector singleton instance', () => {
  beforeEach(() => {
    if (typeof terrainDetector.reset === 'function') terrainDetector.reset();
  });

  it('processes a moving GPS track without throwing', () => {
    // ~11 m per step north, climbing 1 m per step (~9% grade)
    const pts = [0, 1, 2, 3, 4].map((i) => at(47.6 + i * 0.0001, -122.3, 10 + i, 1000 * i));
    const history = [];
    expect(() => {
      for (const p of pts) {
        history.push(p);
        terrainDetector.processLocation(p, history);
      }
    }).not.toThrow();
  });

  it('returns a classified terrain and numeric grade once it has two points', () => {
    const a = at(47.6, -122.3, 10, 0);
    const b = at(47.6001, -122.3, 11, 1000);
    const result = terrainDetector.processLocation(b, [a, b]);
    expect(['flat', 'uphill', 'downhill']).toContain(result.terrain);
    expect(typeof result.grade).toBe('number');
    expect(Number.isFinite(result.grade)).toBe(true);
  });

  it('keeps the static helpers working on the class', () => {
    expect(typeof TerrainDetector.calculateDistance).toBe('function');
    const d = TerrainDetector.calculateDistance(at(47.6, -122.3, 0, 0), at(47.6001, -122.3, 0, 0));
    expect(d).toBeGreaterThan(5);
    expect(d).toBeLessThan(20);
  });
});
