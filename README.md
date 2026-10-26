# KnightLend

Peer-to-peer rentals for the UCF community. Verified students and alumni rent things to each other for a day, a week or a semester: a financial calculator for one exam, a DSLR for one project, a drill for one move-in weekend.

Lenders are protected by a **protection hold**: a temporary hold on the borrower's card, released after a clean return and charged only if an item comes back damaged, late or not at all. Condition photos at both ends, public campus meetups, plain-language agreements, two-way reviews and a moderator view round out the safety story.

Payments, verification and locations are simulated. Nothing here touches a real card, school record or GPS.

## Quick start

Needs Python 3.11+, Node 18+ and (optionally) Docker.

```bash
make install   # Python venv + server deps, client deps, server/.env with a random JWT secret
make mongo     # optional: MongoDB 7 in Docker
make seed      # wipe and load the demo data
make dev       # FastAPI on :8000 and Vite on :5173, together
```

Open **http://localhost:5173**. API docs are at **http://localhost:8000/docs**.

**No Docker?** Skip `make mongo` (and `make seed`). The server can't reach MongoDB, logs a loud `FALLING BACK TO MONGOMOCK` banner, and runs on an in-memory database that it seeds itself on startup. Everything works the same, but data resets whenever the server restarts (including `--reload` restarts after code changes).

Other targets: `make test` (pytest), `make lint` (ruff + TypeScript), `make build` (production client build), `make mongo-down`.

## Demo accounts

All demo accounts share the password **`knightlend-demo`**. With `DEMO_MODE=true` you don't need it: use the Demo bar at the top of the app to switch accounts in one click.

| Demo bar button | Who | Sign-in email |
| --- | --- | --- |
| Borrower Ellie | Finance student, lives on campus. Has rentals in most states. | `ellie@demo.knightlend.test` |
| Lender Leo | Film student who lends camera, GoPro and lighting gear. | `leo@demo.knightlend.test` |
| Alumni Kurt | Class of 2018. Lends tools and appliances. | `kurt@demo.knightlend.test` |
| Moderator | Reviews disputes, reports and flagged members. | `mod@demo.knightlend.test` |

The other seeded members (Priya, Marcus, Sofia, Jordan, Ava, Dana, Rafael) use the same pattern, for example `priya@demo.knightlend.test`. Ava is unverified, and Jordan is flagged for repeated low reviews. All people, listings and reviews are fictional. The `.test` addresses are only used to sign in and are never shown in the app.

## Demo bar

Only rendered when the server runs with `DEMO_MODE=true`. The `/api/demo/*` endpoints answer 404 otherwise.

- **Account buttons**: sign in as Ellie, Leo, Kurt or the Moderator.
- **Advance time N days**: moves the virtual clock forward one day at a time and runs the job runner after each day, so you see the "Your hold renews tomorrow. No charge." reminder, then the refresh (or its failure), and late returns.
- **Run jobs now**: runs the job runner at the current virtual time.
- **Reset demo**: wipes and re-seeds everything and resets the clock (asks first).
- **Today** shows the virtual date.

## Guided walkthrough

About 10 minutes. Start with **Reset demo** for a clean slate.

1. **Landing.** Open Home: the hero search, class/major shortcuts, nearby items, and how the protection hold works.
2. **Sign up.** Sign out, then go to *Create account*. After you register you're taken to **Verify**. For a student, enter any `@ucf.edu` address and the simulated 6-digit code appears on screen. For an alum, enter a graduation year and upload any photo as the diploma. Verified members get the black-and-gold badge and can list items.
3. **Browse.** Click **Borrower Ellie**, then **Browse**. Try the *Finance calculators* shortcut, the *Protection hold: up to $50* filter, availability dates, *Sort: Top-rated lenders*, and the **Map** view (item pins, public pickup spots and nearby apartment areas).
4. **Listing detail.** Open the *Canon EOS Rebel T7*. Check the gallery, exact specs, all four rate types, the *Shoot kit* bundle, the protection hold box with its explainer, the lender's ratings and reviews, the usage guide, the meetup map and the cancellation rules. (To see the near-purchase-price warning, open the *Lasko space heater* and pick a 6-week rental.) A signed-in member can request from Home in 2 clicks: an item card, then **Request to rent**.
5. **Request.** Send a request. Then click **Lender Leo**, open *Dashboard → Requests*, and **Approve and accept agreement**.
6. **Agreement.** Back as **Borrower Ellie**: open the rental, read the plain-language terms and accept.
7. **Protection hold.** The card form shows "You'll be charged" and "Held, not charged" side by side.
   - Open *Test cards* and use **Declines the hold**. You get the friendly error, and the rental can't move ahead.
   - Use the **Visa debit** card to see the debit notice and the *Use a different card* option.
   - Use **Visa credit**. You get "Hold placed. Released automatically on return." and the hold badge turns gold (Active, with its expiry date).
