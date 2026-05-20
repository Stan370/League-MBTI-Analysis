import type { FilteredPlayerData } from './dataFilterService';

/**
 * MBTI维度得分
 */
export interface MBTIScores {
  E: number; // Extroversion - 外向：主动参与团战
  I: number; // Introversion - 内向：独立发育
  S: number; // Sensing - 实感：稳定输出
  N: number; // Intuition - 直觉：高风险高回报
  T: number; // Thinking - 思考：效率优先
  F: number; // Feeling - 情感：团队支持
  J: number; // Judging - 判断：计划性
  P: number; // Perceiving - 感知：灵活应变
}

export interface MBTIMetrics {
  assistsPerGame: number;
  killsPerGame: number;
  deathsPerGame: number;
  kda: number;
  damagePerMin: number;
  visionPerMin: number;
  goldPerMin: number;
  championPoolRatio: number;
  roleDiversityRatio: number;
  supportRate: number;
}

export interface MBTIHarnessResult {
  mbtiType: string;
  scores: MBTIScores;
  confidence: number;
  metrics: MBTIMetrics;
  pairMargins: { EI: number; SN: number; TF: number; JP: number };
  rules: typeof MBTI_RULES;
}

const BASELINES = {
  assistsPerGame: { mean: 8, std: 3 },
  killsPerGame: { mean: 6, std: 2.5 },
  deathsPerGame: { mean: 5.5, std: 1.8 },
  kda: { mean: 2.5, std: 1.2 },
  damagePerMin: { mean: 620, std: 180 },
  visionPerMin: { mean: 1.1, std: 0.45 },
  goldPerMin: { mean: 390, std: 80 },
  championPoolRatio: { mean: 0.35, std: 0.2 },
  roleDiversityRatio: { mean: 0.35, std: 0.25 },
  supportRate: { mean: 0.2, std: 0.25 },
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const z = (value: number, mean: number, std: number) => clamp((value - mean) / Math.max(std, 0.0001), -2.5, 2.5);

function average(values: number[]): number {
  return values.length ? values.reduce((sum, n) => sum + n, 0) / values.length : 0;
}

export function computeMBTIMetrics(games: FilteredPlayerData[]): MBTIMetrics {
  const totalGames = Math.max(games.length, 1);
  const kills = average(games.map(g => g.kills));
  const deaths = average(games.map(g => g.deaths));
  const assists = average(games.map(g => g.assists));
  const damagePerMin = average(games.map(g => g.totalDamageDealtToChampions / Math.max(g.gameDuration / 60, 1)));
  const visionPerMin = average(games.map(g => g.visionScore / Math.max(g.gameDuration / 60, 1)));
  const goldPerMin = average(games.map(g => g.goldEarned / Math.max(g.gameDuration / 60, 1)));
  const championPoolRatio = new Set(games.map(g => g.championName)).size / totalGames;
  const roleDiversityRatio = new Set(games.map(g => g.position)).size / 5;
  const supportRate = games.filter(g => g.position === 'UTILITY').length / totalGames;

  return {
    assistsPerGame: assists,
    killsPerGame: kills,
    deathsPerGame: deaths,
    kda: (kills + assists) / Math.max(deaths, 1),
    damagePerMin,
    visionPerMin,
    goldPerMin,
    championPoolRatio,
    roleDiversityRatio,
    supportRate,
  };
}

function normalized(value: number, key: keyof typeof BASELINES): number {
  return z(value, BASELINES[key].mean, BASELINES[key].std);
}

export const MBTI_RULES = {
  EI: 'E = assists/game + support rate + vision/min. I = kills/game + carry damage/min.',
  SN: 'S = low deaths + stable KDA. N = high volatility (death pressure) + high-risk pace.',
  TF: 'T = damage/gold efficiency. F = vision/support utility.',
  JP: 'J = consistency (champion specialization + lower role switching). P = flexibility (wide champion/role pool).',
  confidence: 'Confidence comes from average absolute margin across EI/SN/TF/JP, normalized to 0-1.',
};

export function calculateMBTIHarness(games: FilteredPlayerData[]): MBTIHarnessResult {
  const metrics = computeMBTIMetrics(games);
  const scores: MBTIScores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };

  const eSignal = normalized(metrics.assistsPerGame, 'assistsPerGame') * 0.45 +
    normalized(metrics.visionPerMin, 'visionPerMin') * 0.25 +
    normalized(metrics.supportRate, 'supportRate') * 0.3;
  const iSignal = normalized(metrics.killsPerGame, 'killsPerGame') * 0.5 +
    normalized(metrics.damagePerMin, 'damagePerMin') * 0.5;

  const sSignal = normalized(-metrics.deathsPerGame, 'deathsPerGame') * 0.5 +
    normalized(metrics.kda, 'kda') * 0.5;
  const nSignal = normalized(metrics.deathsPerGame, 'deathsPerGame') * 0.4 +
    normalized(metrics.damagePerMin, 'damagePerMin') * 0.2 +
    normalized(metrics.killsPerGame, 'killsPerGame') * 0.4;

  const tSignal = normalized(metrics.damagePerMin, 'damagePerMin') * 0.55 +
    normalized(metrics.goldPerMin, 'goldPerMin') * 0.45;
  const fSignal = normalized(metrics.visionPerMin, 'visionPerMin') * 0.5 +
    normalized(metrics.supportRate, 'supportRate') * 0.5;

  const pSignal = normalized(metrics.championPoolRatio, 'championPoolRatio') * 0.65 +
    normalized(metrics.roleDiversityRatio, 'roleDiversityRatio') * 0.35;
  const jSignal = -pSignal;

  scores.E = Math.max(0, eSignal);
  scores.I = Math.max(0, iSignal);
  scores.S = Math.max(0, sSignal);
  scores.N = Math.max(0, nSignal);
  scores.T = Math.max(0, tSignal);
  scores.F = Math.max(0, fSignal);
  scores.J = Math.max(0, jSignal);
  scores.P = Math.max(0, pSignal);

  const pairMargins = {
    EI: eSignal - iSignal,
    SN: nSignal - sSignal,
    TF: tSignal - fSignal,
    JP: jSignal - pSignal,
  };

  const mbtiType = determineMBTI(scores);
  const confidence = clamp(
    average([
      Math.abs(pairMargins.EI),
      Math.abs(pairMargins.SN),
      Math.abs(pairMargins.TF),
      Math.abs(pairMargins.JP),
    ]) / 2,
    0,
    1
  );

  return { mbtiType, scores, confidence, metrics, pairMargins, rules: MBTI_RULES };
}

/**
 * 从得分确定MBTI类型
 */
export function determineMBTI(scores: MBTIScores): string {
  return (
    (scores.E > scores.I ? 'E' : 'I') +
    (scores.N > scores.S ? 'N' : 'S') +
    (scores.T > scores.F ? 'T' : 'F') +
    (scores.P > scores.J ? 'P' : 'J')
  );
}

/**
 * 兼容旧调用：返回维度分数
 */
export function calculateMBTIScores(games: FilteredPlayerData[]): MBTIScores {
  return calculateMBTIHarness(games).scores;
}

export const MBTI_MAPPING = MBTI_RULES;
