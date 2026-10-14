# River Club

A private, play-money Texas Hold’em website for 2–10 friends, ready for Vercel. Create a room, share its six-character code or link, and play from separate phones or computers. No player accounts required.

## Included

- Server-authoritative no-limit Hold’em: blinds, betting streets, legal raises, all-ins, side pots, ties, and uncalled-bet refunds.
- Five decks and synchronized room themes: Classic, Dark Mode, Astral, Black & Gold Metalluxe, and Cyberpunk. Face cards have original mirrored court illustrations.
- Larger, brighter cards, animated deals and reveals, turn indicators, winner announcements, and an audible turn chime; reduced-motion support.
- Configurable seats, free-form starting stacks and blinds, and optional 30/60/90-second turns or no timer. Hosts can resize a table between hands without removing seated players.
- Private room links and invite codes, same-browser reconnects, and automatic host transfer after 90 seconds away.
- Side games pass with n−1 votes from the current session: Bomb Pot, Bounty, 7-2 Game, Ocean, Die on the River, Pocket Trips, Double Barrel, Strip Club, Red River, and Pot or Not. Sit out or rebuy between hands.
- Player Stack shows every player’s current stack and cumulative net chips from completed hands and side bets. Rebuys do not reset net results. Rooms from older versions begin tracking with this update because full historical transactions were not stored.
- Six shared emoji reactions appear temporarily over the reacting player’s seat, with a short cooldown. Reactions do not affect turns, action counters, or chips.
- A full Three.js first-person bar environment with original 3D human stick figures, expressive faces for turns/actions/reactions, 3D hands and flat hole cards at your seat, and mouse/trackpad-controlled head movement shared with other players. Flat cards on the felt, coloured chip towers, dealer throws, fold tosses, and table-knock checks. A per-browser stand-up toggle beside sit-out smoothly raises the viewpoint and leans over the cards.
- Optional on-device webcam expression tracking maps smiles, blinks, brows, and mouth movement onto your character. Live camera faces remain a separate choice. Both require an explicit enable button and browser permission; the microphone is never requested.
- A full-width 3D table with native betting controls over the near rail and game panels below. Table view preserves the compact desktop rail and mobile dock. All chips are fictional; there are no payments or deposits.

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

## First-person controls and camera faces

First-person mode is the default. Three.js renders the entire bar, table, chairs, human characters, hands, chips, and flat cards as 3D objects. Move your mouse or trackpad pointer across the scene to look around; **Center view** returns your head to the middle. Other players see your head turn. Use **Stand up** beside the sit-out button to rise and lean over the community cards and your flat hole cards, then choose **Sit down** to return to your seat. Each player has coloured chip towers on the felt; bets throw chips into the pot, whose exact amount stays in the action dock. The avatar looks puzzled on its turn, changes expression after poker actions, and matches its active emoji reaction. Faces use public actions and never suggest information about hidden cards. On phones, the physical table and seat arc adjust to a full-width portrait view, with controls near your hands. Drag horizontally to look; vertical touch gestures still scroll.

The dealer throws cards to each occupied seat, folds slide face-down to a separate muck pile, and checks tap the felt. Die on the River tumbles a physical die and shows its authoritative face before replacing the board card; Ocean washes in the sixth card with a wave. The showdown overlay waits for these effects to finish. A wanted poster appears for proposed or active bounties, crosses out players who have won, and displays the losing character (or already-shared camera portrait) when the bounty ends. The completed bounty outcome remains available after reconnecting. A bounded public cue history contains player IDs, actions, chip amounts, and die outcomes, with no private card values. Reduced-motion settings skip movement. Large chip stacks are visually compressed; numeric stack and pot displays remain exact.

Choose **Mirror expressions** to request camera permission and animate your character's face from your facial movements. Video is processed on your device in a worker; only ten movement weights are shared with the table. Tracking overrides the automatic thinking/action faces, so a neutral poker face stays neutral. If your face leaves the frame, the character returns to neutral. **Stop expressions** ends capture and tracking. The MediaPipe runtime and model are hosted with the app and load only when enabled.

Choose **Share camera face** to replace your character's face with live video shared with the current table. This is separate from expression tracking. **Turn camera off** stops the camera tracks immediately. Neither mode records video or captures audio. Declining permission leaves the stick face available. Capture stops when leaving or switching out of first-person mode. Camera access requires HTTPS (Vercel supplies it) or localhost during development.

