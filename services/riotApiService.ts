import React from 'react';
import type { AnalysisResult, ChampionData, MatchData, AggregatedSummary, RecapStats } from '../types';
import type { MatchDto } from '../types/riotApiTypes';
import { QUEUE_NAMES, RANKED_QUEUE_IDS, CASUAL_QUEUE_IDS, ALLOWED_QUEUE_IDS } from '../types/riotApiTypes';
import { BrainCircuitIcon, CrosshairIcon, ShieldCheckIcon, SwordsIcon } from '../components/icons';
import {
    getCachedPuuid,
    setCachedPuuid,
    getCachedMatchIds,
    setCachedMatchIds,
    getCachedMatchDetails,
    setCachedMatchDetails,
    getCachedRegion,
    setCachedRegion,
    clearAllCaches,
} from './cacheService';
import pLimit from 'p-limit';
import { rateLimiter } from './rateLimiter';
import { calculateMBTIHarness } from './mbtiMappingService';
import { generateAIInsights } from './aiStorytellingService';

// API requests are proxied through the Cloudflare Worker to keep the API key server-side
const API_BASE_ACCOUNT = '/api';
const API_BASE_MATCH = '/api/riot';
const DDRAGON_VERSION = '14.15.1';

const SOULMATE_MATCHES = [
    {
        champions: ['Xayah', 'Rakan'],
        title: 'The Rebel Lovers',
        description: "The most prominent romantic soulmates in Runeterra. They are fiercely devoted lovers who fight as a pair and complement each other's abilities completely.",
        imageChampion: 'Xayah',
    },
    {
        champions: ['Lucian', 'Senna'],
        title: 'The Sentinels Bond',
        description: "A powerful, married couple of Sentinel warriors who fought to save each other's souls from the undead clutches of the Black Mist.",
        imageChampion: 'Lucian',
    },
    {
        champions: ['Ashe', 'Tryndamere'],
        title: 'The Freljord Vow',
        description: 'A political marriage between Freljordian leaders that organically blossomed into genuine, lifelong love.',
        imageChampion: 'Ashe',
    },
    {
        champions: ['Garen', 'Katarina'],
        title: 'The Forbidden Duel',
        description: 'An ongoing, forbidden Romeo and Juliet dynamic between a Demacian warrior and a Noxian assassin who harbor deep, secret feelings for each other.',
        imageChampion: 'Garen',
    },
];

const CHAMPION_EASTER_EGGS: Record<string, { title: string; description: string }> = {
    Zed: {
        title: 'Living Shadow Protocol',
        description: "Unlike many other champions, Zed's playstyle relies on pure adaptation to a given situation.",
    },
    Yasuo: {
        title: 'The Wind Wall Clause',
        description: 'Your games carry the signature of a duelist who accepts volatility as the price of decisive moments.',
    },
    Teemo: {
        title: 'Scout Code Detected',
        description: 'You like to create map pressure by leaving mushrooms, tempo, and second thoughts in places opponents expected safety.',
    },
    Jhin: {
        title: 'Fourth Shot Finale',
        description: 'Your best moments read like staged executions: patient setup, clean range control, and a final number that matters.',
    },
};

/**
 * Clear all caches (memory + IndexedDB)
 * Useful for testing or when data needs to be refreshed
 */
export function clearCache(): Promise<void> {
    return clearAllCaches();
}
function tagToRegionalHost(tag: string): 'americas' | 'europe' | 'asia' | 'sea' | '' {
    if (!tag) return '';
    const t = tag.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (t.startsWith('BR') || t.startsWith('LA') || t.startsWith('NA') || t.startsWith('OC')) {
        return 'americas';
    }
    if (t.startsWith('EU') || t.startsWith('TR') || t.startsWith('RU')) {
        return 'europe';
    }
    if (t.startsWith('KR') || t.startsWith('JP')) {
        return 'asia';
    }
    if (t.startsWith('PH') || t.startsWith('SG') || t.startsWith('TH') || t.startsWith('TW') || t.startsWith('VN')) {
        return 'sea';
    }
    if (t.startsWith('PBE')) {
        return 'americas';
    }
    console.log('[tagToRegionalHost] No match for tag:', tag, '- returning empty string');
    return '';
}

// Helper function to extract region from match ID in path
function extractRegionFromMatchId(pathname: string): string {
    const matchIdMatch = pathname.match(/\/([A-Z]{2,3}\d?_\d+)$/);
    if (matchIdMatch && matchIdMatch[1]) {
        const matchId = matchIdMatch[1];
        // 提取下划线前的区域前缀
        const regionPrefix = matchId.split('_')[0];
        return tagToRegionalHost(regionPrefix);
    }
    return '';
}

