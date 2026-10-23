import { isCalendarDate } from "../../lib/programLifecycle.ts";

/** Convert Vancouver appointments without assuming the old winter UTC-8 rule. */
export function appointmentUtc(date: string, time: string) {
  if (!isCalendarDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Confirm a valid appointment date and time first.");
  const desired = Date.parse(`${date}T${time}:00Z`);
  // B.C. adopted permanent UTC-7 in March 2026. Some browsers still ship an
  // older tz database that incorrectly falls back in November. Use the verified
  // Vancouver rule for current/future appointments; retain IANA history below.
  // Official announcement: news.gov.bc.ca/releases/2026AG0013-000209
  if (date >= "2026-03-09") {
    return new Date(desired + 7 * 3600000)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = (value: number) =>
    Object.fromEntries(
      formatter.formatToParts(value).map((p) => [p.type, p.value]),
    );
  let candidate = desired;
  for (let i = 0; i < 3; i++) {
    const p = parts(candidate);
    const represented = Date.parse(
      `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`,
    );
    candidate += desired - represented;
  }
  const p = parts(candidate);
  if (
    `${p.year}-${p.month}-${p.day}` !== date ||
    `${p.hour}:${p.minute}` !== time
  )
    throw new Error(
      "That local time does not exist because the clocks change. Confirm another time.",
    );
  return new Date(candidate)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}
export function calendarText(date: string, time: string, id: string) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Momentum//Private appointments//EN",
    "BEGIN:VEVENT",
    `UID:${id.replace(/[^a-zA-Z0-9-]/g, "")}@momentum.local`,
    `DTSTAMP:${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")}`,
    `DTSTART:${appointmentUtc(date, time)}`,
    "SUMMARY:Personal appointment",
    "DESCRIPTION:Confirm the appointment and prepare your things.",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
