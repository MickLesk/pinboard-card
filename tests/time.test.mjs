// Due dates of to-do items: parsing, wording and sorting, bundled on the fly like the QR module.
import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundled = await build({
  entryPoints: [new URL("../src/time.ts", import.meta.url).pathname],
  bundle: true,
  format: "esm",
  write: false,
  platform: "neutral",
});
const { describeDue, dueChange, dueFields, parseDue, sortByDue } = await import(
  `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`
);

const now = new Date(2026, 10, 4, 15, 30); // Wednesday, 4 November 2026, 15:30 local time

test("dates are local days, date-times keep their time", () => {
  const day = parseDue("2026-11-07");
  assert.equal(day.allDay, true);
  assert.deepEqual([day.date.getFullYear(), day.date.getMonth(), day.date.getDate(), day.date.getHours()], [2026, 10, 7, 0]);
  const at = parseDue(new Date(2026, 10, 7, 18, 0).toISOString());
  assert.equal(at.allDay, false);
  assert.equal(at.date.getHours(), 18);
  assert.equal(parseDue(""), null);
  assert.equal(parseDue("not a date"), null);
});

test("due dates read as today, tomorrow or a short date, and overdue ones say so", () => {
  assert.deepEqual(
    [describeDue("2026-11-04", "en", now).text, describeDue("2026-11-04", "en", now).state],
    ["Today", "today"],
  );
  assert.equal(describeDue("2026-11-05", "en", now).text, "Tomorrow");
  assert.equal(describeDue("2026-11-05", "de", now).text, "Morgen");
  assert.equal(describeDue("2026-11-03", "en", now).state, "overdue");
  assert.equal(describeDue("2026-11-09", "en", now).state, "upcoming");
  assert.match(describeDue("2026-11-09", "en", now).text, /Mon.*9.*Nov|Mon.*Nov.*9/);
  assert.match(describeDue("2027-01-09", "en", now).text, /2027/);
  // Earlier today at a time = overdue; later today = today.
  assert.equal(describeDue(new Date(2026, 10, 4, 9, 0).toISOString(), "en", now).state, "overdue");
  const later = describeDue(new Date(2026, 10, 4, 18, 0).toISOString(), "en", now);
  assert.equal(later.state, "today");
  assert.match(later.text, /^Today 0?6:00|^Today 18:00/);
});

test("sorting by due date puts the earliest first and undated items last, in their order", () => {
  const items = [
    { uid: "a" },
    { uid: "b", due: "2026-11-09" },
    { uid: "c" },
    { uid: "d", due: "2026-11-03" },
    { uid: "e", due: new Date(2026, 10, 5, 8).toISOString() },
  ];
  assert.deepEqual(sortByDue(items).map((i) => i.uid), ["d", "e", "b", "a", "c"]);
});

test("due fields read back a date and a time, and only changes are sent", () => {
  assert.deepEqual(dueFields(undefined), { date: "", time: "" });
  assert.deepEqual(dueFields("2026-11-07"), { date: "2026-11-07", time: "" });
  assert.deepEqual(dueFields(new Date(2026, 10, 7, 18, 5).toISOString()), { date: "2026-11-07", time: "18:05" });

  const day = { date: "2026-11-07", time: "" };
  assert.deepEqual(dueChange(day, "2026-11-07", "", true), {});
  assert.deepEqual(dueChange(day, "2026-11-09", "", true), { due_date: "2026-11-09" });
  assert.deepEqual(dueChange(day, "2026-11-09", "07:30", true), { due_datetime: "2026-11-09 07:30:00" });
  assert.deepEqual(dueChange(day, "", "", true), { due_date: null });
  assert.deepEqual(dueChange(day, "", "", false), { due_datetime: null });
  assert.deepEqual(dueChange({ date: "", time: "" }, "", "", true), {});
  // A list that only stores date and time gets midnight for a bare day.
  assert.deepEqual(dueChange({ date: "", time: "" }, "2026-11-09", "", false), { due_datetime: "2026-11-09 00:00:00" });
});
