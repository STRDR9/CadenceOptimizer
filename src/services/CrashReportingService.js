// Crash & Error Reporting Service
// Captures JS errors and unhandled promise rejections locally
// Review reports via the in-app feedback/debug screen

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@strdr_crash_reports';
const MAX_REPORTS = 50;

class CrashReportingService {
  constructor() {
    this.isInitialized = false;
  }

  initialize() {
    if (this.isInitialized) return;

    try {
      // Capture unhandled JS errors
      if (typeof ErrorUtils !== 'undefined') {
        const originalHandler = ErrorUtils.getGlobalHandler();
        ErrorUtils.setGlobalHandler((error, isFatal) => {
          this.captureError(error, { isFatal, source: 'global_handler' });
          if (originalHandler) {
            originalHandler(error, isFatal);
          }
        });
      }
    } catch (e) {
      // ErrorUtils not available
    }

    this.isInitialized = true;
  }

  async captureError(error, context = {}) {
    try {
      const report = {
        id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
        timestamp: new Date().toISOString(),
        message: error?.message || String(error),
        stack: error?.stack || null,
        context,
      };

      const existing = await this.getReports();
      const updated = [report, ...existing].slice(0, MAX_REPORTS);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      // Can't do much if crash reporting itself fails
    }
  }

  async getReports() {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  async clearReports() {
    await AsyncStorage.removeItem(STORAGE_KEY);
  }

  async getReportsSummary() {
    const reports = await this.getReports();
    return {
      total: reports.length,
      fatal: reports.filter(r => r.context?.isFatal).length,
      latest: reports[0] || null,
    };
  }
}

export default new CrashReportingService();
