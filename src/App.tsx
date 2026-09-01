import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase, supabaseConfigError } from "./lib/supabaseClient";

type SessionType = "strength" | "cardio" | "movement" | "recovery";
type AppSection = "today" | "gym" | "week" | "progress" | "library" | "account";
type IconName =
  | "activity"
  | "calendar"
  | "check"
  | "chevronLeft"
  | "chevronRight"
  | "cloud"
  | "dumbbell"
  | "library"
  | "mail"
  | "play"
  | "progress"
  | "search"
  | "spark"
  | "swap"
  | "trophy"
  | "user"
  | "video"
  | "x";

type Resource = {
  label: string;
  url: string;
};

type MotionDemo = {
  workoutXId: string;
  label: string;
  match: "exact" | "reference";
};

type TrainingLocation = "upstairs" | "downstairs" | "downstairs-outside" | "either";

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const commonProps = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  return (
    <svg {...commonProps}>
      {name === "activity" && <path d="M3 12h4l3-8 4 16 3-8h4" />}
      {name === "calendar" && (
        <>
          <rect x="4" y="5" width="16" height="15" rx="2" />
          <path d="M8 3v4M16 3v4M4 10h16" />
        </>
      )}
      {name === "check" && <path d="M5 13l4 4L19 7" />}
      {name === "chevronLeft" && <path d="M15 18l-6-6 6-6" />}
      {name === "chevronRight" && <path d="M9 6l6 6-6 6" />}
      {name === "cloud" && <path d="M6 18h11a4 4 0 0 0 0-8 6 6 0 0 0-11.5 2A3 3 0 0 0 6 18Z" />}
      {name === "dumbbell" && <path d="M4 9v6M8 7v10M16 7v10M20 9v6M8 12h8" />}
      {name === "library" && <path d="M5 4v16M10 6v14M15 4l4 16" />}
      {name === "mail" && (
        <>
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="m4 8 8 6 8-6" />
        </>
      )}
      {name === "play" && <path d="M8 5v14l11-7Z" />}
      {name === "progress" && <path d="M4 17 9 12l4 4 7-9M4 21h16" />}
      {name === "search" && (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </>
      )}
      {name === "spark" && <path d="m12 3 1.7 5.1L19 10l-5.3 1.9L12 17l-1.7-5.1L5 10l5.3-1.9L12 3ZM5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16ZM19 15l.7 2.1L22 18l-2.3.9L19 21l-.7-2.1L16 18l2.3-.9L19 15Z" />}
      {name === "swap" && <path d="M7 7h11l-3-3M17 17H6l3 3M18 7l-4 4M6 17l4-4" />}
      {name === "trophy" && <path d="M8 4h8v3a4 4 0 0 1-8 0V4ZM6 6H4a4 4 0 0 0 4 4M18 6h2a4 4 0 0 1-4 4M12 12v5M9 20h6" />}
      {name === "user" && (
        <>
          <circle cx="12" cy="8" r="4" />
          <path d="M5 21a7 7 0 0 1 14 0" />
        </>
      )}
      {name === "video" && (
        <>
          <rect x="4" y="6" width="12" height="12" rx="2" />
          <path d="m16 10 4-2v8l-4-2" />
        </>
      )}
      {name === "x" && <path d="M18 6 6 18M6 6l12 12" />}
    </svg>
  );
}

type Exercise = {
  id: string;
  name: string;
  shortName: string;
  family: "legs" | "push" | "pull" | "hinge" | "core" | "arms" | "warmup" | "cardio";
  equipment: string;
  target: string;
  reps: string;
  rest: string;
  cues: string[];
  avoid: string[];
  progression: string;
  motionDemo?: MotionDemo;
  youtubeId?: string;
  logType?: "weight" | "done";
  loadLabel?: string;
  trainingLocation?: TrainingLocation;
  locationNote?: string;
  swapIds?: string[];
  resources: Resource[];
};

type SessionTemplate = {
  title: string;
  type: SessionType;
  code: string;
  time: string;
  summary: string;
  accent: string;
  exerciseIds: string[];
  tasks: string[];
  finisher?: string;
};

type SetLog = {
  weight: string;
  done: boolean;
};

type DayLog = {
  completed: boolean;
  warmup: Record<string, boolean>;
  tasks: Record<string, boolean>;
  exercises: Record<string, SetLog[]>;
  swaps: Record<string, string>;
  notes: string;
};

type MetricLog = {
  weight: string;
  waist: string;
  note: string;
};

type TrackerStore = {
  days: Record<string, DayLog>;
  metrics: Record<string, MetricLog>;
};

type StoreMeta = {
  localUpdatedAt?: string;
  lastCloudSyncedAt?: string;
  cloudUpdatedAt?: string;
  lastUserId?: string;
};

type CloudStatus = "local-only" | "signed-out" | "loading" | "saving" | "synced" | "error";

type PlanDay = {
  iso: string;
  index: number;
  week: number;
  dayName: string;
  planDayName: string;
  session: SessionTemplate;
};

const STORAGE_KEY = "body-recomp-gym-tracker-v1";
const STORAGE_META_KEY = "body-recomp-gym-tracker-meta-v1";
const START_DATE = "2026-08-31";
const PROGRAM_DAYS = 182;

const strengthWarmupIds = [
  "bodyweight-squat",
  "hip-hinge-drill",
  "incline-push-up",
  "warmup-front-plank",
  "warmup-treadmill-walk",
];

const emptySet = (): SetLog => ({
  weight: "",
  done: false,
});

const createEmptyDay = (): DayLog => ({
  completed: false,
  warmup: {},
  tasks: {},
  exercises: {},
  swaps: {},
  notes: "",
});

const createEmptyMetric = (): MetricLog => ({
  weight: "",
  waist: "",
  note: "",
});

function normalizeDayLog(log: DayLog | undefined): DayLog {
  return {
    ...createEmptyDay(),
    ...log,
    warmup: log?.warmup ?? {},
    tasks: log?.tasks ?? {},
    exercises: log?.exercises ?? {},
    swaps: log?.swaps ?? {},
    notes: log?.notes ?? "",
  };
}

function normalizeMetricLogShape(metric: MetricLog | undefined): MetricLog {
  return {
    ...createEmptyMetric(),
    ...metric,
  };
}