async function apiFetch<T>(url: string, gameName?: string, tagLine?: string, isMatchEndpoint: boolean = false): Promise<T> {
    const response = await fetch(url);
    // Update: ONLY cache region for match endpoints
    // Logic: Check Header -> If missing, Check MatchID in URL -> Set Cache
    if (gameName && tagLine && response.ok && isMatchEndpoint) {
        let regionToUse = response.headers.get('X-Region-Used');
        if (!regionToUse || regionToUse === '') {
            try {
                const urlPath = new URL(url).pathname;
                const derivedRegion = extractRegionFromMatchId(urlPath);
                if (derivedRegion) {
                    regionToUse = derivedRegion;
                    console.log(`[apiFetch] Header missing. Derived region ${regionToUse} from MatchID in URL.`);
                }
            } catch (e) {
                console.error('[apiFetch] Error parsing URL for region extraction', e);
            }
        }
        // 如果拿到了有效的 region (无论是来自 Header 还是 MatchID)，则更新缓存
        if (regionToUse && regionToUse !== '') {
            const validRegions = ['americas', 'europe', 'asia', 'sea'];
            if (validRegions.includes(regionToUse)) {
                await setCachedRegion(gameName, tagLine, regionToUse as 'americas' | 'europe' | 'asia' | 'sea');
                console.log(`[apiFetch] Successfully get Cached region ${regionToUse} for ${gameName}#${tagLine}`);
            }
        }
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        if (response.status === 403) {
            throw new Error("Forbidden: Check your Riot API key.");
        } else if (response.status === 404) {
            throw new Error("Player or match data not found. Please check Summoner Name and Tag.");
        } else if (response.status === 429) {
            throw new Error("Rate limit exceeded, please wait a 10s and try again.");
        } else if (response.status === 500 && errorData.error) {
            throw new Error(errorData.error);
        } else {
            throw new Error(`Riot API request failed: ${response.status} ${response.statusText}`);
        }
    }

    return response.json() as Promise<T>;
}

async function getPuuid(gameName: string, tagLine: string): Promise<string> {
    // Check multi-layer cache first
    const cached = await getCachedPuuid(gameName, tagLine);
    if (cached) {
        return cached;
    }
    // 这里改为 false，Account Endpoint 不再触发 setCachedRegion
    const data = await apiFetch<{ puuid: string }>(`${API_BASE_ACCOUNT}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`, gameName, tagLine, false);
    await setCachedPuuid(gameName, tagLine, data.puuid);

    return data.puuid;
}

async function getMatchIdPage(
    puuid: string,
    gameName: string,
    tagLine: string,
    start: number = 0,
    count: number = 100,
): Promise<{ ids: string[]; hasMore: boolean }> {
    const startOf2026Sec = Math.floor(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000);

    const base = `${API_BASE_MATCH}/lol/match/v5/matches/by-puuid/${puuid}/ids`;
    const params = new URLSearchParams({
        start: String(start),
        count: String(count),
        startTime: String(startOf2026Sec),
    });

    const url = `${base}?${params.toString()}`;
    console.log(`[getMatchIdPage] Fetching page start=${start} count=${count}`);

    const ids = await apiFetch<string[]>(url, gameName, tagLine, false);
    console.log(`[getMatchIdPage] Got ${ids.length} match IDs (start=${start})`);

    return { ids, hasMore: ids.length === count };
}

async function getMatchDetails(matchId: string, gameName: string, tagLine: string): Promise<MatchDto> {
    // Check multi-layer cache first
    const cached = await getCachedMatchDetails<MatchDto>(matchId);
    if (cached) {
        return cached;
    }
    await rateLimiter.waitForAvailability();

    const response = await apiFetch<MatchDto>(`${API_BASE_MATCH}/lol/match/v5/matches/${matchId}`, gameName, tagLine, true);

    await setCachedMatchDetails(matchId, response);

    return response;
}

// --- HELPER: DATA PROCESSING & ANALYSIS ---

export interface AggregatedStats {
    totalGames: number;
    wins: number;
    avgKills: number;
    avgDeaths: number;
    avgAssists: number;
    avgVisionScorePerMin: number;
    avgDamageDealtPerMin: number;
    avgDamageDealtPercentage: number;
    avgGoldPerMin: number;
    queueBreakdown: Record<number, { games: number; wins: number }>; // queueId -> stats
    rankedStats: { games: number; wins: number }; // Ranked 统计
    casualStats: { games: number; wins: number }; // Casual 统计
    championStats: Record<string, {
        games: number;
        wins: number;
        kills: number;
        deaths: number;
        assists: number;
        playstyleAnalyses: string[];
    }>;
}


/**
 * 统一的 match 过滤逻辑
 * 检查 match 是否符合处理条件
 * 
 * 过滤顺序：
 * 1. 基础验证（info, gameType, queueId）
 * 2. 队列类型验证（ALLOWED_QUEUE_IDS）
 * 3. 玩家验证（puuid）
 */
