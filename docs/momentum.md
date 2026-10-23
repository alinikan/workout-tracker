# Momentum

**My Personal Fitness Journey**

Start small. Show up. Get stronger.

Momentum is an optional, single-owner, private 30-day experience inside Recomp. It emphasizes an
achievable appointment, adapted non-contact boxing, very light strength practice, regular meals,
and recovery. It is **not** a replacement for the original 26-week program or medical assessment.

> [!IMPORTANT]
> The feature is disabled until an administrator installs the additive migration and authorizes
> one Supabase authentication user. There is no owner email/UUID in the public application.
> Nothing in the installation process means that exercise has been medically cleared.

## One-Time Supabase Setup

Use your existing Supabase project, publishable key, authentication and Vercel environment variables.
Do not create a second account, put a service-role key in Vite, or change `workout_progress`.

1. In your project folder, open `supabase/migrations/20261023_momentum.sql`.
2. In the Supabase dashboard for the **same project used by Recomp**, choose **SQL Editor**,
   then **New query**. Paste the full migration and run it as the project administrator.
3. The migration creates a private singleton allowlist, a separate RLS-protected progress table,
   and two restricted RPC functions. It does not delete, migrate or rewrite Recomp progress.
   Re-running it is supported. Its `drop policy` replaces only its own named Momentum read policy.
4. Go to **Authentication → Users**, open your existing sign-in account, and copy its **User UID**.
   Use the authentication UID, not a project reference, email address or API key.
5. Open another SQL query and replace the placeholder **privately in the dashboard**:

```sql
-- Exactly ONE authorized account. Do not commit the completed query to GitHub.
insert into momentum_private.momentum_owner (singleton, user_id)
values (true, 'REPLACE_WITH_YOUR_AUTH_USER_UUID'::uuid)
on conflict (singleton) do update set user_id = excluded.user_id;
```

6. Run that query. Changing its UUID replaces the authorized account; it does not grant a second
   account access. Do not do that accidentally. Existing records remain owned by their original UID.
7. Run the updated app, sign in to that account, and open **Coach Hub → Momentum**. Other accounts
   and signed-out visitors see no Momentum entry. An SQL Editor call to `momentum_access()` is not
   an equivalent browser test: the editor's administrator session normally has no `auth.uid()`.

> [!NOTE]
> No new environment variable is required. `VITE_SUPABASE_URL` and the existing publishable key stay
> as they are. Never add an owner UUID or a service-role credential to a `VITE_` variable.

To revoke private access without deleting records, run as the administrator:

```sql
delete from momentum_private.momentum_owner
where user_id = 'REPLACE_WITH_THE_CURRENT_OWNER_UUID'::uuid;
```

The next connected access check removes the view and device cache. An already-open offline device
cannot learn about a server revocation until it reconnects. Sign it out or close it if immediate
device-level access removal is required. Do not delete the authentication user or original
`workout_progress` table merely to remove Momentum access.

## Run Locally

From the project folder:

```bash
npm install
npm test
npm run dev -- --host 0.0.0.0 --port 3000
```

If port 3000 is already occupied, choose another port. Open the URL printed by Vite on your Mac.
For an iPhone production/Home Screen experience, use the HTTPS Vercel deployment. Private offline
draft encryption needs HTTPS or localhost; a plain LAN HTTP URL is not a secure context on iPhone.
After setup, the same authorized account sees its private record on each device.

For GitHub/Vercel deployment, commit the source and migration file, then push your normal branch.
Vercel builds the code but **does not execute the SQL migration or authorize an account**. Do the
dashboard setup above separately. There is no automatic production database migration in CI.

## The First Visit

Onboarding has three short steps:

1. **Your routine:** review goals, current activity, discipline, environment, realistic days and budget.
   Age, height and a longer-term weight milestone are optional and initially blank.
2. **Safety and guidance:** record assessment, activity permissions, restrictions and any time limit.
   Specific clinician-excluded template movements can be omitted without the app choosing a medical
   substitute. The full starter calendar needs advice permitting all three proposed activity types.
3. **First Monday:** explicitly activate a Monday after assessment, or stay in preparation. Opening
   or installing the app does not start the calendar. A later Monday is allowed; a retroactive start
   is not. Momentum's date is independent of the original Recomp start date.

Preparation includes meals, contacting instructors, comparing small commitments, choosing appointments
and setting out equipment. It has no missed-workout penalty while assessment is pending.

### Medical Boundaries

