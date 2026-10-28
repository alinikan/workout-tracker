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

## Home Quad Work Without A Leg-Extension Machine

New, unstarted home sessions use **Seated Cable Knee Extension** with the Mi6 low
pulley, ankle strap and a stable seat. This trains knee extension without adding
a squat. The seat and cable path must actually be stable and comfortable. Start
with minimal resistance and do not force leg alignment or a painful range.

The **Seated Knee Extension (No Machine)** swap is deliberately lighter bodyweight
work. It is not an equal-load replacement for the cable. It needs no weight
input. Both choices include a matched YouTube tutorial and setup instructions.
The cable exercise does not advertise an unverified machine GIF as an exact demo.
Existing optional GIFs remain available on the exercises that have them.

Already-recorded machine sessions keep the machine prescription and their
history/credit. Future unstarted sessions use the corrected equipment. Cable
history is separate from the old machine's selected pounds. The gentle seated
knee-extension warm-up still requires only a chair, not a leg machine.

References: [cable setup demonstration](https://www.youtube.com/watch?v=ebjD98gZd8E),
[exercise publisher's setup guide](https://fitwill.app/exercise/5664/cable-seated-leg-extension/),
[UNMC seated knee extension](https://www.unmc.edu/cctr/community/proactive/fourtypes/strength_8_seated_knee_extension.pdf),
[HOIST Mi6 equipment and resistance ratio](https://www.hoistfitness.com/products/mi6-functional-trainer).
These establish the movement/setup; they do not diagnose an individual's knee or hip alignment.

## Design And Accessibility

- One navigation model, fixed-size controls and clear screen titles replace the previous stacked navigation/dashboard treatment.
- Training is green, meals coral and weight/account utilities blue. Completed and skipped states have text as well as color.
- Foreground/background selection colors change together; a transition cannot temporarily put dark selected text on a dark transparent surface.
- Set rows explicitly assign every grid track. Labels, targets, weight, reps, effort and completion controls cannot share an inherited grid area.
- Exercise sheets and working fields are opaque. Keyboard focus stays contained in the sheet, and changing tabs unmounts inactive media.
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
