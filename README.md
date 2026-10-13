<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/0282b098-2764-4fd7-9f57-e9ab52bf6d6f

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Copy `.env.local.example` to `.env.local` and fill in your keys:
   - `SUPABASE_URL` / `SUPABASE_ANON_KEY` — only needed for **Multiplayer** (see below)
3. Run the app:
   `npm run dev`

## Multiplayer

Multiplayer lets a group of people play together in a room, using Supabase Realtime — no game server and no database tables required.

1. Create a free project at [supabase.com](https://supabase.com).
2. In your project, go to **Project Settings → API** and copy the **Project URL** and **anon public key**.
3. In **Project Settings → Realtime** (or **Database → Replication** depending on your project), make sure Realtime is enabled for the project (it is on by default for new projects).
4. Put those two values in `.env.local` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`, then restart `npm run dev`.

From the home screen, choose **Multiplayer** to create a room (you get a 5-character code to share) or join one with a code. One player is the host — the host's browser runs the game; everyone else's moves are sent to the host and the result is synced back to the room in real time. Rooms need 3–8 players, same as single-player vs AI. Play vs AI mode is unchanged and doesn't need Supabase at all.

