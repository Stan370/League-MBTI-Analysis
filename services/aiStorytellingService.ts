// AI Storytelling Service - 参考 Vercel AI SDK 和 AWS Bedrock 最佳实践
import type { AggregatedStats } from './riotApiService';
import type { YearInReview2025 } from '../types/yearInReview';

type MonthlyPoint = { winRate: number; month?: string };
type StorytellingContext = {
  roleDistribution?: Record<string, number>;
  topChampionRoles?: string[];
  winStreak?: number;
  lossStreak?: number;
  playstylePatterns?: string[];
};

export function buildStorytellingPrompt(
  stats: AggregatedStats,
  monthlyData: MonthlyPoint[],
  context: StorytellingContext = {}
): string {
  const winRate = ((stats.wins / stats.totalGames) * 100).toFixed(1);
  const kda = ((stats.avgKills + stats.avgAssists) / (stats.avgDeaths || 1)).toFixed(2);
  
  // 识别趋势（早期 vs 晚期表现）
  const earlyMonths = monthlyData.slice(0, 3);
  const lateMonths = monthlyData.slice(-3);
  const earlyWR = earlyMonths.reduce((sum, m) => sum + m.winRate, 0) / earlyMonths.length;
  const lateWR = lateMonths.reduce((sum, m) => sum + m.winRate, 0) / lateMonths.length;
  const improvement = lateWR - earlyWR;
  
  const roleSummary = Object.entries(context.roleDistribution || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([role, games]) => `${role}: ${games} games`)
    .join(', ') || 'N/A';
  const topRoles = (context.topChampionRoles || []).join(', ') || 'N/A';
  const patterns = (context.playstylePatterns || []).join('; ') || 'N/A';
  const streakLine = `Best win streak: ${context.winStreak ?? 0}, worst loss streak: ${context.lossStreak ?? 0}`;
  
  return `You are a League of Legends coach analyzing a player's 2025 season. Generate 3 personalized insights in a motivating, story-driven style (like Spotify Wrapped), grounded in explicit evidence below.

Player Stats:
- Games: ${stats.totalGames}, Win Rate: ${winRate}%
- KDA: ${kda} (${stats.avgKills.toFixed(1)}/${stats.avgDeaths.toFixed(1)}/${stats.avgAssists.toFixed(1)})
- Top Champions: ${Object.entries(stats.championStats).sort((a,b) => b[1].games - a[1].games).slice(0,3).map(([name]) => name).join(', ')}
- Improvement: ${improvement > 0 ? `+${improvement.toFixed(1)}%` : `${improvement.toFixed(1)}%`} win rate from early to late season
- Role Distribution: ${roleSummary}
- Champion Role Profile: ${topRoles}
- ${streakLine}
- Playstyle Patterns: ${patterns}

Generate exactly 3 insights in this JSON format:
{
  "playstyleEvolution": "One sentence describing how their playstyle changed over 2025",
  "standoutMoment": "One sentence highlighting their best achievement or breakthrough",
  "2026Prediction": "One motivating sentence about their potential in 2026"
}

Keep each insight under 25 words. Be specific, positive, and actionable.`;
}

const insightCache = new Map<string, { insights: any; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours
const STORAGE_KEY = 'mbti_ai_insights_v1';

function readPersistentCache(): Record<string, { insights: any; timestamp: number }> {
  if (typeof window === 'undefined' || !window.localStorage) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writePersistentCache(cache: Record<string, { insights: any; timestamp: number }>): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Ignore quota/storage errors.
  }
}

export function getCachedInsights(playerId: string): any | null {
  const cached = insightCache.get(playerId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.insights;
  }
  const persistent = readPersistentCache()[playerId];
  if (persistent && Date.now() - persistent.timestamp < CACHE_TTL) {
    insightCache.set(playerId, persistent);
    return persistent.insights;
  }
  return null;
}

export function setCachedInsights(playerId: string, insights: any): void {
  const payload = { insights, timestamp: Date.now() };
  insightCache.set(playerId, payload);
  const persistent = readPersistentCache();
  persistent[playerId] = payload;
  writePersistentCache(persistent);
}

function safeParseInsightPayload(payload: unknown): Record<string, unknown> {
  if (typeof payload === 'object' && payload !== null) return payload as Record<string, unknown>;
  if (typeof payload !== 'string') return {};

  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    const jsonMatch = payload.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    try {
      return JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}

function fallbackNarrative(stats: AggregatedStats): YearInReview2025['aiInsights'] {
  const wr = stats.totalGames > 0 ? (stats.wins / stats.totalGames) * 100 : 0;
  const kda = (stats.avgKills + stats.avgAssists) / Math.max(stats.avgDeaths, 1);
  return {
    playstyle: wr >= 52
      ? 'You built a winning identity through consistent execution and better late-season decision making.'
      : 'Your season shows strong experimentation; refining consistency will quickly convert close games into wins.',
    strengths: extractStrengths(stats),
    growthAreas: extractGrowthAreas(stats),
    prediction: kda >= 3.5
      ? 'With your current fundamentals, focused champion mastery can accelerate your climb in 2026.'
      : 'If you tighten deaths and lane efficiency, your ceiling in 2026 rises significantly.',
  };
}

// Bedrock API 调用（参考 AWS 官方示例）
export async function generateAIInsights(
  stats: AggregatedStats, 
  monthlyData: any[],
  playerId: string,
  context: StorytellingContext = {}
): Promise<YearInReview2025['aiInsights']> {
  // 检查缓存
  const cached = getCachedInsights(playerId);
  if (cached) return cached;
  
  const prompt = buildStorytellingPrompt(stats, monthlyData, context);
  
  try {
    const response = await fetch('/api/ai/generate-insights', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, maxTokens: 260 })
    });
    
    if (!response.ok) {
      throw new Error('AI insight generation failed');
    }
    
    const result = await response.json();
    const parsed = safeParseInsightPayload(result?.text ?? result?.output ?? result);
    
    const insights = {
      playstyle: typeof parsed.playstyleEvolution === 'string'
        ? parsed.playstyleEvolution
        : "You showed consistent growth throughout 2025",
      strengths: extractStrengths(stats),
      growthAreas: extractGrowthAreas(stats),
      prediction: typeof parsed['2026Prediction'] === 'string'
        ? parsed['2026Prediction']
        : "You're ready to reach new heights in 2026"
    };
    
    setCachedInsights(playerId, insights);
    return insights;
  } catch (error) {
    console.warn('[generateAIInsights] Falling back to deterministic narrative:', error);
    const fallback = fallbackNarrative(stats);
    setCachedInsights(playerId, fallback);
    return fallback;
  }
}

// 辅助函数：基于数据提取优势（不依赖 AI）
function extractStrengths(stats: AggregatedStats): string[] {
  const strengths: string[] = [];
  if (stats.avgVisionScorePerMin > 1.5) strengths.push("Exceptional map awareness");
  if ((stats.avgKills + stats.avgAssists) / (stats.avgDeaths || 1) > 4) strengths.push("Elite KDA management");
  if (stats.avgDamageDealtPercentage > 28) strengths.push("Carry-level damage output");
  return strengths.slice(0, 2);
}

function extractGrowthAreas(stats: AggregatedStats): string[] {
  const areas: string[] = [];
  if (stats.avgDeaths > 6) areas.push("Reduce deaths in teamfights");
  if (Object.keys(stats.championStats).length < 5) areas.push("Expand champion pool");
  if (stats.avgGoldPerMin < 380) areas.push("Improve farming efficiency");
  return areas.slice(0, 2);
}