8. **Meetup.** Pick a public spot (Student Union, Library, Garage A…) on the list or the map, then a day and a time of day. Each spot shows its accessibility notes.
9. **Condition photos.** On the same Canon rental, Ellie uploads a before-pickup photo (any image).
   - Switch to **Lender Leo**, confirm the photos ("These match what I see"), then **Mark as picked up**. Pickup opens the day before the start date, and the default dates start tomorrow.
10. **Return.** Back as **Borrower Ellie**, add a return photo, tick the checklist and **Mark as returned**. The hold stays held while Leo checks it.
    - As **Lender Leo**, choose **Same condition. Release the hold.** Ellie sees "Your $150 hold has been released" in her notifications, and the hold badge turns green.
11. **Review.** Both sides leave a 5-star rating and a written review. The ratings on the user and the listing recompute.

More to try:

- **Claims and disputes.** As Ellie, open *Rode VideoMic*. Rafael's $25 damage claim is waiting: dispute it. As the **Moderator**, open *Moderation → Disputes*, review both sides' photos and capture part of it. Ellie then sees "Hold captured: $15" with the explanation, and the rest released. As Leo, the returned *Canon* lets you file a damage claim (photos required, capped at the hold).
- **Hold refresh.** Ellie's 30-day *portable AC* hold expires within a day. Click **Run jobs now** for the reminder, then **Advance time 1 day** to see "Hold refreshed. No charge."
- **Failed refresh.** Advance 2 days. Marcus's *lighting kit* is on a card that fails on refresh. Sign in as Marcus to see the *Update card* prompt, and as Leo to see the lender notice.
- **Late returns.** Advance past a return date. The rental is marked late, and the lender can file a late or not-returned claim.
- **Restrictions.** As the Moderator, restrict Jordan from *Flagged members*. Jordan now sees a notice and is blocked from requesting and listing by the server, and his listings disappear from search.
- **Messaging.** Any rental's thread polls every 5 seconds. Type a phone number or email and it's replaced with "[contact info hidden]".

## Environment variables

`server/.env` (created by `make install` from `server/.env.example`):

| Variable | Default | What it does |
| --- | --- | --- |
| `MONGODB_URI` | `mongodb://localhost:27017/knightlend` | MongoDB connection string |
| `DB_MODE` | `auto` | `auto` tries MongoDB and falls back to mongomock; `mongo` requires MongoDB; `mock` is in-memory only |
| `JWT_SECRET` | random, set by `make install` | Signs login tokens. Never commit a real one. |
| `JWT_EXPIRES_MINUTES` | `10080` | Token lifetime (7 days) |
| `DEMO_MODE` | `true` in `.env.example` | Enables the Demo bar and `/api/demo/*`. Set `false` outside demos. |
| `DEMO_PASSWORD` | `knightlend-demo` | Password given to seeded accounts |
| `SEED_ON_EMPTY` | `true` | Seed on startup when the database is empty (needed for mongomock) |
| `SCHEDULER_ENABLED` | `true` | Run the job runner every `SCHEDULER_INTERVAL_SECONDS` |
| `SCHEDULER_INTERVAL_SECONDS` | `60` | Job runner interval (real seconds) |
| `MAX_UPLOAD_MB` | `5` | Per-photo upload limit |
| `CORS_ORIGINS` | localhost:5173 | Allowed browser origins |

