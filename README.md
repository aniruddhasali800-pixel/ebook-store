# UPI QR ordering system

Order collection with **direct UPI payments** — the customer pays the merchant's own UPI ID
through Google Pay / PhonePe / Paytm. No payment gateway, no API keys, no mid-way hold of funds.
Debit/credit cards are optional and off by default (`CARD_TEST_MODE`); when enabled the customer
gets a picker and money still can't become `PAID` without a provider webhook or a staff check.

Two promises are tracked rather than asserted. A **refund** is a request the buyer files within a
day of their payment landing and the shop answers within two working days — and this site only says
the money went back after a person types the transfer reference that proves it left. A **complaint**
reaches the shop's inbox and gets its own public status page. Both promises are published
(`/refund-policy`, `/complaints-policy`) using the same numbers the code enforces.

Two storefronts share one payment core:

| | Customer URL | Staff URL on | Settled order becomes |
| --- | --- | --- | --- |
| Ebook shop | `/`, `/books/<slug>` | `/dashboard` (sign-in) | `COMPLETED` + a download link |
| Cafe | `/cafe` | `/admin`, `/admin/kitchen` (sign-in) | `IN_KITCHEN` on the kitchen board |

Both staff areas show the same live strip: how many customers are on the site right now, and an
arrival, payment, refund or complaint the moment it happens.

Built with Next.js 16 (App Router, Server Actions), Prisma 7 + Postgres, Vercel Blob for book files,
Tailwind 4.

---

## Run it

You need a Postgres database before anything else. The app has no other option to fall back on:
a database on a serverless deployment's disk would be wiped between requests, so a file path would
have meant an empty shop that appeared to work.

```bash
npm install
npm run setup:env      # asks for DATABASE_URL + BLOB_READ_WRITE_TOKEN, writes a random APP_SECRET
npm run db:push        # creates the tables in that database
npm run db:seed        # menu, demo UPI payee, 3 ebooks + their PDFs (staff only if SEED_* is set)
npm run dev            # http://localhost:3000
```

`setup:env` prompts for the two secrets without echoing them, and appends a key to `.env` only if
that key is missing — it never rewrites a file you have already filled in.

* `DATABASE_URL` — any Postgres connection string. On Vercel, Storage → Postgres gives one; for
  local work, a Docker or a hosted dev database both work. Note `sslmode` behaviour in
  `src/lib/db-client.ts`: anything that is not a localhost host is contacted over TLS.
* `BLOB_READ_WRITE_TOKEN` — Vercel Blob. Book PDFs and cover images are stored there, because
  a deployed function's filesystem is read-only and exists only for the length of the request.
* `APP_SECRET` — 32 random bytes, hex. Encrypts the payee UPI ID and signs staff sessions.

A database that has tables but no rows still serves every page; only the storefront lists come up
empty. **Old data does not come along.** The orders, staff accounts and encrypted payee UPI ID in an
old SQLite file stay in that file: after `db:push` you re-enter the payee in Payment Settings and
make staff with `npm run staff:add`. Nothing from the old shop is deleted either, so keep `dev.db`
around until you have read what you needed out of it.

`npm run dev` also serves `/api/...` dev resources; if you open the site as `127.0.0.1` instead of
`localhost`, Next blocks them and client components never hydrate. `allowedDevOrigins` in
`next.config.ts` lists `127.0.0.1` so both hostnames work.

| Role | Who makes it | What they can do |
| --- | --- | --- |
| Admin | `npm run staff:add` (or the two `SEED_ADMIN_*` env vars at seed time) | everything below, plus Payment Settings and publishing a submitted title |
| Cashier | same, with role `CASHIER` | verify payments, decide refunds, answer complaints |

**There is no default password any more.** The seed used to ship `admin@upi.local / Admin#12345`;
those accounts exist only in an old database, and a freshly pushed one has no staff at all — so the
first thing on any machine someone else can reach is to make an account you own:

```bash
npm run staff:list                          # what exists right now
npm run staff:rotate -- admin@upi.local     # set your own email + password, keeps its history
npm run staff:add                           # a cashier, or a second admin
```

The password is typed twice at a prompt that does not echo, so it never enters shell history, a
log, or a screenshot — nobody operating this repo on your behalf can see it. Minimum twelve
characters; the last remaining admin cannot be demoted, so you cannot lock yourself out of
Payment Settings. A sign-in then lasts five minutes of idleness (renewed by each staff action).

`REFUND_HOLIDAYS` takes a comma-separated list of `YYYY-MM-DD` dates your shop is shut, and those
days drop out of the two-working-day clock.

Cards are opt-in: add `CARD_TEST_MODE=1` to `.env` to offer a simulated hosted checkout (see
*Card payments* below). Without it the app is UPI-only, exactly as before.

