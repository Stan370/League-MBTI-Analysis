import type { ReactNode } from 'react';
import type { MBTIHarnessResult } from './services/mbtiMappingService';

export interface ChampionData {
  name: string;
  gamesPlayed: number;
  winRate: number;
  kda: string;
  imageUrl: string;
  playstyleAnalysis: string;
}

export interface GrowthDataPoint {
  month: string;
  winRate: number;
  kda: number;
}

import type { FilteredPlayerData } from './services/dataFilterService';

export interface MatchData extends FilteredPlayerData {
  matchId: string;
  gameEndTimestamp: number;
  queueId: number;
}

export interface AggregatedSummary {
  totalGames: number;
  wins: number;
  winRate: number;
  avgKills: number;
  avgDeaths: number;
  avgAssists: number;
  avgKDA: number;
  avgCS: number;
  avgTotalCS: number;
  avgDamage: number;
  avgGold: number;
  avgVisionScore: number;
  avgDamagePerMin: number;
  avgGoldPerMin: number;
}

export interface RecapStats {
  totalTeamObjectives: number;
  baronKills: number;
  dragonKills: number;
  riftHeraldKills: number;
  towerKills: number;
  inhibitorKills: number;
  totalTakedowns: number;
  shortGames: number;
  championPoolSize: number;
  mostPlayedRole: string;
  soulmate: {
    title: string;
    champions: string;
    description: string;
    matchedBecause: string;
    imageUrl: string;
  };
  easterEggs: Array<{
    champion: string;
    title: string;
    description: string;
    imageUrl: string;
  }>;
}

export interface AnalysisResult {
  summonerName: string;
  tag: string;
  archetype: {
    title: string;
    mbti: string;
    description: string;
    imageUrl: string;
  };
  strengths: {
    title: string;
    description: string;
    icon: ReactNode;
  }[];
  growthCurve: GrowthDataPoint[];
  topChampions: ChampionData[];
  matchData: MatchData[];
  aggregatedSummary: AggregatedSummary;
  recapStats: RecapStats;
  mbtiDetails: MBTIHarnessResult;
  aiInsights: {
    playstyle: string;
    strengths: string[];
    growthAreas: string[];
    prediction: string;
  };
}
