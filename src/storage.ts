/** Preferences are optional: corrupt values and full/disabled storage must not stop the app. */
export function readSaved<T>(key: string, fallback: T, valid: (value: unknown) => boolean = value => typeof value === typeof fallback): T {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || 'null');
    return valid(value) ? value as T : fallback;
  } catch { return fallback; }
}
export function savePreference(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
