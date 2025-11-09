
import React from 'react';
import type { AnalysisResult, ChampionData } from '../types';
import type { MatchDto } from '../types/riotApiTypes';
import { BrainCircuitIcon, CrosshairIcon, ShieldCheckIcon, SwordsIcon } from '../components/icons';

// API requests are proxied through the Cloudflare Worker to keep the API key server-side
const API_BASE_ACCOUNT = '/api/riot';
const API_BASE_MATCH = '/api/riot';
const DDRAGON_VERSION = '14.15.1';

// --- HELPER: API FETCHING ---
async function apiFetch<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 403) throw new Error("Forbidden: Check your Riot API key.");
        if (response.status === 404) throw new Error("Player or match data not found. Please check Summoner Name and Tag.");
        if (response.status === 500 && errorData.error) {
            throw new Error(errorData.error);
        }
        throw new Error(`Riot API request failed: ${response.status} ${response.statusText}`);
    }
    return response.json() as Promise<T>;
}

async function getPuuid(gameName: string, tagLine: string): Promise<string> {
    // Pass the routing tagline so Worker can choose the nearest regional cluster
    const data = await apiFetch<{ puuid: string }>(`${API_BASE_ACCOUNT}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}?tag=${encodeURIComponent(tagLine)}`);
    return data.puuid;
}

async function getMatchIds(puuid: string, tagLine: string, queueId?: number): Promise<string[]> {
    // Query only matches in 2025. Keep the tag so the Worker can route correctly.
    const startOf2025Sec = Math.floor(Date.UTC(2025, 0, 1, 0, 0, 0) / 1000);

    const base = `${API_BASE_MATCH}/lol/match/v5/matches/by-puuid/${puuid}/ids`;
    const params = new URLSearchParams({
        start: '0',
        count: '20',
        startTime: String(startOf2025Sec),
        tag: tagLine,
    });
    
    // Filter by queueId if provided (420 = Ranked Solo/Duo, 440 = Ranked Flex)
    if (queueId !== undefined) {
        params.set('queue', String(queueId));
    }
    
    const url = `${base}?${params.toString()}`;
    console.log('[getMatchIds] params', Object.fromEntries(params.entries()));
    return apiFetch<string[]>(url);
}

async function getMatchDetails(matchId: string, tagLine: string): Promise<MatchDto> {
    return apiFetch<MatchDto>(`${API_BASE_MATCH}/lol/match/v5/matches/${matchId}?tag=${encodeURIComponent(tagLine)}`);
}

// --- HELPER: DATA PROCESSING & ANALYSIS ---

