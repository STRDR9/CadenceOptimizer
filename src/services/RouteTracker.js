// Route Tracker Service
// Records GPS coordinates and cadence during workouts
// Calculates distance, pace, and per-split cadence stats
//
// FORGE-009: every point carries BOTH cadences — targetCadence (what the
// metronome asked for) and measuredCadence (what the step sensor saw, null
// when unavailable). Points saved before FORGE-009 have a single `cadence`
// key (the target); normalizeRoutePoint() migrates them on read.

export class RouteTracker {
  constructor() {
    this.isRecording = false;
    this.points = []; // { latitude, longitude, altitude, timestamp, targetCadence, measuredCadence }
    this.startTime = null;
    this.currentTargetCadence = 0;
    this.currentMeasuredCadence = null;
    this.onSplitComplete = null; // callback when a split is completed
    this.splitUnit = 1000; // meters (1000 = km, 1609.34 = mile)
    this.lastSplitIndex = 0;
    this.lastSplitDistance = 0;
    this.completedSplits = 0;
    this.cumulativeDistance = 0;
  }

  start(splitUnit = 1000, onSplitComplete = null) {
    this.isRecording = true;
    this.points = [];
    this.startTime = Date.now();
    this.currentTargetCadence = 0;
    this.currentMeasuredCadence = null;
    this.onSplitComplete = onSplitComplete;
    this.splitUnit = splitUnit;
    this.lastSplitIndex = 0;
    this.lastSplitDistance = 0;
    this.completedSplits = 0;
    this.cumulativeDistance = 0;
  }

  stop() {
    this.isRecording = false;
    return this.getSummary();
  }

  // TARGET cadence (the metronome setting / workout phase). Name kept from
  // pre-FORGE-009 so existing call sites stay valid.
  updateCadence(cadence) {
    this.currentTargetCadence = cadence;
  }

  // MEASURED cadence from the step sensor (null when unavailable).
  updateMeasuredCadence(cadence) {
    this.currentMeasuredCadence = typeof cadence === 'number' ? cadence : null;
  }

  addPoint(location) {
    if (!this.isRecording) return;
    
    const point = {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude || 0,
      timestamp: location.timestamp || Date.now(),
      targetCadence: this.currentTargetCadence,
      measuredCadence: this.currentMeasuredCadence,
    };

    // Calculate distance from last point
    if (this.points.length > 0) {
      const lastPoint = this.points[this.points.length - 1];
      const segDist = this._distanceBetween(lastPoint, point);
      this.cumulativeDistance += segDist;

      // Check if we crossed a split boundary
      const distanceSinceLastSplit = this.cumulativeDistance - this.lastSplitDistance;
      if (distanceSinceLastSplit >= this.splitUnit && this.onSplitComplete) {
        this.completedSplits++;
        
        // Calculate split stats
        const splitPoints = this.points.slice(this.lastSplitIndex);
        const avgCadence = averageOf(splitPoints, 'targetCadence');
        const splitTime = (point.timestamp - this.points[this.lastSplitIndex].timestamp) / 1000;
        const paceSeconds = distanceSinceLastSplit > 0
          ? (splitTime / distanceSinceLastSplit) * this.splitUnit
          : 0;

        // Overall average pace
        const totalTime = (point.timestamp - this.points[0].timestamp) / 1000;
        const overallPace = this.cumulativeDistance > 0
          ? (totalTime / this.cumulativeDistance) * this.splitUnit
          : 0;

        this.onSplitComplete({
          splitNumber: this.completedSplits,
          splitTime,
          splitPace: paceSeconds,
          splitCadence: avgCadence, // target-based (legacy name)
          splitMeasuredCadence: averageOf(splitPoints, 'measuredCadence') || null,
          overallPace,
          totalDistance: this.cumulativeDistance,
        });

        this.lastSplitIndex = this.points.length;
        this.lastSplitDistance = this.cumulativeDistance;
      }
    }

    this.points.push(point);
  }

  // Haversine distance between two GPS points in meters
  _distanceBetween(p1, p2) {
    const R = 6371000;
    const dLat = (p2.latitude - p1.latitude) * Math.PI / 180;
    const dLon = (p2.longitude - p1.longitude) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(p1.latitude * Math.PI / 180) *
      Math.cos(p2.latitude * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Total distance in meters
  getTotalDistance() {
    let total = 0;
    for (let i = 1; i < this.points.length; i++) {
      total += this._distanceBetween(this.points[i - 1], this.points[i]);
    }
    return total;
  }

  // Get route coordinates for map polyline
  getRouteCoordinates() {
    return this.points.map(p => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }));
  }

