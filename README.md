# River Club

A private, play-money Texas Hold’em website for 2–10 friends, ready for Vercel. Create a room, share its six-character code or link, and play from separate phones or computers. No player accounts required.

## Included

- Server-authoritative no-limit Hold’em: blinds, betting streets, legal raises, all-ins, side pots, ties, and uncalled-bet refunds.
- Four decks and synchronized room themes: Classic, Dark Mode, Astral, and Black & Gold Metalluxe.
- Animated deals, card reveals, turn indicators, and winner announcements; reduced-motion support.
- Configurable seats, free-form starting stacks and blinds, and optional 30/60/90-second turns or no timer.
- Private room links and invite codes, same-browser reconnects, and automatic host transfer after 90 seconds away.
- Unanimous Bomb Pot, Bounty, 7-2 Game, and Ocean votes. Sit out or rebuy between hands.
- Mobile and desktop layouts. All chips are fictional; there are no payments or deposits.

## Run locally

Use Node.js 22 or 24 LTS and npm.

```sh
npm ci
npm run dev
```

Open the local address printed in the terminal. Development stores rooms under `.local-data/`; no external account is needed. To test with friends on one computer, use separate browser profiles or an incognito window. Tabs in the same profile share a player identity.

## Deploy free on Vercel

You need a personal Vercel Hobby account and a Neon Free account. The database is necessary because Vercel instances do not share local memory or disk.