const exerciseMap: Record<string, Exercise> = {
  "warmup-treadmill-walk": {
    id: "warmup-treadmill-walk",
    name: "Treadmill Easy Walk",
    shortName: "Easy walk",
    family: "warmup",
    equipment: "Treadmill",
    trainingLocation: "downstairs",
    locationNote: "Do this on the downstairs treadmill so you finish warm and can start the equipment ramp sets right away.",
    target: "General warm-up",
    reps: "10 min easy",
    rest: "None",
    cues: [
      "Start at an easy pace that raises body temperature without making you breathe hard.",
      "Keep posture tall, arms relaxed, and steps quiet.",
      "Step off feeling warmer and more awake, not tired.",
    ],
    avoid: [
      "Do not turn the warm-up into cardio training.",
      "Do not hold the treadmill rails unless you need balance.",
    ],
    progression: "Build from 10 minutes toward 12-15 minutes as fitness improves, but keep it easy enough that the lifting still feels sharp.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "reference",
    },
    logType: "done",
    loadLabel: "easy pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "treadmill-walk": {
    id: "treadmill-walk",
    name: "Treadmill Brisk Walk",
    shortName: "Treadmill",
    family: "cardio",
    equipment: "Treadmill or outdoor route",
    trainingLocation: "downstairs-outside",
    locationNote: "Use the downstairs treadmill or an outdoor route; keep the effort at the planned talk-test pace.",
    target: "Moderate cardio",
    reps: "Talk test pace",
    rest: "As needed",
    cues: [
      "Start easy, then settle into a pace where breathing is elevated but controlled.",
      "Use speed first, then add incline only if your joints feel good.",
      "Keep shoulders relaxed, ribs stacked, and steps quiet.",
    ],
    avoid: [
      "Do not turn every walk into a max-effort test.",
      "Do not hold the treadmill rails unless you need balance.",
    ],
    progression: "Add 5 minutes per week or a small incline before chasing speed.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "exact",
    },
    logType: "done",
    loadLabel: "pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "cardio-cooldown-walk": {
    id: "cardio-cooldown-walk",
    name: "Treadmill Cool-Down Walk",
    shortName: "Cool-down",
    family: "cardio",
    equipment: "Treadmill or outdoor route",
    trainingLocation: "downstairs-outside",
    locationNote: "Cool down downstairs on the treadmill, or outside if the whole cardio session was outdoors.",
    target: "Cool-down",
    reps: "5 min easy",
    rest: "Done after cardio",
    cues: [
      "Reduce speed and incline until breathing settles.",
      "Keep walking until your heart rate feels clearly lower.",
      "Finish with relaxed shoulders and normal breathing.",
    ],
    avoid: [
      "Do not stop abruptly after a brisk walk unless you need to.",
      "Do not use the cool-down as extra hard cardio.",
    ],
    progression: "Keep this easy; the goal is recovery between sessions.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "reference",
    },
    logType: "done",
    loadLabel: "easy pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "long-cardio-walk": {
    id: "long-cardio-walk",
    name: "Long Brisk Walk",
    shortName: "Long walk",
    family: "cardio",
    equipment: "Treadmill or outdoor route",
    trainingLocation: "downstairs-outside",
    locationNote: "Use the downstairs treadmill or an outdoor route. This is not an upstairs-in-the-unit item unless you have enough walking space.",
    target: "Long moderate cardio",
    reps: "45-60 min",
    rest: "As needed",
    cues: [
      "Use the talk test: you can talk in short sentences, but you cannot sing.",
      "Keep the pace purposeful and sustainable for the whole session.",
      "Use incline only if joints feel good and your stride stays smooth.",
    ],
    avoid: [
      "Do not turn the long walk into intervals.",
      "Do not chase incline if it changes your posture or bothers your knees.",
    ],
    progression: "Build duration first, then add a small incline if recovery is good.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "exact",
    },
    logType: "done",
    loadLabel: "pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "bodyweight-squat": {
    id: "bodyweight-squat",
    name: "Bodyweight Squat",
    shortName: "Squat",
    family: "warmup",
    equipment: "Bodyweight",
    trainingLocation: "upstairs",
    locationNote: "Good to do upstairs before heading down, as long as you go downstairs soon after and do the ramp warm-ups there.",
    target: "Squat pattern",
    reps: "8-12 warm-up reps",
    rest: "Easy",
    cues: [
      "Feet about hip to shoulder width, chest tall, weight balanced across the full foot.",
      "Sit down between your knees and stand by driving through the floor.",
      "Use this to rehearse knee tracking before goblet squats or leg press.",
    ],
    avoid: ["Knees collapsing inward.", "Rounding the low back at the bottom."],
    progression: "Add reps and tempo before adding fatigue; this should prepare your knees and hips without draining your working sets.",
    motionDemo: {
      workoutXId: "1685",
      label: "Squat to overhead reach",
      match: "reference",
    },
    youtubeId: "UYbsgiiZgao",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "NASM prisoner squat",
        url: "https://www.nasm.org/resource-center/exercise-library/prisoner-squat",
      },
    ],
  },
  "hip-hinge-drill": {
    id: "hip-hinge-drill",
    name: "Hip-Hinge Drill",
    shortName: "Hip hinge",
    family: "warmup",
    equipment: "Bodyweight",
    trainingLocation: "upstairs",
    locationNote: "Good to do upstairs before heading down; keep the transition short so you do not cool off before lifting.",
    target: "Hinge pattern",
    reps: "8-12 warm-up reps",
    rest: "Easy",
    cues: [
      "Soften the knees, push hips back, and keep ribs and pelvis stacked.",
      "You should feel hamstrings load without your spine rounding.",
      "Imagine closing a car door with your hips.",
    ],
    avoid: ["Squatting the drill.", "Reaching down by rounding your back."],
    progression: "Add reps first, then use a slower hinge and brief hamstring stretch in later phases.",
    motionDemo: {
      workoutXId: "0044",
      label: "Hip-hinge pattern reference",
      match: "reference",
    },
    youtubeId: "sinpFajtRPw",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "Mayo hip hinge video",
        url: "https://www.youtube.com/watch?v=sinpFajtRPw",
      },
      {
        label: "NASM dumbbell RDL",
        url: "https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift",
      },
    ],
  },
  "incline-push-up": {
    id: "incline-push-up",
    name: "Incline Push-Up",
    shortName: "Incline push-up",
    family: "warmup",
    equipment: "Bench",
    trainingLocation: "upstairs",
    locationNote: "Good upstairs if you have a stable counter, bench, or sturdy surface; otherwise do it downstairs.",
    target: "Pressing warm-up",
    reps: "6-10 warm-up reps",
    rest: "Easy",
    cues: [
      "Hands on a bench, body in one line, elbows roughly 45 degrees from your body.",
      "Lower chest toward the bench and press away smoothly.",
      "Choose a higher surface if the rep slows or your hips sag.",
    ],
    avoid: ["Sagging hips.", "Elbows flaring straight out."],
    progression: "Add reps first, then use a slightly lower bench only if shoulder position stays clean.",
    motionDemo: {
      workoutXId: "0493",
      label: "Incline push-up",
      match: "exact",
    },
    youtubeId: "0JUrOH--Kdk",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "NASM incline push-up",
        url: "https://www.nasm.org/resource-center/exercise-library/incline-push-up",
      },
    ],
  },
  "warmup-front-plank": {
    id: "warmup-front-plank",
    name: "Warm-Up Front Plank",
    shortName: "Warm-up plank",
    family: "warmup",
    equipment: "Mat or floor",
    trainingLocation: "upstairs",
    locationNote: "Good upstairs on a mat or floor before you go down to the gym.",
    target: "Core brace rehearsal",
    reps: "20-30 sec",
    rest: "Easy",
    cues: [
      "Elbows under shoulders, ribs down, glutes lightly squeezed.",
      "Hold only long enough to wake up your brace.",
      "Stop before your hips sag or shoulders shrug.",
    ],
    avoid: ["Holding your breath.", "Sagging hips.", "Turning it into a max plank test."],
    progression: "Build the warm-up hold gradually, but stop before it turns into fatigue.",
    motionDemo: {
      workoutXId: "0464",
      label: "Front plank reference",
      match: "reference",
    },
    youtubeId: "GgOnCjmyTfY",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "ACE plank",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/",
      },
      {
        label: "Mayo plank video",
        url: "https://www.youtube.com/watch?v=GgOnCjmyTfY",
      },
    ],
  },
  "warmup-ramp-leg-press": {
    id: "warmup-ramp-leg-press",
    name: "Warm-Up Ramp: Leg Press",
    shortName: "Leg press ramp",
    family: "warmup",
    equipment: "Leg press machine",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs at the leg press immediately before your working Leg Press sets.",
    target: "Specific warm-up for the first working lift",
    reps: "2 lighter sets",
    rest: "45-60 sec",
    cues: [
      "Use the same seat, foot position, and range of motion planned for your Leg Press.",
      "Set 1 should feel very easy and teach the path.",
      "Set 2 should feel closer to working weight but still clearly lighter.",
    ],
    avoid: [
      "Do not count ramp sets as working sets.",
      "Do not tire out your legs before the real Leg Press work.",
      "Do not change depth or foot position from warm-up to working sets.",
    ],
    progression: "As your working weight rises, let the ramp weights rise too, but keep both sets crisp and non-fatiguing.",
    motionDemo: {
      workoutXId: "0739",
      label: "Sled 45 degree leg press",
      match: "reference",
    },
    youtubeId: "cDGOn-yfKJA",
    resources: [
      {
        label: "NASM beginner routine",
        url: "https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine",
      },
      {
        label: "ACSM progression model",
        url: "https://pubmed.ncbi.nlm.nih.gov/11828249/",
      },
    ],
  },
  "warmup-ramp-incline-db-press": {
    id: "warmup-ramp-incline-db-press",
    name: "Warm-Up Ramp: Incline Dumbbell Press",
    shortName: "Incline ramp",
    family: "warmup",
    equipment: "Incline bench and lighter dumbbells",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs at the bench immediately before your working Incline Dumbbell Press sets.",
    target: "Specific warm-up for the second working lift",
    reps: "2 lighter sets",
    rest: "45-60 sec",
    cues: [
      "Use the same bench angle and shoulder setup planned for Incline Dumbbell Press.",
      "Set 1 should feel like rehearsal with very light dumbbells.",
      "Set 2 should move smoothly while still leaving your chest and shoulders fresh.",
    ],
    avoid: [
      "Do not turn these into hard pressing sets.",
      "Do not bounce the dumbbells or change the bench angle.",
      "Do not use warm-up weight that makes the first working set weaker.",
    ],
    progression: "Use slightly heavier ramp dumbbells only when the working sets have clearly moved up.",
    motionDemo: {
      workoutXId: "0314",
      label: "Dumbbell incline bench press",
      match: "reference",
    },
    youtubeId: "JKnpHchOWPU",
    resources: [
      {
        label: "NASM beginner routine",
        url: "https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine",
      },
      {
        label: "NSCA dynamic warm-up",
        url: "https://www.nsca.com/education/articles/kinetic-select/introduction-to-dynamic-warm-up/",
      },
    ],
  },
  "warmup-ramp-goblet-squat": {
    id: "warmup-ramp-goblet-squat",
    name: "Warm-Up Ramp: Goblet Squat",
    shortName: "Goblet ramp",
    family: "warmup",
    equipment: "Bodyweight, light dumbbell, or light kettlebell",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs right before Goblet Squat so the warm-up matches the exact weight and setup.",
    target: "Specific warm-up for the first working lift",
    reps: "2 lighter sets",
    rest: "45-60 sec",
    cues: [
      "Use the same stance and depth planned for Goblet Squat.",
      "Start with bodyweight or a very light weight, then use a second light set.",
      "Treat both sets as skill practice for bracing, depth, and knee tracking.",
    ],
    avoid: [
      "Do not rush the descent.",
      "Do not let knees collapse inward.",
      "Do not make the second warm-up set feel like a working set.",
    ],
    progression: "The warm-up load can rise as your goblet squat improves, but the goal stays rehearsal, not fatigue.",
    motionDemo: {
      workoutXId: "1760",
      label: "Dumbbell goblet squat",
      match: "reference",
    },
    youtubeId: "nfX7IFK9UNI",
    resources: [
      {
        label: "NASM beginner routine",
        url: "https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine",
      },
      {
        label: "NSCA dynamic warm-up",
        url: "https://www.nsca.com/education/articles/kinetic-select/introduction-to-dynamic-warm-up/",
      },
    ],
  },
  "warmup-ramp-single-arm-row": {
    id: "warmup-ramp-single-arm-row",
    name: "Warm-Up Ramp: Single-Arm Dumbbell Row",
    shortName: "Row ramp",
    family: "warmup",
    equipment: "Bench and lighter dumbbell",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs at the bench right before Single-Arm Dumbbell Row.",
    target: "Specific warm-up for the second working lift",
    reps: "2 lighter sets each side",
    rest: "45-60 sec",
    cues: [
      "Use the same bench support and torso angle planned for Single-Arm Dumbbell Row.",
      "Do one light set each side, then one slightly heavier but still easy set each side.",
      "Feel the shoulder blade move before the working sets begin.",
    ],
    avoid: [
      "Do not twist your torso to lift the warm-up dumbbell.",
      "Do not shrug the shoulder toward your ear.",
      "Do not use these sets to test strength.",
    ],
    progression: "Let the ramp dumbbell rise only after the main row loads rise and the movement stays controlled.",
    motionDemo: {
      workoutXId: "0292",
      label: "Dumbbell one-arm bent-over row",
      match: "reference",
    },
    youtubeId: "k0cTJCfxa0Y",
    resources: [
      {
        label: "NASM beginner routine",
        url: "https://www.nasm.org/resource-center/blog/training/beginner-fitness-routine",
      },
      {
        label: "ACSM progression model",
        url: "https://pubmed.ncbi.nlm.nih.gov/11828249/",
      },
    ],
  },
  "treadmill-finisher": {
    id: "treadmill-finisher",
    name: "Brisk Treadmill Finisher",
    shortName: "Finisher",
    family: "cardio",
    equipment: "Treadmill",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs after lifting and before the final floor core block, so you can head upstairs afterward if you want.",
    target: "Post-lift moderate cardio",
    reps: "10 min brisk",
    rest: "After lifting",
    cues: [
      "Use a purposeful walk after the weights are done.",
      "Keep intensity moderate: breathing is elevated, but you can still talk.",
      "Choose speed first, then add incline only if it feels smooth.",
    ],
    avoid: [
      "Do not sprint after a full-body lift.",
      "Do not hold the rails to force a higher incline.",
    ],
    progression: "Start at 10 minutes, build toward 12-15 minutes in later phases, and add incline only if recovery stays good.",
    motionDemo: {
      workoutXId: "3666",
      label: "Walking on incline treadmill",
      match: "exact",
    },
    logType: "done",
    loadLabel: "pace",
    resources: [
      {
        label: "CDC intensity guide",
        url: "https://www.cdc.gov/physical-activity-basics/measuring/index.html",
      },
    ],
  },
  "mobility-flow": {
    id: "mobility-flow",
    name: "Light Mobility Flow",
    shortName: "Mobility",
    family: "warmup",
    equipment: "Open floor space",
    trainingLocation: "upstairs",
    locationNote: "Good upstairs on recovery or movement days if you have enough open floor space.",
    target: "Light mobility and stretching",
    reps: "5-10 min",
    rest: "Easy",
    cues: [
      "Move slowly through hips, upper back, shoulders, and ankles.",
      "Use pain-free ranges and breathe normally.",
      "Finish feeling looser, not stretched to the limit.",
    ],
    avoid: [
      "Do not force deep stretches.",
      "Do not bounce into painful positions.",
      "Do not turn recovery work into a hard workout.",
    ],
    progression: "Add a few minutes only if it helps you feel better for the next lift.",
    motionDemo: {
      workoutXId: "1604",
      label: "World's greatest stretch",
      match: "reference",
    },
    logType: "done",
    loadLabel: "easy",
    resources: [
      {
        label: "ACE flexibility guide",
        url: "https://www.acefitness.org/resources/everyone/blog/6646/6-flexibility-exercises-for-beginners/",
      },
    ],
  },
  "leg-press": {
    id: "leg-press",
    name: "Leg Press",
    shortName: "Leg press",
    family: "legs",
    equipment: "Leg press machine",
    target: "Quadriceps, glutes, hamstrings",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Back and tailbone stay flat on the pad, feet flat on the platform.",
      "Lower until knees are around 90 degrees, then press through the whole foot.",
      "Finish each rep without snapping or locking the knees.",
    ],
    avoid: [
      "Do not let knees cave inward.",
      "Do not cut depth short just to move more weight.",
      "Do not let hips lift off the pad.",
    ],
    progression: "When all sets hit the top of the rep range cleanly, add the smallest available load next time.",
    motionDemo: {
      workoutXId: "0739",
      label: "Sled 45 degree leg press",
      match: "exact",
    },
    youtubeId: "cDGOn-yfKJA",
    swapIds: ["goblet-squat"],
    resources: [
      {
        label: "NASM video guide",
        url: "https://www.nasm.org/resource-center/exercise-library/leg-press",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/154/seated-leg-press/",
      },
      {
        label: "Mayo demo",
        url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/leg-press/vid-20084684",
      },
    ],
  },
  "incline-db-press": {
    id: "incline-db-press",
    name: "Incline Dumbbell Press",
    shortName: "Incline press",
    family: "push",
    equipment: "Incline bench and dumbbells",
    target: "Upper chest, shoulders, triceps",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Set bench around 30 to 45 degrees, feet planted, shoulder blades pulled down and back.",
      "Lower the dumbbells under control toward the upper chest.",
      "Press up and slightly inward without banging the dumbbells together.",
    ],
    avoid: [
      "Do not set the bench so steep that it turns into a shoulder press.",
      "Do not arch the low back to chase heavier weight.",
    ],
    progression: "Add load only after every set reaches 12 clean reps with stable shoulders.",
    motionDemo: {
      workoutXId: "0314",
      label: "Dumbbell incline bench press",
      match: "exact",
    },
    youtubeId: "JKnpHchOWPU",
    swapIds: ["machine-chest-press", "push-up"],
    resources: [
      {
        label: "NASM two-arm guide",
        url: "https://www.nasm.org/resource-center/exercise-library/two-arm-incline-dumbbell-chest-press",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/25/incline-chest-press/",
      },
    ],
  },
  "lat-pulldown": {
    id: "lat-pulldown",
    name: "Seated Lat Pulldown",
    shortName: "Lat pulldown",
    family: "pull",
    equipment: "Lat pulldown machine",
    target: "Lats, upper back, biceps",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Anchor thighs, brace torso, and begin by pulling shoulder blades down.",
      "Drive elbows toward your sides until they stop moving downward.",
      "Return with control and let the lats stretch without shrugging.",
    ],
    avoid: [
      "Do not lean far back to turn it into a row.",
      "Do not pull behind the neck.",
      "Do not yank with momentum.",
    ],
    progression: "Add load only when the bar path stays smooth and your chest stays proud.",
    motionDemo: {
      workoutXId: "2330",
      label: "Cable lat pulldown",
      match: "exact",
    },
    youtubeId: "NbHnnvHkajg",
    swapIds: ["assisted-pull-up", "seated-cable-row"],
    resources: [
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/158/seated-lat-pulldown/",
      },
      {
        label: "Mayo lat pull video",
        url: "https://www.youtube.com/watch?v=NbHnnvHkajg",
      },
      {
        label: "NASM form article",
        url: "https://www.nasm.org/resource-center/blog/training/the-biomechanics-of-the-lat-pulldown-muscles-grip-and-form",
      },
    ],
  },
  "db-rdl": {
    id: "db-rdl",
    name: "Dumbbell Romanian Deadlift",
    shortName: "DB RDL",
    family: "hinge",
    equipment: "Dumbbells",
    target: "Hamstrings, glutes, posterior chain",
    reps: "8-12",
    rest: "90-120 sec",
    cues: [
      "Soft knees, long spine, shoulders down, dumbbells close to your legs.",
      "Push hips back until hamstrings feel stretched.",
      "Stand by driving hips forward, not by leaning backward.",
    ],
    avoid: [
      "Do not turn it into a squat.",
      "Do not chase the floor if your back rounds.",
      "Do not let dumbbells drift away from your legs.",
    ],
    progression: "When 12s are crisp at the same depth, move up one dumbbell size.",
    motionDemo: {
      workoutXId: "1459",
      label: "Dumbbell Romanian deadlift",
      match: "exact",
    },
    youtubeId: "V8Hdl1FiNt4",
    swapIds: ["barbell-rdl"],
    resources: [
      {
        label: "NASM video guide",
        url: "https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/",
      },
    ],
  },
  "front-plank": {
    id: "front-plank",
    name: "Front Plank",
    shortName: "Plank",
    family: "core",
    equipment: "Mat or floor",
    trainingLocation: "either",
    locationNote: "Either place is fine. If you go upstairs after lifting, keep the transition short and finish before you cool down.",
    target: "Core stability",
    reps: "20-45 sec",
    rest: "45-60 sec",
    cues: [
      "Elbows under shoulders, legs long, body in one line from head to heels.",
      "Ribs down, glutes gently squeezed, breathe behind the brace.",
      "Stop the set when hips sag or the low back takes over.",
    ],
    avoid: ["Holding your breath.", "Letting hips sag.", "Shrugging shoulders into ears."],
    progression: "Add 5 seconds only when the current hold is clean.",
    motionDemo: {
      workoutXId: "0464",
      label: "Front plank reference",
      match: "reference",
    },
    youtubeId: "mwlp75MS6Rg",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "NASM video guide",
        url: "https://www.nasm.org/resource-center/exercise-library/plank",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/32/front-plank/",
      },
      {
        label: "Mayo plank video",
        url: "https://www.youtube.com/watch?v=GgOnCjmyTfY",
      },
    ],
  },
  "dead-bug": {
    id: "dead-bug",
    name: "Dead Bug",
    shortName: "Dead bug",
    family: "core",
    equipment: "Mat or open floor",
    trainingLocation: "either",
    locationNote: "Either place is fine. Upstairs is practical if you have a mat and go there right after the lifting block.",
    target: "Dynamic abs, deep core, anti-extension control",
    reps: "8-12 each side",
    rest: "45-60 sec",
    cues: [
      "Lie on your back with arms up and hips and knees bent to 90 degrees.",
      "Exhale, bring ribs down, and keep the low back gently connected to the floor.",
      "Extend one arm and the opposite leg slowly, then return and alternate sides.",
    ],
    avoid: [
      "Do not let the low back arch away from the floor.",
      "Do not rush the reps or twist through the hips.",
      "Do not extend farther than you can control.",
    ],
    progression: "Add reps first, then slow the tempo or reach longer only while your ribs stay down.",
    motionDemo: {
      workoutXId: "0276",
      label: "Dead bug",
      match: "exact",
    },
    youtubeId: "bxn9FBrt4-A",
    logType: "done",
    loadLabel: "body",
    resources: [
      {
        label: "NASM dead bug",
        url: "https://www.nasm.org/resource-center/exercise-library/dead-bug",
      },
      {
        label: "NASM core programming",
        url: "https://www.nasm.org/resource-center/blog/training/best-abs-exercises",
      },
    ],
  },
  "dumbbell-biceps-curl": {
    id: "dumbbell-biceps-curl",
    name: "Dumbbell Biceps Curl",
    shortName: "DB curl",
    family: "arms",
    equipment: "Dumbbells",
    target: "Biceps, brachialis, forearms",
    reps: "10-15",
    rest: "60 sec",
    cues: [
      "Stand or sit tall with dumbbells at your sides and palms facing forward.",
      "Keep elbows close to your body and curl smoothly without swinging.",
      "Lower under control until the arms are long and wrists stay straight.",
    ],
    avoid: [
      "Do not lean back or swing the dumbbells to start the rep.",
      "Do not let elbows drift far forward before the curl finishes.",
      "Do not bend the wrists to force extra range.",
    ],
    progression: "Use small load jumps only after every set reaches 15 clean reps without swinging.",
    motionDemo: {
      workoutXId: "0416",
      label: "Dumbbell standing biceps curl",
      match: "exact",
    },
    youtubeId: "2k9co4UIlEw",
    resources: [
      {
        label: "FITTR dumbbell curl video",
        url: "https://coaching.fittr.com/exercise-video/dumbbell-bicep-curls-192/",
      },
      {
        label: "ACE seated biceps curl",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/44/seated-biceps-curl/",
      },
      {
        label: "Mayo biceps curl",
        url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/biceps-curl/vid-20084675",
      },
      {
        label: "NASM arm exercise guide",
        url: "https://www.nasm.org/resource-center/blog/training/9-of-the-best-arm-sculpting-exercises-to-tone-and-strengthen",
      },
    ],
  },
  "rope-triceps-pressdown": {
    id: "rope-triceps-pressdown",
    name: "Cable Rope Triceps Pressdown",
    shortName: "Rope pressdown",
    family: "arms",
    equipment: "Cable machine and rope attachment",
    target: "Triceps",
    reps: "10-15",
    rest: "60 sec",
    cues: [
      "Set the pulley high, stand tall, and pin elbows near your ribs.",
      "Press the rope down until arms are straight without leaning over the cable.",
      "Let the rope return under control until forearms rise, then repeat.",
    ],
    avoid: [
      "Do not let the elbows flare or drift forward.",
      "Do not use bodyweight to slam the rope down.",
      "Do not let the weight stack bounce between reps.",
    ],
    progression: "Add load only when elbows stay pinned and the return stays quiet for every rep.",
    motionDemo: {
      workoutXId: "0200",
      label: "Cable pushdown with rope attachment",
      match: "exact",
    },
    youtubeId: "4GHNbhQS-Zw",
    resources: [
      {
        label: "FITTR rope pressdown video",
        url: "https://www.fittr.com/exercise-video/cable-pushdown-with-rope-attachment-2/",
      },
      {
        label: "ACE tricep pressdown",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/333/tricep-pressdown/",
      },
      {
        label: "NASM arm exercise guide",
        url: "https://www.nasm.org/resource-center/blog/training/9-of-the-best-arm-sculpting-exercises-to-tone-and-strengthen",
      },
    ],
  },
  "goblet-squat": {
    id: "goblet-squat",
    name: "Goblet Squat",
    shortName: "Goblet squat",
    family: "legs",
    equipment: "Dumbbell or kettlebell",
    target: "Quads, glutes, core",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Hold one weight vertically at chest height with elbows near the ribs.",
      "Brace, sit down between the knees, and keep the chest tall.",
      "Stand by driving through the floor and keeping knees tracking over toes.",
    ],
    avoid: [
      "Do not let the weight drift away from your chest.",
      "Do not collapse knees inward.",
      "Do not turn it into a good morning.",
    ],
    progression: "Add weight after every set reaches 12 with the same depth and posture.",
    motionDemo: {
      workoutXId: "1760",
      label: "Dumbbell goblet squat",
      match: "exact",
    },
    youtubeId: "nfX7IFK9UNI",
    swapIds: ["leg-press"],
    resources: [
      {
        label: "NASM video guide",
        url: "https://www.nasm.org/resource-center/exercise-library/goblet-squat",
      },
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/362/goblet-squat/",
      },
    ],
  },
  "single-arm-row": {
    id: "single-arm-row",
    name: "Single-Arm Dumbbell Row",
    shortName: "1-arm row",
    family: "pull",
    equipment: "Bench and dumbbell",
    target: "Lats, rhomboids, traps, rear delts",
    reps: "8-12 each side",
    rest: "75-90 sec",
    cues: [
      "Support one hand on the bench, brace, and keep hips square.",
      "Row the dumbbell toward your hip with elbow close to your side.",
      "Lower under control until the arm is long without twisting the torso.",
    ],
    avoid: [
      "Do not rotate your chest open to finish the rep.",
      "Do not shrug the working shoulder.",
      "Do not throw the weight upward.",
    ],
    progression: "Increase when both sides hit 12 reps without torso rotation.",
    motionDemo: {
      workoutXId: "0292",
      label: "Dumbbell one-arm bent-over row",
      match: "exact",
    },
    youtubeId: "k0cTJCfxa0Y",
    swapIds: ["seated-cable-row"],
    resources: [
      {
        label: "ACE single-arm row",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/126/single-arm-row/",
      },
      {
        label: "PureGym row demo",
        url: "https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/",
      },
    ],
  },
  "push-up": {
    id: "push-up",
    name: "Push-Up",
    shortName: "Push-up",
    family: "push",
    equipment: "Bodyweight or bench",
    trainingLocation: "downstairs",
    locationNote: "Do this downstairs when it appears in Strength B because it sits inside the main lifting block.",
    target: "Chest, shoulders, triceps, core",
    reps: "6-15",
    rest: "60-75 sec",
    cues: [
      "Start from a rigid plank, hands slightly wider than shoulders.",
      "Lower chest toward the floor with elbows about 45 degrees from your body.",
      "Use a bench incline or knees if full reps lose shape.",
    ],
    avoid: ["Sagging hips.", "Flaring elbows straight out.", "Half reps just to add reps."],
    progression: "First earn 15 clean incline reps, then lower the surface or move to floor reps.",
    motionDemo: {
      workoutXId: "0662",
      label: "Push-up",
      match: "exact",
    },
    youtubeId: "WDIpL0pjun0",
    logType: "done",
    loadLabel: "body",
    swapIds: ["incline-db-press", "machine-chest-press"],
    resources: [
      {
        label: "NASM push-up",
        url: "https://www.nasm.org/resource-center/exercise-library/push-up",
      },
      {
        label: "ACE push-up",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/41/push-up/",
      },
      {
        label: "Mayo knee option",
        url: "https://www.youtube.com/watch?v=WcHtt6zT3Go",
      },
    ],
  },
  "seated-db-overhead": {
    id: "seated-db-overhead",
    name: "Seated Dumbbell Overhead Press",
    shortName: "DB shoulder press",
    family: "push",
    equipment: "Bench and dumbbells",
    target: "Shoulders, triceps, upper chest",
    reps: "8-12",
    rest: "75-90 sec",
    cues: [
      "Sit tall with back supported and feet flat.",
      "Brace abs, start dumbbells between shoulders and ears, wrists neutral.",
      "Press overhead without leaning back or turning it into an incline press.",
    ],
    avoid: [
      "Do not overarch the low back.",
      "Do not force elbows directly out to the side if shoulders complain.",
      "Do not lock out hard at the top.",
    ],
    progression: "Add load only when every rep has a stable rib cage and smooth descent.",
    motionDemo: {
      workoutXId: "0405",
      label: "Dumbbell seated shoulder press",
      match: "exact",
    },
    swapIds: ["machine-shoulder-press"],
    resources: [
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/45/seated-overhead-press/",
      },
      {
        label: "PureGym shoulder press",
        url: "https://www.puregym.com/exercises/arms-and-shoulders/shoulder-press/seated-shoulder-press/",
      },
    ],
  },
  "incline-reverse-fly": {
    id: "incline-reverse-fly",
    name: "Incline Reverse Fly",
    shortName: "Reverse fly",
    family: "pull",
    equipment: "Incline bench and dumbbells",
    target: "Rear delts, upper back",
    reps: "12-15",
    rest: "60 sec",
    cues: [
      "Chest supported on an incline bench, arms long with a slight elbow bend.",
      "Raise dumbbells out to the sides to about shoulder height.",
      "Move with the rear shoulders and shoulder blades, not momentum.",
    ],
    avoid: [
      "Do not fling the weights behind your head.",
      "Do not shrug up.",
      "Do not use a weight that turns the set into swinging.",
    ],
    progression: "Progress slowly; clean 15s matter more than heavier dumbbells here.",
    motionDemo: {
      workoutXId: "0326",
      label: "Dumbbell incline rear lateral raise",
      match: "exact",
    },
    resources: [
      {
        label: "ACE guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/34/incline-reverse-fly/",
      },
    ],
  },
  "barbell-rdl": {
    id: "barbell-rdl",
    name: "Barbell or Dumbbell Romanian Deadlift",
    shortName: "RDL",
    family: "hinge",
    equipment: "Barbell or dumbbells",
    target: "Hamstrings, glutes, posterior chain",
    reps: "8-10",
    rest: "90-120 sec",
    cues: [
      "Use the same hinge pattern as the dumbbell RDL.",
      "Keep the bar close to your legs and brace before every rep.",
      "If bar setup feels awkward, use dumbbells without guilt.",
    ],
    avoid: [
      "Do not pull from the floor like a conventional deadlift.",
      "Do not round the low back.",
      "Do not add load faster than your hinge skill improves.",
    ],
    progression: "Use dumbbells until the hinge is automatic; then try the bar if setup is safe.",
    motionDemo: {
      workoutXId: "0085",
      label: "Barbell Romanian deadlift",
      match: "exact",
    },
    youtubeId: "V8Hdl1FiNt4",
    swapIds: ["db-rdl"],
    resources: [
      {
        label: "NASM dumbbell RDL",
        url: "https://www.nasm.org/resource-center/exercise-library/dumbbell-romanian-deadlift",
      },
      {
        label: "ACE RDL guide",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/317/romanian-deadlift/",
      },
    ],
  },
  "cable-chest-fly": {
    id: "cable-chest-fly",
    name: "Standing Cable Chest Fly",
    shortName: "Cable fly",
    family: "push",
    equipment: "Cable machine",
    target: "Chest, front shoulders",
    reps: "10-15",
    rest: "60 sec",
    cues: [
      "Set handles around shoulder height, step forward, and keep a slight elbow bend.",
      "Bring hands together in front of the chest and pause briefly.",
      "Return slowly until hands line up around the chest, not far behind you.",
    ],
    avoid: [
      "Do not overload and turn it into a press.",
      "Do not let shoulders roll forward.",
      "Do not stretch beyond control.",
    ],
    progression: "Add reps first; increase weight only when the arc stays smooth.",
    motionDemo: {
      workoutXId: "0227",
      label: "Cable standing fly",
      match: "exact",
    },
    youtubeId: "XY6JrX1wyxk",
    swapIds: ["pec-deck-fly"],
    resources: [
      {
        label: "NASM cable crossover",
        url: "https://www.nasm.org/resource-center/exercise-library/cable-crossover",
      },
      {
        label: "ACE standing fly",
        url: "https://www.acefitness.org/resources/everyone/exercise-library/160/standing-chest-fly/",
      },
      {
        label: "PureGym cable fly",
        url: "https://www.puregym.com/exercises/chest/chest-fly/cable-flyes/",
      },
    ],
  },
  "machine-chest-press": {
    id: "machine-chest-press",
    name: "Machine Chest Press",
    shortName: "Machine press",
    family: "push",
    equipment: "Chest press machine",
    target: "Chest, front shoulders, triceps",
    reps: "8-12",
    rest: "90 sec",
    cues: [
      "Set the seat so the handles begin around mid-chest height.",
      "Brace, keep shoulder blades lightly back, and press the handles forward smoothly.",
      "Return under control until the chest is stretched without shoulders rolling forward.",
    ],
    avoid: [
      "Do not let the handles snap back into the stack.",
      "Do not shrug or let shoulders drift toward the ears.",
      "Do not chase a longer range if the front of the shoulder complains.",
    ],
    progression: "Use this as the stable press swap. Add the smallest load jump after all sets hit the top of the range cleanly.",
    motionDemo: {
      workoutXId: "0577",
      label: "Lever chest press",
      match: "exact",
    },
    youtubeId: "lRo9zZ7EwpM",
    resources: [
      {
        label: "NASM chest press machine",
        url: "https://www.nasm.org/resource-center/exercise-library/chest-press-machine",
      },
      {
        label: "Mayo chest press",
        url: "https://www.mayoclinic.org/healthy-lifestyle/fitness/multimedia/chest-press/vid-20084687",
      },
    ],
  },
  "assisted-pull-up": {
    id: "assisted-pull-up",
    name: "Band-Assisted Pull-Up",
    shortName: "Assisted pull-up",
    family: "pull",
    equipment: "Pull-up bar and band, or assisted pull-up machine",
    target: "Lats, upper back, biceps",
    reps: "6-10",
    rest: "90 sec",
    cues: [
      "Use enough assistance that every rep is smooth and controlled.",
      "Start from a long-arm hang, pull shoulder blades down, then drive elbows toward your ribs.",
      "Lower slowly until arms are long again without dropping into the shoulders.",
    ],
    avoid: [
      "Do not kick, swing, or shorten the bottom range.",
      "Do not use so much assistance that the set feels like cardio.",
      "Do not crane the neck to clear the bar.",
    ],
    progression: "Reduce band or machine assistance gradually while keeping clean vertical pulling mechanics.",
    motionDemo: {
      workoutXId: "0017",
      label: "Assisted pull-up",
      match: "exact",
    },
    youtubeId: "B_VkNQS5YLs",
    resources: [
      {
        label: "NASM band-assisted pull-up",
        url: "https://www.nasm.org/resource-center/exercise-library/band-assisted-pull-up",
      },
      {
        label: "Macros machine assisted pull-up",
        url: "https://macrosinc.net/exercises/back/assisted-machine-pull-up/",
      },
    ],
  },
  "seated-cable-row": {
    id: "seated-cable-row",
    name: "Seated Cable Row",
    shortName: "Seated row",
    family: "pull",
    equipment: "Seated cable row machine",
    target: "Lats, rhomboids, traps, biceps",
    reps: "8-12",
    rest: "75-90 sec",
    cues: [
      "Sit tall with ribs down, knees softly bent, and arms long at the start.",
      "Row the handle toward the lower ribs while keeping shoulders away from ears.",
      "Return with control until the back stretches without rounding forward.",
    ],
    avoid: [
      "Do not lean back and turn each rep into a body swing.",
      "Do not shrug before the handle moves.",
      "Do not let the cable pull you into a rounded spine.",
    ],
    progression: "Add load only when the torso stays still and every rep finishes with elbows moving behind the body.",
    motionDemo: {
      workoutXId: "0861",
      label: "Cable seated row",
      match: "exact",
    },
    youtubeId: "k0cTJCfxa0Y",
    resources: [
      {
        label: "NASM seated machine row",
        url: "https://www.nasm.org/resource-center/exercise-library/seated-machine-row-close-grip",
      },
      {
        label: "PureGym seated row machine",
        url: "https://www.puregym.com/lets-get-started/workout-builder/equipment-how-tos/",
      },
    ],
  },
  "machine-shoulder-press": {
    id: "machine-shoulder-press",
    name: "Machine Shoulder Press",
    shortName: "Machine shoulder",
    family: "push",
    equipment: "Shoulder press machine",
    target: "Shoulders, triceps, upper chest",
    reps: "8-12",
    rest: "75-90 sec",
    cues: [
      "Set the seat so handles begin around shoulder or ear height.",
      "Keep ribs down and press up through a comfortable shoulder path.",
      "Lower slowly until the handles return to the start without bouncing the stack.",
    ],
    avoid: [
      "Do not arch the low back to finish reps.",
      "Do not force elbows directly out to the sides if shoulders feel pinched.",
      "Do not lock out hard or lose control at the bottom.",
    ],
    progression: "Use this as the stable vertical press swap. Add load after the same smooth path is repeatable for every set.",
    motionDemo: {
      workoutXId: "0603",
      label: "Lever shoulder press",
      match: "exact",
    },
    youtubeId: "jUB9xk16y5M",
    resources: [
      {
        label: "Muscle & Strength machine shoulder press",
        url: "https://www.muscleandstrength.com/exercises/machine-shoulder-press",
      },
      {
        label: "PureGym shoulder press machine",
        url: "https://www.puregym.com/lets-get-started/workout-builder/equipment-how-tos/",
      },
    ],
  },
  "pec-deck-fly": {
    id: "pec-deck-fly",
    name: "Pec Deck Fly",
    shortName: "Pec deck",
    family: "push",
    equipment: "Pec deck or chest fly machine",
    target: "Chest, front shoulders",
    reps: "10-15",
    rest: "60 sec",
    cues: [
      "Set the seat so elbows and hands move around chest height.",
      "Keep chest tall and bring the pads or handles together without turning it into a press.",
      "Open slowly until the chest stretches while shoulders stay controlled.",
    ],
    avoid: [
      "Do not let shoulders roll forward at the finish.",
      "Do not overload and shorten the arc.",
      "Do not bounce out of the stretched position.",
    ],
    progression: "Add reps first; increase load only when the fly arc stays smooth and chest-led.",
    motionDemo: {
      workoutXId: "0596",
      label: "Lever seated fly",
      match: "exact",
    },
    youtubeId: "Lw6A9NCwReU",
    resources: [
      {
        label: "FITTR pec deck fly",
        url: "https://www.fittr.com/exercise-video/lever-pec-deck-fly-13/",
      },
      {
        label: "Live Lean pec deck fly",
        url: "https://www.liveleantv.com/how-to-do-a-pec-deck-fly/",
      },
    ],
  },
};