interface AggregatedStats {
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
 * Queue ID 映射表 - 只处理指定的 5 种队列类型
 */
const QUEUE_NAMES: Record<number, string> = {
    400: '5v5 Draft Pick games',
    420: '5v5 Ranked Solo games',
    430: '5v5 Blind Pick games',
    440: '5v5 Ranked Flex games',
    450: '5v5 ARAM games',
};

/**
 * Ranked 队列 ID
 */
const RANKED_QUEUE_IDS = [420, 440];

/**
 * Casual 队列 ID
 */
const CASUAL_QUEUE_IDS = [400, 430, 450];

/**
 * 所有允许的队列 ID
 */
const ALLOWED_QUEUE_IDS = [...RANKED_QUEUE_IDS, ...CASUAL_QUEUE_IDS];

function processMatches(matches: MatchDto[], puuid: string, allowedQueueIds?: number[]): AggregatedStats {
    const initialStats: AggregatedStats = {
        totalGames: 0, wins: 0, avgKills: 0, avgDeaths: 0, avgAssists: 0,
        avgVisionScorePerMin: 0, avgDamageDealtPerMin: 0, avgDamageDealtPercentage: 0,
        avgGoldPerMin: 0, queueBreakdown: {}, 
        rankedStats: { games: 0, wins: 0 },
        casualStats: { games: 0, wins: 0 },
        championStats: {},
    };

    let totalKills = 0, totalDeaths = 0, totalAssists = 0, totalVisionScore = 0,
        totalDamage = 0, totalGold = 0, totalDuration = 0, totalTeamDamagePercent = 0;

    let skippedByGameType = 0;
    let skippedByQueue = 0;
    let skippedByPlayer = 0;
    let processedCount = 0;

    for (const match of matches) {
        // 验证 match.info 存在
        if (!match.info) {
            console.warn('[processMatches] Skipping match with missing info:', match.metadata?.matchId);
            continue;
        }

        // 只处理 MATCHED_GAME 类型
        if (match.info.gameType !== "MATCHED_GAME") {
            skippedByGameType++;
            continue;
        }

        // 验证 queueId 存在    
        if (match.info.queueId === undefined || match.info.queueId === null) {
            console.warn('[processMatches] Skipping match with missing queueId:', match.metadata?.matchId);
            continue;
        }

        // 只处理允许的队列类型
        if (!ALLOWED_QUEUE_IDS.includes(match.info.queueId)) {
            skippedByQueue++;
            continue;
        }

        // 如果指定了允许的 queueId，进行进一步过滤
        if (allowedQueueIds && !allowedQueueIds.includes(match.info.queueId)) {
            skippedByQueue++;
            continue;
        }

        // 查找指定玩家的数据
        const player = match.info.participants.find(p => p.puuid === puuid);
        if (!player) {
            skippedByPlayer++;
            console.warn(`[processMatches] Player ${puuid} not found in match ${match.metadata?.matchId}`);
            continue;
        }

        // 记录 queueId 统计
        if (!initialStats.queueBreakdown[match.info.queueId]) {
            initialStats.queueBreakdown[match.info.queueId] = { games: 0, wins: 0 };
        }
        initialStats.queueBreakdown[match.info.queueId].games++;
        if (player.win) {
            initialStats.queueBreakdown[match.info.queueId].wins++;
        }

        // 区分 Ranked 和 Casual
        if (RANKED_QUEUE_IDS.includes(match.info.queueId)) {
            initialStats.rankedStats.games++;
            if (player.win) initialStats.rankedStats.wins++;
        } else if (CASUAL_QUEUE_IDS.includes(match.info.queueId)) {
            initialStats.casualStats.games++;
            if (player.win) initialStats.casualStats.wins++;
        }

        processedCount++;
        
        const teamTotalDamage = match.info.participants
            .filter(p => p.teamId === player.teamId)
            .reduce((sum, p) => sum + p.totalDamageDealtToChampions, 0);

        initialStats.totalGames++;
        if (player.win) initialStats.wins++;

        const durationInMinutes = player.timePlayed / 60;
        totalDuration += durationInMinutes;

        totalKills += player.kills;
        totalDeaths += player.deaths;
        totalAssists += player.assists;
        totalVisionScore += player.visionScore;
        totalDamage += player.totalDamageDealtToChampions;
        totalGold += player.goldEarned;
        totalTeamDamagePercent += teamTotalDamage > 0 ? (player.totalDamageDealtToChampions / teamTotalDamage) : 0;

        const champName = player.championName === "FiddleSticks" ? "Fiddlesticks" : player.championName;
        if (!initialStats.championStats[champName]) {
            initialStats.championStats[champName] = { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0, playstyleAnalyses: [] };
        }
        const champ = initialStats.championStats[champName];
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

    // 计算平均值
    if (initialStats.totalGames > 0) {
        initialStats.avgKills = totalKills / initialStats.totalGames;
        initialStats.avgDeaths = totalDeaths / initialStats.totalGames;
        initialStats.avgAssists = totalAssists / initialStats.totalGames;
        initialStats.avgVisionScorePerMin = totalVisionScore / totalDuration;
        initialStats.avgDamageDealtPerMin = totalDamage / totalDuration;
        initialStats.avgDamageDealtPercentage = (totalTeamDamagePercent / initialStats.totalGames) * 100;
        initialStats.avgGoldPerMin = totalGold / totalDuration;
    }

    // 输出处理统计信息
    console.log('[processMatches] Processing summary:', {
        totalMatches: matches.length,
        processed: processedCount,
        skippedByGameType,
        skippedByQueue,
        skippedByPlayer,
        rankedStats: {
            games: initialStats.rankedStats.games,
            wins: initialStats.rankedStats.wins,
            winRate: initialStats.rankedStats.games > 0 
                ? ((initialStats.rankedStats.wins / initialStats.rankedStats.games) * 100).toFixed(1) + '%'
                : 'N/A',
        },
        casualStats: {
            games: initialStats.casualStats.games,
            wins: initialStats.casualStats.wins,
            winRate: initialStats.casualStats.games > 0
                ? ((initialStats.casualStats.wins / initialStats.casualStats.games) * 100).toFixed(1) + '%'
                : 'N/A',
        },
        queueBreakdown: Object.entries(initialStats.queueBreakdown).map(([queueId, stats]) => ({
            queueId: Number(queueId),
            queueName: QUEUE_NAMES[Number(queueId)] || `Queue ${queueId}`,
            type: RANKED_QUEUE_IDS.includes(Number(queueId)) ? 'Ranked' : 'Casual',
            games: stats.games,
            wins: stats.wins,
            winRate: ((stats.wins / stats.games) * 100).toFixed(1) + '%',
        })),
    });

    return initialStats;
}

function generateAnalysis(stats: AggregatedStats, summonerName: string, tag: string): AnalysisResult {
    const kda = (stats.avgKills + stats.avgAssists) / (stats.avgDeaths || 1);
    const strengths = [];
    
    // Score-based MBTI determination TODO: improve this
    let scores = { E: 0, I: 0, N: 0, S: 0, T: 0, F: 0, J: 0, P: 0 };
    if (stats.avgDamageDealtPercentage > 28) scores.E++; else scores.I++;
    if (stats.avgKills > 7) scores.E++; else scores.I++;
    
    if (stats.avgVisionScorePerMin > 1.5) scores.N++; else scores.S++;
    if (stats.avgAssists > 8) scores.N++; else scores.S++;

    if (kda > 4.0) scores.T++; else scores.F++;
    if (stats.avgDeaths < 5) scores.T++; else scores.F++;

    if (stats.avgGoldPerMin > 420) scores.J++; else scores.P++;
    if (stats.avgKills / (stats.totalGames || 1) < 0.5) scores.J++; else scores.P++;

    const mbti = `${scores.E > scores.I ? 'E' : 'I'}${scores.N > scores.S ? 'N' : 'S'}${scores.T > scores.F ? 'T' : 'F'}${scores.J > scores.P ? 'J' : 'P'}`;

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

    const archetypeMap: Record<string, { title: string, description: string }> = {
        'ENTJ': { title: "The Field Marshal", description: "A natural leader who commands the rift with strategic prowess and decisive action. You see the path to victory and rally your team to follow it." },
        'INTJ': { title: "The Grandmaster", description: "A strategic visionary who outthinks the opponent. Your game is a complex chess match, and you're always five moves ahead."},
        'ESTP': { title: "The Glorious Executioner", description: "An adrenaline junkie who thrives in the chaos of battle. You live for the outplay, turning skirmishes into a highlight reel."},
        'ISTP': { title: "The Blade Master", description: "A mechanical virtuoso with lightning-fast reflexes. You excel in duels, dissecting opponents with cold, calculated precision."},
        'ENFP': { title: "The Spark of Demacia", description: "An inspirational and creative force. You find unconventional paths to victory and energize your teammates with your optimistic plays."},
        'INFP': { title: "The Dream Weaver", description: "A quiet but powerful playmaker who supports the team's dream. Your timely interventions and selfless plays are the unsung key to victory."},
        'ESFJ': { title: "The Warden", description: "A protector at heart, you excel at enabling your teammates and shielding them from harm. Your presence ensures the team's core is safe."},
        'ISFJ': { title: "The Unbreakable Shield", description: "A reliable and steadfast defender, you are the rock of your team. You consistently sacrifice for the greater good."},
    };
    
    const randomArchetype = { title: "The Unseen Threat", description: "Your playstyle is a unique blend of strategies that keeps enemies guessing. You are an unpredictable and formidable force on the Rift."};
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
    };
}

// --- MAIN EXPORTED FUNCTION ---
export const analyzePlayer = async (
    summonerNameWithTag: string,
    options?: { queueId?: number; allowedQueueIds?: number[] }
): Promise<AnalysisResult> => {
    const [gameName, tagLine] = summonerNameWithTag.split('#');
    if (!gameName || !tagLine) {
        throw new Error("Invalid format. Please use 'Summoner Name#Tag'.");
    }

    const puuid = await getPuuid(gameName, tagLine);
    console.log('[analyzePlayer] Resolved PUUID:', puuid, 'for', summonerNameWithTag);

    // 默认只获取 Ranked Solo/Duo (420)，但允许自定义
    const queueId = options?.queueId ?? 420;
    const matchIds = await getMatchIds(puuid, tagLine, queueId);
    console.log('[analyzePlayer] Found match IDs:', matchIds.length, matchIds);
    
    if (matchIds.length < 5) {
        throw new Error(`Not enough recent matches found (${matchIds.length} found, min 5 required). Try a different queue type or time range.`);
    }

    const matchPromises = matchIds.map(id => getMatchDetails(id, tagLine));
    const matches = await Promise.all(matchPromises);
    console.log('[analyzePlayer] Fetched match details:', matches.length);

    // 默认只处理 Ranked Solo/Duo (420)，但允许自定义
    const allowedQueueIds = options?.allowedQueueIds ?? [420];
    const aggregatedStats = processMatches(matches, puuid, allowedQueueIds);
    
    if (aggregatedStats.totalGames < 5) {
        const queueInfo = allowedQueueIds.map(q => QUEUE_NAMES[q] || `Queue ${q}`).join(', ');
        throw new Error(
            `Only found ${aggregatedStats.totalGames} valid matches in ${queueInfo} (min 5 required). ` +
            `Skipped: ${matches.length - aggregatedStats.totalGames} matches.`
        );
    }
    
    return generateAnalysis(aggregatedStats, gameName, tagLine);
};
