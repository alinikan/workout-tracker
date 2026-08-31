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
  | "trophy"
  | "user"
  | "video";

type Resource = {
  label: string;
  url: string;
};

type MotionDemo = {
  workoutXId: string;
  label: string;
  match: "exact" | "reference";
};

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
    </svg>
  );
}

type Exercise = {
  id: string;
  name: string;
  shortName: string;
  family: "legs" | "push" | "pull" | "hinge" | "core" | "warmup" | "cardio";
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
  "warmup-treadmill-walk",
  "bodyweight-squat",
  "hip-hinge-drill",
  "incline-push-up",
  "warmup-front-plank",
  "light-practice-sets",
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
  notes: "",
});

const createEmptyMetric = (): MetricLog => ({
  weight: "",
  waist: "",
  note: "",
});

const exerciseMap: Record<string, Exercise> = {
  "warmup-treadmill-walk": {
    id: "warmup-treadmill-walk",
    name: "Treadmill Easy Walk",
    shortName: "Easy walk",
    family: "warmup",
    equipment: "Treadmill",
    target: "General warm-up",
    reps: "5 min easy",
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
    progression: "Keep this easy every time; progression belongs in the workout, not the warm-up.",
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
    target: "Squat pattern",
    reps: "8 warm-up reps",
    rest: "Easy",
    cues: [
      "Feet about hip to shoulder width, chest tall, weight balanced across the full foot.",
      "Sit down between your knees and stand by driving through the floor.",
      "Use this to rehearse knee tracking before goblet squats or leg press.",
    ],
    avoid: ["Knees collapsing inward.", "Rounding the low back at the bottom."],
    progression: "Move slowly enough that every rep looks the same.",
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
    target: "Hinge pattern",
    reps: "8 warm-up reps",
    rest: "Easy",
    cues: [
      "Soften the knees, push hips back, and keep ribs and pelvis stacked.",
      "You should feel hamstrings load without your spine rounding.",
      "Imagine closing a car door with your hips.",
    ],
    avoid: ["Squatting the drill.", "Reaching down by rounding your back."],
    progression: "Use the same pattern before every Romanian deadlift set.",
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
    target: "Pressing warm-up",
    reps: "6 warm-up reps",
    rest: "Easy",
    cues: [
      "Hands on a bench, body in one line, elbows roughly 45 degrees from your body.",
      "Lower chest toward the bench and press away smoothly.",
      "Choose a higher surface if the rep slows or your hips sag.",
    ],
    avoid: ["Sagging hips.", "Elbows flaring straight out."],
    progression: "Lower the bench height gradually as strength improves.",
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
    target: "Core brace rehearsal",
    reps: "20 sec",
    rest: "Easy",
    cues: [
      "Elbows under shoulders, ribs down, glutes lightly squeezed.",
      "Hold only long enough to wake up your brace.",
      "Stop before your hips sag or shoulders shrug.",
    ],
    avoid: ["Holding your breath.", "Sagging hips.", "Turning it into a max plank test."],
    progression: "Keep the warm-up plank at 20 seconds; progress the main plank later.",
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
  "light-practice-sets": {
    id: "light-practice-sets",
    name: "Light Practice Sets",
    shortName: "Practice sets",
    family: "warmup",
    equipment: "First two workout stations",
    target: "Technique rehearsal",
    reps: "2 lighter sets",
    rest: "45-60 sec",
    cues: [
      "Use the first two exercises of the workout and choose clearly lighter weight.",
      "Rehearse setup, range of motion, breathing, and control.",
      "Stop each set feeling sharper, not fatigued.",
    ],
    avoid: [
      "Do not count practice sets as working sets.",
      "Do not go near failure.",
      "Do not skip setup just because the load is light.",
    ],
    progression: "As working weights rise, keep practice sets light enough to feel crisp.",
    motionDemo: {
      workoutXId: "0739",
      label: "Practice-set reference",
      match: "reference",
    },
    logType: "done",
    loadLabel: "light",
    resources: [
      {
        label: "ACSM progression model",
        url: "https://www.sportgeneeskunde.com/wp-content/uploads/ACSM-Position-Stand-Progression-Models-in-Resistance-Training-for-Healthy-Adults.pdf",
      },
    ],
  },
  "treadmill-finisher": {
    id: "treadmill-finisher",
    name: "Brisk Treadmill Finisher",
    shortName: "Finisher",
    family: "cardio",
    equipment: "Treadmill",
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
    progression: "Keep it at 10 minutes; add a small incline only if recovery stays good.",
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
};

const weeklySchedule: Record<string, SessionTemplate> = {
  Monday: {
    title: "Strength A",
    type: "strength",
    code: "A",
    time: "50-65 min",
    summary: "Full-body weights, then 10 minutes brisk treadmill walk.",
    accent: "strength-a",
    exerciseIds: [
      ...strengthWarmupIds,
      "leg-press",
      "incline-db-press",
      "lat-pulldown",
      "db-rdl",
      "front-plank",
      "treadmill-finisher",
    ],
    tasks: ["Follow every move in order", "Log every working set", "Keep 2 reps in reserve unless phase says otherwise"],
    finisher: "10 min brisk treadmill walk at talk-test pace.",
  },
  Tuesday: {
    title: "Cardio Base",
    type: "cardio",
    code: "CB",
    time: "35-40 min",
    summary: "Treadmill walk: 5 min easy, 25-30 min brisk, 5 min easy.",
    accent: "cardio",
    exerciseIds: ["warmup-treadmill-walk", "treadmill-walk", "cardio-cooldown-walk"],
    tasks: ["5 min easy warm-up", "25-30 min brisk walk", "5 min easy cool-down"],
  },
  Wednesday: {
    title: "Strength B",
    type: "strength",
    code: "B",
    time: "50-65 min",
    summary: "Full-body weights, then 10 minutes brisk treadmill walk.",
    accent: "strength-b",
    exerciseIds: [
      ...strengthWarmupIds,
      "goblet-squat",
      "single-arm-row",
      "push-up",
      "seated-db-overhead",
      "incline-reverse-fly",
      "front-plank",
      "treadmill-finisher",
    ],
    tasks: ["Follow every move in order", "Log every working set", "Keep 2 reps in reserve unless phase says otherwise"],
    finisher: "10 min brisk treadmill walk at talk-test pace.",
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
    time: "50-65 min",
    summary: "Full-body weights, then 10 minutes brisk treadmill walk.",
    accent: "strength-c",
    exerciseIds: [
      ...strengthWarmupIds,
      "leg-press",
      "incline-db-press",
      "lat-pulldown",
      "barbell-rdl",
      "cable-chest-fly",
      "front-plank",
      "treadmill-finisher",
    ],
    tasks: ["Follow every move in order", "Log every working set", "Keep 2 reps in reserve unless phase says otherwise"],
    finisher: "10 min brisk treadmill walk at talk-test pace.",
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
  "light-practice-sets",
  "leg-press",
  "incline-db-press",
  "lat-pulldown",
  "db-rdl",
  "front-plank",
  "goblet-squat",
  "single-arm-row",
  "push-up",
  "seated-db-overhead",
  "incline-reverse-fly",
  "barbell-rdl",
  "cable-chest-fly",
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
  return date.toISOString().slice(0, 10);
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
      note: "Stop with about 2 reps left in the tank. The main win is clean form.",
    };
  }
  if (week <= 6) {
    return {
      label: "Weeks 3-6",
      sets: "3 sets for the first 4 lifts",
      note: "Keep planks at 3 rounds. Add load only after clean top-range reps.",
    };
  }
  if (week <= 10) {
    return {
      label: "Weeks 7-10",
      sets: "Same structure, optional extra set",
      note: "Add one extra set to one big lift only if recovery and joints feel good.",
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
      note: "Start the second block slightly below your best week-12 loads, then rebuild clean top-range reps.",
    };
  }
  if (week <= 18) {
    return {
      label: "Weeks 15-18",
      sets: "3-4 working sets",
      note: "Use the PDF double-progression rule: hit the top of the range cleanly, then add the smallest load jump.",
    };
  }
  if (week <= 22) {
    return {
      label: "Weeks 19-22",
      sets: "Advanced consistency",
      note: "First 4 lifts can use 4 sets if recovery is good. Accessories stay controlled and joint-friendly.",
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
  if (exercise.family === "warmup") return exercise.id === "light-practice-sets" ? 2 : 1;
  if (exercise.family === "cardio") return 1;
  if (planDay.session.type !== "strength") return 1;
  if (planDay.week <= 2) return 2;
  if (planDay.week === 11 || planDay.week === 23) return 2;
  if (exercise.id === "front-plank") return planDay.week >= 19 && planDay.week <= 22 ? 4 : 3;

  const workingIds = planDay.session.exerciseIds.filter((id) => {
    const item = exerciseMap[id];
    return item && item.family !== "warmup" && item.family !== "cardio";
  });
  const foundWorkingIndex = workingIds.indexOf(exercise.id);
  const workingIndex = foundWorkingIndex >= 0 ? foundWorkingIndex : index;

  if (planDay.week <= 6) return workingIndex < 4 ? 3 : 2;
  if (planDay.week <= 10) return workingIndex === 0 ? 4 : workingIndex < 4 ? 3 : 2;
  if (planDay.week <= 14) return workingIndex < 4 ? 3 : 2;
  if (planDay.week <= 18) return workingIndex === 0 ? 4 : workingIndex < 4 ? 3 : 2;
  if (planDay.week <= 22) return workingIndex < 4 ? 4 : 3;
  return workingIndex < 4 ? 3 : 2;
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
    if (planDay.week <= 6) return "25-30 min brisk";
    if (planDay.week <= 14) return "30-35 min brisk";
    if (planDay.week <= 22) return "35-40 min brisk";
    if (planDay.week === 23) return "25-30 min easy";
    return "35-45 min brisk";
  }

  if (exercise.id === "treadmill-walk" && planDay.session.title === "Easy Movement") {
    if (planDay.week <= 6) return "20-30 min moderate";
    if (planDay.week <= 14) return "25-35 min moderate";
    if (planDay.week <= 22) return "30-40 min moderate";
    if (planDay.week === 23) return "20-30 min easy";
    return "30-40 min moderate";
  }

  if (exercise.id === "long-cardio-walk") {
    if (planDay.week <= 6) return "45-60 min brisk";
    if (planDay.week <= 14) return "50-65 min brisk";
    if (planDay.week <= 22) return "55-70 min brisk";
    if (planDay.week === 23) return "40-50 min easy";
    return "55-75 min brisk";
  }

  if (exercise.id === "treadmill-finisher") {
    return planDay.week === 23 ? "8-10 min easy" : "10 min brisk";
  }

  return exercise.reps;
}

function targetForExercise(planDay: PlanDay, exercise: Exercise) {
  if (exercise.family === "warmup") return exercise.reps;
  if (exercise.family === "cardio") return cardioTarget(planDay, exercise);
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
  if (exercise.family === "warmup") return exercise.progression;
  if (planDay.week === 11 || planDay.week === 23) {
    return "Deload week: reduce load about 10-15 percent, leave several reps in reserve, and focus on clean movement.";
  }
  if (planDay.week >= 13) {
    return `${exercise.progression} For this extended block, use the PDF double-progression rule: when all sets hit the top target cleanly, add the smallest available load next time.`;
  }
  return exercise.progression;
}

function tracksWeight(exercise: Exercise) {
  return exercise.logType !== "done";
}

function estimatedCardioMinutes(planDay: PlanDay) {
  if (planDay.session.title === "Cardio Base") return planDay.week >= 15 ? 45 : planDay.week >= 7 ? 40 : 35;
  if (planDay.session.title === "Long Cardio") return planDay.week >= 15 ? 65 : planDay.week >= 7 ? 55 : 45;
  if (planDay.session.title === "Easy Movement") return planDay.week >= 15 ? 30 : 20;
  if (planDay.session.type === "strength") return 10;
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
  return {
    days: isRecord(value.days) ? (value.days as Record<string, DayLog>) : {},
    metrics: isRecord(value.metrics) ? (value.metrics as Record<string, MetricLog>) : {},
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
  if (!cloudLog) return localLog ?? createEmptyDay();
  if (!localLog) return cloudLog;

  const cloudExercises = cloudLog.exercises ?? {};
  const localExercises = localLog.exercises ?? {};
  const exerciseIds = new Set([
    ...Object.keys(cloudExercises),
    ...Object.keys(localExercises),
  ]);

  return {
    completed: Boolean(localLog.completed ?? cloudLog.completed),
    warmup: mergeChecks(cloudLog.warmup, localLog.warmup),
    tasks: mergeChecks(cloudLog.tasks, localLog.tasks),
    exercises: [...exerciseIds].reduce<Record<string, SetLog[]>>((merged, id) => {
      merged[id] = mergeSetRows(cloudExercises[id], localExercises[id]);
      return merged;
    }, {}),
    notes: preferFilled(localLog.notes, cloudLog.notes),
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

function youtubeThumb(id?: string) {
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
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
    warmup: "Warm-up",
    cardio: "Cardio",
  }[family];
}

function lastExerciseLoad(planDays: PlanDay[], store: TrackerStore, selectedDay: PlanDay, exerciseId: string) {
  for (let index = selectedDay.index - 1; index >= 0; index -= 1) {
    const day = planDays[index];
    const previousRows = store.days[day.iso]?.exercises[exerciseId] ?? [];
    const weights = previousRows
      .map((row) => row.weight.trim())
      .filter(Boolean);

    if (weights.length > 0) {
      return {
        date: formatDate(day.iso, "short"),
        weights: weights.join(", "),
      };
    }
  }

  return null;
}

function completedRows(rows: SetLog[]) {
  return rows.filter((row) => row.done).length;
}

function firstWeightedExerciseForDay(planDay?: PlanDay) {
  if (!planDay) return null;

  const firstWeightedId = planDay.session.exerciseIds.find((id) => {
    const item = exerciseMap[id];
    return item ? tracksWeight(item) : false;
  });

  return firstWeightedId ? exerciseMap[firstWeightedId] : null;
}

function motionDemoForExercise(exercise: Exercise, planDay?: PlanDay) {
  if (exercise.id !== "light-practice-sets") return exercise.motionDemo;

  const firstWeightedMove = firstWeightedExerciseForDay(planDay);
  if (!firstWeightedMove?.motionDemo) return exercise.motionDemo;

  return {
    ...firstWeightedMove.motionDemo,
    label: `Practice-set reference: ${firstWeightedMove.shortName}`,
    match: "reference" as const,
  };
}

function ExerciseMedia({
  exercise,
  planDay,
  variant,
}: {
  exercise: Exercise;
  planDay?: PlanDay;
  variant: "gym" | "thumb" | "library";
}) {
  const [gifFailed, setGifFailed] = useState(false);
  const demo = gifFailed ? undefined : motionDemoForExercise(exercise, planDay);
  const className = `exercise-media exercise-media-${variant} ${
    demo ? "has-gif" : exercise.youtubeId ? "has-video" : "placeholder"
  }`;

  if (demo) {
    return (
      <div className={className}>
        <img
          className="exercise-gif"
          src={workoutXGifUrl(demo.workoutXId)}
          alt={`${exercise.name}: ${demo.label} animated demonstration`}
          loading={variant === "gym" ? "eager" : "lazy"}
          decoding="async"
          onError={() => setGifFailed(true)}
        />
        <span className="motion-badge">
          <Icon name="video" size={variant === "gym" ? 16 : 14} />
          {demo.match === "exact" ? "GIF demo" : "Reference GIF"}
        </span>
      </div>
    );
  }

  if (exercise.youtubeId) {
    return (
      <a
        className={className}
        href={youtubeUrl(exercise.youtubeId)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Watch ${exercise.name} video`}
      >
        <img src={youtubeThumb(exercise.youtubeId)} alt="" loading="lazy" />
        <span className="motion-badge">
          <Icon name="video" size={variant === "gym" ? 16 : 14} />
          Video
        </span>
      </a>
    );
  }

  return (
    <div className={className}>
      <span className="motion-badge">Guide</span>
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
  const [selectedDate, setSelectedDate] = useState(START_DATE);
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
  const latestStoreRef = useRef(store);
  const firstLocalSaveRef = useRef(true);
  const suppressLocalChangeMetaRef = useRef(false);
  const suppressNextCloudSaveRef = useRef(false);

  useEffect(() => {
    setSelectedDate(closestProgramDate());
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    setGymExerciseIndex(0);
  }, [selectedDate]);

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
  const selectedLog = store.days[selectedDay.iso] ?? createEmptyDay();
  const selectedMetric = store.metrics[selectedDay.iso] ?? createEmptyMetric();
  const phase = phaseForWeek(selectedDay.week);
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
      streak,
      percent: Math.round((completedDays / PROGRAM_DAYS) * 100),
    };
  }, [planDays, selectedDay.index, store.days]);

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
      const nextLog = updater(current.days[date] ?? createEmptyDay());
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
      const exerciseIndex = selectedExercises.findIndex((item) => item.id === exerciseId);
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
  const currentGymExercise = selectedExercises[gymExerciseIndex] ?? null;
  const currentGymRows =
    currentGymExercise &&
    ensureSetRows(
      selectedLog.exercises[currentGymExercise.id],
      recommendedSets(selectedDay, currentGymExercise, gymExerciseIndex),
    );
  const currentGymPreviousLoad = currentGymExercise
    ? lastExerciseLoad(planDays, store, selectedDay, currentGymExercise.id)
    : null;
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
        {currentGymExercise && currentGymRows ? (
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
                  <span className="order-chip">
                    {completedRows(currentGymRows)}/{currentGymRows.length} sets
                  </span>
                </div>
                <h2>{currentGymExercise.name}</h2>
                <p>{currentGymExercise.target}</p>
              </div>
              <div className="gym-media-stack">
                <ExerciseMedia exercise={currentGymExercise} planDay={selectedDay} variant="gym" />
                <ExerciseMediaLinks exercise={currentGymExercise} />
              </div>
            </div>

            <div className="gym-target-grid">
              <div>
                <span>Target</span>
                <strong>{targetForExercise(selectedDay, currentGymExercise)}</strong>
              </div>
              <div>
                <span>Rest</span>
                <strong>{restForExercise(selectedDay, currentGymExercise)}</strong>
              </div>
              <div>
                <span>Equipment</span>
                <strong>{currentGymExercise.equipment}</strong>
              </div>
              <div>
                <span>Last load</span>
                <strong>{currentGymPreviousLoad?.weights ?? "New"}</strong>
              </div>
            </div>

            {tracksWeight(currentGymExercise) && (
              <p className="load-suggestion">
                {currentGymPreviousLoad
                  ? `Last time was ${currentGymPreviousLoad.weights} on ${currentGymPreviousLoad.date}. Start there, or add the smallest jump if every rep was clean.`
                  : "First logged session for this move. Choose a load that makes every rep controlled."}
              </p>
            )}

            <div className="set-table gym-set-table" aria-label={`${currentGymExercise.name} gym set log`}>
              <div className="set-head">
                <span>Set</span>
                <span>Target</span>
                <span>Weight</span>
                <span>Done</span>
              </div>
              {currentGymRows.map((set, setIndex) => (
                <div className="set-row" key={`${currentGymExercise.id}-gym-${setIndex}`}>
                  <span>{setIndex + 1}</span>
                  <strong className="target-pill">{targetForExercise(selectedDay, currentGymExercise)}</strong>
                  {tracksWeight(currentGymExercise) ? (
                    <input
                      inputMode="decimal"
                      value={set.weight}
                      placeholder="lb/kg"
                      onChange={(event) =>
                        updateSet(currentGymExercise.id, setIndex, "weight", event.target.value)
                      }
                      aria-label={`${currentGymExercise.name} set ${setIndex + 1} weight`}
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
            <p>{selectedDay.session.summary}</p>
            <button type="button" onClick={() => setActiveSection("today")}>
              Back to Today
            </button>
          </section>
        )}
      </section>

      <div className="layout-grid">
        <section className="workout-panel" aria-labelledby="today-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{sessionTypeLabels[selectedDay.session.type]}</p>
              <h2 id="today-heading">{selectedDay.session.title}</h2>
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

          <div className="session-summary">
            <div>
              <span>Time</span>
              <strong>{selectedDay.session.time}</strong>
            </div>
            <div>
              <span>Phase</span>
              <strong>{phase.label}</strong>
            </div>
            <div>
              <span>Sets</span>
              <strong>{phase.sets}</strong>
            </div>
          </div>

          <p className="plan-note">{selectedDay.session.summary}</p>
          <p className="phase-note">{phase.note}</p>

          <section className="checklist-block" aria-labelledby="tasks-heading">
            <h3 id="tasks-heading">Today&apos;s Targets</h3>
            <div className="check-grid">
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

          {selectedExercises.length > 0 && (
            <section className="exercise-stack" aria-labelledby="exercise-heading">
              <div className="flow-heading">
                <h3 id="exercise-heading">Workout Flow</h3>
                <span>{selectedExercises.length} moves</span>
              </div>
              {selectedExercises.map((exercise, exerciseIndex) => {
                const setCount = recommendedSets(selectedDay, exercise, exerciseIndex);
                const rows = ensureSetRows(selectedLog.exercises[exercise.id], setCount);
                const exerciseTarget = targetForExercise(selectedDay, exercise);
                const exerciseRest = restForExercise(selectedDay, exercise);
                const exerciseProgression = progressionForExercise(selectedDay, exercise);
                const hasWeightInput = tracksWeight(exercise);
                const previousLoad = hasWeightInput
                  ? lastExerciseLoad(planDays, store, selectedDay, exercise.id)
                  : null;
                return (
                  <article key={exercise.id} className={`exercise-card ${exercise.family}`}>
                    <div className="exercise-topline">
                      <div>
                        <div className="exercise-labels">
                          <span className="order-chip">Move {exerciseIndex + 1}</span>
                          <span className="family-chip">{familyLabel(exercise.family)}</span>
                        </div>
                        <h4>{exercise.name}</h4>
                        <p>{exercise.target}</p>
                      </div>
                      <div className="rep-box">
                        <strong>{exerciseTarget}</strong>
                        <small>{exerciseRest}</small>
                      </div>
                    </div>

                    <div className="media-row">
                      <ExerciseMedia exercise={exercise} planDay={selectedDay} variant="thumb" />

                      <div className="media-resource-stack">
                        <ExerciseMediaLinks exercise={exercise} compact />
                        <div className="resource-links">
                          {exercise.resources.map((resource) => (
                            <a
                              key={resource.url}
                              href={resource.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {resource.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>

                    {hasWeightInput && (
                      <p className="load-suggestion">
                        {previousLoad
                          ? `Last time: ${previousLoad.weights} on ${previousLoad.date}. Start there, or add the smallest jump if it felt clean.`
                          : "First logged session for this move. Start light enough to control every rep."}
                      </p>
                    )}

                    <div className="exercise-details-grid">
                      <details className="form-details">
                        <summary>How to do it</summary>
                        <ul>
                          {exercise.cues.map((cue) => (
                            <li key={cue}>{cue}</li>
                          ))}
                        </ul>
                      </details>
                      <details className="form-details">
                        <summary>Common mistakes</summary>
                        <ul>
                          {exercise.avoid.map((cue) => (
                            <li key={cue}>{cue}</li>
                          ))}
                        </ul>
                      </details>
                      <details className="form-details progression-details">
                        <summary>Progression</summary>
                        <p>{exerciseProgression}</p>
                      </details>
                    </div>

                    <div className="set-table" aria-label={`${exercise.name} set log`}>
                      <div className="set-head">
                        <span>Set</span>
                        <span>Target</span>
                        <span>Weight</span>
                        <span>Done</span>
                      </div>
                      {rows.map((set, setIndex) => (
                        <div className="set-row" key={`${exercise.id}-${setIndex}`}>
                          <span>{setIndex + 1}</span>
                          <strong className="target-pill">{exerciseTarget}</strong>
                          {hasWeightInput ? (
                            <input
                              inputMode="decimal"
                              value={set.weight}
                              placeholder="lb/kg"
                              onChange={(event) =>
                                updateSet(exercise.id, setIndex, "weight", event.target.value)
                              }
                              aria-label={`${exercise.name} set ${setIndex + 1} weight`}
                            />
                          ) : (
                            <span className="load-pill">{exercise.loadLabel ?? "body"}</span>
                          )}
                          <label className="mini-check">
                            <input
                              type="checkbox"
                              checked={set.done}
                              onChange={(event) =>
                                updateSet(exercise.id, setIndex, "done", event.target.checked)
                              }
                            />
                            <span />
                          </label>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })}
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
                    <small>{day.session.time}</small>
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
                Weight
                <input
                  inputMode="decimal"
                  value={selectedMetric.weight}
                  placeholder="kg"
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
          {filteredLibrary.map((exercise) => (
            <article key={exercise.id} className={`library-card ${exercise.family}`}>
              <div className="library-media">
                <ExerciseMedia exercise={exercise} variant="library" />
              </div>
              <ExerciseMediaLinks exercise={exercise} compact />
              <span className="family-chip">{familyLabel(exercise.family)}</span>
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
          ))}
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