Production on your own box: `npm run build && npm start`. Set `APP_SECRET` to a stable value —
losing it makes the stored UPI ID, the card webhook key and all sessions unreadable.

### Deploying to Vercel

Three things about a serverless runtime shaped this code, and they are worth knowing before you
change any of it:

* The disk is read-only and does not survive the request, so book files are Vercel Blob objects and
  the schema is Postgres, not a file.
* There is no one process to be the truth. Presence, the event queue and the chime live in the
  database, which is why two dashboards on different machines now agree.
* A function is not allowed to hold a connection open for a whole shift, so the live strip polls
  every few seconds instead of keeping a socket.

The build script is `prisma generate && next build`. `prisma generate` reads only
`prisma/schema.prisma`, and `prisma.config.ts` leaves the datasource out until a `DATABASE_URL`
actually exists — so a builder with no secrets yet still compiles, instead of failing the way it did
when `env('DATABASE_URL')` was resolved at config load.

1. Storage → Postgres, and Storage → Blob, both on the project. Vercel injects
   `POSTGRES_URL` / `BLOB_READ_WRITE_TOKEN` for you; this app reads `DATABASE_URL`, so add an
   environment variable of that name with the same value (the connection string, with
   `-pooler` in the host if the free tier gives you one).
2. `APP_SECRET` — the same hex value as the `.env` you seeded with, or a new one plus a re-entered
   payee UPI ID.
3. Build, then run the schema once against the real database from your terminal:

   ```bash
   npm run db:push
   npm run db:seed          # menu + demo payee + three sample titles
   npm run staff:add        # the account you will actually sign in with
   ```

4. Re-enter the payee VPA in Payment Settings. It is stored encrypted with `APP_SECRET`, so the
   copy in an old local database will not decrypt into a new one.

Nothing here runs `db push` during a deploy on purpose: a build that quietly alters the shop's
schema is not something to discover after the fact.

---

## The payment rule this app is built around

A QR code, an opened UPI app, a clicked button, or the browser returning to the site are all
**claims** of payment. None of them is proof, because direct UPI transfers give this site nothing
to verify against. So:

> **No customer action can ever produce `PAID`.** Only staff verification, or a webhook from a
> provider that can prove the money, can settle an order.

Enforced in one place — the transition table in `src/lib/payments/status.ts`:

| From | → PENDING | → VERIFICATION_PENDING | → PAID | → FAILED | → CANCELLED |
| --- | --- | --- | --- | --- | --- |
| `PENDING` | — | customer, staff | staff, provider | staff, provider | customer, staff |
| `PAYMENT_VERIFICATION_PENDING` | — | — | staff, provider | staff, provider | staff |
| `PAID` / `FAILED` / `CANCELLED` | terminal in every direction ||||

`PAID` additionally requires a **bank reference (UTR)** — the UI and the action both refuse without
one — and the row is written with compare-and-swap on the previous status, so two staff members
verifying the same order at once cannot both win.

### Statuses

Payment: `PENDING` → `PAYMENT_VERIFICATION_PENDING` → `PAID` | `FAILED` | `CANCELLED`

Order lifecycle (separate axis, and it depends on `Order.channel`):

* **CAFE** — `AWAITING_PAYMENT` → `IN_KITCHEN` → `READY` → `COMPLETED`, plus `CANCELLED`. The
  kitchen board queries lifecycle status, so unpaid, failed and cancelled orders can't appear there.
* **BOOKS** — `AWAITING_PAYMENT` → `COMPLETED`. There is nothing to cook, so settlement goes
  straight to the finished state and unlocks the file instead.

`src/lib/payments/status.ts:orderStatusForPaymentStatus` is the one place that reads the channel,
and the ebook verification action refuses any order whose channel isn't `BOOKS` — so the book
dashboard can settle a book sale and nothing else.

---

## Flow — cafe

1. **Customer** picks items (`/cafe`) → `createOrderAction` → order row + frozen payee + total.
   Prices are read from the menu table, never from the request, so a tampered cart can't lower
   the amount. Money is integer **paise** end to end. When more than one provider is offered the
   cart shows a UPI / card picker and the choice is stamped on the order.
2. **`/pay/<token>`** (unguessable 22-char token; the numeric order code is never a credential)
   renders the QR plus an `upi://pay?...` deep link. The QR PNG is generated server-side and
   passed as a data URL.
3. Customer scans / taps **Open UPI App**, then **I've Completed Payment** → status becomes
   `PAYMENT_VERIFICATION_PENDING`, with the copy *"Payment submitted. Payment verification pending."*
   The page polls `/api/pay/<token>/status` every 5s, so confirmation appears without a refresh.
4. **Staff** (`/admin`) sees the claim with amount, items, customer and payee VPA, checks their
   own UPI/bank statement, enters the UTR and clicks **Mark Paid** / **Mark Failed** / **Cancel**.