Exercise-related near-fainting must not be attributed to food, hydration, smoking or conditioning by
the app. Seek prompt professional assessment before strenuous activity. The app cannot diagnose the
cause, evaluate cardiovascular safety, verify a clinician's advice or issue clearance.

The controls record advice the user reports actually receiving. They are not clinical authorization.
Permissions and structured time/movement exclusions affect the plan. Free-text restrictions remain
visible during training and must be followed; software cannot interpret every clinical instruction.

Reporting dizziness/near-fainting or concerning pain removes training controls and creates a medical
pause. A weekly review reporting concerning symptoms does the same. Good energy or sleep never
overrides this state. Medical pauses do not expire automatically or become ordinary missed days.
Recording appropriate follow-up guidance is required before resuming.
An unresolved medical pause also blocks starting another private month, including one created on a
different device. Follow-up assessment cannot be dated before that pause.

For fainting during exertion, chest pain, severe breathlessness or other alarming symptoms, stop and
seek emergency help (911 in B.C.). For recurrent symptoms without emergency signs, stop and obtain
prompt medical advice before resuming; HealthLink BC 811 offers non-emergency advice.

## What the 30 Days Contain

| Days | Baseline plan |
| --- | --- |
| 1–7 | 5–8-minute walk; 8-minute walk; first Strength A; recovery/preparation; short boxing introduction; recovery; planning. |
| 8–14 | Strength A; easy walk; rest/skill-note review; easy walk; beginner boxing; recovery; two-week checkpoint. |
| 15–21 | Strength A; comfortable walk; **optional** Strength B or recovery; rest; boxing; optional walk/recovery; weekly review. |
| 22–28 | Strength A; easy walk; **optional** Strength B or recovery; rest; boxing; optional walk/recovery; monthly reflection. |
| 29–30 | Easy familiar Strength A; reflection and an optional walk. No maximum testing. |

Every day has instructions, duration, a preparation task, an achievable success condition and a
smaller alternative. The initial data is in `plan.ts`; adaptations do not rewrite these defaults.

Strength A: one very easy set of leg press, light incline dumbbell press, lat pulldown and dead bug.
Strength B: one very easy set of leg press, supported single-arm row, glute bridge and high-incline
push-up. Both use a gentle 3–5-minute warm-up, generous rests and a gentle cool-down. Targets guide
practice, not compulsory minimums. Continuous breathing and comfortable joint ranges take priority.

### Adaptation Rules

- Dates alone do not increase weight, sets or the number of strength sessions.
- The second weekly strength session defaults to recovery, not an extra obligation.
- Offering it requires two comfortable full strength practices, two comfortable technique visits,
  good recorded recovery, a comfortable/manageable review, explicit permission for progression,
  sufficiently recent practice, and an explicit user choice.
- Missing effort/recovery data, recent demanding attempts, poor recovery, repeated misses or symptoms
  prevent an increase. Observation does not earn physical-intensity progression.
- An eligible user may choose a second short practice **or** one extra easy set of a single movement,
  not a simultaneous load/frequency/volume increase. The app never proposes a heavier weight in Month 1.
- Later boxing durations depend on actual comfortable visits, not the numbered week. Breaks,
  observation and an instructor's adaptation always remain available.
- A lighter option, repeated week or smaller participation is legitimate. There is no mandatory
  make-up session, doubled workout, harsh streak reset or penalty for rest.

Three outcome buttons distinguish planned completion, a smaller version, and not doing the activity.
Medical pause is separate. Completing a movement never fills other sets. The full-session button
rejects unfinished sets; a modified strength record still needs at least one actual set and repetitions.
Planned and actual attendance dates are stored separately.

## Boxing and Appointments

The class finder links to official information checked **October 23, 2026**. It is a dated research
snapshot, not a live price feed. Confirm tax, suitability, availability, trial eligibility and terms
with the gym. No purchases or bookings are submitted by the app.

- **Titan:** official Free Trial link; contact for current price and conditions. Ask about an adapted
  technique introduction, not conditioning-oriented cardio kickboxing.
- **Rebels:** official contact page mentions a free trial and Fundamentals; prices need confirmation.
- **Quinit:** official intro page advertises CAD $59 for two weeks, no trial auto-renewal/contract,
  and glove rental. Adult membership starting prices are not the trial price or a complete contract quote.
- **Engineered Bodies:** Foundational Strength page lists $150 and a three-month commitment, but the
  billing interval and any onboarding charges should be confirmed. It is not a boxing program.
