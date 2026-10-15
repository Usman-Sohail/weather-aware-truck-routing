// Reading and writing departure times the way a driver says them.

const SLOT_MINUTES = 15;

/**
 * Quarter-hour departures from ``earliest`` to midnight, which is as precise as an hourly
 * forecast can answer. ``chosen`` is kept even when it has just passed, so the control
 * always shows the time the driver picked.
 */
export function timeSlots(earliest: string, chosen: string): string[] {
  const first = Math.ceil(minutesOf(earliest) / SLOT_MINUTES) * SLOT_MINUTES;
  const slots: string[] = [];
  for (let minutes = first; minutes < 24 * 60; minutes += SLOT_MINUTES) {
    slots.push(timeOf(minutes));
  }
  if (chosen && !slots.includes(chosen)) slots.unshift(chosen);
  return slots;
}

function minutesOf(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function timeOf(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "06:30" reads as "6:30 AM", the way the rest of the app shows times. */
export function clockLabel(time: string): string {
  const minutes = minutesOf(time);
  const hours = Math.floor(minutes / 60);
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${String(minutes % 60).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

// "6:30 pm", "6 PM", "630pm", "18:30" and "1830" all mean the same departure.
const CLOCK = /^(\d{1,2})(?::?(\d{2}))?\s*([ap])\.?m?\.?$|^(\d{1,2}):?(\d{2})?$/i;

export function parseClock(text: string): string | null {
  const match = CLOCK.exec(text.trim());
  if (!match) return null;
  const [, half, halfMinutes, suffix, whole, wholeMinutes] = match;
  const hours = Number(half ?? whole);
  const minutes = Number(halfMinutes ?? wholeMinutes ?? 0);
  if (minutes > 59) return null;
  if (suffix) {
    if (hours < 1 || hours > 12) return null;
    return timeOf(((hours % 12) + (suffix.toLowerCase() === 'p' ? 12 : 0)) * 60 + minutes);
  }
  return hours > 23 ? null : timeOf(hours * 60 + minutes);
}
