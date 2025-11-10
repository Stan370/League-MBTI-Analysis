<div align="center">
</div>

# League MBTI Analytics

A React application that analyzes League of Legends player behavior and provides MBTI-style personality insights.

## Prerequisites

- Node.js 18+ 
- npm
- Riot API Key (get from [Riot Developer Portal](https://developer.riotgames.com/))

## ⚡ Development & Deployment: Vite and Wrangler Both Supported

This project can be developed, built, and deployed using **either plain Vite (for local/frontend dev)** or with **Cloudflare Wrangler/Pages Functions** (for edge/serverless/API proxy)—choose the workflow that fits your needs!

### 1. Vite Local (Recommended for frontend-only)

- Rapid local development
- Run backend/API mocks or call real Riot API via Cloudflare edge proxy

```bash
npm install
npm run dev
# Visit http://localhost:3000
```
- Configure `.env.local` if you want to set Riot API key for local service mocks.

### 2. Cloudflare Wrangler/Pages (Edge Functions, API Proxy)

- Serverless API proxy using Cloudflare Functions (`functions/api/riot/[[path]].ts`)
- Supports edge routing, CORS, and API key protection—great for real Riot API calls
- Two ways to use:
    - **Dev**: `npx wrangler pages dev`  — local preview with edge logic
    - **Build & Deploy**:
        - Build frontend: `npm run build`
        - Deploy backend+frontend: `npx wrangler pages deploy dist`  
        - Or use GitHub Actions CI deployment
- Set `RIOT_API_KEY` in Cloudflare dashboard (Settings → Environment Variables) or in `wrangler.jsonc`, depending on environment.

### 3. Which One Should I Use?

| Use Case                     | Recommended Mode           |
|-----------------------------|----------------------------|
| Frontend/dev UX              | Vite (`npm run dev`)       |
| Fullstack/API (prod/preview) | Cloudflare Wrangler/Pages  |
| Testing (mock data)          | Either                     |

- Both code paths share core logic (React UI & API proxying)!
- If you only deploy to Cloudflare Pages, you do **not** need `worker.ts` (all logic is in `functions/api/riot/[[path]].ts`).
- If you want custom, global proxying or advanced routing, you can add a traditional Worker script.

## Technology Stack

- **Framework:** React 19 + TypeScript
- **Build Tool:** Vite
- **Styling:** Tailwind CSS
- **Charts:** Recharts
- **Hosting:** Cloudflare Pages
- **CI/CD:** GitHub Actions

## Project Structure

```
/
├── components/          # React components
│   ├── GrowthChart.tsx
│   ├── LandingPage.tsx
│   ├── LoadingScreen.tsx
│   └── ResultsPage.tsx
├── services/           # API services
│   ├── riotApiService.ts
│   └── mockAnalyticsService.ts
├── types/              # TypeScript types
├── src/                # Static assets & styles
│   └── index.css       # Tailwind CSS entry
├── App.tsx             # Main app component
└── index.tsx           # App entry point
```

## Features

- Real-time League of Legends player analysis
- MBTI personality type mapping
- Performance metrics visualization
- Mock data mode for testing
- Responsive design

## License

MIT