The seated view is closer to the felt for a home-game feel. Bounty posters include a small portrait beside each player's name, with tracked expressions or explicitly shared camera portraits when enabled.

Head motion uses WebRTC data channels with a throttled server fallback. Camera frames travel peer to peer; the server stores only poses, short-lived session information, and recipient-private connection signals in separate tables. These requests never advance a turn or update poker state. Presence adds low-frequency polling and occasional writes to the existing free-plan usage, while connected peers exchange movement directly.

Public STUN servers are configured by default. Some mobile, corporate, or restrictive NAT networks require a TURN relay for live video. In that case, set **NEXT_PUBLIC_RTC_ICE_SERVERS** in Vercel to a JSON array of WebRTC ICE servers and redeploy, for example:

```json
[{"urls":"stun:stun.l.google.com:19302"},{"urls":"turn:your-relay.example:3478","username":"relay-user","credential":"relay-credential"}]
```

This optional configuration is visible to browsers by design; use credentials intended for browser clients, never your provider's management API secret. Without a relay, a blocked direct connection falls back to shared head poses and stick faces, and poker remains playable.

## How special games work

**Bomb pot:** Any ready player proposes an ante between hands. All but one player in the session must agree. The next hand collects the same ante from everyone, skips blinds and preflop betting, and opens the flop. Betting starts left of the button. A change in the lineup clears the queued bomb pot; the host can also cancel it from room settings.

**Bounty:** The last original participant without a main-pot win pays the selected bounty to each opponent. Split main-pot winners each earn a win. Side-pot-only wins and uncalled refunds do not count. No chips are reserved when the vote passes. Once only one player remains without a win, the full bounty is deducted from that player and credited to every opponent. If a split pot gives all remaining players a win together, the round is a tie and nobody pays.

**7-2 Game:** A player who wins the main pot holding any seven and any deuce collects the chosen payment directly from every opponent after the hand, up to each opponent's remaining stack. Showdown wins and successful bluffs both count, and the qualifying hand is shown automatically. The game stays active for the session until the host cancels it. There is no chip reserve.

**Ocean:** A successful vote gives the next hand a sixth community card after the river, followed by another betting round. Players make the best five-card hand from their two hole cards and all six community cards. The queued Ocean is cleared if the lineup changes before the hand starts.

**Die on the River:** After river betting, a die replaces the numbered community card on rolls 1–5; a 6 keeps the board intact.

**Pocket Trips:** Each player receives three hole cards and uses the best five-card combination of their hole cards and the board.

**Double Barrel:** Two boards share all betting. Each contribution tier is split between the boards, then paid to the winners on each board. Red River can be combined with this format; each board extends independently, and final betting waits for both boards to finish.

**Strip Club:** Each player starts with five hole cards and discards one after the flop, turn, and river before betting. Discard choices appear in a centered overlay with community cards above them. Up to eight players can use this format with a standard deck.

**Red River:** A red river keeps dealing extra community cards until a black card arrives, before the final betting round. Those extra cards are part of the same street and have no additional burns. In the rare case that the deck runs out, betting resumes on the final card. All available community cards count toward the best five-card hand.

**Pot or Not:** The pot at the start of each betting round is the fixed total wager for that round. Each player pays it or folds; blinds count toward the preflop total, and short stacks can call all in. Raises are disabled, and no extra betting occurs when only one funded player remains.

The default amount for games with a chip payment is one percent of all chips at the table, rounded down with a minimum of one chip. Players can edit it before proposing a vote. Showdowns present the live contenders together, revealing the first card and then the second two seconds later; extra hole cards follow at the same interval. Reduced-motion preferences bypass the animation.

Choose one board format (Ocean, Die on the River, Double Barrel, or Red River), or combine Double Barrel with Red River. Choose one hole-card format (Pocket Trips or Strip Club) per hand. Double Barrel and Strip Club cannot run together. Bomb Pot and Pot or Not can accompany compatible formats. A bounty has a fixed roster; sitting out does not remove a player from its liability or payouts. Other session games allow new players. The host can cancel active side bets and queued formats between hands.

## Reconnection and timeouts