- **Port Moody Recreation:** published adult drop-in/one-month access is a lower-commitment alternative
  for gym access; a suitable boxing class was not verified.

Choose a budget, gym, preferred day, confirmed time and next appointment. Individual class moves swap
with an unrecorded walking/recovery day in the same week and require at least 48-hour spacing from
structured strength/boxing appointments by date. The date check rejects gaps under two calendar days;
strength start times are not collected, so confirm a real 48-hour gap and suitable recovery yourself
with your instructor. A conflicting date is rejected with a reason, not silently squeezed in.
Moving a booked appointment or changing its provider/time clears its booking confirmation: re-confirm with the gym.
Recorded attendance cannot be rescheduled after the fact.

Skills progress as educational prompts: stance/guard, jab/footwork, cross if appropriate, technique
review. They are not mastery requirements or a replacement for an instructor. Sparring never unlocks
automatically, including in Month 2.

## Food and Measurements

Momentum reuses the existing Monday–Sunday recipe rotation and the original tutorials/media.
It offers breakfast, lunch, one snack and dinner, detailed cooking sections, portion examples,
same-slot swaps with visible Revert, and a weekly ingredient list including swaps.

It deliberately does not run Recomp's automatic calorie/portion-tightening engine. Existing calorie
estimates are not assumed to be individualized needs. Regular meals, protein foods, produce and
carbohydrates supporting activity take priority. Supplements are optional; food is not earned through
exercise. Pre-class snack timing is a flexible tolerance-based reminder, not a cure or guarantee
against dizziness. Seek individualized nutritional advice where needed.

Meal checkmarks and swaps belong only to Momentum. Original Diet history is not modified or counted
again. **Weight is different:** the Coach Hub's existing kg metric is the single source of truth.
Saving a weight from Momentum updates that same dated metric, with the existing protected sync.
The shared chart uses actual readings and reports missing coverage rather than treating it as zero.
A Recomp reset that intentionally clears shared weights also clears those displayed weights here.

Waist checks are optional, private to Momentum and not required daily. No body-fat percentage is
estimated. Progress photos are intentionally not collected because no secure private photo-storage
bucket is configured. There is no promised appearance, spot-fat reduction or fixed monthly loss.

## Reminders and Month 2