5. Marking paid pushes the order to **`/admin/kitchen`**, and — for any menu item the shop tracks —
   pulls those units off the shelf in **`/admin/inventory`** at the same moment. A claim never does
   that, and neither does an order whose five-minute window passed unverified: the count moves only
   when a person decided the money is on the statement.

## Flow — ebook shop

Same five moves, with the kitchen replaced by a file:

1. `/` lists the published titles; **Buy with UPI** on a card (or `/books/<slug>`) calls
   `createBookOrder` — one title per order, price read from the `Book` row, `channel: 'BOOKS'`.
2. `/pay/<token>` shows the QR for that exact amount. Nothing is downloadable yet.
3. **I've Completed Payment** → `PAYMENT_VERIFICATION_PENDING`. The download panel on the page
   renders only when the poll reports `PAID`.
4. `/dashboard` lists the claim with the payee VPA that was on the QR, so the shop can spot a
   swapped-payee scam before approving. Marking paid still requires a UTR, still writes a
   `PaymentEvent`, and still cannot be done by the buyer.
5. `/api/dl/<token>/<bookId>` then streams the PDF. It 404s for a cafe order or an unknown title
   and 403s for anything not `PAID`, so the link is safe to leave visible on the receipt page.

Book PDFs and covers are objects in Vercel Blob under `storage/books/` and `storage/covers/`, and the
catalogue stores the full `https://….blob.vercel-storage.com/storage/…` address. `src/lib/storage-path.ts`
is the one judge of what such an address may say — right host, right folder, one file name, nothing
after it — and both the writer and every reader go through it, so an address a customer typed into a
field is treated exactly like one the shop stored itself. The download still streams through
`/api/dl/<token>/<bookId>` rather than a public blob link, because a leaked blob URL would hand the
file to anyone the way a copied disk file would have; covers have nothing to hide behind, so they are
plain absolute URLs. `/dashboard/books` and the review queue name the titles whose address fails the
test, so a broken one is found before a customer pays for it.

### UPI URI

```
upi://pay?pa=<vpa>&pn=<payee name>&am=<rupees>&cu=INR&tn=Order%20%23<code>&tr=<code>
```

`tr` is the order code, so a bank statement line can be matched to an order by searching the
admin board. Built only by `src/lib/payments/upi.ts` (validated VPA, exact 2-decimal amount,
length caps, percent-encoding) so the QR and the deep link can never disagree.

---

## Money-back promises: refunds, complaints, and what a screen may claim

A refund is the hardest promise here, because a direct UPI transfer cannot be reversed by this
app. So the site tracks the promise instead of inventing it:

* The buyer asks from `/pay/<token>` within **24 hours of the payment being confirmed** — measured
  from `paidAt`, not from the order being placed, so a claim made at 11pm and verified next morning
  doesn't cost the buyer ten hours of their window.
* Staff get **two working days** to answer. Weekends never count, and `REFUND_HOLIDAYS` (comma
  separated `YYYY-MM-DD`) removes the days your shop is shut. Counting starts on the next working
  day, so a request filed Friday evening is due Tuesday, not Sunday.
* `REQUESTED → APPROVED → REFUNDED`, or refusal at either decision point. **Only staff move a
  refund**, and `REFUNDED` is refused without a payout reference — a UTR or bank number the buyer
  can look up — in the action, in the queue UI and in the transition table in
  `src/lib/case-rules.ts`. The order keeps its `PAID` payment status throughout, because that is
  the truth about what arrived; the refund lives on a separate axis.

Complaints have their own inbox and their own unguessable `/complaint/<code>` page, so a buyer who
complained from a book page — with no order to return to — still has somewhere to read the answer.
`/refund-policy` and `/complaints-policy` publish these promises with the numbers **imported** from
the modules that enforce them, so a rule change moves the page and the code in one edit.

New titles are uploaded with a cover image and the PDF itself, and land in a review queue that
keeps them off the storefront until an admin publishes; publishing is refused for a title with no
file, and `reviewBookAction` requires `requireAdmin()` — a cashier reads the queue and cannot
put a book on sale. A cover is shown straight from its stored address, so there is no covers route
left to guard.

Presence is deliberately forgetful, and now says so honestly. A browser invents a random id for the
tab, keeps it in `sessionStorage`, and beacons it with the page path to `/api/visit`; that is one row
in `VisitorSlot`, which is deleted once it has not been seen for ninety seconds. No IP, no user
agent, no cookie, and nothing that survives a closed tab or joins two visits together — but it is a
table now, because a hosted app has no single process to hold the count in. The staff strip asks
`/api/activity/poll?since=<id>` every few seconds and only counts what happened after it last looked,
so the queue in `ActivityEntry` can be read by every dashboard at once. Those rows are trimmed to the
newest 500, or to three days, whichever comes first: they repeat headlines a staff member already sees
on the order, refund and complaint screens, and they are a nudge rather than a second set of paperwork.