- Player identity is a random, HttpOnly, SameSite cookie, stored for 30 days. The database stores only its SHA-256 hash.
- Reopen the same invite link in the same browser to recover the same seat. Clearing cookies or changing browsers creates a new identity.
- A timeout checks when possible, otherwise folds. The next room request advances expired actions. At least one active client is needed to keep a game moving.
- An active player inherits hosting after the host has not checked in for 90 seconds.
- Players can request sit-out or sit-in during a hand. The change applies after settlement and can be cancelled before then. Leaving and rebuys still happen between hands. Closing a tab keeps the seat; the action timer prevents that seat from freezing play.
- The host may change the table from 2–10 seats between hands, as long as there are enough seats for everyone currently at the table.
- Rooms expire after seven days without recorded activity. Expired data is cleaned when new rooms are created or `npm run db:setup` runs.

## Architecture

`app/api/presence/route.ts` authenticates seated players and isolates poses/camera signalling from game state; WebRTC carries head motion and live video between peers. `app/api/table/route.ts` authenticates, validates, and applies every action. `lib/engine.ts` is the authoritative state machine. `lib/evaluator.ts` ranks the best five cards directly from 5–52 distinct cards, including long Red River boards. `lib/store.ts` persists the state in Neon JSONB and uses revision-based compare-and-swap, retrying conflicts across serverless instances. Requests carry idempotency IDs and poker-action counters to reject stale moves and avoid duplicate bets.

Clients receive only their own hole cards before showdown. The remaining deck, authentication hashes, and action receipts never enter public responses. Folded hands stay hidden at showdown. Room reads cannot be cached. CSRF checks protect mutations, and create/join endpoints are rate-limited. A person with the room link can join while a seat is available; these are private-by-invite rooms, not password-protected rooms. The server/database owner is trusted, as with most home-game apps.

Local file storage is for development or an explicitly enabled single-process smoke test only. Vercel refuses to use it, even if `ALLOW_LOCAL_STORE=true`, and requires `DATABASE_URL`.

## Verification

```sh
npm test
npm run typecheck
npm run build
# With the local server running (use its printed port):
npm run test:api -- http://127.0.0.1:3001
node --import tsx tests/presence-smoke.ts http://127.0.0.1:3001
```

Character tests cover public-action and emoji expression priorities. Facial-tracking tests cover movement mapping, anatomical left/right orientation, neutral transitions, and validation of peer data. Presence regressions protect newer camera sessions from stale cleanup and clear facial movement on stop. The presence smoke test verifies shared poses, camera state, recipient-private/idempotent signals, validation, authentication, CSRF, and unchanged poker state.

Desktop and portrait browser checks cover the 3D scene, card fans, controls, and camera permission denial. Synthetic peer video reached the remote 3D face, but the test browser crashed on the capture side; real-camera interoperability and restrictive-network relay behavior still require device testing.

The real MediaPipe worker was verified in the browser using synthetic video: it detected facial movements, returned neutral when no face was visible, and stopped cleanly. Actual webcam permission and tracking quality still depend on the player's browser, camera, and lighting.

The engine suite covers hand rankings, Ocean evaluation and dealing, heads-up rules, short all-ins, cumulative reopening, side pots, split pots, privacy, timeouts, 10 players, votes, bounty and 7-2 settlement, reconnects, and chip conservation through 500 randomized hands. The API smoke test creates 10 separate sessions, exercises concurrent joins and votes, checks duplicate-action protection and card isolation, plays combined side games, verifies net results across rebuys, broadcasts a reaction, queues sit-out and sit-in changes, and verifies CSRF checks.

Live Vercel/Neon deployment requires your accounts and has not been performed as part of this source delivery. The browser’s optional WebMCP table-reading interface is feature-detected; a supporting browser is not required to play.

## Files

- `components/PokerApp.tsx`: lobby, room, betting, voting, and sharing UI.
- `components/ThreePokerScene.tsx`: physical 3D environment, seated characters, card meshes, and camera-face textures.
- `components/TableScene.tsx`, `components/useTablePeers.ts`, `components/useTablePresence.ts`: view controls, permission-based camera capture, and shared head/video connections.
- `components/Cards.tsx`: animated cards and deck selector.
- `app/globals.css`: five themes and responsive layouts.
- `app/first-person.css`: full-width scene and native betting overlay.
- `lib/engine.ts`, `lib/evaluator.ts`: poker and side-game rules.
- `lib/store.ts`: persistent rooms and atomic updates.
- `app/api/table/route.ts`: protected room API.
- `app/api/presence/route.ts`, `lib/presence-store.ts`: authenticated, separate head-pose and signalling storage.
- `tests/`: engine tests and multiplayer smoke test.
- `database.sql`: optional initial database setup.

The Black & Gold Metalluxe deck is an original geometric theme; this project does not include licensed card-brand artwork.
# River-Club
