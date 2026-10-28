# Milanty

A browser-based multiplayer card game where players compete to collect four cards of the same number. Play against AI opponents or invite friends into a real-time multiplayer room.

## Overview

Milanty is a React and TypeScript card game featuring turn-based gameplay, AI opponents, round-based scoring, and online multiplayer powered by Supabase Realtime. Its dark interface, animated cards, and in-game commentary create an engaging game experience.

## Features

- **Play against AI** — Play against computer-controlled opponents.
- **Adjustable difficulty** — Choose Easy, Medium, or Hard.
- **Online multiplayer** — Create or join rooms using a five-character room code.
- **Real-time synchronization** — Share game state and player actions through Supabase Realtime.
- **Turn-based gameplay** — Pick cards, pass cards, and track player turns.
- **Round-based scoring** — Collect four matching numbers to win a round and accumulate points.
- **Player lobby and presence** — Manage multiplayer sessions and handle player disconnections.
- **In-game chat** — Send text messages, emojis, and photos in multiplayer rooms.
- **Audio and commentary** — Includes audio services and dynamic game commentary.
- **Responsive interface** — A dark, animated interface designed for interactive gameplay.

## Tech Stack

| Technology | Purpose |
|---|---|
| React 19 | User interface |
| TypeScript | Application logic and type safety |
| Vite 6 | Development server and production builds |
| Supabase Realtime | Multiplayer communication and synchronization |
| Tailwind CSS CDN | Utility-based styling |
| Vercel Analytics | Analytics integration |
| canvas-confetti | Celebration effects |

## Getting Started

### Prerequisites

- Node.js and npm
- A modern web browser
- A Supabase project if you want to use multiplayer

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/Milanty.git
   cd Milanty
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the development server:

   ```bash
   npm run dev
   ```

4. Open the local URL displayed in your terminal, usually `http://localhost:5173`.

AI gameplay does not require Supabase credentials. Multiplayer requires additional configuration.

## Multiplayer Configuration

Milanty uses Supabase Realtime to coordinate multiplayer rooms.

1. Create a project at [Supabase](https://supabase.com/).
2. Find your project URL and publishable/anon client key in the Supabase project settings.
3. Configure the following environment variables in a `.env.local` file in the project root:

   ```env
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_public_key
   ```

4. Confirm that the variable names match those referenced in `services/supabaseClient.ts`.
5. Ensure Supabase Realtime is available and properly configured for the project.
6. Restart the development server after changing environment variables.

**Configuration note:** The original README uses `SUPABASE_URL` and `SUPABASE_ANON_KEY`. Verify `services/supabaseClient.ts` before changing the variable names; Vite client-side environment variables normally require the `VITE_` prefix.

## How to Play

1. Select AI mode or multiplayer mode.
2. Enter a player name and configure the available game settings.
3. Pick cards during the initial selection phase.
4. During the passing phase, pass one card to the next active player if you have not already matched four cards of the same number.
5. Matching four cards of the same number earns a round result.
6. Continue through the rounds and compete for the best cumulative score.

The game includes additional rules for round endings and scoring. Read the in-game **Game Rules** screen for the complete rules.

## Project Structure

```text
Milanty/
├── components/
│   ├── CardComponent.tsx
│   ├── ChatPanel.tsx
│   ├── ModeSelect.tsx
│   ├── MultiplayerLobby.tsx
│   └── SetupForm.tsx
├── services/
│   ├── audioService.ts
│   ├── commentaryService.ts
│   ├── roomService.ts
│   └── supabaseClient.ts
├── App.tsx
├── constants.tsx
├── index.html
├── index.tsx
├── types.ts
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Available Scripts

| Command | Description |
|---|---|
| `npm install` | Install dependencies |
| `npm run dev` | Start the development server |
| `npm run build` | Build the production application |
| `npm run preview` | Preview the production build locally |

## Deployment

Milanty can be deployed to a static hosting platform that supports Vite applications, such as [Vercel](https://vercel.com/) or [Netlify](https://www.netlify.com/).

1. Push the project to GitHub.
2. Import the repository into your hosting provider.
3. Set the build command to `npm run build`.
4. Set the output directory to `dist`.
5. Configure the required Supabase environment variables for multiplayer.
6. Deploy and verify the application in the browser.

The Tailwind CSS CDN and Google Fonts currently referenced by the application require internet access. Multiplayer also depends on the Supabase service being configured and available.

## Current Scope

This repository contains the application source code and its development configuration. Automated test coverage, production security review, and deployment status should be verified separately rather than assumed.

## Contributing

Contributions, bug reports, and suggestions are welcome. Please describe the issue or proposed change clearly when opening an issue or pull request.

## License

No license is specified here. Unless a license is added to the repository, reuse and redistribution are subject to the applicable copyright rules.