Reminders are opt-in and in-app only. Calendar export is an explicit user action, with a generic
appointment title and no clinical notes. There are **no background push notifications**. Vancouver
exports use the verified 2026 permanent UTC-7 rule rather than an obsolete November clock change;
historical dates retain IANA-based handling. See the [B.C. announcement](https://news.gov.bc.ca/releases/2026AG0013-000209).

Month 2 recommendations are deterministic: maintain manageable attendance, keep boxing as an anchor
when it fits, try a different environment when it does not, simplify after poor attendance/recovery,
and prioritize clinical review after symptoms. There is no automatic Month 2 escalation or sparring.
Starting another private month archives the old one after an explicit `START` confirmation. Recomp
records are untouched. Repeating a week creates distinct session IDs and preserves earlier logs;
future booked/recorded appointments block automatic date shifting.

## Privacy and Sync Architecture

| Layer | Boundary |
| --- | --- |
| Administrator allowlist | `momentum_private.momentum_owner` contains one authorized authentication UID; browser roles have no access. Existing unrelated private-schema grants are untouched. |
| Access discovery | `momentum_access()` returns whether the current signed-in user is authorized; no email comparisons. |
| Reads | RLS requires both matching `auth.uid()` and allowlist membership. Guessing another UID returns no record. |
| Writes | Direct browser table writes are denied. `momentum_save()` derives ownership from `auth.uid()` and uses compare-and-swap revisions under a row lock. |
| Activation | The save RPC also validates recorded permissions and a non-retroactive Monday when a new journey is activated. It cannot verify real clinical assessment. |
| Concurrent devices | Existing three-way merge preserves independent edits and new journey IDs retain history. A medical pause wins over stale permission fields. |
| Device cache | Private drafts are AES-GCM ciphertext with an account-bound authentication tag. The key is held in tab session storage, not in source or the database. |
| Account changes | Render-time owner checks, request epochs, memory clearing and cache removal prevent another signed-in account receiving the previous account's private view. |
| Initial offline access | A fresh visit/reload cannot decrypt/display private data until a connected authorization check succeeds. |

> [!WARNING]
> An already authorized open session can keep a private draft while offline. **Sync before closing
> the browser session.** Closing it can discard the encryption key and make an unsynced draft
> unrecoverable. Saved server records remain available after sign-in. Encryption is not a guarantee
> against a compromised device, malicious same-origin script, copied browser session or administrator.

Use a trusted device and sign out on shared computers. Save/sync errors are visible. No private API
response is cached by the service worker, no medical text is exported to reminders, and no health
profile or owner identifier is embedded in static source. The public feature code and generic
program information are inspectable; only authorized records are private.

## Tests and Maintenance

```bash
npm test
npm run typecheck
npm run test:ui -- --momentum-only
npm run test:ui -- --repeat=2
npm audit --audit-level=high
git diff --check
```

`tests/momentum.test.mjs` covers the 30-day schedule, safety, conservative progression, actual
participation, repeats, class moves, encrypted cache, independent merge and shared-resource references.
It executes the actual migration in test-only PGlite (PostgreSQL), including disallowed users,
guessed IDs, direct-write bypasses, singleton authorization, CAS conflicts, anonymous access,
revocation, server-side activation checks and preservation of the original table.

Browser checks use synthetic accounts and mock network services, not the production database.
They exercise iPhone-width WebKit and desktop Chromium in both themes, no-activation onboarding,
real set logging, tutorials, meal swap/revert, shared weigh-ins, offline sync, medical pauses and
revocation, sign-out/account changes and independent-device offline merging. Remote media requests are blocked in fixtures; video availability and physical-device
iOS behavior still need a real-device smoke check after deployment.

No test uses the owner's actual medical history, measurements, email, UID or credentials.

### File Map

| File | Responsibility |
| --- | --- |
| `src/features/momentum/types.ts` | Generic types and blank defaults; private values are collected at runtime. |
| `plan.ts` | Exact starter schedule, templates, date-only arithmetic, repeats and class rescheduling. |
| `safety.ts` | Assessment/start gate, pause logic and urgent-care messages. |
| `coaching.ts` | Explainable recommendations, honest completion checks and earned optional changes. |
| `research.ts` | Concise evidence summaries, source links and dated official gym information. |
| `calendar.ts` | Non-sensitive calendar export and correct Vancouver appointment conversion. |
| `storage.ts` | Private document normalization, merge and account-bound encrypted device drafts. |
| `useMomentum.ts` | Authorization, stale-response guards, revisioned sync and visible errors. |
| `MomentumPage.tsx` / `momentum.css` | Onboarding and seven scoped, responsive working views. |
| `supabase/migrations/20261023_momentum.sql` | Additive allowlist, RLS, grants and write RPC; administrator-run only. |
| `scripts/momentum-ui-check.mjs` | Feature-specific checks using the existing isolated browser harness. |

To change meals, edit the existing shared recipe library or select a swap; do not copy the recipes
into a second static dataset. To extend a future month, add an explicit new template and safety/tests
rather than redirecting Momentum into the original earned-week engine.

## Evidence and Its Limits

The exact starter dose is a deliberately conservative product choice, conditional on clinical advice,
not a proven treatment for fatigue or presyncope. Long-term public-health activity targets should
not be imposed on the first sedentary week.

- [CSEP screening](https://csep.ca/2021/01/20/pre-screening-for-physical-activity/): symptoms and activity restrictions warrant appropriate advice.
- [WHO activity guidance](https://www.who.int/news-room/fact-sheets/detail/physical-activity/): some movement is better than none; build gradually.
- [ACSM 2026 guidance](https://acsm.org/resistance-training-guidelines-update-2026/): consistent, individualized resistance practice for healthy adults; not clinical clearance.
- [Planning meta-analysis](https://pubmed.ncbi.nlm.nih.gov/35742582/): planning interventions improved activity on average, with heterogeneous results.
- [Group-class review](https://pubmed.ncbi.nlm.nih.gov/42352717/): perceived capability and social/instructor context relate to adherence; much evidence is observational.
- [Resistance exercise during weight loss](https://pubmed.ncbi.nlm.nih.gov/40909191/): preservation of fat-free mass on average does not justify an aggressive deficit or inappropriate training dose.
- [CDC weight-management guidance](https://www.cdc.gov/healthy-weight-growth/losing-weight/): realistic goals, support, regular healthy habits and gradual change.
- [HealthLink BC](https://www.healthlinkbc.ca/healthwise/fainting): multiple possible causes of fainting and the role of professional evaluation.
- [QuitNow BC](https://quitnow.ca/): optional free tobacco-reduction/cessation support; not a prerequisite for medically permitted activity.
