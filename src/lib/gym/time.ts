import type { GymTimeZone, PhoneCountry } from "./types";

export const TIME_ZONE_OPTIONS: Array<{ value: GymTimeZone; label: string }> = [
  { value: "Asia/Kathmandu", label: "Nepal — Kathmandu (NPT)" },
  { value: "Asia/Kolkata", label: "India — Kolkata (IST)" },
  { value: "America/New_York", label: "USA — Eastern (New York)" },
  { value: "America/Chicago", label: "USA — Central (Chicago)" },
  { value: "America/Denver", label: "USA — Mountain (Denver)" },
  { value: "America/Los_Angeles", label: "USA — Pacific (Los Angeles)" },
];

const DEFAULT_TIME_ZONE_BY_COUNTRY: Record<PhoneCountry, GymTimeZone> = {
  nepal: "Asia/Kathmandu",
  india: "Asia/Kolkata",
  usa: "America/New_York",
};
const VALID_TIME_ZONES = new Set<string>(TIME_ZONE_OPTIONS.map(({ value }) => value));

let activeTimeZone: GymTimeZone = DEFAULT_TIME_ZONE_BY_COUNTRY.india;

export function defaultTimeZoneForCountry(country?: PhoneCountry): GymTimeZone {
  return DEFAULT_TIME_ZONE_BY_COUNTRY[country ?? "india"] ?? DEFAULT_TIME_ZONE_BY_COUNTRY.india;
}

export function resolveTimeZone(timeZone?: GymTimeZone, country?: PhoneCountry): GymTimeZone {
  return timeZone && VALID_TIME_ZONES.has(timeZone) ? timeZone : defaultTimeZoneForCountry(country);
}

export function configureTimeZone(timeZone?: GymTimeZone, country?: PhoneCountry) {
  activeTimeZone = resolveTimeZone(timeZone, country);
}

export function currentTimeZone() {
  return activeTimeZone;
}

export function formatTime(value: string | Date, options: Intl.DateTimeFormatOptions = {}) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    ...options,
    timeZone: activeTimeZone,
  }).format(date);
}

export function minutesSinceMidnight(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: activeTimeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return Number.isInteger(hour) && Number.isInteger(minute) ? hour * 60 + minute : null;
}