The client reads `API_URL` (default `http://localhost:8000`) for its Vite dev proxy, which forwards `/api`, `/uploads` and `/seed-images`.

## How it's built

```
client/                 React 18 + Vite + TypeScript, React Router, Tailwind (tokens in tailwind.config.js), react-leaflet
  src/lib/api.ts        the single typed API wrapper (types mirror the Pydantic response models)
  src/pages/            Home, Browse, ListingDetail, Rental, Messages, Dashboard, ListingForm, Profile, Verify, Safety, Moderation
  src/components/       layout, demo bar, badges, money (held vs charged), map, rental panels
server/
  app/main.py           app factory, CORS, static files, scheduler
  app/core/             config (pydantic-settings), db (Motor + mongomock fallback), security (JWT, bcrypt, role deps), clock (virtual time)
  app/models/           Beanie documents: User, Listing, Rental, Hold, Message, Review, Report, ConditionPhotoSet, Notification, SystemClock
  app/schemas/          Pydantic request/response models
  app/routers/          auth, users, verification, listings, rentals, messages, notifications, dashboard, reports, moderation, demo, meta
  app/services/         payments (mock provider), holds (state machine), rentals (rules + allowed actions), pricing, jobs, geo, uploads, privacy
  app/seed/             idempotent seed (`python -m app.seed`) and the SVG image generator
  tests/                pytest + pytest-asyncio + httpx AsyncClient, on mongomock
```

**The server owns every rule.** For each rental, the API returns the list of `actions` the current user may take (approve, accept agreement, place hold, confirm photos, file claim…), and the client only renders those. Hold transitions, approvals, agreement acceptance, restrictions and all pricing math happen on the server.

**Protection hold state machine** (`app/services/holds.py`). The states are pending, active, released, captured and failed.
- Placing the hold authorizes it: pending moves to active, or to failed if the card declines.
- Refreshing keeps an active hold active, or moves it to failed if the refresh is declined.
- Release ends an active hold. It also voids a pending or failed hold, where nothing was held.
- Capture ends an active hold.

Released and captured are final. Any other move returns **409**.

**Mock payments** (`app/services/payments.py`) expose `authorize_hold`, `refresh_hold`, `release_hold`, `capture_hold` and `charge_rental`, shaped like Stripe manual-capture PaymentIntents. Only these test numbers are accepted:

| Number | Result |
| --- | --- |
| 4242 4242 4242 4242 | Visa credit, succeeds |
| 5555 5555 5555 4444 | Mastercard credit, succeeds |
| 4000 0566 5566 5556 | Visa debit, succeeds and shows the debit notice |
| 4000 0000 0000 0002 | Declined |
| 4000 0000 0000 0069 | Expired card |
| 4000 0000 0000 0341 | First hold succeeds, the 7-day refresh fails |

**Virtual clock and jobs.** All time logic reads `clock.now()`, which adds the `SystemClock` offset to real time. `services/jobs.run_jobs()` runs every minute (APScheduler) and on demand from the Demo bar. It handles:
- pre-refresh reminders
- 7-day hold refreshes, and failed refreshes
- late-return detection
- expiring requests that were never confirmed

**Search.** Search runs in Python (word-prefix matching ranked by title hits, then haversine distance), so it behaves the same on mongomock. MongoDB-only features such as `$geoNear` and `$text` aren't used.

## Tests

```bash
make test
```

18 tests, seeded fresh for each test on mongomock:

- the full API path: login, search, request, approve, agreement, place hold, meetup, pickup photos, pickup, return photos and checklist, clean return releasing the hold, reviews in both directions with ratings recomputed
- illegal hold transitions, both in the state machine and over the API (409)
- a declined card, a non-test card, then recovery
- a failed refresh after advancing time, then a card update
- successful refreshes and late detection
- a dispute resolved by a moderator with a partial capture, and claim limits
- cancellation refunds
- pricing math
- restricted users being blocked, verification before listing, hold-tier validation
- upload validation by type, magic bytes and size
- demo endpoints disabled without `DEMO_MODE`
- no emails in public payloads