---

## Card payments

Two things about cards are impossible, and the design follows them:

* **There is no card → UPI-ID rail.** A card clears through an acquirer and gateway into a *bank
  account*. Pointing it at your `@oksbi` VPA doesn't make the transfer a UPI payment — the money
  arrives as NEFT/IMPS settlement, and the UPI app will never show it. Cards and UPI are two
  different rails that happen to end in the same account.
* **This app never sees a card number.** A PAN/expiry/CVV entered into our own form would put us
  in full PCI-DSS scope (and an ordinary Postgres row is not a card vault). So card payment is a
  **hosted checkout**: the gateway renders the card form on its own page, and it reports the
  result back to us over a signed webhook.

### What ships here

`CARD_TEST_MODE=1` in `.env` enables a **simulated** gateway so the whole path is exercisable
without a merchant account or a card. It is labelled everywhere it appears — the checkout page,
the receipt banner, the staff queue — because a test order that looks like money is exactly the
bug this app exists to prevent. With the flag unset: no picker on `/cafe` or the book pages,
`/card/<token>` says checkout isn't enabled, and `/api/card/test-checkout` answers 404.

```bash
CARD_TEST_MODE=1        # offers "Debit / credit card" at the till
CARD_WEBHOOK_SECRET=…   # ≥16 chars; if unset the key derives from APP_SECRET
```

| Step | What happens |
| --- | --- |
| Pick "Debit / credit card" | `resolvePaymentProviderId` stamps `paymentMethod = CARD_HOSTED` on the order. Requesting a provider that isn't offered silently falls back to UPI, so a tampered form can't invent one. |
| `/pay/<token>` | No QR. A button for the gateway page plus the same "I've Completed Payment" claim. |
| `/card/<token>` | Stand-in for the gateway's hosted form: Approve / Decline. No field that could take a PAN. |
| `/api/card/test-checkout` | Builds a real webhook payload, **signs it the same way a provider would**, and posts it into the same handler — the test path differs only in skipping HTTP. |
| `POST /api/webhook/CARD_HOSTED` | The only thing that can mark a card order `PAID`. |

### Webhook contract

```
POST /api/webhook/CARD_HOSTED
x-provider-signature: sha256=<hmac-sha256 of the raw request body>

{ "provider": "CARD_HOSTED", "eventId": "…", "orderCode": "59933",
  "status": "PAID" | "FAILED", "amountInPaise": 39900, "reference": "TXN…" }
```

Verification is over the **raw bytes** (`await request.text()`), never a re-serialised object —
one whitespace change would otherwise alter the digest. `src/lib/payments/webhook.ts` then refuses,
in order:

| Answer | When |
| --- | --- |
| `401` | Missing, malformed, truncated or wrong signature; non-JSON; unknown order code format; no `eventId`. |
| `404` | Unknown provider, or one with no `parseWebhook` (asking UPI to confirm is a contradiction). |
| `409` | That order wasn't created with this provider — or it is already settled. |
| `422` | Amount in the notification ≠ frozen amount; or `PAID` with no reference. |
| `200 alreadyRecorded` | Replay of an outcome we already hold. |
| `200 applied` | The state machine accepted the transition. |

`transitionPayment` re-checks the state machine, and the row is still written with compare-and-swap
— so a forged-but-valid-looking notification can't resurrect a cancelled order and two deliveries
of the same event can't settle it twice. `QUERYSTATUS` polling is deliberately *not* a settle
channel for cards: `queryStatus()` returns `settled: false` with the message "Card payments are
reported by the gateway webhook, not by polling."

### Swapping in a real gateway

The order flow only knows the `PaymentProviderAdapter` interface; nothing else changes:

1. Write `src/lib/payments/<provider>.ts` implementing it with **`canSettle = true`**, a real
   `createIntent()` (return `checkoutUrl`) and `parseWebhook()` matching that provider's actual
   signature scheme.
2. `registerPaymentProvider(adapter)` in `registry.ts`, and gate `available()` on the presence of
   *real* keys instead of `CARD_TEST_MODE`.
3. Point the dashboard's webhook setting at `POST /api/webhook/<PROVIDER_ID>` and set the shared
   secret.

Stored orders keep the `paymentMethod` they were created with, so orders placed under the
simulator and under a real gateway coexist. Delete `card/[token]` and
`api/card/test-checkout` once a real host page exists.

### Signing up (individual seller, no GST)

Card money lands in a bank account, so a gateway account is a separate signup from your UPI ID.
For an Indian individual / sole proprietor, expect to hand over:

* **PAN** of the individual.
* **Bank proof** — a cancelled cheque or a statement page showing name + account number (this is
  where card money settles).
