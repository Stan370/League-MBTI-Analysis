<div align="center">
</div>

# League MBTI Analytics

A React application that analyzes League of Legends player behavior and provides MBTI-style personality insights.

## Prerequisites

- Node.js 18+ 
- npm
- Riot API Key (get from [Riot Developer Portal](https://developer.riotgames.com/))

## Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   
   Create a `.env.local` file in the project root:
   ```bash
   RIOT_API_KEY=your_riot_api_key_here
   ```

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   
   Navigate to `http://localhost:3000`

## Build for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Deployment to Cloudflare Pages

### Automatic Deployment (GitHub Actions)

The project is configured for automatic deployment to Cloudflare Pages via GitHub Actions.

**Setup Steps:**

1. **Create a Cloudflare Pages project:**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to Workers & Pages > Create application > Pages
   - Note your Account ID (found in the URL or dashboard)

2. **Generate a Cloudflare API Token:**
   - Go to [API Tokens](https://dash.cloudflare.com/profile/api-tokens)
   - Create Token > Edit Cloudflare Workers template
   - Permissions: Account > Cloudflare Pages > Edit

3. **Add GitHub Secrets:**
   
   Go to your repository Settings > Secrets and variables > Actions, and add:
   - `CLOUDFLARE_API_TOKEN` - Your Cloudflare API token
   - `CLOUDFLARE_ACCOUNT_ID` - Your Cloudflare Account ID
   - `RIOT_API_KEY` - Your Riot API key

4. **Deploy:**
   
   Push to the `main` branch, and GitHub Actions will automatically build and deploy to Cloudflare Pages.

### Manual Deployment

You can also deploy manually using Wrangler:

```bash
npm run build
npx wrangler pages deploy dist --project-name=league-mbti-analysis

# Or if you have wrangler.jsonc configured:
npx wrangler pages deploy
```

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
