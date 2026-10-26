# Session Experience

This redesign keeps the training/diet model and cloud document unchanged. Its purpose is to make
the existing behavior easier to use on an iPhone Home Screen web app and a MacBook browser.

## Implementation Map

| File | Responsibility |
| --- | --- |
| `src/App.tsx` | Owns dates, session state, inline expansion, exercise/recipe section selection, history lookup, and action-scoped Undo. Existing log handlers still perform the actual writes. |
| `src/components/SessionUI.tsx` | Controlled accessible section tabs, honest device/cloud save presentation, and a dismissible Undo notice. |
| `src/components/WeightTrendChart.tsx` | Calendar-spaced daily readings, weekly averages, date-range controls, readable coverage, and exact-value inspection. |
| `src/lib/presentationState.ts` | Pure save-status and conditional Undo functions, suitable for direct regression tests. |
| `src/experience.css` | Semantic colors, compact working layouts, solid content surfaces, measured mobile controls, and motion/transparency fallbacks. Loaded after the existing feature and premium styles. |
| `public/sw.js` | Versioned installed-app shell. This release advances the cache version so deployed devices can receive the updated interface. |

## Working Through Today

1. Coach remains the first screen. Choose Training or the Today dock item.
2. The actual date is visible. The calendar starts collapsed; changing a date does not redirect Gym
   away from the actual current day.
3. The first unresolved movement expands automatically. Tapping a row can open another movement
   without completing anything. Only one inline log is open at a time.
4. Record weights in pounds and explicitly check sets. Previous-load buttons copy one completed
   historical set's weight, not reps, effort, or completion. Incomplete historical sets do not get
   a copy button. There is no automatic weight increase merely because time elapsed.
5. Finishing a movement reveals the next unresolved movement. Skips remain distinct from completion.
6. Readiness, daily targets, and session guidance remain available in disclosures rather than
   competing with the working set log.

Exercise details have three controlled sections: Log, Technique, and History. Switching away from
Technique unmounts its video player, stopping playback. History is limited to the exact movement
ID and dates before the reviewed workout, so machine swaps do not inherit another exercise's loads.
Partial attempts remain visibly partial. The most recent twelve attempts are shown.

## Meals and Weight

Meal rows use stable, contained thumbnails. The current [batch planner](meal-prep.md) replaces
daily cooking assignments with Eat today / Cook batch / To buy, keeping detailed steps collapsed.
One main dish fills lunches and dinners for two or three days. Quantified raw/dry groceries,
dated plate shares, prepared snapshots and whole-batch swaps are shared with Momentum. The
previous Ingredients / Cook / Portion cards remain only for earlier saved meal history.

The weight chart uses calendar-day ranges, not the last N entries. A gap in measurements stays a
gap. Weekly means use only actual measurements from the existing weekly summary model; they are
not smoothed, interpolated, or filled with zeros. Missing weeks break connecting segments.
Current-week averages are provisional. A weekly point can include the whole calendar week's
readings even if the chosen display range starts midweek. Exact reading selection is available
without relying on hover, tiny SVG targets, or color perception.

The chart and coach text describe weight change, not proven fat loss or muscle gain. Weight and
training achievements remain separate signals; no new calorie or exercise decisions are introduced.

## Undo and Saving

Undo captures the normalized before/after logs for one explicit set, movement, or whole-day
completion/skip, or for one meal completion. Reversal compares each field to the action's expected result before restoring it.
If a field was edited afterward, that value is left alone. Unrelated exercises, dates, metrics,
and the other product area's entries are not part of the reversal. The result is normalized and day completion is
recomputed using the same model as Today and Gym.

The action is invalidated on a workout-date change, account switch, or reset generation change.
It has a visible dismiss control and does not disappear on a short timer. New undoable actions
replace the previous notice. Undo remains a normal autosaved edit and uses the existing sync merge.

Device saving and cloud syncing are deliberately different labels. 'Synced' requires a signed-in,
online, synced state and an existing successful device save. A quota/storage failure takes
precedence over all success messages. Offline status never claims an edit reached the cloud.

## Mobile and Accessibility

- The footer measures its actual height with ResizeObserver, including Undo and safe-area padding.
  Gym's fixed action bar and page-bottom padding use that measurement, avoiding fixed-height guesses.