const weeklySchedule: Record<string, SessionTemplate> = {
  Monday: {
    title: "Strength A",
    type: "strength",
    code: "A",
    time: "60-85 min",
    summary: "Phase-scaled warm-up, two specific ramp warm-ups, full-body weights, a brisk treadmill finisher, then floor core work.",
    accent: "strength-a",
    exerciseIds: [
      ...strengthWarmupIds,
      "warmup-ramp-leg-press",
      "warmup-ramp-incline-db-press",
      "leg-press",
      "incline-db-press",
      "lat-pulldown",
      "db-rdl",
      "treadmill-finisher",
      "front-plank",
      "dead-bug",
    ],
    tasks: ["Follow every move in order", "Log weights in pounds", "Keep every rep clean and stop before form breaks"],
    finisher: "Brisk treadmill walk at talk-test pace; duration progresses by phase.",
  },
  Tuesday: {
    title: "Cardio Base",
    type: "cardio",
    code: "CB",
    time: "40-65 min",
    summary: "Treadmill walk: phase-scaled easy warm-up, brisk walking block, and easy cool-down.",
    accent: "cardio",
    exerciseIds: ["warmup-treadmill-walk", "treadmill-walk", "cardio-cooldown-walk"],
    tasks: ["Complete the easy warm-up", "Complete the brisk walking block", "Complete the easy cool-down"],
  },
  Wednesday: {
    title: "Strength B",
    type: "strength",
    code: "B",
    time: "65-90 min",
    summary: "Phase-scaled warm-up, two specific ramp warm-ups, full-body weights, direct arms, a brisk treadmill finisher, then floor core work.",
    accent: "strength-b",
    exerciseIds: [
      ...strengthWarmupIds,
      "warmup-ramp-goblet-squat",
      "warmup-ramp-single-arm-row",
      "goblet-squat",
      "single-arm-row",
      "push-up",
      "seated-db-overhead",
      "incline-reverse-fly",
      "dumbbell-biceps-curl",
      "rope-triceps-pressdown",
      "treadmill-finisher",
      "front-plank",
      "dead-bug",
    ],
    tasks: ["Follow every move in order", "Log weights in pounds", "Keep every rep clean and stop before form breaks"],
    finisher: "Brisk treadmill walk at talk-test pace; duration progresses by phase.",
  },
  Thursday: {
    title: "Easy Movement",
    type: "movement",
    code: "EM",
    time: "25-40 min",
    summary: "20-30 min moderate walk plus 5-10 min light mobility or stretching.",
    accent: "movement",
    exerciseIds: ["treadmill-walk", "mobility-flow", "hip-hinge-drill", "incline-push-up", "warmup-front-plank"],
    tasks: ["20-30 min moderate walk", "5-10 min light mobility", "Keep intensity easy"],
  },
  Friday: {
    title: "Strength C",
    type: "strength",
    code: "C",
    time: "65-90 min",
    summary: "Phase-scaled warm-up, two specific ramp warm-ups, full-body weights, direct arms, a brisk treadmill finisher, then floor core work.",
    accent: "strength-c",
    exerciseIds: [
      ...strengthWarmupIds,
      "warmup-ramp-leg-press",
      "warmup-ramp-incline-db-press",
      "leg-press",
      "incline-db-press",
      "lat-pulldown",
      "barbell-rdl",
      "cable-chest-fly",
      "dumbbell-biceps-curl",
      "rope-triceps-pressdown",
      "treadmill-finisher",
      "front-plank",
      "dead-bug",
    ],
    tasks: ["Follow every move in order", "Log weights in pounds", "Keep every rep clean and stop before form breaks"],
    finisher: "Brisk treadmill walk at talk-test pace; duration progresses by phase.",
  },
  Saturday: {
    title: "Long Cardio",
    type: "cardio",
    code: "LC",
    time: "45-60 min",
    summary: "45-60 min brisk treadmill walk or outdoor walk.",
    accent: "cardio-long",
    exerciseIds: ["long-cardio-walk"],
    tasks: ["45-60 min brisk walk", "Use talk-test intensity", "Optional outdoor route"],
  },
  Sunday: {
    title: "Recovery",
    type: "recovery",
    code: "R",
    time: "15-30 min",
    summary: "Rest from hard training; easy walk if you want; weigh-in average, waist check, meal prep optional.",
    accent: "recovery",
    exerciseIds: [],
    tasks: ["Review weekly average weight", "Waist check at navel", "Meal prep optional", "Easy walk optional"],
  },
};

const scheduleOrder = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const sessionTypeLabels: Record<SessionType, string> = {
  strength: "Strength",
  cardio: "Cardio",
  movement: "Movement",
  recovery: "Recovery",
};

const libraryOrder = [
  "warmup-treadmill-walk",
  "bodyweight-squat",
  "hip-hinge-drill",
  "incline-push-up",
  "warmup-front-plank",
  "warmup-ramp-leg-press",
  "warmup-ramp-incline-db-press",
  "warmup-ramp-goblet-squat",
  "warmup-ramp-single-arm-row",
  "leg-press",
  "goblet-squat",
  "incline-db-press",
  "machine-chest-press",
  "lat-pulldown",
  "assisted-pull-up",
  "seated-cable-row",
  "db-rdl",
  "barbell-rdl",
  "front-plank",
  "dead-bug",
  "dumbbell-biceps-curl",
  "rope-triceps-pressdown",
  "single-arm-row",
  "push-up",
  "seated-db-overhead",
  "machine-shoulder-press",
  "incline-reverse-fly",
  "cable-chest-fly",
  "pec-deck-fly",
  "treadmill-finisher",
  "treadmill-walk",
  "cardio-cooldown-walk",
  "long-cardio-walk",
  "mobility-flow",
];

function dateFromIso(iso: string) {
  return new Date(`${iso}T12:00:00`);
}

function isoFromDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(iso: string, amount: number) {
  const next = dateFromIso(iso);
  next.setDate(next.getDate() + amount);
  return isoFromDate(next);
}

function diffDays(fromIso: string, toIso: string) {
  const from = dateFromIso(fromIso).getTime();
  const to = dateFromIso(toIso).getTime();
  return Math.round((to - from) / 86_400_000);
}

function dayName(iso: string) {
  return dateFromIso(iso).toLocaleDateString("en-US", { weekday: "long" });
}

function formatDate(iso: string, style: "short" | "long" = "long") {
  return dateFromIso(iso).toLocaleDateString("en-US", {
    weekday: style === "long" ? "long" : "short",
    month: "short",
    day: "numeric",
  });
}