* **Address & identity proof** — Aadhaar / passport / voter ID, plus a utility bill or rent
  agreement for the address.
* **Signature** — a stamped authorisation letter or the gateway's e-sign.
* **Website or app** that visibly shows pricing, a refund policy and contact details; reviewers
  open it.
* **GST only if you're registered.** Many gateways allow sellers under the GST threshold for
  digital goods with a declaration; a business name that reads like a registered company while
  having no GSTIN is what gets an application rejected.
* Cat-banned goods are a real constraint: some gateways won't onboard certain categories
  regardless of paperwork.

Settlement is T+2 to T+7 for a new merchant account, with a rolling risk hold on the first
payouts. Budget a week for onboarding, not an afternoon.

---

## Layout

```
prisma/schema.prisma        Order (channel CAFE|BOOKS), OrderItem (optional bookId), Book,
                            Customer, MenuItem, User, PaymentSetting (encrypted VPA), PaymentEvent,
                            RefundRequest, Complaint (public viewToken), CaseEvent,
                            ActivityEntry (the staff feed, which is a queue rather than an archive),
                            VisitorSlot (a tab that was on a page in the last ninety seconds)
src/lib/payments/
  status.ts                 payment + order state machines (channel-aware), customer copy
  upi.ts                    upi://pay URI builder and parser
  types.ts                  PaymentProviderAdapter interface (canSettle, available, parseWebhook)
  upi-direct.ts             UPI adapter (canSettle = false)
  card-hosted.ts            simulated hosted-card adapter, webhook payload + signing helpers
  webhook.ts                handleProviderWebhook(): verify → match → transition
  registry.ts               provider lookup by id, which providers are offered at the till
  service.ts                transitionPayment(), intent rebuild, queues, kitchen ladder
src/lib/case-rules.ts       refund + complaint state machines, working-day clock, buyer copy
src/lib/case-status.ts      status vocabularies and labels, shared by client and server
src/lib/{refunds,case-log}.ts  the two DB write paths (compare-and-swap + audit row)
src/lib/cases.ts            every queue and panel the staff screens read
src/lib/inventory/ledger.ts stock arithmetic with no database in it (clamps at zero, records shortfalls)
src/lib/inventory/stock.ts  the shelf: consume on PAID, counts, adjustments, par levels, books ledger
src/lib/activity.ts         presence rows (90s) + the event queue, both in Postgres
src/lib/books.ts            catalogue reads, book orders, stored-file reads through the guard
src/lib/storage-path.ts     the one validator of a stored address — no server, so it is testable
src/lib/storage.ts          write/read a blob object (Vercel Blob, `BLOB_READ_WRITE_TOKEN`)
src/lib/uploads.ts          cover + PDF intake: size caps, safe file names, then storage.ts
src/lib/db-client.ts        the Postgres pool + Prisma client, shared by the app and the scripts
src/lib/db.ts               the lazy `prisma` the app imports
src/lib/{money,crypto,settings,orders}.ts
src/lib/pay/window.ts       the shop's 5-minute payment request window (countdown maths, nothing else)
src/lib/auth/session.ts     signed cookie (5 idle minutes) + requireStaff/requireAdmin/extendSession
src/lib/auth/guard.ts       staffOrSignIn(): the page-side check that redirects instead of throwing
src/lib/actions/            customer.ts, staff.ts, auth.ts, books.ts, dashboard.ts,
                            refunds.ts, complaints.ts, inventory.ts
src/components/             HeroSequence, BookCover, BuyButton, BookEditor, BookReviewQueue,
                            RefundQueue, ComplaintInbox, RefundRequest, ComplaintBox,
                            LiveActivity, VisitorBeacon, PaymentReceipt, PaymentMethodPicker,
                            UpiQrCode, PaymentStatus, PaymentVerification, PaymentSettings,
                            InventoryBoard, CardTestCheckout, Cart, AppChrome, LoginForm
src/app/
  (bookstore)/              / (scroll hero + library) · /books/[slug]
  (cafe)/cafe               menu + cart
  pay/[token]               one receipt page for both channels and both methods
  card/[token]              stand-in for the gateway's hosted card form (test mode only)
  complaint/[ticket]        the buyer's side of a complaint, no sign-in, unguessable code
  refund-policy, complaints-policy   the promises, with the numbers imported from the rules
  dashboard{,/refunds,/complaints,/review,/books}
                            ebook staff: verify payments, decide refunds, answer complaints,
                            review submitted titles, edit the catalogue (sign-in required)
  admin{,/kitchen,/settings,/refunds,/complaints,/inventory}
                            cafe staff, same queues scoped to channel = 'CAFE' (sign-in);
                            /inventory is admin-only
  api/pay/[token]/status    polling · api/dl/[token]/[bookId]  ebook download
                            api/visit + api/activity/poll  presence and the live feed
                            api/webhook/[provider] · api/card/test-checkout
tests/                      90 tests, incl. decoding the QR image back to text
scripts/staff.ts            staff:add / staff:rotate / staff:list — passwords typed at a silent prompt
scripts/hidden-prompt.ts    the prompt every terminal script shares, and `closePrompt()`
scripts/setup-env.ts        appends the keys .env is missing; never rewrites one it did not write
```