function shouldProcessMatch(
    match: MatchDto,
    puuid: string
): { shouldProcess: boolean; reason?: string; queueId?: number } {
    // 验证 match.info 存在
    if (!match.info) {
        return { shouldProcess: false, reason: 'missing_info' };
    }

    // Skip custom games (queueId 0) and TFT — gameMode is the cleanest signal
    // We intentionally do NOT gate on gameType === "MATCHED_GAME" because Arena
    // and several rotating modes use different gameType values but are valid PvP.
    const gameMode = match.info.gameMode || '';
    if (['TFT', 'TUTORIAL'].includes(gameMode)) {
        return { shouldProcess: false, reason: 'not_lol_game', queueId: match.info.queueId };
    }

    const queueId = match.info.queueId;
    if (queueId === undefined || queueId === null) {
        return { shouldProcess: false, reason: 'missing_queueId' };
    }

    // 只处理允许的队列类型（基础白名单）
    if (!ALLOWED_QUEUE_IDS.includes(queueId)) {
        return { shouldProcess: false, reason: 'queue_not_allowed', queueId };
    }

    // 查找指定玩家的数据
    const player = match.info.participants.find(p => p.puuid === puuid);
    if (!player) {
        return { shouldProcess: false, reason: 'player_not_found', queueId };
    }

    return { shouldProcess: true, queueId };
}

/**
 * 处理单个 match 并更新统计
 */
function processSingleMatch(
    match: MatchDto,
    puuid: string,
    stats: AggregatedStats,
    totals: {
        totalKills: number;
        totalDeaths: number;
        totalAssists: number;
        totalVisionScore: number;
        totalDamage: number;
        totalGold: number;
        totalDuration: number;
        totalTeamDamagePercent: number;
    }
): void {
    const player = match.info!.participants.find(p => p.puuid === puuid)!;

    // 记录 queueId 统计
    if (!stats.queueBreakdown[match.info!.queueId!]) {
        stats.queueBreakdown[match.info!.queueId!] = { games: 0, wins: 0 };
    }
    stats.queueBreakdown[match.info!.queueId!].games++;
    if (player.win) {
        stats.queueBreakdown[match.info!.queueId!].wins++;
    }

    // 区分 Ranked 和 Casual
    if (RANKED_QUEUE_IDS.includes(match.info!.queueId!)) {
        stats.rankedStats.games++;
        if (player.win) stats.rankedStats.wins++;
    } else if (CASUAL_QUEUE_IDS.includes(match.info!.queueId!)) {
        stats.casualStats.games++;
        if (player.win) stats.casualStats.wins++;
    }

    const teamTotalDamage = match.info!.participants
        .filter(p => p.teamId === player.teamId)
        .reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);

    stats.totalGames++;
    if (player.win) stats.wins++;

    const durationInMinutes = player.timePlayed / 60;
    totals.totalDuration += durationInMinutes;

    totals.totalKills += player.kills;
    totals.totalDeaths += player.deaths;
    totals.totalAssists += player.assists;
    totals.totalVisionScore += player.visionScore;
    totals.totalDamage += player.totalDamageDealtToChampions;
    totals.totalGold += player.goldEarned;
    totals.totalTeamDamagePercent += teamTotalDamage > 0 ? (player.totalDamageDealtToChampions / teamTotalDamage) : 0;

    const champName = player.championName === "FiddleSticks" ? "Fiddlesticks" : player.championName;
    if (!stats.championStats[champName]) {
        stats.championStats[champName] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, playstyleAnalyses: [] };
    }
    const champ = stats.championStats[champName];
    champ.games++;
    if (player.win) champ.wins++;
    champ.kills += player.kills;
    champ.deaths += player.deaths;
    champ.assists += player.assists;

    const kda = (player.kills + player.assists) / (player.deaths || 1);
    if (kda > 5 && player.totalDamageDealtToChampions / durationInMinutes > 800) {
        champ.playstyleAnalyses.push("a dominant, high-damage carry performance");
    } else if (player.visionScore / durationInMinutes > 1.8) {
        champ.playstyleAnalyses.push("a vision-focused, controlling style");
    } else if (player.turretTakedowns > 2 && player.damageDealtToBuildings > 5000) {
        champ.playstyleAnalyses.push("an objective-focused, split-pushing style");
    } else if (player.totalHealsOnTeammates > 3000 || player.totalDamageShieldedOnTeammates > 3000) {
        champ.playstyleAnalyses.push("a protective, team-oriented role");
    } else {
        champ.playstyleAnalyses.push("a balanced contribution to the team");
    }
}

/**
 * Layer 1: Fetch - 只负责获取 match details，使用 rate limiter + p-limit 控制并发
 */