## Assumptions

- **Stack.**
  - I pinned **Beanie 1.30**, because Beanie 2.x replaced Motor with PyMongo's async client and the mongomock-motor fallback needs Motor.
  - The client is written in **TypeScript**, to make the "single typed API wrapper" literal.
  - The root runner is a **Makefile**.
- **Demo password and accounts.** Seeded accounts use reserved `.test` email addresses. Login accepts them; sign-up validates real email formats.
- **Moderator.** The moderator is an 11th staff account on top of the 10 seeded members (7 students, 3 alumni).
- **Fees.** There's one visible $1.00 service fee per rental and no other fees. Lenders keep the rental and bundle fees. The cheapest mix of day, week, month and semester rates (a semester is 16 weeks) is chosen automatically.
- **Protection hold tiers.** Items under $50 hold $5 to $15, $50 to $150 hold $25 to $50, and $150 and up hold $75 to $150. The suggestion scales within the tier and rounds to $5.
- **Near purchase price.** The warning shows when the rental total reaches 60% of the estimated value.
- **Cancellation.** More than 24 hours before pickup refunds the full rental charge; within 24 hours refunds half. A lender cancellation always refunds in full. The hold is always released on cancel.
- **Holds.** Holds last 7 days. Reminders go out within 24 hours of expiry, and refreshes run at expiry. Card details are never stored beyond brand, last four digits, funding type and expiry.
- **Agreement.** A lender who turns approval off accepts the standard agreement up front, so instant-book requests are approved automatically. Lenders who keep approval accept the agreement when they approve.
- **Pickup.** Pickup needs at least one pickup photo set confirmed by the other side, and opens the day before the start date. A clean-return confirmation also confirms the borrower's return photos.
- **Claims.**
  - Claims are filed after a return, or while a rental is late, and are capped at the hold.
  - Damage claims need lender photos.
  - A borrower can accept (captured right away) or dispute, which goes to a moderator.
  - Claims can't be filed against a lapsed (failed) hold.
- **Verification.** Students verify with a UCF email domain (`ucf.edu` or `knights.ucf.edu`) and a simulated 6-digit code that is shown on screen instead of emailed. The UCF address isn't stored. Alumni verify with a graduation year plus a photo upload that is approved instantly. Only verified members can list, but anyone signed in can request, and lenders see each borrower's verification status.
- **Flags and restrictions.** A member is auto-flagged after 2 reviews of 2 stars or less, or 2 open reports. Moderators decide whether to restrict. A restriction hides the member's listings and blocks listing, requesting and placing holds.
- **Privacy.** Phone numbers, emails and social handles typed into notes, messages, meetup notes, claims and reviews are replaced with "[contact info hidden]".
- **Places.** Campus pickup spots use real public building names with approximate coordinates near UCF (28.6024, -81.2001). Apartment areas use generic descriptive names, not real complexes. Map tiles come from OpenStreetMap; markers still show if tiles can't load.
- **Branding.** No UCF logos, wordmarks or Pegasus artwork. The KnightLend mark is an original shield with a keyhole. The footer says KnightLend isn't affiliated with UCF.
- **Earlier work.** The earlier single-file design prototype is kept, unchanged, in `reference/` as visual reference. It contains no research content.

## Known gaps

- The job runner runs inside the API process. Running several API workers would run jobs several times; a real deployment would move it to a single worker or a queue.
- Listing search loads active listings into Python to filter and sort. That's fine for a campus-sized catalog; a large one would want MongoDB indexes and pre-filtering.
- Uploaded photos are stored on local disk under `server/uploads` and aren't resized or virus-scanned.
- Notifications are in-app only (no email or push), and the bell polls every 15 seconds.
- The moderator resolves disputes alone. There's no appeal step and no evidence upload by the borrower beyond their own condition photos.