**Security notes**

* Payee VPA is AES-256-GCM encrypted at rest; the settings UI only ever shows `dem••••@okhdfcbank`,
  and saving requires re-typing it — a payee change is never a side effect.
* Nothing in the repository knows a staff password: the seed only creates accounts from
  `SEED_*_EMAIL` / `SEED_*_PASSWORD`, refuses one under 12 characters, and never prints one. The
  normal route is `npm run staff:rotate`, which asks twice at a prompt that does not echo, refuses
  to demote the last admin, and cannot be completed by a non-terminal stdin — so a password set
  here stays with whoever is sitting at the keyboard.
* Sessions are HMAC-signed, `httpOnly`, `SameSite=Lax`, and re-checked against the user row on
  every staff action, so a deleted or demoted account loses access immediately.
* A staff sign-in lasts **five minutes of idleness**: `SESSION_TTL_SECONDS` in
  `src/lib/auth/session.ts`, renewed by `extendSession()` inside every staff Server Function, so
  somebody working is never bounced mid-task and an unattended counter screen stops working on
  its own. Renewal cannot happen during a page render — Next 16 only allows `cookies().set()` in
  a Server Function or Route Handler — which is why a dashboard left open *does* lapse and asks
  to be signed in again.
* Every status change appends a `PaymentEvent`, and every refund or complaint decision appends a
  `CaseEvent` (actor, from, to, note) in the same transaction as the write.
* The status API returns only two status strings — no VPA, UTR or customer data.
* Provider notifications are honoured only over a verified signature on the raw body, only for the
  provider the order was created with, and only for the exact frozen amount. `queryStatus()`
  cannot settle a card order.
* `/dashboard` used to be open, and it can no longer be: the same screen now holds refund requests
  with buyer UPI IDs and complaint threads with names and contact details. Both it and `/admin`
  check the session cookie in the layout *and* re-resolve it against the user row in every page and
  action, so a stale cached segment still can't reach another channel's money.
* Refund and complaint queues are channel-scoped: the book dashboard only ever lists `BOOKS` rows
  and the cafe staff area only `CAFE` ones, and each decision action re-checks the row's channel
  before writing, so one dashboard cannot decide the other's money.
* `/complaint/<code>` is public by design — the code is 18 hex characters from `randomBytes`, and
  it exposes one thread and its answer, never a list. Complaints are otherwise only ever read
  scoped to the order token they were filed from.

---

## The landing hero

`src/components/HeroSequence.tsx` pins four frames into one sticky stage. Scroll writes a single
number, `--p` (0→1), on the stage element, and CSS derives every layer's transform and opacity
from it — so a scroll frame costs no React render. The frames rise quadratically, which is what
makes the last third feel fast. Under `prefers-reduced-motion` the pin and the travel are dropped:
one frame, all three copy blocks, no animation.

---

## Tests

```bash
npm test        # 90 unit tests: status machine, UPI URI, money, crypto, QR image decode, card
                # webhook, case rules, payment window, stock ledger, stored file addresses
npm run lint
```

`tests/case-rules.test.ts` exercises the refund and complaint rules in plain Node, against
`src/lib/case-rules.ts` — the module holds the rules with no database in it, and `refunds.ts` /
`case-log.ts` hold only the writes. What it pins down is the two things a friendly UI could get
wrong: that no customer actor can produce `REFUNDED` (not by name, and not with a crafted actor
value), and that a deadline counts in the shop's working days in `Asia/Kolkata` rather than in raw
48-hour blocks — a request filed Friday evening is due at the end of Tuesday, and a day listed in
`REFUND_HOLIDAYS` pushes it out again.

`tests/qr-code.test.ts` renders a real payment QR, then decodes the PNG with `jsqr` and asserts
the scanned text equals the intended `upi://pay` URI — it checks what a phone would read, not
what we meant to draw.

`tests/card-webhook.test.ts` signs payloads with the real key and checks both directions: a
tampered amount, a foreign key, a truncated or wrong-algorithm header, a bad order code and
non-JSON all fail verification, while the adapter's `available()` and the checkout URL flip with
`CARD_TEST_MODE`.

`tests/pay-window.test.ts` times the shop's five-minute request window: the last millisecond before
the deadline is still open, the deadline itself is not, an hour-late order is *just* passed with a
countdown of zero rather than a negative one, and the object carries no status field at all —
because a passed window is a piece of copy, not a cancellation.