function phaseForWeek(week: number) {
  if (week <= 2) {
    return {
      label: "Weeks 1-2",
      sets: "2 working sets",
      note: "Build the habit, use 10-minute treadmill warm-ups, and keep every rep clean before adding weight.",
    };
  }
  if (week <= 6) {
    return {
      label: "Weeks 3-6",
      sets: "3 sets for the first 4 lifts",
      note: "Warm-up drills add reps, cardio blocks grow, and load increases only after clean top-range reps.",
    };
  }
  if (week <= 10) {
    return {
      label: "Weeks 7-10",
      sets: "Same structure, optional extra set",
      note: "Use slower warm-up reps, a 12-minute lift finisher, and one extra set on one big lift only if recovery feels good.",
    };
  }
  if (week === 11) {
    return {
      label: "Week 11",
      sets: "Deload",
      note: "Reduce loads 10-15 percent and do 2 sets for everything. Keep walking.",
    };
  }
  if (week === 12) {
    return {
      label: "Week 12",
      sets: "Compare week",
      note: "Return to normal loads and compare waist, photos, average body weight, and strength.",
    };
  }
  if (week <= 14) {
    return {
      label: "Weeks 13-14",
      sets: "Rebuild block",
      note: "Start the second block slightly below your best week-12 loads, keep the longer warm-up, then rebuild clean top-range reps.",
    };
  }
  if (week <= 18) {
    return {
      label: "Weeks 15-18",
      sets: "3-4 working sets",
      note: "Use the double-progression rule, longer cardio blocks, and 12-15 minute lift finishers.",
    };
  }
  if (week <= 22) {
    return {
      label: "Weeks 19-22",
      sets: "Advanced consistency",
      note: "First 4 lifts can use 4 sets if recovery is good. Warm-ups reach 15 minutes and accessories stay controlled.",
    };
  }
  if (week === 23) {
    return {
      label: "Week 23",
      sets: "Deload",
      note: "Reduce loads 10-15 percent and use 2 sets. Keep walking but let fatigue fall.",
    };
  }
  return {
    label: "Weeks 24-26",
    sets: "Final compare",
    note: "Weeks 24-26 return to normal loads. Compare body metrics, photos, and strength against week 1 and week 12.",
  };
}

function recommendedSets(planDay: PlanDay, exercise: Exercise, index: number) {
  if (isRampWarmup(exercise)) return 2;
  if (exercise.family === "warmup") return 1;
  if (exercise.family === "cardio") return 1;
  if (planDay.session.type !== "strength") return 1;
  if (planDay.week <= 2) return 2;
  if (planDay.week === 11 || planDay.week === 23) return 2;
  if (exercise.id === "front-plank") return planDay.week >= 19 && planDay.week <= 22 ? 4 : 3;
  if (exercise.id === "dead-bug" || exercise.family === "arms") return planDay.week >= 15 ? 3 : 2;

  const workingIds = planDay.session.exerciseIds.filter((id) => {
    const item = exerciseMap[id];
    return item && item.family !== "warmup" && item.family !== "cardio";
  });
  const warmupCount = planDay.session.exerciseIds.filter((id) => {
    const item = exerciseMap[id];
    return item?.family === "warmup";
  }).length;
  const foundWorkingIndex = workingIds.indexOf(exercise.id);
  const workingIndex = foundWorkingIndex >= 0 ? foundWorkingIndex : Math.max(0, index - warmupCount);

  if (planDay.week <= 6) return workingIndex < 4 ? 3 : 2;
  if (planDay.week <= 10) return workingIndex === 0 ? 4 : workingIndex < 4 ? 3 : 2;
  if (planDay.week <= 14) return workingIndex < 4 ? 3 : 2;
  if (planDay.week <= 18) return workingIndex === 0 ? 4 : workingIndex < 4 ? 3 : 2;
  if (planDay.week <= 22) return workingIndex < 4 ? 4 : 3;
  return workingIndex < 4 ? 3 : 2;
}

function isRampWarmup(exercise: Exercise) {
  return exercise.id.startsWith("warmup-ramp-");
}

function warmupTarget(planDay: PlanDay, exercise: Exercise) {
  if (exercise.id === "warmup-treadmill-walk") {
    if (planDay.week <= 2) return "10 min easy";
    if (planDay.week <= 6) return "10 min easy, last 2 min a little brisker";
    if (planDay.week <= 10) return "12 min easy-to-moderate";
    if (planDay.week === 11) return "8-10 min easy deload";
    if (planDay.week <= 14) return "12 min easy-to-moderate";
    if (planDay.week <= 18) return "12 min with 3 brisk 30-sec pickups";
    if (planDay.week <= 22) return "15 min easy-to-moderate";
    if (planDay.week === 23) return "8-10 min easy deload";
    return "12-15 min easy-to-moderate";
  }

  if (exercise.id === "bodyweight-squat") {
    if (planDay.week <= 2) return "8 smooth reps";
    if (planDay.week <= 6) return "10 smooth reps";
    if (planDay.week <= 10) return "10 reps with a 2-sec bottom pause";
    if (planDay.week === 11) return "8 easy reps";
    if (planDay.week <= 14) return "10 controlled reps";
    if (planDay.week <= 18) return "12 reps with a 2-sec bottom pause";
    if (planDay.week <= 22) return "12 controlled reps";
    if (planDay.week === 23) return "8 easy reps";
    return "12 crisp reps";
  }

  if (exercise.id === "hip-hinge-drill") {
    if (planDay.week <= 2) return "8 smooth reps";
    if (planDay.week <= 6) return "10 smooth reps";
    if (planDay.week <= 10) return "10 reps with a 2-sec hamstring stretch";
    if (planDay.week === 11) return "8 easy reps";
    if (planDay.week <= 14) return "10 controlled reps";
    if (planDay.week <= 18) return "12 reps with a 2-sec hamstring stretch";
    if (planDay.week <= 22) return "12 slow reps";
    if (planDay.week === 23) return "8 easy reps";
    return "12 crisp reps";
  }

  if (exercise.id === "incline-push-up") {
    if (planDay.week <= 2) return "6 clean reps";
    if (planDay.week <= 6) return "8 clean reps";
    if (planDay.week <= 10) return "10 clean reps";
    if (planDay.week === 11) return "6 easy reps";
    if (planDay.week <= 14) return "8 reps, slightly lower bench if easy";
    if (planDay.week <= 18) return "10 reps, controlled lowering";
    if (planDay.week <= 22) return "10 reps, lower incline if form is solid";
    if (planDay.week === 23) return "6 easy reps";
    return "10 crisp reps";
  }

  if (exercise.id === "warmup-front-plank") {
    if (planDay.week <= 2) return "20 sec";
    if (planDay.week <= 6) return "25 sec";
    if (planDay.week <= 10) return "30 sec";
    if (planDay.week === 11) return "20 sec easy";
    if (planDay.week <= 14) return "25 sec";
    if (planDay.week <= 18) return "30 sec";
    if (planDay.week <= 22) return "30 sec with slower breathing";
    if (planDay.week === 23) return "20 sec easy";
    return "30 sec crisp brace";
  }

  if (exercise.id === "mobility-flow") {
    if (planDay.week <= 6) return "5-10 min";
    if (planDay.week <= 14) return "8-12 min";
    if (planDay.week === 23) return "5-8 min easy";
    return "10-12 min";
  }

  return exercise.reps;
}

function rampWarmupTarget(planDay: PlanDay, exercise: Exercise) {
  const isUpperBody = exercise.id.includes("press") || exercise.id.includes("row");
  if (planDay.week === 11 || planDay.week === 23) {
    return isUpperBody
      ? "2 easy sets: 40-55% working lbs"
      : "2 easy sets: 45-60% working lbs";
  }
  if (planDay.week <= 2) {
    return isUpperBody
      ? "2 lighter sets: 40-60% working lbs"
      : "2 lighter sets: 50-65% working lbs";
  }
  if (planDay.week <= 10) {
    return isUpperBody
      ? "2 ramp sets: 50-70% working lbs"
      : "2 ramp sets: 55-75% working lbs";
  }
  if (planDay.week <= 18) {
    return isUpperBody
      ? "2 ramp sets: 55-75% working lbs"
      : "2 ramp sets: 60-80% working lbs";
  }
  return isUpperBody
    ? "2 ramp sets: 60-80% working lbs"
    : "2 ramp sets: 65-85% working lbs";
}

function warmupProgressionForExercise(planDay: PlanDay, exercise: Exercise) {
  if (isRampWarmup(exercise)) {
    if (planDay.week === 11 || planDay.week === 23) {
      return "Deload week: keep both ramp sets lighter than usual and use them only to rehearse the movement.";
    }
    return `${exercise.progression} These are logged in pounds so you can see how your warm-up weights rise as your working weights rise.`;
  }

  if (exercise.id === "warmup-treadmill-walk") {
    return "The warm-up starts at 10 minutes, grows toward 12-15 minutes in later phases, and stays easy enough that the first lift still feels powerful.";
  }

  if (exercise.family === "warmup") {
    return `${exercise.progression} The target changes by phase so the prep work keeps matching your fitness level.`;
  }

  return exercise.progression;
}

function rangedTarget(base: string, week: number) {
  if (base.includes("20-45 sec")) {
    if (week <= 2) return "20-30 sec";
    if (week <= 6) return "30-45 sec";
    if (week <= 10) return "35-50 sec";
    if (week === 11) return "20-30 sec lighter";
    if (week <= 14) return "35-50 sec";
    if (week <= 18) return "45-60 sec";
    if (week <= 22) return "50-70 sec";
    if (week === 23) return "30-45 sec deload";
    return "45-75 sec";
  }

  if (base.includes("6-15")) {
    if (week <= 2) return "6-10 reps";
    if (week <= 6) return "8-12 reps";
    if (week <= 10) return "10-15 reps";
    if (week === 11) return "6-10 reps lighter";
    if (week <= 14) return "8-12 reps";
    if (week <= 22) return "10-15 reps";
    if (week === 23) return "6-10 reps deload";
    return "10-15 reps";
  }

  if (base.includes("12-15")) {
    if (week <= 2) return "12 reps";
    if (week <= 6) return "12-15 reps";
    if (week <= 10) return "15 clean reps";
    if (week === 11) return "12 reps lighter";
    if (week <= 14) return "12-15 reps";
    if (week <= 22) return "15 clean reps";
    if (week === 23) return "12 reps deload";
    return "12-15 reps";
  }

  if (base.includes("10-15")) {
    if (week <= 2) return "10-12 reps";
    if (week <= 6) return "10-15 reps";
    if (week <= 10) return "12-15 reps";
    if (week === 11) return "10-12 reps lighter";
    if (week <= 14) return "10-15 reps";
    if (week <= 22) return "12-15 reps";
    if (week === 23) return "10-12 reps deload";
    return "10-15 reps";
  }

  if (base.includes("8-10")) {
    if (week <= 2) return "8 reps";
    if (week <= 6) return "8-10 reps";
    if (week <= 10) return "10 clean reps";
    if (week === 11) return "8 reps lighter";
    if (week <= 14) return "8-10 reps";
    if (week <= 22) return "8-10 heavier";
    if (week === 23) return "8 reps deload";
    return "8-10 reps";
  }

  if (base.includes("8-12")) {
    if (week <= 2) return "8-10 reps";
    if (week <= 6) return "8-12 reps";
    if (week <= 10) return "10-12 reps";
    if (week === 11) return "8-10 reps lighter";
    if (week <= 14) return "8-12 reps";
    if (week <= 18) return "10-12 reps";
    if (week <= 22) return "8-12 heavier";
    if (week === 23) return "8-10 reps deload";
    return "8-12 reps";
  }

  return base;
}

function cardioTarget(planDay: PlanDay, exercise: Exercise) {
  if (exercise.id === "treadmill-walk" && planDay.session.title === "Cardio Base") {
    if (planDay.week <= 2) return "25-30 min brisk";
    if (planDay.week <= 6) return "30-35 min brisk";
    if (planDay.week <= 10) return "35-40 min brisk";
    if (planDay.week === 11) return "25-30 min easy";
    if (planDay.week <= 14) return "35-40 min brisk";
    if (planDay.week <= 18) return "40-45 min brisk";
    if (planDay.week <= 22) return "45 min brisk";
    if (planDay.week === 23) return "30 min easy";
    return "45-50 min brisk";
  }

  if (exercise.id === "treadmill-walk" && planDay.session.title === "Easy Movement") {
    if (planDay.week <= 2) return "20-30 min moderate";
    if (planDay.week <= 6) return "25-35 min moderate";
    if (planDay.week <= 10) return "30-40 min moderate";
    if (planDay.week === 11) return "20-30 min easy";
    if (planDay.week <= 14) return "30-40 min moderate";
    if (planDay.week <= 18) return "35-45 min moderate";
    if (planDay.week <= 22) return "40-45 min moderate";
    if (planDay.week === 23) return "20-30 min easy";
    return "35-45 min moderate";
  }

  if (exercise.id === "long-cardio-walk") {
    if (planDay.week <= 2) return "45-55 min brisk";
    if (planDay.week <= 6) return "50-60 min brisk";
    if (planDay.week <= 10) return "55-65 min brisk";
    if (planDay.week === 11) return "40-50 min easy";
    if (planDay.week <= 14) return "55-65 min brisk";
    if (planDay.week <= 18) return "60-70 min brisk";
    if (planDay.week <= 22) return "65-75 min brisk";
    if (planDay.week === 23) return "40-50 min easy";
    return "60-75 min brisk";
  }

  if (exercise.id === "treadmill-finisher") {
    if (planDay.week <= 6) return "10 min brisk";
    if (planDay.week <= 10) return "12 min brisk";
    if (planDay.week === 11) return "8-10 min easy";
    if (planDay.week <= 14) return "12 min brisk";
    if (planDay.week <= 18) return "12-15 min brisk";
    if (planDay.week <= 22) return "15 min brisk";
    if (planDay.week === 23) return "8-10 min easy";
    return "15 min brisk";
  }

  return exercise.reps;
}

function sessionTimeForDay(planDay: PlanDay) {
  if (planDay.session.type === "strength") {
    const hasDirectArms = planDay.session.exerciseIds.includes("dumbbell-biceps-curl");
    if (planDay.week === 11 || planDay.week === 23) return hasDirectArms ? "55-70 min" : "50-65 min";
    if (planDay.week <= 2) return hasDirectArms ? "65-80 min" : "60-75 min";
    if (planDay.week <= 10) return hasDirectArms ? "70-85 min" : "65-80 min";
    if (planDay.week <= 18) return hasDirectArms ? "75-90 min" : "70-85 min";
    return hasDirectArms ? "80-95 min" : "75-90 min";
  }

  if (planDay.session.title === "Cardio Base") {
    if (planDay.week === 11 || planDay.week === 23) return "40-45 min";
    if (planDay.week <= 2) return "40-45 min";
    if (planDay.week <= 6) return "45-50 min";
    if (planDay.week <= 10) return "50-55 min";
    if (planDay.week <= 18) return "55-60 min";
    return "60-65 min";
  }

  if (planDay.session.title === "Easy Movement") {
    if (planDay.week === 11 || planDay.week === 23) return "25-35 min";
    if (planDay.week <= 2) return "25-40 min";
    if (planDay.week <= 6) return "30-45 min";
    return "40-55 min";
  }

  if (planDay.session.title === "Long Cardio") {
    if (planDay.week === 11 || planDay.week === 23) return "40-50 min";
    if (planDay.week <= 2) return "45-55 min";
    if (planDay.week <= 6) return "50-60 min";
    if (planDay.week <= 10) return "55-65 min";
    return "60-75 min";
  }

  return planDay.session.time;
}

function sessionSummaryForDay(planDay: PlanDay) {
  if (planDay.session.type === "strength") {
    const finisher = cardioTarget(planDay, exerciseMap["treadmill-finisher"]);
    const hasDirectArms = planDay.session.exerciseIds.includes("dumbbell-biceps-curl");
    const armText = hasDirectArms ? "direct arms, " : "";
    return `Phase-scaled warm-up, two lift-specific ramp warm-ups, full-body weights, ${armText}dead bugs, and ${finisher}.`;
  }

  if (planDay.session.title === "Cardio Base") {
    return `Treadmill walk: ${warmupTarget(planDay, exerciseMap["warmup-treadmill-walk"])}, ${cardioTarget(
      planDay,
      exerciseMap["treadmill-walk"],
    )}, then 5 min easy cool-down.`;
  }

  if (planDay.session.title === "Easy Movement") {
    return `Moderate walk, ${warmupTarget(planDay, exerciseMap["mobility-flow"])}, and easy movement prep without turning it into a hard workout.`;
  }

  if (planDay.session.title === "Long Cardio") {
    return `${cardioTarget(planDay, exerciseMap["long-cardio-walk"])} at talk-test pace.`;
  }

  return planDay.session.summary;
}

function targetForExercise(planDay: PlanDay, exercise: Exercise) {
  if (isRampWarmup(exercise)) return rampWarmupTarget(planDay, exercise);
  if (exercise.family === "warmup") return warmupTarget(planDay, exercise);
  if (exercise.family === "cardio") return cardioTarget(planDay, exercise);
  if (exercise.id === "dead-bug") {
    if (planDay.week <= 2) return "8 each side";
    if (planDay.week <= 6) return "8-10 each side";
    if (planDay.week <= 10) return "10-12 each side";
    if (planDay.week === 11) return "6-8 each side deload";
    if (planDay.week <= 14) return "8-10 each side";
    if (planDay.week <= 22) return "10-12 each side";
    if (planDay.week === 23) return "6-8 each side deload";
    return "10-12 each side";
  }
  if (planDay.session.title === "Strength C" && exercise.id === "leg-press") {
    return rangedTarget("10-15", planDay.week);
  }
  return rangedTarget(exercise.reps, planDay.week);
}

function restForExercise(planDay: PlanDay, exercise: Exercise) {
  if (planDay.week === 11 || planDay.week === 23) {
    if (exercise.family === "warmup" || exercise.family === "cardio") return exercise.rest;
    return "60-90 sec";
  }
  return exercise.rest;
}

function progressionForExercise(planDay: PlanDay, exercise: Exercise) {
  if (exercise.family === "warmup") return warmupProgressionForExercise(planDay, exercise);
  if (planDay.week === 11 || planDay.week === 23) {
    return "Deload week: reduce load about 10-15 percent, stop well before form breaks, and focus on clean movement.";
  }
  if (planDay.week >= 13) {
    return `${exercise.progression} For this extended block, use the PDF double-progression rule: when all sets hit the top target cleanly, add the smallest available load next time.`;
  }
  return exercise.progression;
}

function tracksWeight(exercise: Exercise) {
  return exercise.logType !== "done";
}

function activeExerciseFor(originalExercise: Exercise, log: DayLog) {
  const selectedSwapId = log.swaps?.[originalExercise.id];
  if (!selectedSwapId || !originalExercise.swapIds?.includes(selectedSwapId)) return originalExercise;
  return exerciseMap[selectedSwapId] ?? originalExercise;
}

function swapOptionsFor(exercise: Exercise) {
  return (exercise.swapIds ?? []).flatMap((id) => (exerciseMap[id] ? [exerciseMap[id]] : []));
}

