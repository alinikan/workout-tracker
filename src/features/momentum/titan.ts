import {
  addDays,
  currentJourney,
  makeJourney,
  sortedSlots,
  weekOf,
  weekday,
} from "./plan.ts";
import { type MomentumData } from "./types.ts";

/** Public catalogue facts, checked against Titan's own PDF and enrollment page.
 * Prices exclude unverified taxes/fees. Never treat a planned visit as a booking. */
export const titan = {
  name: "Titan Training Centre",
  address: "910 Sherwood Ave, Coquitlam",
  checked: "2026-10-25",
  pricing:
    "https://titantrainingcentre.com/wp-content/uploads/2026/06/Titan-Training-Centre-Pricing.pdf",
  catalogue: "https://titanmma.sites.zenplanner.com/sign-up-now.cfm",
  schedule:
    "https://titantrainingcentre.com/wp-content/uploads/2026/06/Titan-Training-Centre-Schedule-2026-2.pdf",
  program: "https://titantrainingcentre.com/program/muay-thai-classes/",
  pass: 300,
  credits: 10,
  dropIn: 50,
  monthly: 210,
  sixMonth: 180,
  annual: 150,
  week: 100,
} as const;
export const introName = "Introduction to Muay Thai / Kickboxing";
export const beginnerName = "Muay Thai Kickboxing (Beginners / Intermediate)";
export function classFor(data: MomentumData, date: string) {
  const journey = currentJourney(data);
  if (journey?.planVersion === "home-trial-90") return {
    name: "Muay Thai / Kickboxing trial", room: "Confirm the room with Titan",
    time: journey.trial?.date === date ? journey.trial.time : "",
  };
  const beginner =
    data.profile.classStage === "beginner" &&
    Boolean(
      data.profile.classSwitchDate && date >= data.profile.classSwitchDate,
    );
  return {
    name: beginner ? beginnerName : introName,
    room: beginner ? "Room #1 · Main Room" : "Room #2 · Front Entrance",
    time: "18:15",
  };
}
/** Compare marginal credit use with monthly billing, not a misleading cash total.
 * The pass is recommended only if its expiry and class eligibility fit the user. */
export function membershipEstimate(visits: number) {
  const count = Math.max(0, Math.floor(Number.isFinite(visits) ? visits : 0));
  return {
    visits: count,
    creditValue: (count * titan.pass) / titan.credits,
    monthly: titan.monthly,
    cheaper: count >= 8 ? ("monthly" as const) : ("pass" as const),
    equal: count === 7,
  };
}
export function passCashCost(paidVisits: number) {
  const n = Math.max(0, Math.floor(paidVisits));
  // Buy only fully used ten-packs, then compare drop-ins with one more pack.
  const packs = Math.floor(n / 10),
    remaining = n % 10;
  return packs * 300 + Math.min(remaining * 50, remaining ? 300 : 0);
}
export function firstWednesday(start: string) {
  return addDays(start, (3 - weekday(start) + 7) % 7);
}

/** Idempotent extension, not a reset: keep IDs and all private records. Past,
 * booked and partially worked slots retain their original prescription. Nothing
 * is marked attended, paid or booked. Exact personal dates are runtime data. */
export function upgradeTitan(
  data: MomentumData,
  today: string,
  firstClass?: string,
): MomentumData {
  const j = currentJourney(data);
  if (!j || j.planVersion === "titan-90") return data;
  const template = makeJourney(j.startedOn, j.id, j.createdAt);
  const preserved = sortedSlots(j).filter(
    (s) =>
      s.date < today ||
      Boolean(
        j.logs[s.id]?.outcome ||
        j.logs[s.id]?.booked ||
        Object.values(j.logs[s.id]?.sets ?? {}).some(
          (e) => e.done || e.skipped || e.weight || e.reps,
        ),
      ),
  );
  // Keep an already-started legacy week's rhythm together. Otherwise a saved
  // Friday class and the replacement Wednesday could become two appointments.
  const protectedWeeks = new Set(preserved.map((s) => weekOf(s.day)));
  const retained = sortedSlots(j).filter((s) =>
    protectedWeeks.has(weekOf(s.day)),
  );
  const slots = {
    ...template.slots,
    ...Object.fromEntries(retained.map((s) => [s.id, { ...s, legacy: true }])),
  };
  // Repeated weeks have independent IDs; never discard them during an upgrade.
  for (const s of sortedSlots(j))
    if (!/^day-\d+$/.test(s.id)) slots[s.id] = { ...s, legacy: true };
  const classDate = firstClass ?? firstWednesday(j.startedOn);
  return {
    ...data,
    profile: {
      ...data.profile,
      gymId: "titan",
      discipline: "muay-thai",
      className: introName,
      classWeekday: 3,
      classTime: "18:15",
      nextClassDate: classDate,
      classStage: "introduction",
      classSwitchDate: "",
    },
    journeys: {
      ...data.journeys,
      [j.id]: { ...j, slots, planVersion: "titan-90" },
    },
  };
}