`tests/inventory.test.ts` holds the shelf to the same standard of arithmetic: a sale can never take a
count below zero (it records what it could not give instead), a physical count stores the *difference*
rather than the new total so the ledger still explains itself, `-0` is never written as a movement, and
an item with no par level reads "not set" rather than "low" on every row. The module is pure Node with
no database in it, which is why those rules can be asserted at all.

`tests/storage.test.ts` holds the door that decides which file address the app will fetch. It accepts
the shape Vercel Blob hands back, and refuses the disk-era values an old row or a typed-in field could
still carry — `storage/books/play.pdf`, `./`, `/` — plus plain text, `http`, a host that only ends up
looking like the storage host, a port, credentials, a query string, and a nested path. The dots are
settled by the URL parser before the folder is judged, so `..` can only land inside `storage/`, never
climb out of it, and the test says so rather than leaving that to a comment. The same module is what
the writer uses to name an object, so a name it would refuse to read is a name it cannot produce.

The checks below were each run by hand in a browser against a production build — add them as a
regression suite when the app grows enough to deserve one:

**Cafe**

1. Place an order from the menu → order row and `/pay/<token>` link are created.
2. The QR amount equals the menu prices summed in paise (`am=119.00`, never `11,900`).
3. The QR image decodes to the exact `upi://pay` URI the page also offers as a link.
4. Scanning it with a UPI app opens a pre-filled request for the right payee and amount.
5. "Pay with UPI App" opens the same request on a phone.
6. "I've Completed Payment" moves the order to `PAYMENT_VERIFICATION_PENDING` and the page says
   the payment will be verified — it never says successful.
7. The order appears in the staff verification queue with its amount and frozen payee.
8. "Mark paid" without a UTR is refused; with one it sets `PAID`.
9. The order appears on the kitchen board immediately afterwards.
10. `FAILED` and `CANCELLED` orders stay out of the kitchen board and out of `PAID` counts.

**Ebook shop**

11. Buy with UPI → `/pay/<token>` with `am=399.00` and `tn=Order%20%2317446` (the `#` is encoded,
    so the note cannot truncate the rest of the URI).
12. Before payment, `/api/dl/...` answers 403; a cafe token answers 404.
13. `/dashboard` shows the claim, and marking it paid moves the order to `COMPLETED`.
14. The receipt page then shows the download, and the link serves a real PDF
    (`content-disposition: attachment`, valid `%PDF` bytes).
15. A cafe order verified at `/dashboard` is refused with "That order is not part of the book
    shop.", and a book order never appears on `/admin/kitchen`.

**Card path** (`CARD_TEST_MODE=1`)

16. With the flag unset, the picker is absent from `/cafe` and the book pages, `/card/<token>`
    says checkout is not enabled, and `/api/card/test-checkout` answers 404 — so the disabled
    state leaves no card affordance anywhere in the UI.
17. With the flag on, the till offers "Debit / credit card"; choosing UPI (or tampering the form to
    send an unknown id) still yields `paymentMethod = UPI_DIRECT` and a QR.
18. The card receipt page shows no QR and no copy-URI row, and is labelled as a simulated gateway.
19. Approve on `/card/<token>` → signed webhook → `PAID` with `actorType = PROVIDER` and the
    gateway reference; the cafe order lands in the kitchen, the book order unlocks its PDF
    (`content-disposition: attachment`, valid `%PDF` bytes).
20. Decline → `FAILED`, and the download stays 403.
21. "I've Completed Payment" on a card order gives `PAYMENT_VERIFICATION_PENDING` +
    `CONFIRMED_BY_CUSTOMER` — never `PAID`.
22. Direct POSTs to `/api/webhook/CARD_HOSTED`: unsigned / wrongly signed / non-JSON → 401;
    unknown provider and `UPI_DIRECT` → 404; valid signature but ₹0.01 off → 422; `FAILED` after
    `PAID` → 409; replaying the approved event → 200 `alreadyRecorded` with no second settlement.

**Refunds, complaints, presence and review** (2026-10-08, against `npm run dev`, with the route
table checked against `npm run build`)

23. An anonymous GET of `/dashboard` answers 307 → `/login?next=%2Fdashboard`, and signing in
    lands back on the page that was asked for.
24. A paid order offers the refund form until 24 hours after `paidAt`; filing it writes `REQUESTED`
    with `reviewDueAt` at the end of the second working day in IST — asked on Wednesday 11:17 pm,
    due Friday 11:59 pm, and the weekend never counts.
25. The receipt page then shows the request, the date the shop owes an answer by, and never a word
    suggesting money moved.
26. The book queue lists it with the buyer's words, the amount and the deadline; the cafe queue
    shows **0 waiting** for the same row.