function isSwappedExercise(originalExercise: Exercise, log: DayLog) {
  return activeExerciseFor(originalExercise, log).id !== originalExercise.id;
}

function parseLoadValue(value: string) {
  const match = value.replace(",", ".").match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function formatLoadValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function formatLoggedWeightText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /[a-z]/i.test(trimmed) ? trimmed : `${trimmed} lb`;
}

function estimatedCardioMinutes(planDay: PlanDay) {
  if (planDay.session.title === "Cardio Base") {
    if (planDay.week === 11 || planDay.week === 23) return 40;
    if (planDay.week <= 2) return 40;
    if (planDay.week <= 6) return 45;
    if (planDay.week <= 10) return 50;
    if (planDay.week <= 18) return 55;
    return 60;
  }
  if (planDay.session.title === "Long Cardio") {
    if (planDay.week === 11 || planDay.week === 23) return 45;
    if (planDay.week <= 2) return 50;
    if (planDay.week <= 6) return 55;
    if (planDay.week <= 10) return 60;
    if (planDay.week <= 18) return 65;
    return 70;
  }
  if (planDay.session.title === "Easy Movement") {
    if (planDay.week === 11 || planDay.week === 23) return 25;
    if (planDay.week <= 2) return 25;
    if (planDay.week <= 6) return 30;
    if (planDay.week <= 10) return 35;
    return 40;
  }
  if (planDay.session.type === "strength") {
    if (planDay.week === 11 || planDay.week === 23) return 18;
    if (planDay.week <= 6) return 20;
    if (planDay.week <= 10) return 24;
    if (planDay.week <= 18) return 27;
    return 30;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function nowIso() {
  return new Date().toISOString();
}

function formatClock(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeStore(value: unknown): TrackerStore | null {
  if (!isRecord(value)) return null;
  const days = isRecord(value.days)
    ? Object.entries(value.days).reduce<Record<string, DayLog>>((merged, [date, log]) => {
        merged[date] = normalizeDayLog(log as DayLog | undefined);
        return merged;
      }, {})
    : {};
  const metrics = isRecord(value.metrics)
    ? Object.entries(value.metrics).reduce<Record<string, MetricLog>>((merged, [date, metric]) => {
        merged[date] = normalizeMetricLogShape(metric as MetricLog | undefined);
        return merged;
      }, {})
    : {};

  return {
    days,
    metrics,
  };
}

function loadStore(): TrackerStore {
  if (typeof window === "undefined") return { days: {}, metrics: {} };
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (!saved) return { days: {}, metrics: {} };
    return normalizeStore(JSON.parse(saved)) ?? { days: {}, metrics: {} };
  } catch {
    return { days: {}, metrics: {} };
  }
}

function loadStoreMeta(): StoreMeta {
  if (typeof window === "undefined") return {};
  try {
    const saved = window.localStorage.getItem(STORAGE_META_KEY);
    if (!saved) return {};
    const parsed = JSON.parse(saved);
    return isRecord(parsed) ? (parsed as StoreMeta) : {};
  } catch {
    return {};
  }
}

function saveStoreMeta(meta: StoreMeta) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_META_KEY, JSON.stringify(meta));
}

function hasStoreData(store: TrackerStore) {
  return Object.keys(store.days).length > 0 || Object.keys(store.metrics).length > 0;
}

function mergeChecks(
  cloudChecks: Record<string, boolean> = {},
  localChecks: Record<string, boolean> = {},
) {
  const ids = new Set([...Object.keys(cloudChecks), ...Object.keys(localChecks)]);
  return [...ids].reduce<Record<string, boolean>>((merged, id) => {
    merged[id] = Boolean(localChecks[id] ?? cloudChecks[id]);
    return merged;
  }, {});
}

function mergeSwaps(
  cloudSwaps: Record<string, string> = {},
  localSwaps: Record<string, string> = {},
) {
  return {
    ...cloudSwaps,
    ...localSwaps,
  };
}

function preferFilled(localValue = "", cloudValue = "") {
  return localValue.trim() ? localValue : cloudValue;
}

function mergeSetRows(cloudRows: SetLog[] = [], localRows: SetLog[] = []) {
  const rowCount = Math.max(cloudRows.length, localRows.length);
  return Array.from({ length: rowCount }, (_, index) => {
    const cloudRow = cloudRows[index] ?? emptySet();
    const localRow = localRows[index] ?? emptySet();
    return {
      weight: preferFilled(localRow.weight, cloudRow.weight),
      done: Boolean(localRow.done ?? cloudRow.done),
    };
  });
}

function mergeDayLog(cloudLog: DayLog | undefined, localLog: DayLog | undefined) {
  if (!cloudLog) return normalizeDayLog(localLog);
  if (!localLog) return normalizeDayLog(cloudLog);

  const normalizedCloudLog = normalizeDayLog(cloudLog);
  const normalizedLocalLog = normalizeDayLog(localLog);

  const cloudExercises = normalizedCloudLog.exercises;
  const localExercises = normalizedLocalLog.exercises;
  const exerciseIds = new Set([
    ...Object.keys(cloudExercises),
    ...Object.keys(localExercises),
  ]);

  return {
    completed: Boolean(normalizedLocalLog.completed ?? normalizedCloudLog.completed),
    warmup: mergeChecks(normalizedCloudLog.warmup, normalizedLocalLog.warmup),
    tasks: mergeChecks(normalizedCloudLog.tasks, normalizedLocalLog.tasks),
    swaps: mergeSwaps(normalizedCloudLog.swaps, normalizedLocalLog.swaps),
    exercises: [...exerciseIds].reduce<Record<string, SetLog[]>>((merged, id) => {
      merged[id] = mergeSetRows(cloudExercises[id], localExercises[id]);
      return merged;
    }, {}),
    notes: preferFilled(normalizedLocalLog.notes, normalizedCloudLog.notes),
  };
}

function mergeMetricLog(metric: MetricLog | undefined, localMetric: MetricLog | undefined) {
  if (!metric) return localMetric ?? createEmptyMetric();
  if (!localMetric) return metric;
  return {
    weight: preferFilled(localMetric.weight, metric.weight),
    waist: preferFilled(localMetric.waist, metric.waist),
    note: preferFilled(localMetric.note, metric.note),
  };
}

function mergeStores(localStore: TrackerStore, cloudStore: TrackerStore) {
  const dayIds = new Set([...Object.keys(cloudStore.days), ...Object.keys(localStore.days)]);
  const metricIds = new Set([
    ...Object.keys(cloudStore.metrics),
    ...Object.keys(localStore.metrics),
  ]);

  return {
    days: [...dayIds].reduce<Record<string, DayLog>>((merged, id) => {
      merged[id] = mergeDayLog(cloudStore.days[id], localStore.days[id]);
      return merged;
    }, {}),
    metrics: [...metricIds].reduce<Record<string, MetricLog>>((merged, id) => {
      merged[id] = mergeMetricLog(cloudStore.metrics[id], localStore.metrics[id]);
      return merged;
    }, {}),
  };
}

function shouldMergeLocalWithCloud(localStore: TrackerStore, cloudStore: TrackerStore, meta: StoreMeta) {
  if (!hasStoreData(localStore)) return false;
  if (!hasStoreData(cloudStore)) return true;
  if (!meta.lastCloudSyncedAt) return true;
  return Boolean(meta.localUpdatedAt && meta.localUpdatedAt > meta.lastCloudSyncedAt);
}

function chooseInitialSyncedStore(localStore: TrackerStore, cloudStore: TrackerStore, meta: StoreMeta) {
  return shouldMergeLocalWithCloud(localStore, cloudStore, meta)
    ? mergeStores(localStore, cloudStore)
    : cloudStore;
}

function ensureSetRows(existing: SetLog[] | undefined, count: number) {
  const rows = existing ? [...existing] : [];
  while (rows.length < count) rows.push(emptySet());
  return rows;
}

function youtubeUrl(id?: string) {
  return id ? `https://www.youtube.com/watch?v=${id}` : "";
}

function youtubeEmbedUrl(id?: string) {
  return id
    ? `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`
    : "";
}

function workoutXGifUrl(workoutXId?: string) {
  return workoutXId ? `/api/workoutx-gif?id=${encodeURIComponent(workoutXId)}` : "";
}

async function fetchCloudStore(userId: string) {
  if (!supabase) return { store: { days: {}, metrics: {} }, updatedAt: null };

  const { data, error } = await supabase
    .from("workout_progress")
    .select("data, updated_at")
    .eq("user_id", userId)
    .limit(1);

  if (error) throw error;

  const row = data?.[0] as { data: unknown; updated_at: string } | undefined;
  return {
    store: normalizeStore(row?.data) ?? { days: {}, metrics: {} },
    updatedAt: row?.updated_at ?? null,
  };
}

async function upsertCloudStore(userId: string, store: TrackerStore) {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("workout_progress")
    .upsert({ user_id: userId, data: store }, { onConflict: "user_id" })
    .select("updated_at")
    .single();

  if (error) throw error;
  return (data as { updated_at: string } | null)?.updated_at ?? null;
}

function buildPlanDays() {
  return Array.from({ length: PROGRAM_DAYS }, (_, index) => {
    const iso = addDays(START_DATE, index);
    const actualName = dayName(iso);
    const planName = scheduleOrder[index % scheduleOrder.length];
    return {
      iso,
      index,
      week: Math.floor(index / 7) + 1,
      dayName: actualName,
      planDayName: planName,
      session: weeklySchedule[planName],
    };
  });
}

function closestProgramDate() {
  const today = isoFromDate(new Date());
  const offset = diffDays(START_DATE, today);
  if (offset < 0) return START_DATE;
  if (offset >= PROGRAM_DAYS) return addDays(START_DATE, PROGRAM_DAYS - 1);
  return today;
}

function familyLabel(family: Exercise["family"]) {
  return {
    legs: "Legs",
    push: "Push",
    pull: "Pull",
    hinge: "Hinge",
    core: "Core",
    arms: "Arms",
    warmup: "Warm-up",
    cardio: "Cardio",
  }[family];
}

const locationLabels: Record<TrainingLocation, { label: string; detail: string }> = {
  upstairs: {
    label: "Upstairs OK",
    detail: "Good to do in your unit if you have clear floor space and head downstairs soon after.",
  },
  downstairs: {
    label: "Downstairs",
    detail: "Keep this in the home gym because it needs equipment or should happen right before lifting.",
  },
  "downstairs-outside": {
    label: "Downstairs/outside",
    detail: "Use the downstairs treadmill or an outdoor route for the planned cardio pace.",
  },
  either: {
    label: "Either",
    detail: "Can be done upstairs or downstairs; choose the option that keeps the session flowing.",
  },
};

function trainingLocationForExercise(exercise: Exercise): TrainingLocation {
  if (exercise.trainingLocation) return exercise.trainingLocation;
  if (exercise.family === "warmup") return "upstairs";
  if (exercise.family === "cardio") return "downstairs-outside";
  return "downstairs";
}

function locationGuideForExercise(exercise: Exercise) {
  const type = trainingLocationForExercise(exercise);
  return {
    type,
    label: locationLabels[type].label,
    detail: exercise.locationNote ?? locationLabels[type].detail,
  };
}

function locationFlowNoteForDay(planDay: PlanDay) {
  if (planDay.session.type === "strength") {
    return "Start with the Upstairs OK moves in your unit, then go downstairs for the treadmill warm-up, ramp sets, lifting, and treadmill finisher. After that, Either floor work can be upstairs or downstairs.";
  }

  if (planDay.session.type === "movement") {
    return "Mobility and bodyweight prep can be upstairs. Do the walking portion downstairs on the treadmill or outside.";
  }

  if (planDay.session.type === "cardio") {
    return "Use the downstairs treadmill or an outdoor route for the walking work.";
  }

  return "Recovery work can happen upstairs unless you choose an optional walk.";
}

function lastExerciseLoad(planDays: PlanDay[], store: TrackerStore, selectedDay: PlanDay, exerciseId: string) {
  for (let index = selectedDay.index - 1; index >= 0; index -= 1) {
    const day = planDays[index];
    const previousRows = store.days[day.iso]?.exercises[exerciseId] ?? [];
    const weights = previousRows
      .map((row) => row.weight.trim())
      .filter(Boolean);

    if (weights.length > 0) {
      const numericLoads = weights
        .map(parseLoadValue)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
      return {
        date: formatDate(day.iso, "short"),
        weights: weights.join(", "),
        maxLoad: numericLoads.length ? Math.max(...numericLoads) : null,
        allDone: previousRows.length > 0 && previousRows.every((row) => row.done),
      };
    }
  }

  return null;
}

function smartLoadSuggestion(
  planDays: PlanDay[],
  store: TrackerStore,
  selectedDay: PlanDay,
  exercise: Exercise,
  exerciseIndex: number,
) {
  const setCount = recommendedSets(selectedDay, exercise, exerciseIndex);
  const target = targetForExercise(selectedDay, exercise);

  if (!tracksWeight(exercise)) {
    return {
      label: "Complete clean",
      detail: `Do ${setCount} ${setCount === 1 ? "round" : "rounds"} at ${target}. Mark it done when form and pace stay controlled.`,
      tone: "steady",
    };
  }

  const previousLoad = lastExerciseLoad(planDays, store, selectedDay, exercise.id);

  if (!previousLoad) {
    return {
      label: "Start conservative",
      detail: `Choose a weight in pounds you can control for ${setCount} ${setCount === 1 ? "set" : "sets"} of ${target}. The first win is repeatable form.`,
      tone: "start",
    };
  }

  if ((selectedDay.week === 11 || selectedDay.week === 23) && previousLoad.maxLoad) {
    const low = formatLoadValue(previousLoad.maxLoad * 0.85);
    const high = formatLoadValue(previousLoad.maxLoad * 0.9);
    return {
      label: "Deload load",
      detail: `Last top logged load was ${formatLoggedWeightText(previousLoad.weights)}. Use about ${low}-${high} lb today and make every rep smooth.`,
      tone: "deload",
    };
  }

  if (previousLoad.allDone) {
    return {
      label: "Hold or nudge up",
      detail: `Last time was ${formatLoggedWeightText(previousLoad.weights)} on ${previousLoad.date}. Start there; if set 1 feels clean, take the smallest available jump.`,
      tone: "build",
    };
  }

  return {
    label: "Repeat and own it",
    detail: `Last logged load was ${formatLoggedWeightText(previousLoad.weights)} on ${previousLoad.date}. Repeat that before increasing.`,
    tone: "steady",
  };
}

function completedRows(rows: SetLog[]) {
  return rows.filter((row) => row.done).length;
}

function ExerciseMedia({
  exercise,
  variant,
}: {
  exercise: Exercise;
  variant: "gym" | "thumb" | "library";
}) {
  const [showGif, setShowGif] = useState(false);
  const [gifFailed, setGifFailed] = useState(false);
  const demo = exercise.motionDemo;
  const canShowGif = Boolean(demo && !gifFailed);
  const isShowingGif = Boolean(canShowGif && showGif);
  const className = `exercise-media exercise-media-${variant} ${
    isShowingGif ? "has-gif" : exercise.youtubeId ? "has-video" : "placeholder"
  }`;

  return (
    <div
      className={`exercise-media-shell exercise-media-shell-${variant} ${
        isShowingGif ? "showing-gif" : "showing-video"
      }`}
    >
      {isShowingGif && demo ? (
        <div className={className}>
          <img
            className="exercise-gif"
            src={workoutXGifUrl(demo.workoutXId)}
            alt={`${exercise.name}: ${demo.label} animated demonstration`}
            loading={variant === "gym" ? "eager" : "lazy"}
            decoding="async"
            onError={() => {
              setGifFailed(true);
              setShowGif(false);
            }}
          />
        </div>
      ) : exercise.youtubeId ? (
        <div className={className}>
          <iframe
            title={`${exercise.name} YouTube demo`}
            src={youtubeEmbedUrl(exercise.youtubeId)}
            loading={variant === "gym" ? "eager" : "lazy"}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        </div>
      ) : (
        <div className={className}>
          <span className="motion-badge">Guide</span>
        </div>
      )}

      {canShowGif && demo && (
        <div className="gif-controls">
          <button
            className={`gif-toggle-button ${isShowingGif ? "active" : ""}`}
            type="button"
            onClick={() => setShowGif((current) => !current)}
            aria-pressed={isShowingGif}
          >
            <Icon name={isShowingGif ? "video" : "activity"} size={14} />
            {isShowingGif ? (exercise.youtubeId ? "Show YouTube" : "Hide GIF") : "Show GIF"}
          </button>
          <span>{demo.match === "exact" ? "Exact demo" : "Reference demo"}</span>
        </div>
      )}
    </div>
  );
}

function ExerciseMediaLinks({
  exercise,
  compact = false,
}: {
  exercise: Exercise;
  compact?: boolean;
}) {
  if (!exercise.youtubeId) return null;

  return (
    <div className={`media-actions ${compact ? "compact-media-actions" : ""}`}>
      <a href={youtubeUrl(exercise.youtubeId)} target="_blank" rel="noreferrer">
        <Icon name="video" size={14} /> YouTube
      </a>
    </div>
  );
}

