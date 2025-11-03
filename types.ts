import type { ReactNode } from 'react';

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
    // Fix: Use the imported ReactNode type to resolve the 'Cannot find namespace React' error.
    icon: ReactNode;
  }[];
  growthCurve: GrowthDataPoint[];
  topChampions: ChampionData[];
}