- VisualViewport changes detect a substantial keyboard resize while editing. Fixed dock/action
  chrome becomes noninteractive and hidden while typing; normal in-page form controls remain usable.
- Tabs expose tablist/tab/tabpanel relationships, a selected state, roving focus, and Arrow/Home/End
  keyboard navigation. Modal sheets retain Escape, focus containment, background-scroll locking,
  and focus restoration.
- Content and input surfaces are opaque. Navigation has a reduced-transparency fallback. The
  interface does not require browser support for backdrop filters or view transitions to function.
- Short transitions do not gate writes. Reduced motion disables the new decorative animations.
- Native focus scrolling is immediate, not globally smooth. Today and recipe cards retain
  their real heights without layout-position animations or off-screen size estimates. Panel
  entrances fade without translating the controls. Explicit workout navigation can still
  request a smooth scroll; normal tab and input interactions do not.
- Labels, icons, check states, and text accompany semantic colors. Small inspection targets have
  an equivalent select control. Input font sizes avoid iOS focus-zoom for the primary logging fields.
- WebKit emulation is useful but does not reproduce every physical iPhone keyboard, browser chrome,
  safe-area inset, or installed-PWA lifecycle. A physical-device smoke test remains worthwhile.

## Verification

`npm test` runs a production build and the behavior/source/service-worker tests. New behavioral
coverage checks conditional Undo, honest save states, calendar chart windows and missing data,
and exact-exercise history isolation. Existing progression, skip, rollover, reset, and sync tests
remain in place.

`npm run test:ui` runs isolated fixtures in WebKit at 402x874 and 375x812 and Chromium at 1440x900,
in light/dark themes and normal/reduced motion. It exercises inline logging, previous-load copying,
later edits followed by Undo, recipe/exercise sections, calendar return-to-today, chart controls,
offline status, keyboard-resize behavior, contrast, overflow, dock/action separation, GIF fallback,
and two-device/reset/offline-save integration. Test users and storage are synthetic; no personal
account or production database is used. Remote media is blocked except for an explicit synthetic
GIF, so these tests verify player behavior and layout, not external video availability.

Use `npm run test:ui -- --repeat=2` for the same repeated matrix that runs in GitHub Actions.
Each repetition creates fresh contexts and exercises all six viewport/theme configurations.
Recipe checks also switch Ingredients/Cook/Portion three times with real taps/clicks and assert
both the selected tab and its panel. Repetition is not a retry: the first failed interaction
fails the job. `--repeat` accepts integers from 1 through 5; the default is 1.

Screenshots are written under `outputs/ui-check/` (ignored by Git). The test server disables source watching
so editing a source file cannot silently reload a fixture into a different product area mid-test.
If a check fails, the runner also saves the failing screen and a Playwright trace in that folder.
GitHub Actions uploads both in the `ui-check-screenshots` artifact. Download and extract the artifact,
then inspect a trace locally with `npx playwright show-trace path/to/failure-trace-1.zip` (use the
actual file name). The trace includes only the isolated test account and synthetic progress.

Phone copy-weight and repeated-tab interactions center the actual control before tapping, reducing
dependence on WebKit's automatic edge scrolling. Copying a previous
load is tested both on an empty field and after a manual edit, without completing the set or
inventing repetitions. The copy button sits outside the input label, and interactive Today rows
do not use layout-position transforms; the small log entrance fade remains separate.

Run #13's trace recorded a changing document scroll position during a recipe tab click, followed
by an unchanged selected tab. That evidence motivated the geometry changes above. Background
references: [MDN scroll-behavior](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scroll-behavior),
[MDN content-visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility),
and [Playwright input actions](https://playwright.dev/docs/input).

## Design References

- [Hevy: previous workout values](https://www.hevyapp.com/features/track-exercises/): previous
  performance belongs beside the current logging action.
- [Fitbod exercise pages](https://fitbod.me/about-fitbod-exercises/): demonstrations and technique
  belong together, available when needed.
- [Cronometer interface updates](https://cronometer.com/blog/cronometer-updates-whats-new-improved/):
  clear summaries and nutrition visualizations.
- [Apple materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials):
  depth should communicate structure without sacrificing contrast.
- [Linear's UI redesign](https://linear.app/now/how-we-redesigned-the-linear-ui): aligned controls,
  visual hierarchy, and reduced navigation noise.
