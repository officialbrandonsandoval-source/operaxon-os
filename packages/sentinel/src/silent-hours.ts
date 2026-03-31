// Copyright (c) 2026 Operaxon Inc. All rights reserved.
// Licensed under the Operaxon Proprietary License. See LICENSE-PROPRIETARY.

import type { SilentHoursConfig } from '@operaxon/types';

/**
 * Manages silent hours — periods when the sentinel suppresses non-critical actions.
 * Respects timezone configuration and supports temporary overrides for critical events.
 */
export class SilentHoursManager {
  private config: SilentHoursConfig;
  private overrideUntil: Date | null = null;

  constructor(config: SilentHoursConfig) {
    this.config = config;
  }

  /**
   * Update the silent hours configuration at runtime.
   */
  updateConfig(config: SilentHoursConfig): void {
    this.config = config;
  }

  /**
   * Check whether the current moment falls within configured silent hours.
   * Returns false if silent hours are disabled or if an override is active.
   */
  isInSilentHours(now?: Date): boolean {
    if (!this.config.enabled) return false;

    const currentTime = now ?? new Date();

    // If a critical override is active and hasn't expired, silent hours are bypassed
    if (this.overrideUntil !== null && currentTime < this.overrideUntil) {
      return false;
    }

    // Clear expired overrides
    if (this.overrideUntil !== null && currentTime >= this.overrideUntil) {
      this.overrideUntil = null;
    }

    const localTimeStr = currentTime.toLocaleTimeString('en-GB', {
      timeZone: this.config.timezone,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
    });

    const currentMinutes = timeStringToMinutes(localTimeStr);
    const startMinutes = timeStringToMinutes(this.config.start);
    const endMinutes = timeStringToMinutes(this.config.end);

    // Handle ranges that cross midnight (e.g. 22:00 → 07:00)
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  /**
   * Temporarily override silent hours for critical actions.
   * @param durationMs How long the override lasts in milliseconds.
   */
  overrideForCritical(durationMs: number): void {
    this.overrideUntil = new Date(Date.now() + durationMs);
  }

  /**
   * Cancel any active override, restoring normal silent hours behavior.
   */
  cancelOverride(): void {
    this.overrideUntil = null;
  }

  /**
   * Returns whether an override is currently active.
   */
  isOverrideActive(): boolean {
    if (this.overrideUntil === null) return false;
    return new Date() < this.overrideUntil;
  }
}

/**
 * Parse a "HH:MM" string into total minutes since midnight.
 */
function timeStringToMinutes(time: string): number {
  const [hoursStr, minutesStr] = time.split(':');
  const hours = parseInt(hoursStr ?? '0', 10);
  const minutes = parseInt(minutesStr ?? '0', 10);
  return hours * 60 + minutes;
}