  // Average TARGET cadence across all points (legacy name/semantics)
  getAverageCadence() {
    return averageOf(this.points, 'targetCadence');
  }

  // Average MEASURED cadence across all points (null when nothing measured)
  getAverageMeasuredCadence() {
    return averageOf(this.points, 'measuredCadence') || null;
  }

  // Per-split stats (per km or per mile)
  getSplits(unitMeters = 1000) {
    if (this.points.length < 2) return [];

    const splits = [];
    let splitDistance = 0;
    let splitStartIndex = 0;
    let splitNumber = 1;

    for (let i = 1; i < this.points.length; i++) {
      const segDist = this._distanceBetween(this.points[i - 1], this.points[i]);
      splitDistance += segDist;

      if (splitDistance >= unitMeters) {
        const splitPoints = this.points.slice(splitStartIndex, i + 1);
        const avgCadence = averageOf(splitPoints, 'targetCadence');

        const splitTime = (this.points[i].timestamp - this.points[splitStartIndex].timestamp) / 1000;
        const paceSecondsPerUnit = splitDistance > 0 ? (splitTime / splitDistance) * unitMeters : 0;

        splits.push({
          number: splitNumber,
          distance: splitDistance,
          duration: splitTime,
          avgCadence, // target-based (legacy name, kept for existing UI)
          targetCadence: avgCadence,
          measuredCadence: averageOf(splitPoints, 'measuredCadence') || null,
          pace: paceSecondsPerUnit, // seconds per km or mile
        });

        splitNumber++;
        splitDistance = 0;
        splitStartIndex = i;
      }
    }

    // Partial last split
    if (splitDistance > 100 && splitStartIndex < this.points.length - 1) {
      const splitPoints = this.points.slice(splitStartIndex);
      const avgCadence = averageOf(splitPoints, 'targetCadence');
      const splitTime = (this.points[this.points.length - 1].timestamp - this.points[splitStartIndex].timestamp) / 1000;
      const paceSecondsPerUnit = splitDistance > 0 ? (splitTime / splitDistance) * unitMeters : 0;

      splits.push({
        number: splitNumber,
        distance: splitDistance,
        duration: splitTime,
        avgCadence, // target-based (legacy name, kept for existing UI)
        targetCadence: avgCadence,
        measuredCadence: averageOf(splitPoints, 'measuredCadence') || null,
        pace: paceSecondsPerUnit,
        partial: true,
      });
    }

    return splits;
  }

  getSummary() {
    const totalDistance = this.getTotalDistance();
    const duration = this.points.length > 1
      ? (this.points[this.points.length - 1].timestamp - this.points[0].timestamp) / 1000
      : (Date.now() - (this.startTime || Date.now())) / 1000;

    return {
      points: this.points,
      route: this.getRouteCoordinates(),
      totalDistance,
      duration,
      avgCadence: this.getAverageCadence(), // target-based (legacy)
      avgMeasuredCadence: this.getAverageMeasuredCadence(),
      splitsKm: this.getSplits(1000),
      splitsMi: this.getSplits(1609.34),
      startTime: this.startTime,
    };
  }
}

// Mean of a positive numeric field over points; 0 when no point qualifies.
function averageOf(points, field) {
  const values = points
    .map((p) => p[field])
    .filter((v) => typeof v === 'number' && v > 0);
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Pure (FORGE-009): migrate a saved route point to the current shape.
 * Pre-009 points carry a single `cadence` key — that was the metronome
 * TARGET, so it maps to targetCadence; measuredCadence did not exist and
 * becomes null. Current-shape points pass through unchanged.
 */
export function normalizeRoutePoint(point) {
  if (!point) return null;
  return {
    latitude: point.latitude,
    longitude: point.longitude,
    altitude: point.altitude || 0,
    timestamp: point.timestamp,
    targetCadence: point.targetCadence ?? point.cadence ?? 0,
    measuredCadence: point.measuredCadence ?? null,
  };
}

/**
 * Pure (FORGE-009): cap a per-point series for persistence. Uniform stride,
 * always keeping the first and last points so the route's extent survives.
 */
export function downsamplePoints(points, maxPoints = 2000) {
  if (!Array.isArray(points) || points.length <= maxPoints) return points || [];
  const stride = Math.ceil(points.length / maxPoints);
  const out = [];
  for (let i = 0; i < points.length; i += stride) {
    out.push(points[i]);
  }
  if (out[out.length - 1] !== points[points.length - 1]) {
    out.push(points[points.length - 1]);
  }
  return out;
}

export default new RouteTracker();
