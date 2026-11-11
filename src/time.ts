const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 minutes ago" / "vor 3 Minuten"; "just now" for anything under a minute. */
export function formatRelativeTime(date: Date, language: string, now = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  const formatter = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const abs = Math.abs(seconds);
  for (const [unit, size] of UNITS) {
    if (abs >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return formatter.format(0, "second");
}

export type DueState = "overdue" | "today" | "upcoming";

export interface DueInfo {
  date: Date;
  /** A to-do due on a day ("2026-11-07") rather than at a time. */
  allDay: boolean;
  state: DueState;
  text: string;
}

const DAY_MS = 24 * 3600 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** Reads a to-do item's `due`: a date ("2026-11-07", local day) or a date and time (ISO 8601). */
export function parseDue(value: string | undefined): { date: Date; allDay: boolean } | null {
  if (!value) return null;
  const day = DATE_ONLY.exec(value.trim());
  if (day) {
    const date = new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]));
    return Number.isNaN(date.getTime()) ? null : { date, allDay: true };
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { date, allDay: false };
}

/** "Today", "Tomorrow 18:00", "Fri, 7 Nov" – and whether the item is overdue. */
export function describeDue(value: string | undefined, language: string, now = new Date()): DueInfo | null {
  const due = parseDue(value);
  if (!due) return null;
  const { date, allDay } = due;
  const days = Math.round((startOfDay(date) - startOfDay(now)) / DAY_MS);
  const overdue = allDay ? days < 0 : date.getTime() < now.getTime();
  const state: DueState = overdue ? "overdue" : days === 0 ? "today" : "upcoming";
  let text: string;
  if (Math.abs(days) <= 1) {
    text = new Intl.RelativeTimeFormat(language, { numeric: "auto" }).format(days, "day");
    text = text.charAt(0).toLocaleUpperCase(language) + text.slice(1);
  } else {
    const options: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" };
    if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
    text = new Intl.DateTimeFormat(language, options).format(date);
  }
  if (!allDay) text += ` ${new Intl.DateTimeFormat(language, { hour: "2-digit", minute: "2-digit" }).format(date)}`;
  return { date, allDay, state, text };
}

/** Open items by due date, earliest first; items without one keep their order at the end. */
export function sortByDue<T extends { due?: string }>(items: T[]): T[] {
  const time = (item: T) => parseDue(item.due)?.date.getTime() ?? Number.POSITIVE_INFINITY;
  return items
    .map((item, index) => ({ item, index, at: time(item) }))
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map(({ item }) => item);
}

const pad = (value: number) => String(value).padStart(2, "0");

/** A to-do item's due date as the values of a date and a time field (local time; no time for all-day items). */
export function dueFields(value: string | undefined): { date: string; time: string } {
  const due = parseDue(value);
  if (!due) return { date: "", time: "" };
  const { date, allDay } = due;
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: allDay ? "" : `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

/**
 * The todo.update_item fields for a changed due date: `due_date` for a day, `due_datetime` with a time,
 * null to clear it. `byDate` says whether the list takes a bare date; without it a day starts at midnight.
 */
export function dueChange(
  original: { date: string; time: string },
  date: string,
  time: string,
  byDate: boolean,
): Record<string, string | null> {
  if (date === original.date && time === original.time) return {};
  if (!date) {
    if (!original.date) return {};
    return byDate ? { due_date: null } : { due_datetime: null };
  }
  if (!time && byDate) return { due_date: date };
  return { due_datetime: `${date} ${time || "00:00"}:00` };
}
