# Open Box

A private pixel town. The people in it think their lives are real. Watching the town is also a quiet window onto Open Box Industries: the store jobs are neighbors with jobs of their own.

This is a fork of [AI Town](https://github.com/a16z-infra/ai-town) (MIT, copyright a16z-infra). The map, walking, conversations, Convex game engine, and the first version of memory all come from that project. Do not strip the MIT license in `LICENSE`.

Other work this stands on:

- **Generative Agents** (Park et al., Stanford). Memory is retrieved by recency, importance, and relevance. Mornings produce a plan. Nights produce reflections. AI Town already had a lighter version of this; the nightly and morning passes here push it toward that design, in one batched call so it stays on a free budget.
- **Affordable Generative Agents** and the NPCAgent line of work. Several people share one model call. Importance is scored with a small heuristic instead of a model call per memory. When the daily budget is gone, everyone follows a script and turns in early.

Sentinel is the mayor. That name stays Sentinel.

## Where it runs

| Piece | Where | Cost |
| --- | --- | --- |
| Town, memory, engine | Convex free tier | $0 if we stay inside the caps below |
| Pixel client | Netlify free, `world.openboxindustries.com` | $0 |
| Brains | Gemini free tier, OpenAI-compatible endpoint | $0. Haiku and Grok are wired and stay off until a key exists |
| Later, at home | Ollama on the Legion | $0 |

Nothing in this repo writes to the store database or calls store functions.

## Free-tier brakes

Convex free, roughly: **1 million function calls / month**, **20 GB-hours** of action compute, **0.5 GB** database, **1 GB** file storage. The exact meters are in the Convex dashboard. The god panel shows the counters this app keeps itself (model calls, drowsy pulses, memories). It does not pretend to be the bill.

- While you have the town open, the engine runs live and your browser heartbeats about once a minute.
- Five minutes after you leave, the engine stops. A heartbeat every **15 minutes** still writes diaries, reads the store window, and (at dawn and late night) plans and reflects.
- Gemini calls are capped at **320 a Pacific day**, **24 per person**, and at least **5 seconds** apart. That is aimed under the free Flash-Lite budget. Google does not publish a stable free-tier number; check AI Studio for the project you create. The default model is `gemini-3.5-flash-lite` (`GEMINI_MODEL` overrides it).
- Conversations stop after **4** messages. There is a cooldown between talks.
- If the budget is spent, or a key is missing, or a call fails, the person says a scripted line. Nothing throws a paid retry and nothing should fail in front of you.

## Keys you enter

Convex environment (`npx convex env set NAME value` inside this repo):

| Name | Required now | What |
| --- | --- | --- |
| `GOD_PASSPHRASE` | yes | The passphrase for the login screen |
| `GOD_ALLOWLIST` | already defaults to `pgg124@gmail.com` | Comma-separated emails |
| `GEMINI_API_KEY` | yes, for real thoughts | From [Google AI Studio](https://aistudio.google.com/apikey). Do not turn on billing |
| `GEMINI_MODEL` | no | Default `gemini-3.5-flash-lite` |
| `DEFAULT_BRAIN` | no | `gemini` (default when the Gemini key exists), `ollama`, `haiku`, or `grok` |
| `OLLAMA_HOST` | when you use the Legion | A tunnel to the machine, not `127.0.0.1`, because Convex cloud cannot see your laptop |
| `OLLAMA_MODEL` | no | Default `llama3` |
| `ANTHROPIC_API_KEY` | leave unset | Enables Haiku. No key, no calls |
| `XAI_API_KEY` | leave unset | Enables Grok. No key, no calls |
| `FLOOR_READ_URL` | when the store window should wake up | `https://world.openboxindustries.com/.netlify/functions/floor-read` |
| `FLOOR_READ_TOKEN` | same time | Shared secret. Same value on Netlify |
| `CURSOR_API_KEY` | optional | View only. The town lists cloud agents. It never creates one |
| `CONVEX_DEPLOY_KEY` | in GitHub Actions secrets, not in the client | Weekly `npx convex export` |

Netlify environment for **this new site only**:

| Name | What |
| --- | --- |
| `VITE_CONVEX_URL` | The Convex deployment URL. Set it, then rebuild |
| `FLOOR_READ_TOKEN` | Same secret as Convex |
| `SUPABASE_URL` | Store project URL |
| `WORLD_READER_KEY` | A key that can `select` the two views below. Keep it off the store site and out of the browser |

DNS, at the host that already serves `openboxindustries.com` (the same place `admin` and the others are managed):

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `world` | the Netlify site hostname, shown after the site exists, ending in `.netlify.app` |

Netlify also asks you to add the custom domain `world.openboxindustries.com` on the new site. Do not edit the store sites.

## Store window

Run this yourself on the store database. This repo does not connect to it until you paste the keys.

```sql
create or replace view public.world_feed as
select
  created_at,
  source,
  level,
  event,
  left(regexp_replace(coalesce(message, ''), '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[private]', 'g'), 180) as message
from public.floor_logs
where source in (
  'ebay-sync', 'amazon-sync', 'channel-fee-sync', 'dispatch-alerts',
  'gmail-sales-poll', 'marketplace-sale', 'marketplace-daily-report'
);

create or replace view public.world_sales as
select created_at, provider as channel, item_cents
from public.channel_orders
where created_at > now() - interval '2 days';
```

`world_sales` has no buyer name, email, address, or order id. The Netlify function `netlify/functions/floor-read.mjs` reads only those views, strips anything that still looks like an email or phone, and tells the town things like "an item sold on Depop for $69". Brains never see the raw row.

Characters: Ellis (eBay), Amara (Amazon), Maren (Depop/Mercari letters), Felix (fees), Crier (alerts), Sentinel (mayor, watches all of them). A red or overdue job knocks that person down at their desk. A sale is coins and a cheer. A slow day is a worried diary.

## People, brains, growth

Fourteen main characters live in `data/characters.ts`. To add one, append a `Descriptions` entry (name, sprite `f1`–`f8`, identity, plan, optional `job`) and a few `RelationshipSeeds`. Restart is not required if you then insert them with the existing `createAgent` input; a fresh world picks up the list on init.

Brains are per person. In the character sheet, the dropdown writes the `brains` table: `gemini`, `ollama`, `haiku`, or `grok`. Haiku and Grok do nothing until their keys exist. Citizens are the growth path: tier `citizen` is in the schema, routine-driven, and the morning/night pass already batches many people into one call. Talking to someone, or a main character seeking them out, is the promotion hook to flip their tier to `main`.

The map you are looking at is the live neighborhood. When the tab is closed the rest of life is diaries, not a one-second engine. That is the level-of-detail split a bigger city can hang districts on.

## Backups and leaving Convex cloud

Memories are not vacuumed. Inputs are.

Every Sunday the GitHub Action `.github/workflows/convex-export.yml` runs `npx convex export` if `CONVEX_DEPLOY_KEY` is set, and keeps the zip as an artifact. You can also run that command by hand.

To move the world onto a big machine later:

1. Export a snapshot (`npx convex export`).
2. Run [self-hosted Convex](https://github.com/get-convex/convex-backend) (their open-source backend) on that machine.
3. Import the snapshot into the self-hosted deployment.
4. Point `VITE_CONVEX_URL` at the new deployment and set `OLLAMA_HOST` to the local model.
5. The tables (memories, diaries, relationships, jobs) come across with the snapshot. The engine code in this repo does not change.

Do that before the database nears 0.5 GB. Embeddings are the heavy part.

## What is intentionally not here yet

A second neighborhood, citizen crowds, launching Cursor agents (that spends money; the workshop is view-only), and VR. The engine, the brain switch, and the diary are the parts those should reuse.
