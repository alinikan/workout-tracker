import type { ReactNode } from "react";

// Everything below describes generic software, not the owner's personal health
// history. Profile values live only in the separately authorized private record.
export type Activity =
  "walk" | "strength-a" | "strength-b" | "boxing" | "recovery" | "review";
export type Outcome = "planned" | "modified" | "missed" | "stopped";
export type MealSlot = "breakfast" | "lunch" | "snack" | "dinner";
export type DayPlan = {
  day: number;
  activity: Activity;
  title: string;
  minutes: string;
  steps: string[];
  task: string;
  enough: string;
  minimum: string;
};
export type Slot = { id: string; day: number; date: string; note?: string };
export type Readiness = {
  energy?: "low" | "normal" | "good";
  sleep?: "poor" | "okay" | "good";
  soreness?: "none" | "mild" | "significant";
  pain?: "none" | "mild" | "concerning";
  dizzy?: boolean;
};
export type SetEntry = {
  weight: string;
  reps: string;
  done: boolean;
  skipped?: boolean;
};
export type ActivityLog = {
  outcome?: Outcome;
  performedOn?: string;
  scheduledFor?: string;
  recordedAt?: string;
  plannedActivity?: Activity;
  plannedMinutes?: string;
  extraExercise?: string;
  plannedExerciseIds?: string[];
  classTime?: string;
  className?: string;
  gymId?: string;
  minutes: string;
  reason: string;
  effort: "" | "easy" | "manageable" | "hard";
  recovery: "" | "good" | "poor";
  enjoyment: "" | "yes" | "no";
  observed: boolean;
  booked: boolean;
  prepared: boolean;
  comfortable: boolean;
  note: string;
  readiness: Readiness;
  sets: Record<string, SetEntry>;
};
export type Review = {
  barrier: string;
  body: "" | "comfortable" | "difficult" | "symptoms";
  manageable: boolean;
  nextClass: string;
  easier: string;
  savedAt: string;
};
export type Adaptation = {
  mode: "steady" | "lighter" | "second-session" | "extra-set";
  exerciseId?: string;
  reason: string;
};
export type Profile = {
  goals: string[];
  activity: "sedentary" | "some";
  discipline: "boxing" | "kickboxing" | "muay-thai";
  environment: "both" | "home" | "classes";
  jointModification: boolean;
  availableDays: number[];
  budget: string;
  gymId: string;
  className: string;
  classWeekday: number;
  classTime: string;
  nextClassDate: string;
  reminders: boolean;
  wellbeing: boolean;
  wellbeingGoal: string;
  goalWeight: string;
  age: string;
  height: string;
};
export type Journey = {
  id: string;
  createdAt: string;
  startedOn: string;
  slots: Record<string, Slot>;
  logs: Record<string, ActivityLog>;
  reviews: Record<string, Review>;
  adaptations: Record<string, Adaptation>;
  pauses: Record<
    string,
    { from: string; to?: string; reason: "personal" }
  >;
};
export type MomentumData = {
  schemaVersion: 2;
  onboarded: boolean;
  profile: Profile;
  activeJourneyId: string | null;
  journeys: Record<string, Journey>;
  meals: Record<
    string,
    {
      swaps: Partial<Record<MealSlot, string>>;
      eaten: Partial<Record<MealSlot, boolean>>;
    }
  >;
  waist: Record<string, string>;
  preparation: Record<string, boolean>;
};
export type ExerciseResource = {
  id: string;
  name: string;
  equipment: string;
  cues: string[];
  avoid: string[];
  youtubeId?: string;
  logType?: string;
};
export type RecipeResource = {
  id: string;
  slot: MealSlot;
  title: string;
  photo: string;
  ingredients: string[];
  prep: string[];
  plate: string[];
};
export type Resources = {
  exercises: Record<string, ExerciseResource>;
  recipes: RecipeResource[];
  meals: Record<string, Record<MealSlot, string>>;
  howTo: (recipe: RecipeResource) => string[];
  media: (id: string) => ReactNode;
  groceries: (
    recipes: RecipeResource[],
  ) => Array<{ name: string; category: string; portions: string[] }>;
};
export const newLog = (): ActivityLog => ({
  minutes: "",
  reason: "",
  effort: "",
  recovery: "",
  enjoyment: "",
  observed: false,
  booked: false,
  prepared: false,
  comfortable: false,
  note: "",
  readiness: {},
  sets: {},
});
export function emptyMomentum(): MomentumData {
  return {
    schemaVersion: 2,
    onboarded: false,
    profile: {
      goals: ["Consistency", "Fitness", "Boxing skills"],
      activity: "sedentary",
      discipline: "boxing",
      environment: "both",
      jointModification: false,
      availableDays: [1, 3, 5],
      budget: "",
      gymId: "",
      className: "",
      classWeekday: 5,
      classTime: "",
      nextClassDate: "",
      reminders: false,
      wellbeing: false,
      wellbeingGoal: "",
      goalWeight: "",
      age: "",
      height: "",
    },
    activeJourneyId: null,
    journeys: {},
    meals: {},
    waist: {},
    preparation: {},
  };
}