1. Create a free database at [Neon](https://console.neon.tech/). Choose a region near your friends. Copy the PostgreSQL connection string from **Connect**. A pooled connection string is fine; this app uses Neon’s HTTP driver.
2. Put this project in a personal GitHub repository. Upload the files inside this folder, with `package.json` at the repository root. Exclude `node_modules`, `.next`, `.local-data`, and `.env.local` (already in `.gitignore`).
3. In [Vercel New Project](https://vercel.com/new), import the repository. Use the **Next.js** preset. Set Node.js to **24.x** (or **22.x**), leave the root directory at the repository root, and use the included `npm run build` command.
4. Add a server environment variable named **`DATABASE_URL`**, with the connection string from Neon. Enable it for Production and for any Preview deployments you want to test. Do **not** prefix it with `NEXT_PUBLIC_`.
5. Deploy. The app creates its tables automatically on the first room request. Alternatively, run `database.sql` once in Neon’s SQL editor before inviting anyone.
6. Open the Vercel production URL, create a room, and share **Invite friends → Copy invite link**. If Vercel asks friends to sign in, disable Vercel Authentication for the production deployment in its Deployment Protection settings; the app itself does not require accounts.

If you change `DATABASE_URL` after deployment, redeploy so the functions receive the new value. Keep the database and Vercel function regions close together for responsive play.

You can also deploy from this folder with the [Vercel CLI](https://vercel.com/docs/cli): `npx vercel`, then add `DATABASE_URL` in the project dashboard and deploy Production with `npx vercel --prod`.

### What “free” means

This is designed for occasional private games within free-plan quotas. It uses short HTTPS polling requests (about every 1.2 seconds while visible, every 12 seconds in the background) and does not require a separate always-running server or paid realtime service. With 10 continuously active players, polling alone is roughly 30,000 requests per hour, plus game actions and page loads.

Vercel’s [Hobby plan](https://vercel.com/docs/plans/hobby) is free for personal, non-commercial use and currently includes 1 million function invocations per month, alongside CPU, memory, and transfer limits. Neon also offers a [Free plan](https://neon.com/pricing) with usage limits. Check both dashboards before long or frequent sessions; free is not unlimited. No paid plan is required by this code. Pricing and quotas can change.

## How special games work

**Bomb pot:** Any ready player proposes an ante between hands. Every ready player must agree. The next hand collects the same ante from everyone, skips blinds and preflop betting, and opens the flop. Betting starts left of the button. A change in the lineup clears the queued bomb pot; the host can also cancel it from room settings.

**Bounty:** The last original participant without a main-pot win pays the selected bounty to each opponent. Split main-pot winners each earn a win. Side-pot-only wins and uncalled refunds do not count. On unanimous approval, each player reserves `bounty × opponents` from their stack. Example: with 4 players and a bounty of 50, each reserves 150. Once three players have won a main pot, the last player’s 150 goes to the three winners, who also recover their own reserves. If a split pot gives all remaining players a win together, the round is a tie and all reserves are refunded.

**7-2 Game:** After a unanimous vote, every participant reserves enough chips to cover the selected payment to every other player. A player who wins the main pot while holding any seven and any deuce collects that amount from each opponent. Showdown wins and successful bluffs both count, and the qualifying hand is shown automatically. The game continues across hands. After a payout, reserves refill from player stacks; if anyone cannot refill, the game ends and every remaining reserve is returned.

**Ocean:** A unanimous vote gives the next hand a sixth community card after the river, followed by another betting round. Players make the best five-card hand from their two hole cards and all six community cards. The queued Ocean is cleared if the lineup changes before the hand starts.

Active bounty and 7-2 lineups stay fixed. New players, leaving, and sitting out wait until those games finish or the host cancels them. Host cancellation returns all reserves and also clears queued Bomb Pot and Ocean hands.

## Reconnection and timeouts

- Player identity is a random, HttpOnly, SameSite cookie, stored for 30 days. The database stores only its SHA-256 hash.
- Reopen the same invite link in the same browser to recover the same seat. Clearing cookies or changing browsers creates a new identity.
- A timeout checks when possible, otherwise folds. The next room request advances expired actions. At least one active client is needed to keep a game moving.
- An active player inherits hosting after the host has not checked in for 90 seconds.
- Players leave, sit out, or rebuy only between hands. Closing a tab keeps the seat; the action timer prevents that seat from freezing play.
- Rooms expire after seven days without recorded activity. Expired data is cleaned when new rooms are created or `npm run db:setup` runs.

## Architecture

`app/api/table/route.ts` authenticates, validates, and applies every action. `lib/engine.ts` is the authoritative state machine. `lib/evaluator.ts` ranks every possible five-card combination from up to eight available cards for Ocean hands. `lib/store.ts` persists the state in Neon JSONB and uses revision-based compare-and-swap, retrying conflicts across serverless instances. Requests carry idempotency IDs and poker-action counters to reject stale moves and avoid duplicate bets.

Clients receive only their own hole cards before showdown. The remaining deck, authentication hashes, and action receipts never enter public responses. Folded hands stay hidden at showdown. Room reads cannot be cached. CSRF checks protect mutations, and create/join endpoints are rate-limited. A person with the room link can join while a seat is available; these are private-by-invite rooms, not password-protected rooms. The server/database owner is trusted, as with most home-game apps.

Local file storage is for development or an explicitly enabled single-process smoke test only. Vercel refuses to use it, even if `ALLOW_LOCAL_STORE=true`, and requires `DATABASE_URL`.

## Verification

```sh
npm test
npm run typecheck
npm run build
# With the local server running (use its printed port):
npm run test:api -- http://127.0.0.1:3001
```

The engine suite covers hand rankings, Ocean evaluation and dealing, heads-up rules, short all-ins, cumulative reopening, side pots, split pots, privacy, timeouts, 10 players, votes, bounty and 7-2 settlement, reconnects, and chip conservation through 500 randomized hands. The API smoke test creates 10 separate sessions, exercises concurrent joins and votes, submits a duplicate bet, checks card isolation, completes a hand, starts a bomb pot, and verifies CSRF checks.

Live Vercel/Neon deployment requires your accounts and has not been performed as part of this source delivery. The browser’s optional WebMCP table-reading interface is feature-detected; a supporting browser is not required to play.

## Files

- `components/PokerApp.tsx`: lobby, room, betting, voting, and sharing UI.
- `components/Cards.tsx`: animated cards and deck selector.
- `app/globals.css`: four themes and responsive layouts.
- `lib/engine.ts`, `lib/evaluator.ts`: poker and side-game rules.
- `lib/store.ts`: persistent rooms and atomic updates.
- `app/api/table/route.ts`: protected room API.
- `tests/`: engine tests and multiplayer smoke test.
- `database.sql`: optional initial database setup.

The Black & Gold Metalluxe deck is an original geometric theme; this project does not include licensed card-brand artwork.
# River-Club