export default function Home() {
  const planDays = useMemo(buildPlanDays, []);
  const [selectedDate, setSelectedDate] = useState(() => closestProgramDate());
  const [store, setStore] = useState<TrackerStore>(() => loadStore());
  const [isHydrated, setIsHydrated] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>(
    supabaseConfigError ? "error" : isSupabaseConfigured ? "signed-out" : "local-only",
  );
  const [cloudError, setCloudError] = useState(supabaseConfigError);
  const [cloudReadyForUser, setCloudReadyForUser] = useState<string | null>(null);
  const [lastCloudSyncedAt, setLastCloudSyncedAt] = useState<string | null>(
    () => formatClock(loadStoreMeta().lastCloudSyncedAt),
  );
  const [activeSection, setActiveSection] = useState<AppSection>("today");
  const [gymExerciseIndex, setGymExerciseIndex] = useState(0);
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [librarySearch, setLibrarySearch] = useState("");
  const [detailExerciseId, setDetailExerciseId] = useState<string | null>(null);
  const latestStoreRef = useRef(store);
  const lastAutoAlignedDateRef = useRef(selectedDate);
  const firstLocalSaveRef = useRef(true);
  const suppressLocalChangeMetaRef = useRef(false);
  const suppressNextCloudSaveRef = useRef(false);

  useEffect(() => {
    setIsHydrated(true);

    const alignWithCurrentProgramDate = () => {
      const nextProgramDate = closestProgramDate();
      if (lastAutoAlignedDateRef.current === nextProgramDate) return;

      lastAutoAlignedDateRef.current = nextProgramDate;
      setSelectedDate(nextProgramDate);
      setActiveSection("today");
    };

    const alignWhenVisible = () => {
      if (document.visibilityState === "visible") alignWithCurrentProgramDate();
    };

    window.addEventListener("focus", alignWithCurrentProgramDate);
    document.addEventListener("visibilitychange", alignWhenVisible);

    return () => {
      window.removeEventListener("focus", alignWithCurrentProgramDate);
      document.removeEventListener("visibilitychange", alignWhenVisible);
    };
  }, []);

  useEffect(() => {
    setGymExerciseIndex(0);
    setDetailExerciseId(null);
  }, [selectedDate]);

  useEffect(() => {
    if (!detailExerciseId || typeof window === "undefined") return undefined;

    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetailExerciseId(null);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [detailExerciseId]);

  useEffect(() => {
    latestStoreRef.current = store;
  }, [store]);

  useEffect(() => {
    if (!isHydrated) return;
    const savedAt = nowIso();
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));

    if (firstLocalSaveRef.current) {
      firstLocalSaveRef.current = false;
    } else if (suppressLocalChangeMetaRef.current) {
      suppressLocalChangeMetaRef.current = false;
    } else {
      const nextMeta = { ...loadStoreMeta(), localUpdatedAt: savedAt };
      saveStoreMeta(nextMeta);
    }

    setLastSavedAt(formatClock(savedAt));
  }, [isHydrated, store]);

  useEffect(() => {
    if (supabaseConfigError) {
      setCloudStatus("error");
      setCloudError(supabaseConfigError);
      return;
    }

    if (!supabase) return;

    let isMounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return;
      if (error) {
        setCloudStatus("error");
        setCloudError(error.message);
        return;
      }
      setSession(data.session);
      setCloudStatus(data.session ? "loading" : "signed-out");
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setCloudReadyForUser(null);
      setCloudError("");
      setCloudStatus(nextSession ? "loading" : "signed-out");
    });

    return () => {
      isMounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !session?.user.id || !isHydrated) return;

    let isCancelled = false;

    async function loadCloudProgress() {
      const userId = session.user.id;
      setCloudStatus("loading");
      setCloudError("");

      try {
        const localStore = latestStoreRef.current;
        const localMeta = loadStoreMeta();
        const { store: cloudStore, updatedAt } = await fetchCloudStore(userId);
        if (isCancelled) return;

        const nextStore = chooseInitialSyncedStore(localStore, cloudStore, localMeta);
        suppressLocalChangeMetaRef.current = true;
        suppressNextCloudSaveRef.current = true;
        setStore(nextStore);

        const cloudUpdatedAt = await upsertCloudStore(userId, nextStore);
        if (isCancelled) return;

        const syncedAt = nowIso();
        saveStoreMeta({
          ...loadStoreMeta(),
          cloudUpdatedAt: cloudUpdatedAt ?? updatedAt ?? syncedAt,
          lastCloudSyncedAt: syncedAt,
          lastUserId: userId,
        });
        setLastCloudSyncedAt(formatClock(syncedAt));
        setCloudReadyForUser(userId);
        setCloudStatus("synced");
      } catch (error) {
        if (isCancelled) return;
        setCloudStatus("error");
        setCloudError(error instanceof Error ? error.message : "Cloud sync failed.");
      }
    }

    void loadCloudProgress();

    return () => {
      isCancelled = true;
    };
  }, [isHydrated, session?.user.id]);

  useEffect(() => {
    if (!supabase || !session?.user.id || cloudReadyForUser !== session.user.id) return;
    if (suppressNextCloudSaveRef.current) {
      suppressNextCloudSaveRef.current = false;
      return;
    }

    setCloudStatus("saving");
    const saveTimer = window.setTimeout(() => {
      const userId = session.user.id;
      upsertCloudStore(userId, latestStoreRef.current)
        .then((cloudUpdatedAt) => {
          const syncedAt = nowIso();
          saveStoreMeta({
            ...loadStoreMeta(),
            cloudUpdatedAt: cloudUpdatedAt ?? syncedAt,
            lastCloudSyncedAt: syncedAt,
            lastUserId: userId,
          });
          setLastCloudSyncedAt(formatClock(syncedAt));
          setCloudError("");
          setCloudStatus("synced");
        })
        .catch((error: unknown) => {
          setCloudStatus("error");
          setCloudError(error instanceof Error ? error.message : "Cloud sync failed.");
        });
    }, 700);

    return () => window.clearTimeout(saveTimer);
  }, [cloudReadyForUser, session?.user.id, store]);

  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      let shouldReloadForUpdate = true;

      const reloadOnceForUpdate = () => {
        if (!shouldReloadForUpdate) return;
        const key = "recomp-gym-console-sw-refresh";
        if (window.sessionStorage.getItem(key) === "done") return;
        window.sessionStorage.setItem(key, "done");
        window.location.reload();
      };

      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          void registration.update();

          if (registration.waiting) {
            registration.waiting.postMessage({ type: "SKIP_WAITING" });
          }

          registration.addEventListener("updatefound", () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener("statechange", () => {
              if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
                installingWorker.postMessage({ type: "SKIP_WAITING" });
              }
            });
          });
        })
        .catch(() => undefined);

      navigator.serviceWorker.addEventListener("controllerchange", reloadOnceForUpdate);

      return () => {
        shouldReloadForUpdate = false;
        navigator.serviceWorker.removeEventListener("controllerchange", reloadOnceForUpdate);
      };
    }

    return undefined;
  }, []);

  const selectedDay =
    planDays.find((day) => day.iso === selectedDate) ?? planDays[0];
  const selectedLog = normalizeDayLog(store.days[selectedDay.iso]);
  const selectedMetric = store.metrics[selectedDay.iso] ?? createEmptyMetric();
  const phase = phaseForWeek(selectedDay.week);
  const selectedSessionTime = sessionTimeForDay(selectedDay);
  const selectedSessionSummary = sessionSummaryForDay(selectedDay);
  const selectedLocationNote = locationFlowNoteForDay(selectedDay);
  const selectedExercises = selectedDay.session.exerciseIds.flatMap((id) =>
    exerciseMap[id] ? [exerciseMap[id]] : [],
  );
  const currentWeekStartIndex = Math.floor(selectedDay.index / 7) * 7;
  const currentWeekDays = planDays.slice(currentWeekStartIndex, currentWeekStartIndex + 7);
  const selectedWeekStart = planDays[currentWeekStartIndex]?.iso ?? selectedDay.iso;
  const weekOptions = useMemo(
    () =>
      Array.from({ length: Math.ceil(PROGRAM_DAYS / 7) }, (_, weekIndex) => {
        const firstDay = planDays[weekIndex * 7];
        const lastDay = planDays[Math.min(weekIndex * 7 + 6, planDays.length - 1)];
        return {
          value: firstDay.iso,
          label: `Week ${weekIndex + 1}`,
          detail: `${formatDate(firstDay.iso, "short")} - ${formatDate(lastDay.iso, "short")}`,
        };
      }),
    [planDays],
  );

  const stats = useMemo(() => {
    const completedDates = new Set(
      Object.entries(store.days)
        .filter(([, log]) => log.completed)
        .map(([date]) => date),
    );

    const completedDays = completedDates.size;
    const strengthSessions = planDays.filter(
      (day) => day.session.type === "strength" && completedDates.has(day.iso),
    ).length;

    const cardioMinutes = planDays.reduce(
      (sum, day) => (completedDates.has(day.iso) ? sum + estimatedCardioMinutes(day) : sum),
      0,
    );

    const completedSets = Object.values(store.days).reduce(
      (daySum, log) =>
        daySum +
        Object.values(log.exercises).reduce(
          (exerciseSum, sets) => exerciseSum + sets.filter((set) => set.done).length,
          0,
        ),
      0,
    );
    const bodyCheckIns = Object.values(store.metrics).filter(
      (metric) => metric.weight.trim() || metric.waist.trim() || metric.note.trim(),
    ).length;

    let streak = 0;
    for (let index = selectedDay.index; index >= 0; index -= 1) {
      if (completedDates.has(planDays[index].iso)) streak += 1;
      else break;
    }

    return {
      completedDays,
      strengthSessions,
      cardioMinutes,
      completedSets,
      bodyCheckIns,
      streak,
      percent: Math.round((completedDays / PROGRAM_DAYS) * 100),
    };
  }, [planDays, selectedDay.index, store.days, store.metrics]);

  const achievements = [
    {
      label: "First gym day",
      earned: stats.completedDays >= 1,
      detail: "Complete any plan day.",
    },
    {
      label: "Three-day chain",
      earned: stats.streak >= 3,
      detail: "Complete 3 days in a row.",
    },
    {
      label: "Strength rhythm",
      earned: stats.strengthSessions >= 3,
      detail: "Complete 3 strength sessions.",
    },
    {
      label: "Cardio floor",
      earned: stats.cardioMinutes >= 150,
      detail: "Log 150 cardio minutes.",
    },
    {
      label: "Data-minded",
      earned: Object.keys(store.metrics).length >= 2,
      detail: "Log 2 body check-ins.",
    },
    {
      label: "Week one locked",
      earned: planDays.slice(0, 7).every((day) => store.days[day.iso]?.completed),
      detail: "Complete the first 7 program days.",
    },
  ];

  const updateDay = (date: string, updater: (log: DayLog) => DayLog) => {
    setStore((current) => {
      const nextLog = updater(normalizeDayLog(current.days[date]));
      return {
        ...current,
        days: {
          ...current.days,
          [date]: nextLog,
        },
      };
    });
  };

  const updateMetric = (date: string, updater: (log: MetricLog) => MetricLog) => {
    setStore((current) => {
      const nextLog = updater(current.metrics[date] ?? createEmptyMetric());
      return {
        ...current,
        metrics: {
          ...current.metrics,
          [date]: nextLog,
        },
      };
    });
  };

  const updateSet = (
    exerciseId: string,
    setIndex: number,
    field: keyof SetLog,
    value: string | boolean,
  ) => {
    updateDay(selectedDay.iso, (log) => {
      const exercise = exerciseMap[exerciseId];
      const exerciseIndex = selectedExercises.findIndex(
        (item) => item.id === exerciseId || activeExerciseFor(item, selectedLog).id === exerciseId,
      );
      const count = Math.max(
        recommendedSets(selectedDay, exercise, exerciseIndex),
        log.exercises[exerciseId]?.length ?? 0,
      );
      const rows = ensureSetRows(log.exercises[exerciseId], count);
      rows[setIndex] = {
        ...rows[setIndex],
        [field]: value,
      };
      if (field === "weight" && typeof value === "string" && value.trim()) {
        rows[setIndex].done = true;
      }
      return {
        ...log,
        exercises: {
          ...log.exercises,
          [exerciseId]: rows,
        },
      };
    });
  };

  const setExerciseSwap = (originalExerciseId: string, nextExerciseId: string) => {
    updateDay(selectedDay.iso, (log) => {
      const nextSwaps = { ...(log.swaps ?? {}) };
      if (nextExerciseId === originalExerciseId) {
        delete nextSwaps[originalExerciseId];
      } else {
        nextSwaps[originalExerciseId] = nextExerciseId;
      }

      return {
        ...log,
        swaps: nextSwaps,
      };
    });
  };

  const toggleExerciseDone = (exerciseId: string, setCount: number, isComplete: boolean) => {
    updateDay(selectedDay.iso, (log) => {
      const rows = ensureSetRows(log.exercises[exerciseId], setCount).map((row) => ({
        ...row,
        done: !isComplete,
      }));

      return {
        ...log,
        exercises: {
          ...log.exercises,
          [exerciseId]: rows,
        },
      };
    });
  };

  const toggleTask = (taskId: string) => {
    updateDay(selectedDay.iso, (log) => ({
      ...log,
      tasks: {
        ...log.tasks,
        [taskId]: !log.tasks[taskId],
      },
    }));
  };

  const getAuthCredentials = () => {
    const email = authEmail.trim().toLowerCase();
    const password = authPassword;
    setCloudError("");

    if (!email) {
      setAuthMessage("Enter your email first.");
      return null;
    }
    if (password.length < 8) {
      setAuthMessage("Use a password with at least 8 characters.");
      return null;
    }

    return { email, password };
  };

  const handleSignInWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!supabase) return;

    const credentials = getAuthCredentials();
    if (!credentials) return;

    setAuthMessage("Signing in...");
    setCloudError("");

    const { error } = await supabase.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      setAuthMessage("");
      setCloudStatus("error");
      setCloudError(error.message);
      return;
    }

    setAuthPassword("");
    setAuthMessage("Signed in. Cloud sync is loading your progress now.");
  };

  const handleCreateAccount = async () => {
    if (!supabase) return;

    const credentials = getAuthCredentials();
    if (!credentials) return;

    setAuthMessage("Creating your account...");
    setCloudError("");

    const { data, error } = await supabase.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      setAuthMessage("");
      setCloudStatus("error");
      setCloudError(error.message);
      return;
    }

    setAuthPassword("");
    setAuthMessage(
      data.session
        ? "Account created and signed in. Cloud sync is loading your progress now."
        : "Account created. Supabase is asking for email confirmation first. Confirm the email once, then return here and sign in with your password.",
    );
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) {
      setCloudStatus("error");
      setCloudError(error.message);
      return;
    }

    setCloudReadyForUser(null);
    setCloudStatus("signed-out");
    setAuthMessage("Signed out. Your local copy stays on this device.");
  };

  const filteredLibrary = libraryOrder
    .map((id) => exerciseMap[id])
    .filter((exercise) => {
      const matchesFilter = libraryFilter === "all" || exercise.family === libraryFilter;
      const query = librarySearch.trim().toLowerCase();
      const matchesSearch =
        !query ||
        exercise.name.toLowerCase().includes(query) ||
        exercise.target.toLowerCase().includes(query) ||
        exercise.equipment.toLowerCase().includes(query);
      return matchesFilter && matchesSearch;
    });

  const nextDay = planDays[Math.min(selectedDay.index + 1, planDays.length - 1)];
  const previousDay = planDays[Math.max(selectedDay.index - 1, 0)];
  const syncHeadline = supabaseConfigError
    ? "Check Supabase settings"
    : !isSupabaseConfigured
    ? "Connect Supabase to sync"
    : session
      ? cloudStatus === "loading"
        ? "Loading cloud progress"
        : cloudStatus === "saving"
          ? "Saving to cloud"
          : cloudStatus === "error"
            ? "Sync needs attention"
            : "Synced across devices"
      : "Sign in to sync";
  const syncCopy = supabaseConfigError
    ? "Your workouts still save locally. The production sync settings need correction in Vercel, then a redeploy."
    : !isSupabaseConfigured
    ? "Local saving still works. Add your Supabase URL and publishable key to unlock the same data on your MacBook and iPhone."
    : session
      ? "You are signed in, so every workout check, weight, note, and body check-in saves locally and to your cloud account."
      : "Sign in or create an account with email and password. This works inside the iPhone Home Screen app without magic links or custom SMTP.";

  const weeklyCompletion = useMemo(
    () =>
      weekOptions.map((week, weekIndex) => {
        const days = planDays.slice(weekIndex * 7, weekIndex * 7 + 7);
        const completed = days.filter((day) => store.days[day.iso]?.completed).length;
        return {
          ...week,
          completed,
          total: days.length,
          percent: Math.round((completed / days.length) * 100),
        };
      }),
    [planDays, store.days, weekOptions],
  );
  const recentCompletedDays = planDays
    .filter((day) => store.days[day.iso]?.completed)
    .slice(-6)
    .reverse();
  const workoutMoveRows = selectedExercises.map((originalExercise, exerciseIndex) => {
    const activeExercise = activeExerciseFor(originalExercise, selectedLog);
    const setCount = recommendedSets(selectedDay, activeExercise, exerciseIndex);
    const rows = ensureSetRows(selectedLog.exercises[activeExercise.id], setCount);
    const doneCount = completedRows(rows);
    const isComplete = rows.length > 0 && doneCount >= rows.length;

    return {
      originalExercise,
      activeExercise,
      exerciseIndex,
      setCount,
      rows,
      doneCount,
      isComplete,
      target: targetForExercise(selectedDay, activeExercise),
      rest: restForExercise(selectedDay, activeExercise),
      location: locationGuideForExercise(activeExercise),
      progression: progressionForExercise(selectedDay, activeExercise),
      suggestion: smartLoadSuggestion(planDays, store, selectedDay, activeExercise, exerciseIndex),
      swaps: swapOptionsFor(originalExercise),
      isSwapped: isSwappedExercise(originalExercise, selectedLog),
    };
  });
  const completedMoveCount = workoutMoveRows.filter((move) => move.isComplete).length;
  const moveCompletionPercent = workoutMoveRows.length
    ? Math.round((completedMoveCount / workoutMoveRows.length) * 100)
    : selectedLog.completed
      ? 100
      : 0;
  const completedTaskCount = selectedDay.session.tasks.filter((task) => selectedLog.tasks[task]).length;
  const taskCompletionPercent = selectedDay.session.tasks.length
    ? Math.round((completedTaskCount / selectedDay.session.tasks.length) * 100)
    : 0;
  const nextOpenMove = workoutMoveRows.find((move) => !move.isComplete) ?? workoutMoveRows[0] ?? null;
  const currentGymMove = workoutMoveRows[gymExerciseIndex] ?? null;
  const currentGymExercise = currentGymMove?.activeExercise ?? null;
  const currentGymOriginalExercise = currentGymMove?.originalExercise ?? null;
  const currentGymRows = currentGymMove?.rows ?? null;
  const currentGymPreviousLoad = currentGymExercise
    ? lastExerciseLoad(planDays, store, selectedDay, currentGymExercise.id)
    : null;
  const currentGymTarget = currentGymMove?.target ?? "";
  const currentGymRest = currentGymMove?.rest ?? "";
  const currentGymLocation = currentGymMove?.location ?? null;
  const currentGymSuggestion = currentGymMove?.suggestion ?? null;
  const detailMove = detailExerciseId
    ? workoutMoveRows.find((move) => move.originalExercise.id === detailExerciseId) ?? null
    : null;
  const detailExercise = detailMove?.activeExercise ?? null;
  const detailRows = detailMove?.rows ?? null;
  const detailPreviousLoad = detailExercise
    ? lastExerciseLoad(planDays, store, selectedDay, detailExercise.id)
    : null;
  const detailLocation = detailMove?.location ?? null;
  const bestLiftRows = libraryOrder
    .map((id) => {
      const exercise = exerciseMap[id];
      if (!exercise || !tracksWeight(exercise) || exercise.family === "warmup") return null;

      const allLoads = Object.values(store.days).flatMap((log) =>
        (log.exercises[id] ?? [])
          .map((row) => parseLoadValue(row.weight))
          .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
      );

      if (!allLoads.length) return null;

      return {
        id,
        name: exercise.shortName,
        load: Math.max(...allLoads),
        family: exercise.family,
      };
    })
    .filter((item): item is { id: string; name: string; load: number; family: Exercise["family"] } =>
      Boolean(item),
    )
    .sort((a, b) => b.load - a.load)
    .slice(0, 5);
  const bodyTrend = useMemo(() => {
    const entries = Object.entries(store.metrics)
      .map(([date, metric]) => ({
        date,
        weight: parseLoadValue(metric.weight),
        waist: parseLoadValue(metric.waist),
      }))
      .filter((entry) => entry.weight !== null || entry.waist !== null)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (entries.length < 2) return null;

    const first = entries[0];
    const last = entries[entries.length - 1];
    const weightDelta =
      first.weight !== null && last.weight !== null ? last.weight - first.weight : null;
    const waistDelta = first.waist !== null && last.waist !== null ? last.waist - first.waist : null;

    return {
      from: formatDate(first.date, "short"),
      to: formatDate(last.date, "short"),
      weightDelta,
      waistDelta,
    };
  }, [store.metrics]);
  const activeSectionLabel = {
    today: "Today",
    gym: "Gym Mode",
    week: "Week",
    progress: "Progress",
    library: "Library",
    account: "Account",
  }[activeSection];
  const navItems = [
    { id: "today" as const, label: "Today", icon: "activity" as const },
    { id: "gym" as const, label: "Gym", icon: "dumbbell" as const },
    { id: "week" as const, label: "Week", icon: "calendar" as const },
    { id: "progress" as const, label: "Progress", icon: "progress" as const },
    { id: "library" as const, label: "Library", icon: "library" as const },
    { id: "account" as const, label: "Account", icon: "user" as const },
  ];

  const completeNextGymSet = () => {
    if (!currentGymExercise || !currentGymRows) return;
    const nextSetIndex = currentGymRows.findIndex((row) => !row.done);
    updateSet(currentGymExercise.id, nextSetIndex >= 0 ? nextSetIndex : 0, "done", true);
  };

  const goToNextGymMove = () => {
    setGymExerciseIndex((index) => Math.min(index + 1, Math.max(selectedExercises.length - 1, 0)));
  };

  const goToPreviousGymMove = () => {
    setGymExerciseIndex((index) => Math.max(index - 1, 0));
  };

  return (
    <main className={`app-shell section-${activeSection}`}>
      <header className={`app-header ${selectedDay.session.accent}`}>
        <div className="brand-lockup">
          <span className="brand-mark">RG</span>
          <div>
            <p className="eyebrow">Workout tracker · {activeSectionLabel}</p>
            <h1>Recomp Gym Console</h1>
          </div>
        </div>

        <div className="header-status-grid" aria-label="Current status">
          <div className="header-status-card">
            <span>Today</span>
            <strong>{selectedDay.session.title}</strong>
            <small>
              {formatDate(selectedDay.iso)} · Week {selectedDay.week} · Day {selectedDay.index + 1}
            </small>
          </div>
          <div className={`header-status-card sync-mini ${cloudStatus}`}>
            <span>Save</span>
            <strong>{lastSavedAt ?? "Ready"}</strong>
            <small>{syncHeadline}</small>
          </div>
        </div>
      </header>

      <nav className="section-tabs" aria-label="Main app sections">
        {navItems.map(({ id, label, icon }) => (
          <button
            key={id}
            className={activeSection === id ? "active" : ""}
            type="button"
            onClick={() => setActiveSection(id)}
            aria-current={activeSection === id ? "page" : undefined}
          >
            <Icon name={icon} size={18} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="week-planner" aria-label="Program week">
        <div className="week-planner-top">
          <div>
            <p className="eyebrow">Week {selectedDay.week}</p>
            <h2>{selectedDay.session.title}</h2>
          </div>
          <label className="week-jump">
            <span>Jump to week</span>
            <select
              value={selectedWeekStart}
              onChange={(event) => setSelectedDate(event.target.value)}
              aria-label="Jump to week"
            >
              {weekOptions.map((week) => (
                <option key={week.value} value={week.value}>
                  {week.label} · {week.detail}
                </option>
              ))}
            </select>
          </label>
        </div>

        <nav className="week-grid" aria-label="Days in selected week">
          {currentWeekDays.map((day) => (
            <button
              key={day.iso}
              className={`week-day-card ${day.iso === selectedDay.iso ? "active" : ""} ${
                store.days[day.iso]?.completed ? "complete" : ""
              } ${day.session.type}`}
              onClick={() => setSelectedDate(day.iso)}
              type="button"
              aria-label={`${formatDate(day.iso)} ${day.session.title}`}
            >
              <span>{day.dayName.slice(0, 3)}</span>
              <strong>{day.session.code}</strong>
              <small>{day.session.title}</small>
            </button>
          ))}
        </nav>
      </section>

      <section className="progress-strip" aria-label="Program progress">
        <div className="progress-meter">
          <div>
            <span>Program progress</span>
            <strong>{stats.percent}%</strong>
          </div>
          <div className="progress-track">
            <span style={{ width: `${stats.percent}%` }} />
          </div>
        </div>
        <div className="quick-stat">
          <span>Streak</span>
          <strong>{stats.streak}</strong>
        </div>
        <div className="quick-stat">
          <span>Completed</span>
          <strong>
            {stats.completedDays}/{PROGRAM_DAYS}
          </strong>
        </div>
        <div className="strip-actions">
          <button type="button" onClick={() => setSelectedDate(previousDay.iso)}>
            Prev
          </button>
          <button type="button" onClick={() => setSelectedDate(closestProgramDate())}>
            Today
          </button>
          <button type="button" onClick={() => setSelectedDate(nextDay.iso)}>
            Next
          </button>
        </div>
      </section>

      <div className="mobile-save-status" aria-live="polite">
        <span>Local save</span>
        <strong>{isHydrated ? lastSavedAt ?? "Ready" : "Loading"}</strong>
      </div>

      <section className="today-day-switcher" aria-label="Choose workout day">
        <div>
          <p className="eyebrow">Selected workout day</p>
          <h2>{selectedDay.session.title}</h2>
          <p>
            {formatDate(selectedDay.iso)} · Day {selectedDay.index + 1} · PDF {selectedDay.planDayName}
          </p>
        </div>
        <label className="week-jump">
          <span>Jump to week</span>
          <select
            value={selectedWeekStart}
            onChange={(event) => setSelectedDate(event.target.value)}
            aria-label="Jump to week"
          >
            {weekOptions.map((week) => (
              <option key={week.value} value={week.value}>
                {week.label} · {week.detail}
              </option>
            ))}
          </select>
        </label>
        <nav className="today-week-strip" aria-label="Choose day in selected week">
          {currentWeekDays.map((day) => (
            <button
              key={day.iso}
              className={`today-day-button ${day.iso === selectedDay.iso ? "active" : ""} ${
                store.days[day.iso]?.completed ? "complete" : ""
              } ${day.session.type}`}
              onClick={() => setSelectedDate(day.iso)}
              type="button"
              aria-label={`${formatDate(day.iso)} ${day.session.title}`}
            >
              <span>{day.dayName.slice(0, 3)}</span>
              <strong>{day.session.code}</strong>
              <small>{day.index + 1}</small>
            </button>
          ))}
        </nav>
      </section>

      <section className="gym-mode-shell" aria-label="Gym mode">
        {currentGymMove && currentGymExercise && currentGymRows ? (
          <article className={`gym-card ${currentGymExercise.family}`}>
            <div className="gym-topbar">
              <button
                type="button"
                onClick={goToPreviousGymMove}
                disabled={gymExerciseIndex === 0}
                aria-label="Previous move"
              >
                <Icon name="chevronLeft" size={18} />
              </button>
              <span>
                Move {gymExerciseIndex + 1} of {selectedExercises.length}
              </span>
              <button
                type="button"
                onClick={goToNextGymMove}
                disabled={gymExerciseIndex >= selectedExercises.length - 1}
                aria-label="Next move"
              >
                <Icon name="chevronRight" size={18} />
              </button>
            </div>

            <div className="gym-main">
              <div>
                <div className="exercise-labels">
                  <span className="family-chip">{familyLabel(currentGymExercise.family)}</span>
                  {currentGymLocation && (
                    <span className={`location-chip ${currentGymLocation.type}`}>
                      {currentGymLocation.label}
                    </span>
                  )}
                  <span className="order-chip">
                    {completedRows(currentGymRows)}/{currentGymRows.length} sets
                  </span>
                  {currentGymMove.isSwapped && currentGymOriginalExercise && (
                    <span className="swap-chip">
                      Swapped from {currentGymOriginalExercise.shortName}
                    </span>
                  )}
                </div>
                <h2>{currentGymExercise.name}</h2>
                <p>{currentGymExercise.target}</p>
              </div>
              <div className="gym-media-stack">
                <ExerciseMedia exercise={currentGymExercise} variant="gym" />
                <ExerciseMediaLinks exercise={currentGymExercise} />
              </div>
            </div>

            <div className="gym-target-grid">
              <div>
                <span>Target</span>
                <strong>{currentGymTarget}</strong>
              </div>
              <div>
                <span>Rest</span>
                <strong>{currentGymRest}</strong>
              </div>
              <div>
                <span>Equipment</span>
                <strong>{currentGymExercise.equipment}</strong>
              </div>
              {currentGymLocation && (
                <div className={`location-fact ${currentGymLocation.type}`}>
                  <span>Where</span>
                  <strong>{currentGymLocation.label}</strong>
                  <small>{currentGymLocation.detail}</small>
                </div>
              )}
              <div>
                <span>Last load</span>
                <strong>
                  {currentGymPreviousLoad ? formatLoggedWeightText(currentGymPreviousLoad.weights) : "New"}
                </strong>
              </div>
            </div>

            {currentGymOriginalExercise && currentGymMove.swaps.length > 0 && (
              <div className="swap-control-strip" aria-label={`${currentGymOriginalExercise.name} swap options`}>
                <span>
                  <Icon name="swap" size={15} /> Swap
                </span>
                <button
                  className={!currentGymMove.isSwapped ? "selected" : ""}
                  type="button"
                  onClick={() => setExerciseSwap(currentGymOriginalExercise.id, currentGymOriginalExercise.id)}
                >
                  Original
                </button>
                {currentGymMove.swaps.map((swap) => (
                  <button
                    key={swap.id}
                    className={currentGymExercise.id === swap.id ? "selected" : ""}
                    type="button"
                    onClick={() => setExerciseSwap(currentGymOriginalExercise.id, swap.id)}
                  >
                    {swap.shortName}
                  </button>
                ))}
              </div>
            )}

            {currentGymSuggestion && (
              <div className={`load-suggestion smart-load ${currentGymSuggestion.tone}`}>
                <Icon name="spark" size={16} />
                <span>
                  <strong>{currentGymSuggestion.label}</strong>
                  <small>{currentGymSuggestion.detail}</small>
                </span>
              </div>
            )}

            <div className="set-table gym-set-table" aria-label={`${currentGymExercise.name} gym set log`}>
              <div className="set-head">
                <span>Set</span>
                <span>Target</span>
                <span>Weight (lbs)</span>
                <span>Done</span>
              </div>
              {currentGymRows.map((set, setIndex) => (
                <div className="set-row" key={`${currentGymExercise.id}-gym-${setIndex}`}>
                  <span>{setIndex + 1}</span>
                  <strong className="target-pill">{currentGymTarget}</strong>
                  {tracksWeight(currentGymExercise) ? (
                    <input
                      inputMode="decimal"
                      value={set.weight}
                      placeholder="lbs"
                      onChange={(event) =>
                        updateSet(currentGymExercise.id, setIndex, "weight", event.target.value)
                      }
                      aria-label={`${currentGymExercise.name} set ${setIndex + 1} weight in pounds`}
                    />
                  ) : (
                    <span className="load-pill">{currentGymExercise.loadLabel ?? "body"}</span>
                  )}
                  <label className="mini-check">
                    <input
                      type="checkbox"
                      checked={set.done}
                      onChange={(event) =>
                        updateSet(currentGymExercise.id, setIndex, "done", event.target.checked)
                      }
                    />
                    <span />
                  </label>
                </div>
              ))}
            </div>

            <div className="gym-details-grid">
              <details className="form-details">
                <summary>How to do it</summary>
                <ul>
                  {currentGymExercise.cues.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </details>
              <details className="form-details">
                <summary>Common mistakes</summary>
                <ul>
                  {currentGymExercise.avoid.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </details>
            </div>

            <div className="gym-action-bar">
              <button
                type="button"
                onClick={goToPreviousGymMove}
                disabled={gymExerciseIndex === 0}
                aria-label="Previous move"
              >
                <Icon name="chevronLeft" size={18} />
                <span className="gym-action-label optional">Previous</span>
              </button>
              <button
                className="primary"
                type="button"
                onClick={completeNextGymSet}
                aria-label="Complete next set"
              >
                <Icon name="check" size={18} />
                <span className="gym-action-label gym-action-full">Complete Set</span>
                <span className="gym-action-label gym-action-short">Done</span>
              </button>
              <button
                type="button"
                onClick={goToNextGymMove}
                disabled={gymExerciseIndex >= selectedExercises.length - 1}
                aria-label="Next move"
              >
                <span className="gym-action-label optional">Next</span>
                <Icon name="chevronRight" size={18} />
              </button>
            </div>
          </article>
        ) : (
          <section className="empty-gym-card">
            <p className="eyebrow">{selectedDay.session.title}</p>
            <h2>No gym moves today</h2>
            <p>{selectedSessionSummary}</p>
            <button type="button" onClick={() => setActiveSection("today")}>
              Back to Today
            </button>
          </section>
        )}
      </section>

      <div className="layout-grid">
        <section className={`workout-panel today-command-panel ${selectedDay.session.accent}`} aria-labelledby="today-heading">
          <div className="today-command-header">
            <div>
              <p className="eyebrow">{sessionTypeLabels[selectedDay.session.type]}</p>
              <h2 id="today-heading">{selectedDay.session.title}</h2>
              <p className="today-command-date">
                {formatDate(selectedDay.iso)} · Day {selectedDay.index + 1} · {phase.label}
              </p>
            </div>
            <div className="today-actions">
              {selectedExercises.length > 0 && (
                <button className="gym-launch-button" type="button" onClick={() => setActiveSection("gym")}>
                  <Icon name="play" size={18} /> Gym Mode
                </button>
              )}
              <button
                className={`complete-button ${selectedLog.completed ? "is-complete" : ""}`}
                type="button"
                onClick={() =>
                  updateDay(selectedDay.iso, (log) => ({
                    ...log,
                    completed: !log.completed,
                  }))
                }
              >
                {selectedLog.completed ? "Completed" : "Mark Complete"}
              </button>
            </div>
          </div>

          <div className="command-progress-grid">
            <div className="command-progress-card primary">
              <span>Move progress</span>
              <strong>
                {completedMoveCount}/{workoutMoveRows.length || selectedDay.session.tasks.length}
              </strong>
              <div className="progress-track compact">
                <span style={{ width: `${moveCompletionPercent}%` }} />
              </div>
            </div>
            <div className="command-progress-card">
              <span>Next</span>
              <strong>{nextOpenMove?.activeExercise.shortName ?? "Recovery"}</strong>
              <small>{nextOpenMove?.target ?? selectedSessionSummary}</small>
            </div>
            <div className="command-progress-card">
              <span>Session</span>
              <strong>{selectedSessionTime}</strong>
              <small>{phase.sets}</small>
            </div>
          </div>

          <p className="plan-note">{selectedSessionSummary}</p>
          <p className="phase-note">{phase.note}</p>
          <p className="location-flow-note">
            <strong>Home/gym split:</strong> {selectedLocationNote}
          </p>

          <section className="checklist-block compact-targets" aria-labelledby="tasks-heading">
            <div className="flow-heading">
              <h3 id="tasks-heading">Today&apos;s Targets</h3>
              <span>{completedTaskCount}/{selectedDay.session.tasks.length}</span>
            </div>
            <div className="progress-track compact task-track">
              <span style={{ width: `${taskCompletionPercent}%` }} />
            </div>
            <div className="check-grid compact">
              {selectedDay.session.tasks.map((task) => (
                <label key={task} className="check-row">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedLog.tasks[task])}
                    onChange={() => toggleTask(task)}
                  />
                  <span>
                    <strong>{task}</strong>
                  </span>
                </label>
              ))}
            </div>
          </section>

          {workoutMoveRows.length > 0 ? (
            <section className="exercise-stack compact-flow" aria-labelledby="exercise-heading">
              <div className="flow-heading">
                <h3 id="exercise-heading">Workout Flow</h3>
                <span>{completedMoveCount}/{workoutMoveRows.length} complete</span>
              </div>
              <div className="move-list">
                {workoutMoveRows.map((move) => (
                  <article
                    key={move.originalExercise.id}
                    className={`move-item ${move.activeExercise.family} ${
                      move.isComplete ? "complete" : ""
                    } ${nextOpenMove?.originalExercise.id === move.originalExercise.id ? "next-up" : ""}`}
                  >
                    <button
                      className="move-check-button"
                      type="button"
                      onClick={() =>
                        toggleExerciseDone(move.activeExercise.id, move.setCount, move.isComplete)
                      }
                      aria-label={`${move.isComplete ? "Reopen" : "Complete"} ${move.activeExercise.name}`}
                    >
                      {move.isComplete ? <Icon name="check" size={18} /> : move.exerciseIndex + 1}
                    </button>
                    <button
                      className="move-main-button"
                      type="button"
                      onClick={() => setDetailExerciseId(move.originalExercise.id)}
                    >
                      <span className="move-title-row">
                        <strong>{move.activeExercise.name}</strong>
                        <span className="family-chip">{familyLabel(move.activeExercise.family)}</span>
                        <span className={`location-chip ${move.location.type}`}>{move.location.label}</span>
                        {move.isSwapped && <span className="swap-chip">Swap active</span>}
                      </span>
                      {move.isSwapped && (
                        <small className="swap-origin">Original: {move.originalExercise.name}</small>
                      )}
                      <span className="move-meta-row">
                        <span>{move.target}</span>
                        <span>{move.rest}</span>
                        <span>{move.activeExercise.equipment}</span>
                      </span>
                      <span className={`smart-load-mini ${move.suggestion.tone}`}>
                        <Icon name="spark" size={14} />
                        <span>
                          <strong>{move.suggestion.label}</strong>
                          <small>{move.suggestion.detail}</small>
                        </span>
                      </span>
                    </button>
                    <button
                      className="move-detail-button"
                      type="button"
                      onClick={() => setDetailExerciseId(move.originalExercise.id)}
                    >
                      <Icon name={move.swaps.length ? "swap" : "video"} size={16} />
                      <span>{move.swaps.length ? "Details / Swap" : "Details"}</span>
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="recovery-flow" aria-label="Recovery day">
              <h3>Recovery Day</h3>
              <p>{selectedSessionSummary}</p>
            </section>
          )}

          <section className="notes-block" aria-labelledby="notes-heading">
            <h3 id="notes-heading">Workout Notes</h3>
            <label className="notes-field">
              Notes
              <textarea
                value={selectedLog.notes}
                placeholder="Machine settings, weights that felt right, soreness, or what to improve next time..."
                onChange={(event) =>
                  updateDay(selectedDay.iso, (log) => ({
                    ...log,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </section>
        </section>

        <aside className="side-panel" aria-label="Progress and check-ins">
          <section className={`metric-panel sync-panel account-card ${cloudStatus}`}>
            <div className="sync-heading">
              <div>
                <p className="eyebrow">
                  <Icon name="cloud" size={14} /> Cloud sync
                </p>
                <h2>{syncHeadline}</h2>
              </div>
              <span>{cloudStatus}</span>
            </div>
            <p className="side-copy">{syncCopy}</p>

            {isSupabaseConfigured && session && (
              <div className="account-row">
                <span>{session.user.email ?? "Signed in"}</span>
                <button type="button" onClick={handleSignOut}>
                  Sign out
                </button>
              </div>
            )}

            {isSupabaseConfigured && !session && (
              <div className="auth-stack">
                <form className="auth-form password-auth-form" onSubmit={handleSignInWithPassword}>
                  <label>
                    Email
                    <input
                      type="email"
                      value={authEmail}
                      placeholder="you@example.com"
                      autoComplete="email"
                      onChange={(event) => setAuthEmail(event.target.value)}
                    />
                  </label>
                  <label>
                    Password
                    <input
                      type="password"
                      value={authPassword}
                      placeholder="At least 8 characters"
                      autoComplete="current-password"
                      minLength={8}
                      onChange={(event) => setAuthPassword(event.target.value)}
                    />
                  </label>
                  <div className="auth-button-row">
                    <button type="submit">
                      <Icon name="user" size={17} /> Sign in
                    </button>
                    <button className="secondary" type="button" onClick={handleCreateAccount}>
                      <Icon name="check" size={17} /> Create account
                    </button>
                  </div>
                  <p>
                    Use the same email and password on your iPhone Home Screen app, MacBook, and
                    any other device.
                  </p>
                </form>
              </div>
            )}

            {!isSupabaseConfigured && (
              <code className="env-hint">VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY</code>
            )}

            {lastCloudSyncedAt && session && (
              <p className="sync-message">Last cloud sync: {lastCloudSyncedAt}</p>
            )}
            {authMessage && <p className="sync-message">{authMessage}</p>}
            {cloudError && <p className="sync-message error">{cloudError}</p>}
          </section>

          <section className="metric-panel progress-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">
                  <Icon name="trophy" size={14} /> Achievements
                </p>
                <h2>Scoreboard</h2>
              </div>
            </div>
            <div className="stat-grid">
              <div>
                <span>Streak</span>
                <strong>{stats.streak}</strong>
              </div>
              <div>
                <span>Done</span>
                <strong>{stats.completedDays}</strong>
              </div>
              <div>
                <span>Strength</span>
                <strong>{stats.strengthSessions}</strong>
              </div>
              <div>
                <span>Sets</span>
                <strong>{stats.completedSets}</strong>
              </div>
            </div>
            <div className="achievement-list">
              {achievements.map((achievement) => (
                <div
                  key={achievement.label}
                  className={`achievement ${achievement.earned ? "earned" : ""}`}
                >
                  <span>{achievement.earned ? "Done" : "Open"}</span>
                  <strong>{achievement.label}</strong>
                  <small>{achievement.detail}</small>
                </div>
              ))}
            </div>
          </section>

          <section className="metric-panel progress-card dashboard-card">
            <div className="section-heading compact">
              <div>
                <p className="eyebrow">
                  <Icon name="progress" size={14} /> Progress Dashboard
                </p>
                <h2>Training picture</h2>
              </div>
            </div>
            <div className="dashboard-stat-grid">
              <div className="dashboard-stat strength">
                <span>Program</span>
                <strong>{stats.percent}%</strong>
                <small>{stats.completedDays} of {PROGRAM_DAYS} days</small>
              </div>
              <div className="dashboard-stat cardio">
                <span>Cardio</span>
                <strong>{stats.cardioMinutes}</strong>
                <small>estimated minutes</small>
              </div>
              <div className="dashboard-stat sets">
                <span>Sets</span>
                <strong>{stats.completedSets}</strong>
                <small>completed rows</small>
              </div>
              <div className="dashboard-stat body">
                <span>Body checks</span>
                <strong>{stats.bodyCheckIns}</strong>
                <small>logged check-ins</small>
              </div>
            </div>

            <div className="dashboard-split">
              <div className="best-load-panel">
                <h3>Best logged loads</h3>
                {bestLiftRows.length > 0 ? (
                  <div className="best-load-list">
                    {bestLiftRows.map((lift) => (
                      <div key={lift.id} className={`best-load-row ${lift.family}`}>
                        <span>{lift.name}</span>
                        <strong>{formatLoadValue(lift.load)} lb</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="side-copy">Weights appear here after your first logged sets.</p>
                )}
              </div>
              <div className="body-trend-panel">
                <h3>Body trend</h3>
                {bodyTrend ? (
                  <div className="trend-list">
                    <span>{bodyTrend.from} to {bodyTrend.to}</span>
                    <strong>
                      Weight {bodyTrend.weightDelta === null ? "n/a" : `${formatLoadValue(bodyTrend.weightDelta)} lb`}
                    </strong>
                    <strong>
                      Waist {bodyTrend.waistDelta === null ? "n/a" : `${formatLoadValue(bodyTrend.waistDelta)} cm`}
                    </strong>
                  </div>
                ) : (
                  <p className="side-copy">Two body check-ins unlock the trend.</p>
                )}
              </div>
            </div>
          </section>

          <section className="metric-panel progress-card">
            <p className="eyebrow">Completion trend</p>
            <h2>Weekly consistency</h2>
            <div className="week-chart">
              {weeklyCompletion.slice(0, selectedDay.week).map((week) => (
                <div key={week.value} className="week-bar-row">
                  <span>{week.label.replace("Week ", "W")}</span>
                  <div>
                    <i style={{ width: `${week.percent}%` }} />
                  </div>
                  <strong>
                    {week.completed}/{week.total}
                  </strong>
                </div>
              ))}
            </div>
          </section>

          <section className="metric-panel progress-card">
            <p className="eyebrow">History</p>
            <h2>Recent workouts</h2>
            <div className="history-list">
              {recentCompletedDays.length > 0 ? (
                recentCompletedDays.map((day) => (
                  <div key={day.iso} className="history-row">
                    <span>{formatDate(day.iso, "short")}</span>
                    <strong>{day.session.title}</strong>
                    <small>{sessionTimeForDay(day)}</small>
                  </div>
                ))
              ) : (
                <p className="side-copy">Completed workouts will appear here.</p>
              )}
            </div>
          </section>

          <section className="metric-panel progress-card checkin-card">
            <p className="eyebrow">Body check-in</p>
            <h2>{formatDate(selectedDay.iso, "short")}</h2>
            <div className="foundation-grid two">
              <label>
                Body weight (lbs)
                <input
                  inputMode="decimal"
                  value={selectedMetric.weight}
                  placeholder="lbs"
                  onChange={(event) =>
                    updateMetric(selectedDay.iso, (metric) => ({
                      ...metric,
                      weight: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Waist
                <input
                  inputMode="decimal"
                  value={selectedMetric.waist}
                  placeholder="cm"
                  onChange={(event) =>
                    updateMetric(selectedDay.iso, (metric) => ({
                      ...metric,
                      waist: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <label className="notes-field">
              Check-in note
              <textarea
                value={selectedMetric.note}
                placeholder="Lighting, photos, waist location, weekly average..."
                onChange={(event) =>
                  updateMetric(selectedDay.iso, (metric) => ({
                    ...metric,
                    note: event.target.value,
                  }))
                }
              />
            </label>
          </section>
        </aside>
      </div>

      <section className="library-section" aria-labelledby="library-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Move library</p>
            <h2 id="library-heading">Videos, cues, and resources</h2>
          </div>
          <div className="library-tools">
            <select value={libraryFilter} onChange={(event) => setLibraryFilter(event.target.value)}>
              <option value="all">All</option>
              <option value="legs">Legs</option>
              <option value="push">Push</option>
              <option value="pull">Pull</option>
              <option value="hinge">Hinge</option>
              <option value="core">Core</option>
              <option value="arms">Arms</option>
              <option value="warmup">Warm-up</option>
              <option value="cardio">Cardio</option>
            </select>
            <label className="library-search">
              <Icon name="search" size={16} />
              <input
                className="library-search-input"
                value={librarySearch}
                placeholder="Search moves"
                onChange={(event) => setLibrarySearch(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="library-grid">
          {filteredLibrary.map((exercise) => {
            const location = locationGuideForExercise(exercise);

            return (
              <article key={exercise.id} className={`library-card ${exercise.family}`}>
                <div className="library-media">
                  <ExerciseMedia exercise={exercise} variant="library" />
                </div>
                <ExerciseMediaLinks exercise={exercise} compact />
                <div className="library-chip-row">
                  <span className="family-chip">{familyLabel(exercise.family)}</span>
                  <span className={`location-chip ${location.type}`}>{location.label}</span>
                </div>
                <h3>{exercise.name}</h3>
                <p>{exercise.target}</p>
                <small>{exercise.equipment}</small>
                <div className="resource-links compact-links">
                  {exercise.resources.slice(0, 3).map((resource) => (
                    <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer">
                      {resource.label}
                    </a>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="fallback-section" aria-labelledby="fallback-heading">
        <div>
          <p className="eyebrow">No-gym fallback</p>
          <h2 id="fallback-heading">25-35 minute emergency session</h2>
          <p>
            Do 3 rounds. Rest 60-90 seconds between exercises as needed. This protects the habit
            on days when going downstairs is not happening.
          </p>
        </div>
        <div className="swap-grid">
          {[
            ["Leg press or goblet squat", "Bodyweight squat or backpack squat"],
            ["Incline dumbbell press", "Incline push-up on counter, desk, or bench"],
            ["Lat pulldown or row", "One-arm backpack row with a sturdy chair"],
            ["Romanian deadlift", "Backpack or dumbbell Romanian deadlift"],
            ["Cable fly", "Push-up"],
            ["Plank", "Same plank"],
          ].map(([gym, home]) => (
            <div key={gym} className="swap-row">
              <strong>{gym}</strong>
              <span>{home}</span>
            </div>
          ))}
        </div>
      </section>

      {detailMove && detailExercise && detailRows && (
        <div
          className="detail-sheet-backdrop"
          role="presentation"
          onClick={() => setDetailExerciseId(null)}
        >
          <section
            className={`exercise-detail-sheet ${detailExercise.family}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="detail-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-handle" />
            <div className="detail-sheet-header">
              <div>
                <p className="eyebrow">Exercise Detail</p>
                <h2 id="detail-heading">{detailExercise.name}</h2>
                {detailMove.isSwapped && (
                  <p>Swapped from {detailMove.originalExercise.name}</p>
                )}
              </div>
              <button
                className="sheet-close-button"
                type="button"
                onClick={() => setDetailExerciseId(null)}
                aria-label="Close exercise details"
              >
                <Icon name="x" size={20} />
              </button>
            </div>

            <div className="detail-media-grid">
              <div className="detail-media-panel">
                <ExerciseMedia exercise={detailExercise} variant="gym" />
                <ExerciseMediaLinks exercise={detailExercise} />
                <div className="resource-links detail-resources">
                  {detailExercise.resources.map((resource) => (
                    <a key={resource.url} href={resource.url} target="_blank" rel="noreferrer">
                      {resource.label}
                    </a>
                  ))}
                </div>
              </div>

              <div className="detail-fact-grid">
                <div>
                  <span>Target</span>
                  <strong>{detailMove.target}</strong>
                </div>
                <div>
                  <span>Rest</span>
                  <strong>{detailMove.rest}</strong>
                </div>
                <div>
                  <span>Equipment</span>
                  <strong>{detailExercise.equipment}</strong>
                </div>
                {detailLocation && (
                  <div className={`location-fact ${detailLocation.type}`}>
                    <span>Where</span>
                    <strong>{detailLocation.label}</strong>
                    <small>{detailLocation.detail}</small>
                  </div>
                )}
                <div>
                  <span>Last load</span>
                  <strong>
                    {detailPreviousLoad ? formatLoggedWeightText(detailPreviousLoad.weights) : "New"}
                  </strong>
                </div>
              </div>
            </div>

            {detailMove.swaps.length > 0 && (
              <section className="swap-panel" aria-labelledby="swap-heading">
                <div className="flow-heading">
                  <h3 id="swap-heading">Swap Options</h3>
                  <span>{detailMove.swaps.length} legit</span>
                </div>
                <div className="swap-option-grid">
                  <button
                    className={!detailMove.isSwapped ? "selected" : ""}
                    type="button"
                    onClick={() =>
                      setExerciseSwap(detailMove.originalExercise.id, detailMove.originalExercise.id)
                    }
                  >
                    <strong>Use original</strong>
                    <small>{detailMove.originalExercise.name}</small>
                    <span>{detailMove.originalExercise.equipment}</span>
                  </button>
                  {detailMove.swaps.map((swap) => (
                    <button
                      key={swap.id}
                      className={detailExercise.id === swap.id ? "selected" : ""}
                      type="button"
                      onClick={() => setExerciseSwap(detailMove.originalExercise.id, swap.id)}
                    >
                      <strong>{swap.name}</strong>
                      <small>{swap.target}</small>
                      <span>{swap.equipment}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className={`load-suggestion smart-load ${detailMove.suggestion.tone}`}>
              <Icon name="spark" size={16} />
              <span>
                <strong>{detailMove.suggestion.label}</strong>
                <small>{detailMove.suggestion.detail}</small>
              </span>
            </div>

            <div className="detail-details-grid">
              <details className="form-details" open>
                <summary>How to do it</summary>
                <ul>
                  {detailExercise.cues.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </details>
              <details className="form-details">
                <summary>Common mistakes</summary>
                <ul>
                  {detailExercise.avoid.map((cue) => (
                    <li key={cue}>{cue}</li>
                  ))}
                </ul>
              </details>
              <details className="form-details progression-details">
                <summary>Progression</summary>
                <p>{detailMove.progression}</p>
              </details>
            </div>

            <div className="set-table detail-set-table" aria-label={`${detailExercise.name} detail set log`}>
              <div className="set-head">
                <span>Set</span>
                <span>Target</span>
                <span>Weight (lbs)</span>
                <span>Done</span>
              </div>
              {detailRows.map((set, setIndex) => (
                <div className="set-row" key={`${detailExercise.id}-detail-${setIndex}`}>
                  <span>{setIndex + 1}</span>
                  <strong className="target-pill">{detailMove.target}</strong>
                  {tracksWeight(detailExercise) ? (
                    <input
                      inputMode="decimal"
                      value={set.weight}
                      placeholder="lbs"
                      onChange={(event) =>
                        updateSet(detailExercise.id, setIndex, "weight", event.target.value)
                      }
                      aria-label={`${detailExercise.name} set ${setIndex + 1} weight in pounds`}
                    />
                  ) : (
                    <span className="load-pill">{detailExercise.loadLabel ?? "body"}</span>
                  )}
                  <label className="mini-check">
                    <input
                      type="checkbox"
                      checked={set.done}
                      onChange={(event) =>
                        updateSet(detailExercise.id, setIndex, "done", event.target.checked)
                      }
                    />
                    <span />
                  </label>
                </div>
              ))}
            </div>

            <div className="sheet-action-row">
              <button
                type="button"
                onClick={() =>
                  toggleExerciseDone(detailExercise.id, detailMove.setCount, detailMove.isComplete)
                }
              >
                <Icon name="check" size={17} />
                {detailMove.isComplete ? "Reopen Move" : "Complete Move"}
              </button>
              <button className="secondary" type="button" onClick={() => setDetailExerciseId(null)}>
                Close
              </button>
            </div>
          </section>
        </div>
      )}

      <nav className="bottom-nav" aria-label="Main app sections">
        {navItems.map(({ id, label, icon }) => (
          <button
            key={id}
            className={activeSection === id ? "active" : ""}
            type="button"
            onClick={() => setActiveSection(id)}
            aria-current={activeSection === id ? "page" : undefined}
          >
            <Icon name={icon} size={20} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}