async function fetchMatches(
    matchIds: string[],
    gameName: string,
    tagLine: string
): Promise<{ matches: MatchDto[]; errors: number }> {
    console.log(`[fetchMatches] Starting to fetch ${matchIds.length} matches`);

    // 使用 p-limit 控制并发数（5-10 个并发请求）
    const limit = pLimit(8);
    const errors: number[] = [];

    // 并发获取所有 match details，但限制并发数
    const matchPromises = matchIds.map((matchId, index) =>
        limit(async () => {
            try {
                const match = await getMatchDetails(matchId, gameName, tagLine);
                if ((index + 1) % 10 === 0) {
                    const status = rateLimiter.getStatus();
                    console.log(`[fetchMatches] Progress: ${index + 1}/${matchIds.length} | Rate limit: ${status.short.count}/${status.short.limit} (short), ${status.long.count}/${status.long.limit} (long)`);
                }
                return match;
            } catch (error) {
                console.warn(`[fetchMatches] Failed to fetch match ${matchId}:`, error);
                errors.push(1);
                return null;
            }
        })
    );

    // 等待所有请求完成
    const results = await Promise.all(matchPromises);

    // 过滤掉 null（错误情况）
    const matches = results.filter((m): m is MatchDto => m !== null);

    console.log(`[fetchMatches] Completed: ${matches.length} matches fetched, ${errors.length} errors`);

    return { matches, errors: errors.length };
}

/**
 * Layer 2: Filter - 过滤 matches，只保留符合条件的
 */
function filterMatches(
    matches: MatchDto[],
    puuid: string
): { validMatches: MatchDto[]; skipStats: { [key: string]: number } } {
    console.log(`[filterMatches] Filtering ${matches.length} matches`);

    const skipStats: { [key: string]: number } = {};
    const validMatches: MatchDto[] = [];
    const queueIdDistribution: { [queueId: number]: number } = {};

    // 先统计所有 queueId 的分布
    for (const match of matches) {
        if (match.info?.queueId !== undefined && match.info.queueId !== null) {
            queueIdDistribution[match.info.queueId] = (queueIdDistribution[match.info.queueId] || 0) + 1;
        }
    }

    console.log(`[filterMatches] Queue ID distribution:`, Object.entries(queueIdDistribution).map(([qid, count]) => ({
        queueId: Number(qid),
        queueName: QUEUE_NAMES[Number(qid)] || `Queue ${qid}`,
        count,
    })));

    for (const match of matches) {
        const filterResult = shouldProcessMatch(match, puuid);

        if (filterResult.shouldProcess) {
            validMatches.push(match);
        } else {
            const reason = filterResult.reason || 'unknown';
            skipStats[reason] = (skipStats[reason] || 0) + 1;

            // 详细日志：记录被跳过的匹配的 queueId
            if (filterResult.queueId !== undefined) {
                const queueName = QUEUE_NAMES[filterResult.queueId] || `Queue ${filterResult.queueId}`;
                if (!skipStats[`${reason}_details`]) {
                    skipStats[`${reason}_details`] = {} as any;
                }
                const details = skipStats[`${reason}_details`] as any;
                if (!details[filterResult.queueId]) {
                    details[filterResult.queueId] = { queueId: filterResult.queueId, queueName, count: 0 };
                }
                details[filterResult.queueId].count++;
            }
        }
    }

    console.log(`[filterMatches] Filtered: ${validMatches.length} valid matches, skip stats:`, skipStats);

    // 如果 validMatches 为空，提供更详细的诊断信息
    if (validMatches.length === 0 && matches.length > 0) {
        const foundQueueIds = Object.keys(queueIdDistribution).map(Number);
        console.warn(`[filterMatches] WARNING: No valid matches found!`, {
            foundQueueIds,
            foundQueueNames: foundQueueIds.map(q => QUEUE_NAMES[q] || `Queue ${q}`),
            allowedQueueIds: ALLOWED_QUEUE_IDS,
            allowedQueueNames: ALLOWED_QUEUE_IDS.map(q => QUEUE_NAMES[q] || `Queue ${q}`),
            skipStats,
        });
    }

    return { validMatches, skipStats };
}

/**
 * Layer 3: Aggregate - 聚合统计数据
 */
function aggregateMatches(
    matches: MatchDto[],
    puuid: string
): AggregatedStats {
    console.log(`[aggregateMatches] Aggregating ${matches.length} matches`);

    const initialStats: AggregatedStats = {
        totalGames: 0, wins: 0, avgKills: 0, avgDeaths: 0, avgAssists: 0,
        avgVisionScorePerMin: 0, avgDamageDealtPerMin: 0, avgDamageDealtPercentage: 0,
        avgGoldPerMin: 0, queueBreakdown: {},
        rankedStats: { games: 0, wins: 0 },
        casualStats: { games: 0, wins: 0 },
        championStats: {},
    };

    const totals = {
        totalKills: 0,
        totalDeaths: 0,
        totalAssists: 0,
        totalVisionScore: 0,
        totalDamage: 0,
        totalGold: 0,
        totalDuration: 0,
        totalTeamDamagePercent: 0,
    };

    // 顺序处理，避免并发竞争
    for (const match of matches) {
        processSingleMatch(match, puuid, initialStats, totals);
    }

    // 计算平均值
    if (initialStats.totalGames > 0) {
        initialStats.avgKills = totals.totalKills / initialStats.totalGames;
        initialStats.avgDeaths = totals.totalDeaths / initialStats.totalGames;
        initialStats.avgAssists = totals.totalAssists / initialStats.totalGames;
        initialStats.avgVisionScorePerMin = totals.totalVisionScore / totals.totalDuration;
        initialStats.avgDamageDealtPerMin = totals.totalDamage / totals.totalDuration;
        initialStats.avgDamageDealtPercentage = (totals.totalTeamDamagePercent / initialStats.totalGames) * 100;
        initialStats.avgGoldPerMin = totals.totalGold / totals.totalDuration;
    }

    console.log(`[aggregateMatches] Aggregated stats: ${initialStats.totalGames} games processed`);

    return initialStats;
}

