/**
 * Serializable report type for KV storage and sharing.
 *
 * Mirrors AnalysisResult but replaces ReactNode (strengths[].icon)
 * with a plain string key so the whole object is JSON-safe.
 */

import type { ChampionData, GrowthDataPoint, MatchData, AggregatedSummary, RecapStats } from '../types';
import type { MBTIHarnessResult } from '../services/mbtiMappingService';

/** Icon keys that map to React icon components on the client */
export type StrengthIconKey =
  | 'SwordsIcon'
  | 'BrainCircuitIcon'
  | 'ShieldCheckIcon'
  | 'CrosshairIcon';

export interface SerializableStrength {
  title: string;
  description: string;
  iconKey: StrengthIconKey;
}

export interface SerializableReport {
  /** Short unique ID (first 8 hex chars of SHA-256) */
  id: string;
  /** Unix ms when the report was created */
  createdAt: number;

  summonerName: string;
  tag: string;

  archetype: {
    title: string;
    mbti: string;
    description: string;
    imageUrl: string;
  };

  strengths: SerializableStrength[];
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
