// Route Tracker Service
// Records GPS coordinates and cadence during workouts
// Calculates distance, pace, and per-split cadence stats

class RouteTracker {
  constructor() {
    this.isRecording = false;
    this.points = []; // { latitude, longitude, altitude, timestamp, cadence }
    this.startTime = null;
    this.currentCadence = 0;
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
    this.currentCadence = 0;
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

  updateCadence(cadence) {
    this.currentCadence = cadence;
  }

  addPoint(location) {
    if (!this.isRecording) return;
    
    const point = {
      latitude: location.latitude,
      longitude: location.longitude,
      altitude: location.altitude || 0,
      timestamp: location.timestamp || Date.now(),
      cadence: this.currentCadence,
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
        const cadences = splitPoints.filter(p => p.cadence > 0).map(p => p.cadence);
        const avgCadence = cadences.length > 0
          ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length)
          : 0;
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
          splitCadence: avgCadence,
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

  // Average cadence across all points
  getAverageCadence() {
    const withCadence = this.points.filter(p => p.cadence > 0);
    if (withCadence.length === 0) return 0;
    const sum = withCadence.reduce((acc, p) => acc + p.cadence, 0);
    return Math.round(sum / withCadence.length);
  }

  // Per-split stats (per km or per mile)
  getSplits(unitMeters = 1000) {
    if (this.points.length < 2) return [];

    const splits = [];
    let splitDistance = 0;
    let splitStartIndex = 0;
    let splitNumber = 1;
    let cumulativeDistance = 0;

    for (let i = 1; i < this.points.length; i++) {
      const segDist = this._distanceBetween(this.points[i - 1], this.points[i]);
      splitDistance += segDist;
      cumulativeDistance += segDist;

      if (splitDistance >= unitMeters) {
        const splitPoints = this.points.slice(splitStartIndex, i + 1);
        const cadences = splitPoints.filter(p => p.cadence > 0).map(p => p.cadence);
        const avgCadence = cadences.length > 0
          ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length)
          : 0;

        const splitTime = (this.points[i].timestamp - this.points[splitStartIndex].timestamp) / 1000;
        const paceSecondsPerUnit = splitDistance > 0 ? (splitTime / splitDistance) * unitMeters : 0;

        splits.push({
          number: splitNumber,
          distance: splitDistance,
          duration: splitTime,
          avgCadence,
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
      const cadences = splitPoints.filter(p => p.cadence > 0).map(p => p.cadence);
      const avgCadence = cadences.length > 0
        ? Math.round(cadences.reduce((a, b) => a + b, 0) / cadences.length)
        : 0;
      const splitTime = (this.points[this.points.length - 1].timestamp - this.points[splitStartIndex].timestamp) / 1000;
      const paceSecondsPerUnit = splitDistance > 0 ? (splitTime / splitDistance) * unitMeters : 0;

      splits.push({
        number: splitNumber,
        distance: splitDistance,
        duration: splitTime,
        avgCadence,
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
      avgCadence: this.getAverageCadence(),
      splitsKm: this.getSplits(1000),
      splitsMi: this.getSplits(1609.34),
      startTime: this.startTime,
    };
  }
}

export default new RouteTracker();