/**
 * 三层架构：fetch -> filter -> aggregate
 * 完全解耦，每层职责单一
 */
async function fetchFilterAndAggregateMatches(
    matchIds: string[],
    gameName: string,
    tagLine: string,
    puuid: string
): Promise<{ stats: AggregatedStats; matches: MatchDto[]; skipStats: { [key: string]: number } }> {
    // Layer 1: Fetch - 只负责获取数据，不涉及业务逻辑
    const { matches: allMatches, errors } = await fetchMatches(matchIds, gameName, tagLine);

    // Layer 2: Filter - 只负责过滤，不涉及聚合
    const { validMatches, skipStats } = filterMatches(allMatches, puuid);

    // Layer 3: Aggregate - 只负责聚合，不涉及获取和过滤
    const stats = aggregateMatches(validMatches, puuid);

    // 输出处理统计信息
    console.log('[fetchFilterAndAggregateMatches] Final summary:', {
        totalMatchIds: matchIds.length,
        fetched: allMatches.length,
        fetchErrors: errors,
        validMatches: validMatches.length,
        skipStats,
        rankedStats: {
            games: stats.rankedStats.games,
            wins: stats.rankedStats.wins,
            winRate: stats.rankedStats.games > 0
                ? ((stats.rankedStats.wins / stats.rankedStats.games) * 100).toFixed(1) + '%'
                : 'N/A',
        },
        casualStats: {
            games: stats.casualStats.games,
            wins: stats.casualStats.wins,
            winRate: stats.casualStats.games > 0
                ? ((stats.casualStats.wins / stats.casualStats.games) * 100).toFixed(1) + '%'
                : 'N/A',
        },
        queueBreakdown: Object.entries(stats.queueBreakdown).map(([queueId, queueStats]) => ({
            queueId: Number(queueId),
            queueName: QUEUE_NAMES[Number(queueId)] || `Queue ${queueId}`,
            type: RANKED_QUEUE_IDS.includes(Number(queueId)) ? 'Ranked' : 'Casual',
            games: queueStats.games,
            wins: queueStats.wins,
            winRate: ((queueStats.wins / queueStats.games) * 100).toFixed(1) + '%',
        })),
    });

    return { stats, matches: validMatches, skipStats };
}

