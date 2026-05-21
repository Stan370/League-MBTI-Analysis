
// A simplified version of the Riot API Match-v5 DTO
// Based on the provided JSON and common usage

export interface MatchDto {
    metadata: MetadataDto;
    info: InfoDto;
}

export interface MetadataDto {
    matchId: string;
    participants: string[]; // List of PUUIDs
}

export interface InfoDto {
    gameDuration: number;
    gameEndTimestamp: number;
    gameMode: string;
    gameType?: string;
    queueId: number; // 420 = Ranked Solo/Duo, 440 = Ranked Flex, etc.
    participants: ParticipantDto[];
    teams: TeamDto[];
}

export interface ParticipantDto {
    assists: number;
    championName: string;
    deaths: number;
    goldEarned: number;
    individualPosition: string; // "TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"
    kills: number;
    lane: string;
    puuid: string;
    riotIdGameName: string;
    riotIdTagline: string;
    teamId: number;
    teamPosition: string;
    timePlayed: number;
    totalDamageDealtToChampions: number;
    totalDamageShieldedOnTeammates: number;
    totalHeal: number;
    totalHealsOnTeammates: number;
    totalMinionsKilled: number;
    neutralMinionsKilled: number;
    turretKills: number;
    turretTakedowns: number;
    damageDealtToBuildings: number;
    visionScore: number;
    wardsKilled: number;
    wardsPlaced: number;
    win: boolean;
}

export interface TeamDto {
    teamId: number;
    win: boolean;
    objectives: ObjectivesDto;
}

export interface ObjectivesDto {
    baron: ObjectiveDto;
    champion: ObjectiveDto;
    dragon: ObjectiveDto;
    inhibitor: ObjectiveDto;
    riftHerald: ObjectiveDto;
    tower: ObjectiveDto;
}

export interface ObjectiveDto {
    first: boolean;
    kills: number;
}

// Queue ID constants
/**
 * Queue ID to name mapping — sourced from Riot's static queues.json.
 * Covers all actively-used queues as of 2025.
 */
export const QUEUE_NAMES: Record<number, string> = {
    // ── Standard modes ──────────────────────────
    400: 'Draft Pick',
    420: 'Ranked Solo/Duo',
    430: 'Blind Pick',
    440: 'Ranked Flex',
    450: 'ARAM',
    480: 'Swiftplay',
    490: 'Quickplay',
    // ── Competitive ─────────────────────────────
    700: 'Clash',
    720: 'ARAM Clash',
    // ── Rotating / Special ──────────────────────
    900: 'ARURF',
    1010: 'Snow ARURF',
    1020: 'One for All',
    1300: 'Nexus Blitz',
    1400: 'Ultimate Spellbook',
    1900: 'Pick URF',
    2300: 'Brawl',
    2400: 'ARAM: Mayhem',
    // ── Arena (2v2v2v2) ──────────────────────────
    1700: 'Arena',
    1710: 'Arena (16-player)',
    // ── Co-op vs AI ──────────────────────────────
    870: 'Co-op vs AI (Intro)',
    880: 'Co-op vs AI (Beginner)',
    890: 'Co-op vs AI (Intermediate)',
};

/**
 * Ranked queue IDs
 */
export const RANKED_QUEUE_IDS: number[] = [420, 440];

/**
 * Casual / non-ranked queue IDs.
 * Includes all standard, rotating, special, competitive, and AI modes.
 */
export const CASUAL_QUEUE_IDS: number[] = [
    // Standard
    400, 430, 450, 480, 490,
    // Competitive
    700, 720,
    // Rotating / Special
    900, 1010, 1020, 1300, 1400, 1900, 2300, 2400,
    // Arena
    1700, 1710,
    // Co-op vs AI
    870, 880, 890,
];

/**
 * All allowed queue IDs (ranked + casual).
 * Any match with a queueId not in this list is skipped during analysis.
 */
export const ALLOWED_QUEUE_IDS: number[] = [...RANKED_QUEUE_IDS, ...CASUAL_QUEUE_IDS];