27. Approve → `APPROVED, PAYOUT PENDING` with the note kept. **Mark paid back** with the UTR box
    empty is refused in the browser before it can send, and the row stays `APPROVED`.
28. With a UTR typed in it becomes `REFUNDED`, a `CaseEvent` plus a `REFUND_REFUNDED` `PaymentEvent`
    are appended, and only then does the buyer's page say *"The shop has paid you back"* — with the
    reference quoted back to them.
29. A complaint from a receipt page reaches that shop's inbox; the answer appears on the receipt
    page and on `/complaint/<code>`. An empty answer is refused before sending.
30. A complaint from a book page — no order behind it — gets the same tracking link, and its status
    page names the book instead of an order. Neither one can see the other's thread.
31. Both staff areas watched one SSE connection: the pill read *Live*, an arrival on `/cafe` appeared
    in the feed without a reload, and the visitor count aged out on the 90-second TTL. That is what
    was *last* checked by hand — the queue is in Postgres now and the strip polls, so the same two
    things need looking at again on the deployed site: a pill that goes Live, and an arrival that
    appears without a reload.
32. A new title with a `.webp` cover and a PDF saves as `published = false` + `submittedAt`; `/`
    omits it and `/books/<slug>` answers 404 until it is published.
33. The review queue reads *File is ready* and renders the uploaded cover from its stored address,
    which is a full `https://….blob.vercel-storage.com/…` URL now that there is no covers route.
    Publish sets `published = true`, clears `submittedAt`, and the storefront shows the title with
    its own cover.
34. A cashier gets the read-only notice on that queue and every Payment Settings field disabled —
    and bypassing the form still returns *"Only an admin…"* from `reviewBookAction` and
    `savePaymentSettingsAction`.
35. With `CARD_TEST_MODE` unset no till offers a card, and the storefront and app footers now read
    *"straight UPI"* instead of promising a card gateway that isn't switched on.

**The five-minute clocks**

36. A `PENDING` receipt counts down from `5:00` in a line that ticks without a reload, and an order
    placed yesterday says *"This payment request has passed its 5 minutes"* instead.
37. Passing the window changes nothing about the order: it is still `PENDING`, *"Cancel this order"*
    and *"I've Completed Payment"* both still work, and claiming still lands on
    `PAYMENT_VERIFICATION_PENDING` — a late transfer is real money, and only the shop's statement
    settles it.
38. A staff page asked for with a five-minute-old token answers `307` to `/login?next=…` — checked
    with a token minted by the app's own `signSession()`, so it is the real expiry rule under test,
    not a guess. `/dashboard/*` carries the exact page it wanted; the cafe tabs can only name
    `/admin`, because a layout cannot see which page it wraps.
39. `npm run staff:rotate -- <email>` on a piped (non-terminal) stdin refuses to run and writes
    nothing: the account list is byte-for-byte the same afterwards.

**Inventory, and stock that only moves on real money**

40. `/admin/inventory` with no session answers `307` to `/login?next=%2Fadmin`, and every write on the
    page re-checks `requireAdmin()` itself, so hiding the tab from a cashier is tidiness rather than
    the defence.
41. Driven through the real `createOrder()` and `transitionPayment()` against the real database: an
    order sitting at `PENDING` moved the shelf not at all, a buyer tapping *"I've Completed Payment"*
    moved it not at all, and only the staff decision `PAID` took 40 → 37. That is the same rule the
    money follows, so stock and payments cannot tell two different stories.
42. A settled order for 50 plates against 2 on the shelf clamped at zero and wrote a movement carrying
    `shortByUnits = 48` with the order code in the note — the payment was never refused, because the
    money arriving is the fact and the count is bookkeeping. Undoing the test was itself recorded as a
    `COUNT` row; no number on this page is ever changed without leaving a line behind.

**The move to Postgres and Blob, and what it owes a re-run**

Everything above was checked against a local SQLite database and files on this disk. Two of those
checks cannot be repeated until a hosted database and a blob store exist, because the thing being
tested no longer has a local home:

43. A cover upload and a PDF upload write to Vercel Blob and come back as a URL the review queue
    renders — which needs a real `BLOB_READ_WRITE_TOKEN`, since a local run with no token refuses
    the upload and says so.
44. The download route streams the object rather than the disk: 403 before `PAID`, a real `%PDF`
    after it, and a `content-disposition` the browser saves under the title's name.
45. The live strip across two different machines. One process could always see its own events; the
    point of the queue being in the database is that a claim published by request A rings on a
    dashboard held by request B.

None of these were run in this change, and the app does not start locally until a Postgres URL is in
`.env` — that is the honest state of it, and it is the first thing to do after provisioning.

Still needing the one human click, because a password is not something this agent may type: the count
and reorder-level forms in a browser, the tab actually missing for a cashier sign-in, and the chime
sounding on a live claim.