function generateAnalysis(
    stats: AggregatedStats,
    matches: MatchDto[],
    puuid: string,
    summonerName: string,
    tag: string
): AnalysisResult {
    // Extract match data for table display
    const matchData: MatchData[] = [];

    for (const match of matches) {
        if (!match.info) continue;
        const gameMode = match.info.gameMode || '';
        if (['TFT', 'TUTORIAL'].includes(gameMode)) continue;
        if (!match.info.queueId || !ALLOWED_QUEUE_IDS.includes(match.info.queueId)) continue;

        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) continue;

        matchData.push({
            matchId: match.metadata.matchId,
            gameEndTimestamp: match.info.gameEndTimestamp,
            queueId: match.info.queueId,
            kills: player.kills,
            deaths: player.deaths,
            assists: player.assists,
            totalMinionsKilled: player.totalMinionsKilled,
            neutralMinionsKilled: player.neutralMinionsKilled,
            totalDamageDealtToChampions: player.totalDamageDealtToChampions,
            goldEarned: player.goldEarned,
            championName: player.championName,
            teamId: player.teamId,
            win: player.win,
            position: player.teamPosition || player.individualPosition,
            visionScore: player.visionScore,
            gameDuration: match.info.gameDuration,
            gameMode: match.info.gameMode,
        });
    }

    // Sort by most recent first
    matchData.sort((a, b) => b.gameEndTimestamp - a.gameEndTimestamp);

    // Calculate aggregated summary
    const totalCS = matchData.reduce((sum, m) => sum + m.totalMinionsKilled, 0);
    const totalNeutralCS = matchData.reduce((sum, m) => sum + m.neutralMinionsKilled, 0);
    const totalDamage = matchData.reduce((sum, m) => sum + m.totalDamageDealtToChampions, 0);
    const totalGold = matchData.reduce((sum, m) => sum + m.goldEarned, 0);
    const totalVision = matchData.reduce((sum, m) => sum + m.visionScore, 0);
    const totalDuration = matchData.reduce((sum, m) => sum + m.gameDuration, 0);
    const wins = matchData.filter(m => m.win).length;

    const aggregatedSummary: AggregatedSummary = {
        totalGames: stats.totalGames,
        wins: wins,
        winRate: stats.totalGames > 0 ? (wins / stats.totalGames) * 100 : 0,
        avgKills: stats.avgKills,
        avgDeaths: stats.avgDeaths,
        avgAssists: stats.avgAssists,
        avgKDA: (stats.avgKills + stats.avgAssists) / (stats.avgDeaths || 1),
        avgCS: stats.totalGames > 0 ? totalCS / stats.totalGames : 0,
        avgTotalCS: stats.totalGames > 0 ? (totalCS + totalNeutralCS) / stats.totalGames : 0,
        avgDamage: stats.totalGames > 0 ? totalDamage / stats.totalGames : 0,
        avgGold: stats.totalGames > 0 ? totalGold / stats.totalGames : 0,
        avgVisionScore: stats.totalGames > 0 ? totalVision / stats.totalGames : 0,
        avgDamagePerMin: stats.avgDamageDealtPerMin,
        avgGoldPerMin: stats.avgGoldPerMin,
    };
    const kda = (stats.avgKills + stats.avgAssists) / (stats.avgDeaths || 1);
    const strengths = [];
    const mbtiHarness = calculateMBTIHarness(matchData);
    const mbti = mbtiHarness.mbtiType;

    // Determine strengths
    if (stats.avgDamageDealtPercentage >= 28) {
        strengths.push({ title: "Teamfight Titan", description: `Dealing ${stats.avgDamageDealtPercentage.toFixed(0)}% of your team's damage, you are their primary threat.`, icon: React.createElement(SwordsIcon, { className: "w-8 h-8 text-[#CDA434]" }) });
    }
    if (stats.avgVisionScorePerMin >= 1.5) {
        strengths.push({ title: "Macro Mastermind", description: `With a vision score of ${stats.avgVisionScorePerMin.toFixed(1)} per minute, you control the map.`, icon: React.createElement(BrainCircuitIcon, { className: "w-8 h-8 text-[#CDA434]" }) });
    }
    if (kda >= 4.0) {
        strengths.push({ title: "Flawless Positioning", description: `Your impressive ${kda.toFixed(1)} KDA shows you know how to deal damage while staying safe.`, icon: React.createElement(ShieldCheckIcon, { className: "w-8 h-8 text-[#CDA434]" }) });
    }
    if (stats.avgGoldPerMin >= 420) {
        strengths.push({ title: "Economic Powerhouse", description: `Earning ${stats.avgGoldPerMin.toFixed(0)} gold per minute, you build an insurmountable lead.`, icon: React.createElement(CrosshairIcon, { className: "w-8 h-8 text-[#CDA434]" }) });
    }
    if (strengths.length < 3) {
        strengths.push({ title: "Adaptable Playmaker", description: "You show flexibility, adapting to the needs of the game to secure victory.", icon: React.createElement(BrainCircuitIcon, { className: "w-8 h-8 text-[#CDA434]" }) });
    }

    const topChampions: ChampionData[] = Object.entries(stats.championStats)
        .sort(([, a], [, b]) => b.games - a.games).slice(0, 3)
        .map(([name, champStats]) => {
            const mostCommonPlaystyle = (champStats.playstyleAnalyses
                .sort((a, b) => champStats.playstyleAnalyses.filter(v => v === a).length - champStats.playstyleAnalyses.filter(v => v === b).length)
                .pop() || "a versatile approach").replace("a ", "").replace("an ", "");
            return {
                name, gamesPlayed: champStats.games,
                winRate: Math.round((champStats.wins / champStats.games) * 100),
                kda: `${(champStats.kills / champStats.games).toFixed(1)} / ${(champStats.deaths / champStats.games).toFixed(1)} / ${(champStats.assists / champStats.games).toFixed(1)}`,
                imageUrl: `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${name}.png`,
                playstyleAnalysis: `Your ${name} is characterized by ${mostCommonPlaystyle}.`
            };
        });

    const roleCounts = matchData.reduce<Record<string, number>>((acc, match) => {
        const role = match.position || 'UNKNOWN';
        acc[role] = (acc[role] || 0) + 1;
        return acc;
    }, {});
    const mostPlayedRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'FILL';
    const recapStats = matches.reduce<RecapStats>((recap, match) => {
        const player = match.info?.participants.find(p => p.puuid === puuid);
        const playerTeam = match.info?.teams.find(team => team.teamId === player?.teamId);
        const objectives = playerTeam?.objectives;
        if (objectives) {
            recap.baronKills += objectives.baron?.kills || 0;
            recap.dragonKills += objectives.dragon?.kills || 0;
            recap.riftHeraldKills += objectives.riftHerald?.kills || 0;
            recap.towerKills += objectives.tower?.kills || 0;
            recap.inhibitorKills += objectives.inhibitor?.kills || 0;
        }
        return recap;
    }, {
        totalTeamObjectives: 0,
        baronKills: 0,
        dragonKills: 0,
        riftHeraldKills: 0,
        towerKills: 0,
        inhibitorKills: 0,
        totalTakedowns: matchData.reduce((sum, m) => sum + m.kills + m.assists, 0),
        shortGames: matchData.filter(m => m.gameDuration < 20 * 60).length,
        championPoolSize: Object.keys(stats.championStats).length,
        mostPlayedRole,
        soulmate: {
            title: 'The Flexible Pair',
            champions: 'Xayah & Rakan',
            description: SOULMATE_MATCHES[0].description,
            matchedBecause: "Your champion pool did not contain a canonical pair, so the recap defaults to League's clearest duo fantasy.",
            imageUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${SOULMATE_MATCHES[0].imageChampion}_0.jpg`,
        },
        easterEggs: [],
    });
    recapStats.totalTeamObjectives = recapStats.baronKills + recapStats.dragonKills + recapStats.riftHeraldKills + recapStats.towerKills + recapStats.inhibitorKills;

    const championNames = new Set(Object.keys(stats.championStats));
    const soulmateMatch = SOULMATE_MATCHES.find(pair => pair.champions.some(champion => championNames.has(champion))) || SOULMATE_MATCHES[0];
    const matchedChampion = soulmateMatch.champions.find(champion => championNames.has(champion));
    recapStats.soulmate = {
        title: soulmateMatch.title,
        champions: soulmateMatch.champions.join(' & '),
        description: soulmateMatch.description,
        matchedBecause: matchedChampion
            ? `Matched because ${matchedChampion} appears in your champion pool.`
            : 'Matched as a featured Runeterra soulmate pair for your recap.',
        imageUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${soulmateMatch.imageChampion}_0.jpg`,
    };
    recapStats.easterEggs = Object.keys(CHAMPION_EASTER_EGGS)
        .filter(champion => championNames.has(champion))
        .map(champion => ({
            champion,
            ...CHAMPION_EASTER_EGGS[champion],
            imageUrl: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion}_0.jpg`,
        }));

    const archetypeMap: Record<string, { title: string, description: string }> = {
        'ENTJ': { title: "The Field Marshal", description: "A natural leader who commands the rift with strategic prowess and decisive action. You see the path to victory and rally your team to follow it." },
        'INTJ': { title: "The Grandmaster", description: "A strategic visionary who outthinks the opponent. Your game is a complex chess match, and you're always five moves ahead." },
        'ESTP': { title: "The Glorious Executioner", description: "An adrenaline junkie who thrives in the chaos of battle. You live for the outplay, turning skirmishes into a highlight reel." },
        'ISTP': { title: "The Blade Master", description: "A mechanical virtuoso with lightning-fast reflexes. You excel in duels, dissecting opponents with cold, calculated precision." },
        'ENFP': { title: "The Spark of Demacia", description: "An inspirational and creative force. You find unconventional paths to victory and energize your teammates with your optimistic plays." },
        'INFP': { title: "The Dream Weaver", description: "A quiet but powerful playmaker who supports the team's dream. Your timely interventions and selfless plays are the unsung key to victory." },
        'ESFJ': { title: "The Warden", description: "A protector at heart, you excel at enabling your teammates and shielding them from harm. Your presence ensures the team's core is safe." },
        'ISFJ': { title: "The Unbreakable Shield", description: "A reliable and steadfast defender, you are the rock of your team. You consistently sacrifice for the greater good." },
    };

    const randomArchetype = { title: "The Unseen Threat", description: "Your playstyle is a unique blend of strategies that keeps enemies guessing. You are an unpredictable and formidable force on the Rift." };
    const archetypeDetails = archetypeMap[mbti] || randomArchetype;

    return {
        summonerName, tag,
        archetype: {
            title: archetypeDetails.title, mbti, description: archetypeDetails.description,
            imageUrl: topChampions.length > 0 ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${topChampions[0].name}_0.jpg` : 'https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Fiddlesticks_0.jpg'
        },
        strengths: strengths.slice(0, 3),
        growthCurve: [
            { month: "Jan", winRate: 52, kda: 3.8 }, { month: "Feb", winRate: 55, kda: 4.1 },
            { month: "Mar", winRate: 54, kda: 4.0 }, { month: "Apr", winRate: 58, kda: 4.5 },
            { month: "May", winRate: 62, kda: 5.1 }, { month: "Jun", winRate: 60, kda: 4.9 },
        ],
        topChampions,
        matchData,
        aggregatedSummary,
        recapStats,
        mbtiDetails: mbtiHarness,
        aiInsights: {
            playstyle: 'Narrative loading...',
            strengths: [],
            growthAreas: [],
            prediction: 'Narrative loading...',
        },
    };
}

/**
 * Progressive analysis handle — allows incremental loading of more matches.
 */
export interface AnalysisHandle {
    result: AnalysisResult;
    loadedMatchCount: number;
    totalMatchIdsFound: number;
    hasMore: boolean;
    /** Fetch the next page of matches, merge, and return updated result. Returns null if no more. */
    loadMore: () => Promise<AnalysisResult | null>;
}

// --- MAIN EXPORTED FUNCTION (progressive) ---
export const analyzePlayerProgressive = async (
    summonerNameWithTag: string
): Promise<AnalysisHandle> => {
    const [gameName, tagLine] = summonerNameWithTag.split('#');
    if (!gameName || !tagLine) {
        throw new Error("Invalid format. Please use 'Summoner Name#Tag'.");
    }

    const puuid = await getPuuid(gameName, tagLine);
    console.log('[analyzePlayer] Resolved PUUID:', puuid, 'for', summonerNameWithTag);

    // State accumulated across pages
    let allValidMatches: MatchDto[] = [];
    let currentStart = 0;
    let hasMore = true;
    const PAGE_SIZE = 100;

    // Fetch first page
    const firstPage = await getMatchIdPage(puuid, gameName, tagLine, 0, PAGE_SIZE);
    if (firstPage.ids.length === 0) {
        throw new Error('No recent matches found for 2026. Try a different time range.');
    }
    hasMore = firstPage.hasMore;
    currentStart = firstPage.ids.length;

    // Fetch, filter, aggregate first page
    const { stats, matches: validMatches, skipStats } = await fetchFilterAndAggregateMatches(
        firstPage.ids, gameName, tagLine, puuid
    );
    allValidMatches = validMatches;

    console.log('[analyzePlayer] First page processed:', {
        totalFetched: firstPage.ids.length,
        validMatches: stats.totalGames,
        hasMore,
        skipStats,
    });

    if (stats.totalGames < 5) {
        const skipDetails = Object.entries(skipStats)
            .map(([reason, count]) => `${reason}: ${count}`)
            .join(', ');
        throw new Error(
            `Only found ${stats.totalGames} valid matches (min 5 required). ` +
            `Skipped: ${skipDetails}. ` +
            `Total matches fetched: ${firstPage.ids.length}.`
        );
    }

    // Build the initial analysis result
    const buildResult = async (aggregatedStats: AggregatedStats, matches: MatchDto[]): Promise<AnalysisResult> => {
        const analysis = generateAnalysis(aggregatedStats, matches, puuid, gameName, tagLine);

        const roleDistribution = analysis.matchData.reduce<Record<string, number>>((acc, m) => {
            acc[m.position || 'UNKNOWN'] = (acc[m.position || 'UNKNOWN'] || 0) + 1;
            return acc;
        }, {});
        const topChampionRoles = analysis.matchData
            .slice(0, 30)
            .map(m => `${m.championName}:${m.position || 'UNKNOWN'}`);

        let winStreak = 0;
        let lossStreak = 0;
        let currentWin = 0;
        let currentLoss = 0;
        for (const m of [...analysis.matchData].reverse()) {
            if (m.win) {
                currentWin++;
                currentLoss = 0;
                winStreak = Math.max(winStreak, currentWin);
            } else {
                currentLoss++;
                currentWin = 0;
                lossStreak = Math.max(lossStreak, currentLoss);
            }
        }
        const monthlyData = analysis.growthCurve;
        const playstylePatterns = [
            `Avg DPM ${aggregatedStats.avgDamageDealtPerMin.toFixed(0)}`,
            `Avg VPM ${aggregatedStats.avgVisionScorePerMin.toFixed(2)}`,
            `Champion pool ${Object.keys(aggregatedStats.championStats).length}`,
        ];
        const playerId = `${gameName}#${tagLine}`;
        analysis.aiInsights = await generateAIInsights(aggregatedStats, monthlyData, playerId, {
            roleDistribution,
            topChampionRoles,
            winStreak,
            lossStreak,
            playstylePatterns,
        });
        return analysis;
    };

    const initialResult = await buildResult(stats, allValidMatches);

    // Build the loadMore closure
    const loadMore = async (): Promise<AnalysisResult | null> => {
        if (!hasMore) return null;

        console.log(`[loadMore] Fetching next page at start=${currentStart}`);
        const page = await getMatchIdPage(puuid, gameName, tagLine, currentStart, PAGE_SIZE);
        if (page.ids.length === 0) {
            hasMore = false;
            return null;
        }
        hasMore = page.hasMore;
        currentStart += page.ids.length;

        // Fetch + filter the new page
        const { matches: newValid } = await fetchFilterAndAggregateMatches(
            page.ids, gameName, tagLine, puuid
        );

        // Merge with accumulated matches
        allValidMatches = [...allValidMatches, ...newValid];

        // Re-aggregate everything from scratch (fast, it's just in-memory number crunching)
        const mergedStats = aggregateMatches(allValidMatches, puuid);
        const updatedResult = await buildResult(mergedStats, allValidMatches);

        console.log(`[loadMore] Updated: ${allValidMatches.length} total valid matches, hasMore=${hasMore}`);
        return updatedResult;
    };

    return {
        result: initialResult,
        loadedMatchCount: allValidMatches.length,
        totalMatchIdsFound: firstPage.ids.length,
        hasMore,
        loadMore,
    };
};

// --- BACKWARD-COMPAT WRAPPER ---
export const analyzePlayer = async (
    summonerNameWithTag: string
): Promise<AnalysisResult> => {
    const handle = await analyzePlayerProgressive(summonerNameWithTag);
    return handle.result;
};
