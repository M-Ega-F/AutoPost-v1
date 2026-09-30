function pluralize(value: number, singular: string): string {
  return `${value} ${singular}${value === 1 ? "" : "s"}`;
}

export function formatLoginCooldown(seconds: number): string {
  const remaining = Math.max(0, Math.ceil(seconds));
  if (remaining === 0) return "";
  if (remaining < 60) return pluralize(remaining, "second");

  const minutes = Math.floor(remaining / 60);
  const secondsAfterMinutes = remaining % 60;
  return secondsAfterMinutes === 0
    ? pluralize(minutes, "minute")
    : `${pluralize(minutes, "minute")} ${pluralize(secondsAfterMinutes, "second")}`;
}

export function formatLoginCooldownMessage(seconds: number): string {
  if (seconds <= 0) return "Too many login attempts. Please try again later.";
  return `Too many login attempts. Please try again in ${formatLoginCooldown(seconds)}.`;
}

export function formatLoginCooldownClock(seconds: number): string {
  const remaining = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(remaining / 60);
  const secondsAfterMinutes = remaining % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secondsAfterMinutes).padStart(2, "0")}`;
}
