// Tests for LocationService's FORGE-009c pipeline hardening. Field test #2:
// blue location pill on for an 11-min locked walk, yet route_points = 1 —
// locations were dying somewhere between the TaskManager task and
// RouteTracker. These pin the guarantees that make test #3 diagnosable:
// the point is recorded BEFORE any consumer code runs, a throwing consumer
// can't cost a point, every hop is counted, and the start mode/error
// survive to analytics.

import { LocationService, ROUTE_LOCATION_TASK } from '../LocationService';
import RouteTracker from '../RouteTracker';

jest.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  ActivityType: { Fitness: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));

const Location = require('expo-location');
const TaskManager = require('expo-task-manager');

// defineTask fires once, at module import — capture before any
// jest.clearAllMocks() wipes the recorded call.
const taskRegistration = TaskManager.defineTask.mock.calls.find(
  (c) => c[0] === 'strdr-route-location'
);

const rawLocation = (i, timestamp) => ({
  coords: {
    latitude: 37.77 + i * 0.0001,
    longitude: -122.42,
    altitude: 10,
    accuracy: 5,
    speed: 1.5,
  },
  timestamp,
});

describe('LocationService (FORGE-009c pipeline)', () => {
  let service;

  beforeEach(() => {
    service = new LocationService();
    RouteTracker.start(); // fresh singleton recording session
    RouteTracker.updateCadence(170);
    Location.requestForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Location.startLocationUpdatesAsync.mockResolvedValue(undefined);
    Location.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });
    Location.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
    Location.stopLocationUpdatesAsync.mockResolvedValue(undefined);
  });

  afterEach(() => {
    RouteTracker.stop();
    RouteTracker.points = [];
    jest.clearAllMocks();
  });

  test('the module registers the background task at load time', () => {
    // defineTask must run on import (before any start), with our task name.
    expect(taskRegistration).toBeDefined();
    expect(taskRegistration[0]).toBe(ROUTE_LOCATION_TASK);
    expect(taskRegistration[1]).toBeInstanceOf(Function);
  });

  test('point is recorded even when the consumer callback throws', async () => {
    const explosive = jest.fn(() => {
      throw new Error('TerrainDetector exploded');
    });
    await service.startTracking(explosive);

    service.handleLocationUpdate(rawLocation(0, 1000));
    service.handleLocationUpdate(rawLocation(1, 6000));

    expect(RouteTracker.points).toHaveLength(2); // recorded FIRST, both times
    expect(explosive).toHaveBeenCalledTimes(2);
    expect(service.counters.routePointsAdded).toBe(2);
    expect(service.counters.callbackErrors).toBe(2);
    expect(service.counters.firstError).toContain('TerrainDetector exploded');
  });

  test('background task deliveries are counted and fed through the same pipeline', async () => {
    await service.startTracking(jest.fn());

    // Simulate the OS delivering two batches to the singleton's task. The
    // module-level task routes to the module singleton, so mirror it here.
    service.handleBackgroundLocations([rawLocation(0, 1000), rawLocation(1, 6000)]);
    service.handleBackgroundLocations([rawLocation(2, 11000)]);
    expect(taskRegistration[1]).toBeInstanceOf(Function); // wiring exists at load

    expect(service.counters.taskDeliveries).toBe(2);
    expect(service.counters.taskLocationsReceived).toBe(3);
    expect(service.counters.routePointsAdded).toBe(3);
    expect(RouteTracker.points).toHaveLength(3);
  });

  test('points arriving while the tracker is not recording count as dropped', async () => {
    await service.startTracking(jest.fn());
    RouteTracker.stop(); // e.g. a straggler delivery after workout end

    service.handleLocationUpdate(rawLocation(0, 1000));
    expect(service.counters.routePointsAdded).toBe(0);
    expect(service.counters.routePointsDropped).toBe(1);
  });

  test('background start failure is captured and the watcher fallback engages', async () => {
    Location.startLocationUpdatesAsync.mockRejectedValue(
      new Error('TaskManager module not found')
    );
    await service.startTracking(jest.fn());

    expect(service.trackingMode).toBe('foreground');
    expect(service.lastStartError).toContain('TaskManager module not found');
    expect(Location.watchPositionAsync).toHaveBeenCalledTimes(1);
  });

  test('successful background start reports its mode and no error', async () => {
    await service.startTracking(jest.fn());
    expect(service.trackingMode).toBe('background');
    expect(service.lastStartError).toBeNull();
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
  });

  test('counters survive stopTracking (analytics read them after stop)', async () => {
    await service.startTracking(jest.fn());
    service.handleLocationUpdate(rawLocation(0, 1000));
    await service.stopTracking();

    expect(service.trackingMode).toBeNull(); // reset — which is why the
    expect(service.counters.routePointsAdded).toBe(1); // screen snapshots mode at start
  });

  test('getPermissionLevel maps background/foreground/denied', async () => {
    Location.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    expect(await service.getPermissionLevel()).toBe('always');

    Location.getBackgroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'granted' });
    expect(await service.getPermissionLevel()).toBe('whenInUse');

    Location.getForegroundPermissionsAsync.mockResolvedValue({ status: 'denied' });
    expect(await service.getPermissionLevel()).toBe('denied');
  });
});
