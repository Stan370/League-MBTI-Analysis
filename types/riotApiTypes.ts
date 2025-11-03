
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
