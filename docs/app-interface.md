# The Rebuilt App Interface

Recomp uses the same five destinations on iPhone and Mac: **Today, Gym, Diet,
Progress and Coach**. On a phone they live in the bottom navigation; on a larger
screen they become a left rail. Coach remains the opening screen. Nothing in this
redesign resets an account or changes Supabase access permissions.

## Where Everything Lives

| Destination | What To Do |
| --- | --- |
| Coach | Morning weight, nutrition profile/check-in, weight trends, account and Start Fresh. The account button in the app bar jumps directly to sign-in/sync settings. |
| Today | Select a date, check readiness and follow the ordered movement list. Expand a movement to log its sets. Optional guidance, targets and notes follow the exercise list. |
| Gym | Work through actual today's unfinished sets, independently of a date browsed in Today. Set actions remain above the measured phone navigation area. |
| Diet | Follow the shared batch meals, open recipe instructions, change an uncooked batch and use the To buy list. |
| Progress | Review training attendance, achievements, logged loads and history. |
| Week plan / Exercise library | Contextual buttons inside Workout; they are not extra global navigation layers. |
| Momentum | Open from Coach for the private 90-day home/trial journey. It keeps its existing independent private tracking and security. |

## Exercise Swaps

Each movement with supported alternatives has an explicit **Swap** button in
Today. It opens the **Swap** tab of the exercise sheet, separate from **Log**,
**Technique** and **History**. Gym retains its visible swap choices.

Select an option whose listed equipment you actually have. The sheet changes to
that movement's own instructions and video. A swapped movement is labelled
**Swap version**, with a visible **Revert to original** action. Returning to the
original restores its own recorded loads; it does not copy another machine's
pounds across. Ramp-up teaching also follows the chosen alternative.

## Bodyweight Quads And Available Home Equipment

New, unstarted home A sessions use **Bodyweight Wall Sit** (10-20 seconds,
shallow comfortable depth); B sessions use **Nordic Leg Extension (Reverse Nordic)**
(4-6 small-range repetitions). These replace the former cable quad slot rather
than adding two more quad exercises to every workout. A wall sit is a timed
isometric hold, not a dynamic leg extension. The reverse Nordic trains the quads;
it is not an ankle-anchored Nordic hamstring curl.

Both movements have their own E3 Rehab video and instructions. Neither asks for
pounds: log hold seconds for wall sits and reps for reverse Nordics. Because knee
bending/sitting has previously been difficult, do not force a deep wall sit or
kneeling lean. Use the **Seated Knee Extension (No Machine)** swap if either is
uncomfortable. It is a lighter option, not identical resistance. No unverified
GIF is advertised as an exact demonstration of either new movement.

Future home rows use **Single-Arm Dumbbell Row**, not the unavailable Mi6 seated
row. Existing machine/cable sessions keep their actual history and training credit.
Upstairs bodyweight practice comes first; downstairs walking precedes machine
ramp sets and lifting. Machine Chest Press Warm-Up is always downstairs. Finish
floor work can stay downstairs or be done upstairs without another equipment trip.
Movements open only when explicitly selected; completing one never opens the next.

References: [E3 Rehab reverse Nordic guide](https://e3rehab.com/reversenordic/),
[reverse Nordic setup video](https://www.youtube.com/watch?v=PvJDjcfZe1c),
[wall sit demonstration](https://www.youtube.com/watch?v=RG7z0P9qrLk),
[UNMC seated knee extension](https://www.unmc.edu/cctr/community/proactive/fourtypes/strength_8_seated_knee_extension.pdf),
[HOIST Mi6 equipment and resistance ratio](https://www.hoistfitness.com/products/mi6-functional-trainer).
These establish the movement/setup; they do not diagnose an individual's knee or hip alignment.

## Design And Accessibility

- Today is a location-grouped session checklist, not a stack of expanded exercise cards. Coach uses compact training/meal launch rows; set logs open explicitly in place.
- One navigation model, fixed-size controls and clear screen titles replace the previous stacked navigation/dashboard treatment.
- Training is green, meals coral and weight/account utilities blue. Completed and skipped states have text as well as color.
- Foreground/background selection colors change together; a transition cannot temporarily put dark selected text on a dark transparent surface.
- Set rows explicitly assign every grid track. Labels, targets, weight, reps, effort and completion controls cannot share an inherited grid area.
- Exercise sheets and working fields are opaque. Keyboard focus stays contained in the sheet, and changing tabs unmounts inactive media.
- Media resets when the exercise, video or GIF changes. Inline iframes are keyed by the active video, preventing a swap from retaining the old player.
- Inputs use readable text and touch-friendly dimensions. Reduced motion is respected. Image failures show a video icon rather than a broken thumbnail.

The design draws on [Apple's separation of navigation and toolbars](https://developer.apple.com/documentation/uikit/uitabbar)
and [Strong's ordered workout/individual set workflow](https://help.strongapp.io/article/229-my-first-workout).
It is an original web/PWA interface, not native UIKit or a claim of App Store distribution.

## Developer Map

| File | Responsibility |
| --- | --- |
| `src/components/WorkoutMove.tsx` | Movement presentation and explicit actions. Receives callbacks; owns no fitness records. |
| `src/components/PremiumUI.tsx` | Compact app bar, account entry and accessible progress primitive. |
| `src/experience.css` | Rebuilt app shell, navigation rail/dock, semantic colors, explicit logging grids and responsive sheets. Replaces the previous experience layer. |
| `src/premium.css` / `src/styles.css` | Existing feature primitives and legacy data-view compatibility. New movement layouts override their inherited grid positions explicitly. |
| `src/features/momentum/plan.ts` | Equipment-aware future home templates and preservation of recorded machine sessions. |
| `scripts/redesign-ui-check.mjs` | Phone/desktop checks for input overlap, account navigation, swaps, bodyweight fields and original-load restoration. |

```bash
npm test
npm run test:ui -- --redesign-only
npm run test:ui -- --contrast-only
npm run test:ui -- --repeat=2
npm audit --audit-level=high
```

UI checks use synthetic accounts and block production data access. Screenshots and
failure traces go into ignored `outputs/ui-check/`, never private documentation.
