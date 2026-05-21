
import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import type { AnalysisResult } from '../types';
import GrowthChart from './GrowthChart';
import { QUEUE_NAMES, RANKED_QUEUE_IDS } from '../types/riotApiTypes';

// ---------------------------------------------------------------------------
// MBTI Storytelling — personalized, data-driven narrative for each dimension
// ---------------------------------------------------------------------------

/** Build a paragraph explaining WHY each MBTI letter was chosen, grounded in real stats */
function buildMBTIDimensionStory(
  letter: string,
  pair: 'EI' | 'SN' | 'TF' | 'JP',
  margin: number,
  metrics: AnalysisResult['mbtiDetails']['metrics'],
): { label: string; chosen: string; because: string; stat: string } {
  const strength = Math.abs(margin) > 0.6 ? 'strongly' : Math.abs(margin) > 0.25 ? 'clearly' : 'slightly';

  switch (pair) {
    case 'EI':
      return letter === 'E'
        ? { label: 'Extrovert', chosen: 'E', because: `You ${strength} lean team-oriented — averaging ${metrics.assistsPerGame.toFixed(1)} assists/game and ${metrics.visionPerMin.toFixed(2)} vision/min shows you thrive in the teamfight chaos and live to set up plays for others.`, stat: `${metrics.assistsPerGame.toFixed(1)} assists/game` }
        : { label: 'Introvert', chosen: 'I', because: `You ${strength} lean self-reliant — averaging ${metrics.killsPerGame.toFixed(1)} kills/game with ${metrics.damagePerMin.toFixed(0)} DPM, you prefer farming your lead and carrying through individual dominance over group plays.`, stat: `${metrics.killsPerGame.toFixed(1)} kills/game` };
    case 'SN':
      return letter === 'S'
        ? { label: 'Sensing', chosen: 'S', because: `Your ${metrics.kda.toFixed(2)} KDA and ${metrics.deathsPerGame.toFixed(1)} deaths/game tell us you're a calculated player — you rarely overcommit and prefer consistent, stable execution over coin-flip plays.`, stat: `${metrics.kda.toFixed(2)} KDA` }
        : { label: 'Intuitive', chosen: 'N', because: `With ${metrics.deathsPerGame.toFixed(1)} deaths/game and ${metrics.damagePerMin.toFixed(0)} DPM, you're willing to trade your safety for big moments — high-risk, high-reward is your language.`, stat: `${metrics.damagePerMin.toFixed(0)} DPM` };
    case 'TF':
      return letter === 'T'
        ? { label: 'Thinking', chosen: 'T', because: `${metrics.damagePerMin.toFixed(0)} DPM and ${metrics.goldPerMin.toFixed(0)} gold/min — you treat the game as an efficiency puzzle: maximize resources, maximize output, emotion second.`, stat: `${metrics.goldPerMin.toFixed(0)} gold/min` }
        : { label: 'Feeling', chosen: 'F', because: `${metrics.visionPerMin.toFixed(2)} vision/min and a ${(metrics.supportRate * 100).toFixed(0)}% support-role rate reveal your instinct to protect and enable your teammates, even at the cost of personal stats.`, stat: `${metrics.visionPerMin.toFixed(2)} vision/min` };
    case 'JP':
      return letter === 'J'
        ? { label: 'Judging', chosen: 'J', because: `Your champion pool ratio of ${metrics.championPoolRatio.toFixed(2)} and focused role selection say you believe in mastery over breadth — pick the plan, execute the plan.`, stat: `${metrics.championPoolRatio.toFixed(2)} pool ratio` }
        : { label: 'Perceiving', chosen: 'P', because: `A ${metrics.championPoolRatio.toFixed(2)} champion pool ratio and ${metrics.roleDiversityRatio.toFixed(2)} role diversity — you adapt to whatever the team needs. No two games look the same.`, stat: `${metrics.roleDiversityRatio.toFixed(2)} role diversity` };
  }
}

/** Build a one-liner about their preferred game mode and how it reflects personality */
function buildGameModePersonality(matchData: AnalysisResult['matchData']): string {
  const modeCounts: Record<string, number> = {};
  for (const m of matchData) {
    const name = QUEUE_NAMES[m.queueId] || `Queue ${m.queueId}`;
    modeCounts[name] = (modeCounts[name] || 0) + 1;
  }
  const sorted = Object.entries(modeCounts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return '';
  const [topMode, topCount] = sorted[0];
  const pct = ((topCount / matchData.length) * 100).toFixed(0);

  const modeVibes: Record<string, string> = {
    'Ranked Solo/Duo': 'You compete where it counts — the ranked ladder is your proving ground.',
    'ARAM': "You're here for the brawl. Non-stop action, zero downtime, maximum chaos.",
    'Arena': 'Arena is your playground — quick rounds, constant fighting, and creative builds.',
    'Arena (16-player)': 'You thrive in the largest Arena lobbies where every round is a surprise.',
    'Quickplay': 'Quickplay is your comfort zone — hop in, play your main, no strings attached.',
    'Ranked Flex': 'Flex queue says you like the ranked stakes but prefer playing with friends.',
    'Draft Pick': 'Draft pick shows you value strategy and preparation before the game even starts.',
    'Blind Pick': 'Blind pick? You want action NOW. No bans, no waiting, just go.',
    'ARURF': 'URF mode — you play League to press buttons as fast as humanly possible.',
    'Pick URF': 'Pick URF — max speed, max damage, zero chill. This is your happy place.',
    'One for All': 'One for All — you enjoy the memes and the unique chaos of 5 of the same champion.',
    'Clash': 'Clash tournaments show you take coordinated competitive play seriously.',
    'Swiftplay': 'Swiftplay — you want the Summoner\'s Rift experience, just... faster.',
  };

  const vibe = modeVibes[topMode] || `Your go-to mode is ${topMode}.`;
  return `This year you have played ${matchData.length} games, and ${pct}% of them were ${topMode}. ${vibe}`;
}


interface ResultsPageProps {
  analysis: AnalysisResult;
  onReset: () => void;
  reportId?: string | null;
  hasMore?: boolean;
  loadedMatchCount?: number;
  onLoadMore?: () => Promise<void>;
}

const Section: React.FC<{ title: string; children: React.ReactNode; className?: string; open?: boolean }> = ({ title, children, className = '', open = false }) => (
  <div className={`w-full max-w-9xl mx-auto py-14 md:py-16 px-4 md:px-8 mb-10 ${open ? '' : 'panel-ambient backdrop-blur-md'} ${className}`}>
    <h2 className="font-rajdhani text-4xl md:text-5xl font-bold italic text-center md:text-left mb-10 uppercase tracking-[0.18em] text-gold-gradient text-glow-gold">{title}</h2>
    {children}
  </div>
);

const cardBase = 'panel-ambient p-6 backdrop-blur-md';
const statValue = 'font-mono font-semibold tracking-normal text-glow-cyan';

const ResultsPage: React.FC<ResultsPageProps> = ({ analysis, onReset, reportId, hasMore = false, loadedMatchCount, onLoadMore }) => {
  const [shareCopied, setShareCopied] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const handleShare = async () => {
    const shareUrl = reportId
      ? `${window.location.origin}/report/${reportId}`
      : window.location.href;

    // Try Web Share API first (mobile)
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${analysis.summonerName} — ${analysis.archetype.title} (${analysis.archetype.mbti})`,
          text: `Check out my League MBTI personality!`,
          url: shareUrl,
        });
        return;
      } catch {
        // User cancelled or API not supported, fall through to clipboard
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2500);
    } catch {
      // Last resort: prompt
      window.prompt('Copy this link:', shareUrl);
    }
  };

  // ---------------------------------------------------------------------------
  // Share card as downloadable image (native Canvas 2D — no deps)
  // ---------------------------------------------------------------------------
  const shareCardRef = useRef<HTMLDivElement>(null);
  const [downloadingCard, setDownloadingCard] = useState<'mbti' | 'year' | null>(null);

  const handleDownloadMBTI = useCallback(async () => {
    setDownloadingCard('mbti');
    try {
      const { renderMBTICard } = await import('../services/shareCardRenderer');
      await renderMBTICard(analysis);
    } catch (err) {
      console.warn('[ShareCard] Failed to generate MBTI card:', err);
      alert('Failed to generate image. Please try again.');
    } finally {
      setDownloadingCard(null);
    }
  }, [analysis]);

  const handleDownloadYear = useCallback(async () => {
    setDownloadingCard('year');
    try {
      const { renderYearCard } = await import('../services/shareCardRenderer');
      await renderYearCard(analysis);
    } catch (err) {
      console.warn('[ShareCard] Failed to generate Year card:', err);
      alert('Failed to generate image. Please try again.');
    } finally {
      setDownloadingCard(null);
    }
  }, [analysis]);

  // ---------------------------------------------------------------------------
  // Lazy load more matches (IntersectionObserver)
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Manual load more matches on button click
  // ---------------------------------------------------------------------------
  const [visibleCount, setVisibleCount] = useState(30);

  const handleLoadMoreClick = useCallback(async () => {
    if (loadingMore) return;

    // If there is more to fetch from the API and we need to fetch more
    if (hasMore && onLoadMore) {
      setLoadingMore(true);
      try {
        await onLoadMore();
      } catch (err) {
        console.warn('[ResultsPage] Failed to fetch more matches:', err);
      } finally {
        setLoadingMore(false);
      }
    }

    setVisibleCount(prev => prev + 30);
  }, [hasMore, onLoadMore, loadingMore]);

  // ---------------------------------------------------------------------------
  // MBTI dimension stories (memoized)
  // ---------------------------------------------------------------------------
  const mbtiStories = useMemo(() => {
    const mbti = analysis.archetype.mbti;
    const m = analysis.mbtiDetails;
    return [
      buildMBTIDimensionStory(mbti[0], 'EI', m.pairMargins.EI, m.metrics),
      buildMBTIDimensionStory(mbti[1], 'SN', m.pairMargins.SN, m.metrics),
      buildMBTIDimensionStory(mbti[2], 'TF', m.pairMargins.TF, m.metrics),
      buildMBTIDimensionStory(mbti[3], 'JP', m.pairMargins.JP, m.metrics),
    ];
  }, [analysis]);

  const gameModeStory = useMemo(() => buildGameModePersonality(analysis.matchData), [analysis.matchData]);

  // Helper function to calculate statistics from matches
  const calculateStats = (matches: typeof analysis.matchData) => {
    if (matches.length === 0) {
      return {
        totalGames: 0,
        wins: 0,
        winRate: 0,
        avgKills: 0,
        avgDeaths: 0,
        avgAssists: 0,
        avgKDA: 0,
        avgCS: 0,
        avgTotalCS: 0,
        avgDamage: 0,
        avgGold: 0,
        avgVisionScore: 0,
        avgDamagePerMin: 0,
        avgGoldPerMin: 0,
      };
    }

    const totalCS = matches.reduce((sum, m) => sum + m.totalMinionsKilled, 0);
    const totalNeutralCS = matches.reduce((sum, m) => sum + m.neutralMinionsKilled, 0);
    const totalDamage = matches.reduce((sum, m) => sum + m.totalDamageDealtToChampions, 0);
    const totalGold = matches.reduce((sum, m) => sum + m.goldEarned, 0);
    const totalVision = matches.reduce((sum, m) => sum + m.visionScore, 0);
    const totalDuration = matches.reduce((sum, m) => sum + m.gameDuration, 0);
    const totalKills = matches.reduce((sum, m) => sum + m.kills, 0);
    const totalDeaths = matches.reduce((sum, m) => sum + m.deaths, 0);
    const totalAssists = matches.reduce((sum, m) => sum + m.assists, 0);
    const wins = matches.filter(m => m.win).length;

    return {
      totalGames: matches.length,
      wins: wins,
      winRate: matches.length > 0 ? (wins / matches.length) * 100 : 0,
      avgKills: matches.length > 0 ? totalKills / matches.length : 0,
      avgDeaths: matches.length > 0 ? totalDeaths / matches.length : 0,
      avgAssists: matches.length > 0 ? totalAssists / matches.length : 0,
      avgKDA: totalDeaths > 0 ? (totalKills + totalAssists) / totalDeaths : totalKills + totalAssists,
      avgCS: matches.length > 0 ? totalCS / matches.length : 0,
      avgTotalCS: matches.length > 0 ? (totalCS + totalNeutralCS) / matches.length : 0,
      avgDamage: matches.length > 0 ? totalDamage / matches.length : 0,
      avgGold: matches.length > 0 ? totalGold / matches.length : 0,
      avgVisionScore: matches.length > 0 ? totalVision / matches.length : 0,
      avgDamagePerMin: totalDuration > 0 ? (totalDamage / totalDuration) * 60 : 0,
      avgGoldPerMin: totalDuration > 0 ? (totalGold / totalDuration) * 60 : 0,
    };
  };

  // Separate matches into ranked, casual, and queueId 420
  const { rankedMatches, casualMatches, rankedSoloMatches } = useMemo(() => {
    const ranked: typeof analysis.matchData = [];
    const casual: typeof analysis.matchData = [];
    const rankedSolo: typeof analysis.matchData = [];

    analysis.matchData.forEach(match => {
      if (RANKED_QUEUE_IDS.includes(match.queueId)) {
        ranked.push(match);
        if (match.queueId === 420) {
          rankedSolo.push(match);
        }
      } else {
        casual.push(match);
      }
    });

    return { rankedMatches: ranked, casualMatches: casual, rankedSoloMatches: rankedSolo };
  }, [analysis.matchData]);

  // Calculate statistics for each category
  const rankedStats = useMemo(() => calculateStats(rankedMatches), [rankedMatches]);
  const casualStats = useMemo(() => calculateStats(casualMatches), [casualMatches]);
  const rankedSoloStats = useMemo(() => calculateStats(rankedSoloMatches), [rankedSoloMatches]);

  // Helper function to get game type name
  const getGameTypeName = (queueId: number): string => {
    if (queueId === 450) return 'ARAM';
    // For ranked queues, show the queue name
    if (QUEUE_NAMES[queueId]) {
      return QUEUE_NAMES[queueId].replace('5v5 ', '').replace(' games', '');
    }
    // For other casual queues, show as Classic
    if (queueId === 400 || queueId === 430 || queueId === 490) return 'Classic';
    return `Queue ${queueId}`;
  };

  // Helper function to check if match is ARAM
  const isARAM = (queueId: number): boolean => queueId === 450;

  // Helper component to render a match table
  const renderMatchTable = (matches: typeof analysis.matchData, title: string) => {
    if (matches.length === 0) return null;

    const displayedMatches = matches.slice(0, visibleCount);

    // Check if any match in this section is ARAM
    const hasARAM = displayedMatches.some(m => isARAM(m.queueId));
    const hasNonARAM = displayedMatches.some(m => !isARAM(m.queueId));

    // Determine which columns to show
    const showVision = hasNonARAM;
    const showPosition = hasNonARAM;

    return (
      <div className="mb-8">
        <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.16em] text-gold-gradient mb-4">{title}</h3>
        <div className="overflow-x-auto border border-[#2D899B]/25 bg-[#010A13]/55 shadow-[0_20px_70px_rgba(0,0,0,0.32)]">
          <table className="w-full border-collapse font-mono text-sm">
            <thead>
              <tr className="border-b border-[#CDA434]/45 bg-[#061527]/80 font-rajdhani text-sm uppercase tracking-[0.16em]">
                <th className="px-4 py-3 text-left text-[#F7D879] font-bold sticky left-0 bg-[#061527]/95 z-10">Date</th>
                <th className="px-4 py-3 text-left text-[#F7D879] font-bold sticky left-20 bg-[#061527]/95 z-10">Champion</th>
                <th className="px-4 py-3 text-center text-[#F7D879] font-bold">Game Type</th>
                <th className="px-4 py-3 text-center text-[#F7D879] font-bold">Result</th>
                <th className="px-4 py-3 text-center text-[#F7D879] font-bold">K/D/A</th>
                <th className="px-4 py-3 text-center text-[#F7D879] font-bold">KDA</th>
                <th className="px-4 py-3 text-center text-[#F7D879] font-bold">CS</th>
                <th className="px-4 py-3 text-center text-[#F7D879] font-bold">Total CS</th>
                <th className="px-4 py-3 text-center text-[#F7D879] font-bold">Damage</th>
                <th className="px-4 py-3 text-center text-[#F7D879] font-bold">Gold</th>
                {showVision && <th className="px-4 py-3 text-center text-[#F7D879] font-bold">Vision</th>}
                {showPosition && <th className="px-4 py-3 text-center text-[#F7D879] font-bold">Position</th>}
              </tr>
            </thead>
            <tbody>
              {displayedMatches.map((match) => {
                const kda = (match.kills + match.assists) / (match.deaths || 1);
                const totalCS = match.totalMinionsKilled + match.neutralMinionsKilled;
                const date = new Date(match.gameEndTimestamp);
                const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const gameType = getGameTypeName(match.queueId);
                const isAramMatch = isARAM(match.queueId);

                return (
                  <tr
                    key={match.matchId}
                    className={`border-b border-[#2D899B]/16 hover:bg-[#12315b]/45 transition-colors ${match.win ? 'bg-green-900/10' : 'bg-red-900/10'
                      }`}
                  >
                    <td className="px-4 py-3 text-gray-300 sticky left-0 bg-[#020d19]/95 z-10">{dateStr}</td>
                    <td className="px-4 py-3 sticky left-20 bg-[#020d19]/95 z-10">
                      <div className="flex items-center gap-2">
                        <img
                          src={`https://ddragon.leagueoflegends.com/cdn/14.15.1/img/champion/${match.championName}.png`}
                          alt={match.championName}
                          className="w-8 h-8 rounded"
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = 'https://ddragon.leagueoflegends.com/cdn/14.15.1/img/champion/Fiddlesticks.png';
                          }}
                        />
                        <span className="font-space text-white font-semibold">{match.championName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center text-blue-400 font-semibold">
                      {gameType}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-bold ${match.win ? 'text-green-400' : 'text-red-400'}`}>
                        {match.win ? 'WIN' : 'LOSS'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-white">
                      {match.kills}/{match.deaths}/{match.assists}
                    </td>
                    <td className="px-4 py-3 text-center text-cyan-300 font-semibold text-glow-cyan">
                      {kda.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">
                      {match.totalMinionsKilled}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-300">
                      {totalCS}
                    </td>
                    <td className="px-4 py-3 text-center text-orange-400">
                      {match.totalDamageDealtToChampions.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-center text-yellow-400">
                      {match.goldEarned.toLocaleString()}
                    </td>
                    {showVision && (
                      <td className="px-4 py-3 text-center text-purple-400">
                        {isAramMatch ? '-' : match.visionScore}
                      </td>
                    )}
                    {showPosition && (
                      <td className="px-4 py-3 text-center text-gray-400">
                        {isAramMatch ? '-' : match.position}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Load More Button specific to this table */}
        {(hasMore || visibleCount < matches.length) && (
          <div className="mt-4 text-center">
            <button
              onClick={handleLoadMoreClick}
              disabled={loadingMore}
              className="group relative inline-flex items-center gap-3 font-rajdhani text-lg font-bold uppercase tracking-[0.15em] text-[#F7D879] bg-transparent border border-[#F7D879]/50 hover:border-[#F7D879] px-6 py-3 transition-all duration-300 shadow-[0_0_15px_rgba(247,216,121,0.05)] hover:shadow-[0_0_30px_rgba(247,216,121,0.2)] hover:bg-[#F7D879]/5 disabled:opacity-50 disabled:cursor-wait"
            >
              {loadingMore ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-[#F7D879]" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Fetching matches...</span>
                </>
              ) : (
                <span>Load More Matches</span>
              )}
              {loadedMatchCount && (
                <span className="font-mono text-sm text-cyan-300 border-l border-[#F7D879]/30 pl-3">
                  {Math.min(visibleCount, matches.length)} / {matches.length} Shown
                </span>
              )}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen p-4 pt-24 animate-fade-in font-space">
      <button
        onClick={onReset}
        className="fixed top-4 left-4 z-50 border font-teko border-[#F7D879] bg-gradient-to-r from-[#8f6b24] via-[#F7D879] to-[#b98d2d] text-[#010A13] font-bold uppercase tracking-[0.12em] py-2 px-4 text-lg shadow-[0_0_28px_rgba(247,216,121,0.2)] hover:bg-transparent hover:text-[#F7D879] transition-all duration-300"
      >
        Analyze Another
      </button>

      {/* Archetype Section */}
      <header className="relative mx-auto mb-14 max-w-7xl text-center">
        <div className="absolute inset-x-10 top-1/2 -z-10 h-px bg-cyan-300/30 shadow-[0_0_44px_18px_rgba(34,211,238,0.13)]" />
        <h1 className="font-teko text-7xl md:text-9xl font-bold tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-gray-100 via-[#F7D879] to-gray-400 drop-shadow-[0_0_32px_rgba(45,137,155,0.28)]">{analysis.summonerName}</h1>
      </header>

      <Section title={`${analysis.archetype.title} — ${analysis.archetype.mbti}`} className="relative overflow-visible">
        <div className="grid md:grid-cols-[0.84fr_1.16fr] gap-8 items-stretch">
          <div className="relative -mx-2 md:-ml-12 md:-mt-8 md:mb-[-2.5rem]">
            <div className="absolute -inset-4 bg-[#2D899B]/20 blur-3xl" />
            <img src={analysis.archetype.imageUrl} alt={analysis.archetype.title} className="relative z-10 h-full min-h-96 w-full object-cover border border-[#F7D879]/45 shadow-[0_28px_90px_rgba(0,0,0,0.55)]" />
            <div className="absolute -bottom-8 right-2 z-20 font-teko text-8xl md:text-9xl font-bold tracking-widest text-[#F7D879]/20">{analysis.archetype.mbti}</div>
          </div>
          <div className="relative z-20 bg-[#010A13]/58 p-6 md:p-8 border border-[#2D899B]/30 text-lg md:text-xl leading-8 text-gray-300 space-y-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            {/* Archetype + AI narrative */}
            <p className="text-2xl font-semibold text-white">{analysis.archetype.description}</p>
            <p>{analysis.aiInsights.playstyle} {analysis.aiInsights.prediction}</p>

            {/* Game mode personality */}
            {gameModeStory && (
              <p className="italic text-gray-400 border-l-2 border-[#F7D879]/40 pl-4">
                {gameModeStory}
              </p>
            )}

            {/* Confidence badge */}
            <div className="flex items-center gap-3 bg-[#061527]/60 border border-[#2D899B]/25 px-4 py-3 rounded">
              <span className="font-teko text-4xl font-bold text-[#F7D879] text-glow-gold">{(analysis.mbtiDetails.confidence * 100).toFixed(0)}%</span>
              <span className="text-base text-gray-400">prediction confidence based on {analysis.aggregatedSummary.totalGames} games analyzed</span>
            </div>

            {/* Per-dimension breakdown — the story of WHY */}
            <div className="space-y-4 mt-2">
              <p className="font-rajdhani text-xl font-bold uppercase tracking-[0.12em] text-[#F7D879]/80">How We Read Your Playstyle</p>
              {mbtiStories.map((dim, i) => (
                <div key={i} className="flex gap-3 items-start">
                  <span className="font-teko text-3xl font-bold text-cyan-300 text-glow-cyan w-8 shrink-0 text-center">{dim.chosen}</span>
                  <div>
                    <span className="font-rajdhani text-lg font-bold text-white uppercase tracking-wide">{dim.label}</span>
                    <span className="mx-2 text-gray-600">·</span>
                    <span className={`${statValue} text-[#F7D879] text-sm`}>{dim.stat}</span>
                    <p className="text-base text-gray-400 mt-1 leading-relaxed">{dim.because}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Together We Are Strong" open>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 md:[&>*:nth-child(3)]:translate-y-8 md:[&>*:nth-child(5)]:-translate-y-5">
          <div className={`md:row-span-2 ${cardBase}`}>
            <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.12em] text-white mb-8">Objective Control</h3>
            <p className="text-2xl leading-relaxed text-gray-300">
              You and your team secured <span className={`${statValue} text-white`}>{analysis.recapStats.totalTeamObjectives.toLocaleString()} objectives</span> this season.
            </p>
            <p className="text-2xl leading-relaxed text-gray-300 mt-8">
              Your most played role was <span className="font-bold text-white">{analysis.recapStats.mostPlayedRole}</span>, with a champion pool of <span className={`${statValue} text-white`}>{analysis.recapStats.championPoolSize}</span>.
            </p>
          </div>
          {[
            ['Rift Herald', analysis.recapStats.riftHeraldKills, 'kills'],
            ['Baron', analysis.recapStats.baronKills, 'kills'],
            ['Dragon', analysis.recapStats.dragonKills, 'kills'],
            ['Towers', analysis.recapStats.towerKills, 'destroyed'],
            ['Inhibitors', analysis.recapStats.inhibitorKills, 'destroyed'],
            ['Takedowns', analysis.recapStats.totalTakedowns, 'total'],
          ].map(([label, value, suffix]) => (
            <div key={label} className={`${cardBase} min-h-44`}>
              <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.1em] text-white mb-8">{label}</h3>
              <p className="text-xl text-gray-300">Team total</p>
              <p className={`text-4xl text-white mt-2 ${statValue}`}>{Number(value).toLocaleString()} <span className="font-space text-2xl font-normal">{suffix}</span></p>
            </div>
          ))}
          <div className={`md:col-span-2 ${cardBase}`}>
            <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.1em] text-white mb-6">Let Us Out</h3>
            <p className="text-2xl leading-relaxed text-gray-300">
              Your sample included <span className={`${statValue} text-white`}>{analysis.recapStats.shortGames}</span> games under 20 minutes.
            </p>
          </div>
          <div className={`md:col-span-2 ${cardBase}`}>
            <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.1em] text-white mb-6">Soulmate Match</h3>
            <div className="flex flex-col sm:flex-row gap-5 items-center">
              <img src={analysis.recapStats.soulmate.imageUrl} alt={analysis.recapStats.soulmate.champions} className="w-full sm:w-48 h-32 object-cover border border-[#F7D879]/50" />
              <div>
                <p className="font-rajdhani text-2xl font-bold uppercase tracking-[0.1em] text-[#F7D879] text-glow-gold">{analysis.recapStats.soulmate.champions}</p>
                <p className="text-xl text-gray-300 mt-2">{analysis.recapStats.soulmate.description}</p>
                <p className="text-lg text-gray-500 mt-2">{analysis.recapStats.soulmate.matchedBecause}</p>
              </div>
            </div>
          </div>
          {analysis.recapStats.easterEggs.map(egg => (
            <div key={egg.champion} className={`md:col-span-2 ${cardBase} border-[#F7D879]/40`}>
              <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.1em] text-white mb-6">{egg.title}</h3>
              <div className="flex flex-col sm:flex-row gap-5 items-center">
                <img src={egg.imageUrl} alt={egg.champion} className="w-full sm:w-48 h-32 object-cover border border-[#F7D879]/50" />
                <p className="text-2xl leading-relaxed text-gray-300">{egg.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Strengths and Growth Section */}
      <Section title="Identity Signal" open>
        <div className="grid grid-cols-1 lg:grid-cols-[0.36fr_0.64fr] gap-8 items-start">
          <div>
            <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.16em] text-gold-gradient mb-5">Core Strengths</h3>
            <div className="space-y-5">
              {analysis.strengths.map((strength, index) => (
                <div key={index} className={`${cardBase} text-left`}>
                  <div className="mb-4 text-[#F7D879]">{strength.icon}</div>
                  <h4 className="font-rajdhani text-2xl font-bold italic uppercase tracking-[0.12em] text-[#F7D879] text-glow-gold mb-2">{strength.title}</h4>
                  <p className="text-base leading-7 text-gray-400">{strength.description}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="lg:pt-16">
            <div className={`${cardBase} p-5 md:p-7`}>
              <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.16em] text-gold-gradient mb-6">Your Growth Curve</h3>
              <div className="h-[28rem]">
                <GrowthChart data={analysis.growthCurve} />
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* Top Champions Section */}
      <Section title="Champion Mastery" className="md:ml-auto md:mr-[6vw]">
        <div className="space-y-8">
          {analysis.topChampions.map(champ => (
            <div key={champ.name} className="flex flex-col md:flex-row items-center gap-6 bg-[#010A13]/52 p-6 border border-[#2D899B]/20 shadow-[0_20px_70px_rgba(0,0,0,0.28)]">
              <img src={champ.imageUrl} alt={champ.name} className="w-24 h-24 border border-[#F7D879] shadow-[0_0_22px_rgba(247,216,121,0.18)]" />
              <div className="flex-1 text-center md:text-left">
                <h3 className="font-rajdhani text-4xl font-bold italic uppercase tracking-[0.1em] text-white">{champ.name}</h3>
                <p className="text-xl text-gray-400">{champ.playstyleAnalysis}</p>
              </div>
              <div className="flex gap-4 md:gap-8 text-center">
                <div>
                  <p className={`text-3xl text-cyan-300 ${statValue}`}>{champ.gamesPlayed}</p>
                  <p className="text-lg text-gray-500">Games</p>
                </div>
                <div>
                  <p className={`text-3xl text-cyan-300 ${statValue}`}>{champ.winRate}%</p>
                  <p className="text-lg text-gray-500">Winrate</p>
                </div>
                <div>
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{champ.kda.split('/')[0].trim()}</p>
                  <p className="text-lg text-gray-500">KDA</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Match Data Table Section */}
      <Section title="Match History">
        <div className="space-y-8">
          {/* Overall Summary */}
          <div className={`${cardBase}`}>
            <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.14em] text-gold-gradient mb-6 text-center">Overall Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="text-center">
                <p className={`text-2xl text-cyan-300 ${statValue}`}>{analysis.aggregatedSummary.totalGames}</p>
                <p className="text-sm text-gray-400">Total Games</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl text-green-300 ${statValue}`}>{analysis.aggregatedSummary.wins}</p>
                <p className="text-sm text-gray-400">Wins</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl text-[#F7D879] text-glow-gold ${statValue}`}>{analysis.aggregatedSummary.winRate.toFixed(1)}%</p>
                <p className="text-sm text-gray-400">Win Rate</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl text-cyan-300 ${statValue}`}>{analysis.aggregatedSummary.avgKDA.toFixed(2)}</p>
                <p className="text-sm text-gray-400">Avg KDA</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl text-cyan-300 ${statValue}`}>{analysis.aggregatedSummary.avgTotalCS.toFixed(1)}</p>
                <p className="text-sm text-gray-400">Avg Total CS</p>
              </div>
              <div className="text-center">
                <p className={`text-2xl text-cyan-300 ${statValue}`}>{analysis.aggregatedSummary.avgDamagePerMin.toFixed(0)}</p>
                <p className="text-sm text-gray-400">Dmg/Min</p>
              </div>
            </div>
          </div>

          {/* Ranked Summary */}
          {rankedMatches.length > 0 && (
            <div className={`${cardBase}`}>
              <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.14em] text-gold-gradient mb-6 text-center">Ranked Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{rankedStats.totalGames}</p>
                  <p className="text-sm text-gray-400">Total Games</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-green-300 ${statValue}`}>{rankedStats.wins}</p>
                  <p className="text-sm text-gray-400">Wins</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-[#F7D879] text-glow-gold ${statValue}`}>{rankedStats.winRate.toFixed(1)}%</p>
                  <p className="text-sm text-gray-400">Win Rate</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{rankedStats.avgKDA.toFixed(2)}</p>
                  <p className="text-sm text-gray-400">Avg KDA</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{rankedStats.avgTotalCS.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Total CS</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{rankedStats.avgDamagePerMin.toFixed(0)}</p>
                  <p className="text-sm text-gray-400">Dmg/Min</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedStats.avgKills.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Kills</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedStats.avgDeaths.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Deaths</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedStats.avgAssists.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Assists</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedStats.avgCS.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg CS</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedStats.avgGold.toFixed(0)}</p>
                  <p className="text-sm text-gray-400">Avg Gold</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedStats.avgVisionScore.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Vision</p>
                </div>
              </div>
            </div>
          )}

          {/* Ranked Solo (Queue 420) Summary - Competitive Gamer Focus */}
          {/* {rankedSoloMatches.length > 0 && (
            <div className={`${cardBase} border-[#F7D879]/70 shadow-[0_0_50px_rgba(247,216,121,0.12)]`}>
              <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.14em] text-gold-gradient mb-2 text-center">Ranked Solo</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{rankedSoloStats.totalGames}</p>
                  <p className="text-sm text-gray-400">Total Games</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-green-300 ${statValue}`}>{rankedSoloStats.wins}</p>
                  <p className="text-sm text-gray-400">Wins</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-[#F7D879] text-glow-gold ${statValue}`}>{rankedSoloStats.winRate.toFixed(1)}%</p>
                  <p className="text-sm text-gray-400">Win Rate</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{rankedSoloStats.avgKDA.toFixed(2)}</p>
                  <p className="text-sm text-gray-400">Avg KDA</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{rankedSoloStats.avgTotalCS.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Total CS</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{rankedSoloStats.avgDamagePerMin.toFixed(0)}</p>
                  <p className="text-sm text-gray-400">Dmg/Min</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedSoloStats.avgKills.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Kills</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedSoloStats.avgDeaths.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Deaths</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedSoloStats.avgAssists.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Assists</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedSoloStats.avgCS.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg CS</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedSoloStats.avgGold.toFixed(0)}</p>
                  <p className="text-sm text-gray-400">Avg Gold</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{rankedSoloStats.avgVisionScore.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Vision</p>
                </div>
              </div>
            </div>
          )} */}

          {/* Casual Summary */}
          {casualMatches.length > 0 && (
            <div className={`${cardBase}`}>
              <h3 className="font-rajdhani text-3xl font-bold italic uppercase tracking-[0.14em] text-gold-gradient mb-6 text-center">Casual Statistics</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{casualStats.totalGames}</p>
                  <p className="text-sm text-gray-400">Total Games</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-green-300 ${statValue}`}>{casualStats.wins}</p>
                  <p className="text-sm text-gray-400">Wins</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-[#F7D879] text-glow-gold ${statValue}`}>{casualStats.winRate.toFixed(1)}%</p>
                  <p className="text-sm text-gray-400">Win Rate</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{casualStats.avgKDA.toFixed(2)}</p>
                  <p className="text-sm text-gray-400">Avg KDA</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{casualStats.avgTotalCS.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Total CS</p>
                </div>
                <div className="text-center">
                  <p className={`text-2xl text-cyan-300 ${statValue}`}>{casualStats.avgDamagePerMin.toFixed(0)}</p>
                  <p className="text-sm text-gray-400">Dmg/Min</p>
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-4">
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{casualStats.avgKills.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Kills</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{casualStats.avgDeaths.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Deaths</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{casualStats.avgAssists.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Assists</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{casualStats.avgCS.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg CS</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{casualStats.avgGold.toFixed(0)}</p>
                  <p className="text-sm text-gray-400">Avg Gold</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-white">{casualStats.avgVisionScore.toFixed(1)}</p>
                  <p className="text-sm text-gray-400">Avg Vision</p>
                </div>
              </div>
            </div>
          )}

          {/* Match Data Tables - Separated by Ranked and Casual */}
          {renderMatchTable(rankedMatches, 'Ranked Matches')}
          {renderMatchTable(casualMatches, 'Casual Matches')}
        </div>
      </Section>

      {/* Shareable Card */}
      <Section title="Share Your Legend" open>
        {/* --- Card container (captured for image download) --- */}
        <div ref={shareCardRef} className="panel-ambient p-8 max-w-3xl mx-auto border-[#F7D879]/55" style={{ background: 'linear-gradient(145deg, #010A13 0%, #0A1428 50%, #061527 100%)' }}>
          <p className="text-center text-lg text-gray-500 uppercase tracking-[0.2em] font-rajdhani">League MBTI Analytics</p>
          <h3 className="text-center font-teko text-6xl font-bold tracking-wider text-white mt-2">{analysis.summonerName}</h3>
          <p className="text-center text-gray-400 mt-1 font-mono">#{analysis.tag}</p>

          {/* MBTI type highlight */}
          <div className="mt-6 text-center">
            <div className="inline-flex gap-2">
              {analysis.archetype.mbti.split('').map((letter, i) => (
                <span key={i} className="font-teko text-5xl font-bold text-[#F7D879] text-glow-gold bg-[#F7D879]/10 border border-[#F7D879]/30 w-14 h-14 flex items-center justify-center">
                  {letter}
                </span>
              ))}
            </div>
            <p className="font-rajdhani text-2xl font-bold italic uppercase tracking-[0.1em] text-[#F7D879] text-glow-gold mt-3">{analysis.archetype.title}</p>
          </div>

          <div className="mt-6 border-t border-[#F7D879]/25 pt-6 grid grid-cols-3 gap-4 text-center">
            <div>
              <p className={`text-3xl text-cyan-300 ${statValue}`}>{analysis.aggregatedSummary.totalGames}</p>
              <p className="text-sm text-gray-500">Games</p>
            </div>
            <div>
              <p className={`text-3xl text-[#F7D879] text-glow-gold ${statValue}`}>{analysis.aggregatedSummary.winRate.toFixed(1)}%</p>
              <p className="text-sm text-gray-500">Win Rate</p>
            </div>
            <div>
              <p className={`text-3xl text-cyan-300 ${statValue}`}>{analysis.aggregatedSummary.avgKDA.toFixed(2)}</p>
              <p className="text-sm text-gray-500">KDA</p>
            </div>
          </div>

          <div className="mt-4 border-t border-[#2D899B]/20 pt-4 flex justify-around items-center text-center">
            <div>
              <p className="text-sm text-gray-500">Top Champion</p>
              <p className="font-rajdhani text-2xl font-bold italic uppercase tracking-[0.1em] text-white">{analysis.topChampions[0]?.name}</p>
              <p className={`text-lg text-cyan-300 ${statValue}`}>{analysis.topChampions[0]?.winRate}% WR</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Confidence</p>
              <p className={`text-2xl text-[#F7D879] text-glow-gold ${statValue}`}>{(analysis.mbtiDetails.confidence * 100).toFixed(0)}%</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Role</p>
              <p className="font-rajdhani text-2xl font-bold italic uppercase text-white">{analysis.recapStats.mostPlayedRole}</p>
            </div>
          </div>

          <p className="text-center text-xs text-gray-600 mt-4">leaguembti.com · Discover your playstyle personality</p>
        </div>

        {/* --- Buttons below the card (NOT captured in screenshot) --- */}
        <div className="max-w-3xl mx-auto mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleShare}
            className="font-rajdhani text-lg font-bold uppercase tracking-[0.12em] text-[#010A13] bg-gradient-to-r from-[#8f6b24] via-[#F7D879] to-[#b98d2d] px-4 py-3 border border-[#F7D879] hover:bg-transparent hover:text-[#F7D879] transition-all duration-300"
          >
            {shareCopied ? '✓ Link Copied!' : '🔗 Share Link'}
          </button>
          <button
            onClick={handleDownloadMBTI}
            disabled={downloadingCard !== null}
            className="font-rajdhani text-lg font-bold uppercase tracking-[0.12em] text-[#F7D879] bg-transparent px-4 py-3 border border-[#F7D879] hover:bg-[#F7D879]/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-wait"
          >
            {downloadingCard === 'mbti' ? '⏳ Generating...' : '📸 MBTI Card'}
          </button>
          <button
            onClick={handleDownloadYear}
            disabled={downloadingCard !== null}
            className="font-rajdhani text-lg font-bold uppercase tracking-[0.12em] text-cyan-300 bg-transparent px-4 py-3 border border-[#2D899B] hover:bg-[#2D899B]/10 transition-all duration-300 disabled:opacity-50 disabled:cursor-wait"
          >
            {downloadingCard === 'year' ? '⏳ Generating...' : '📈 Year Stats Card'}
          </button>
        </div>
      </Section>


    </div>
  );
};

export default ResultsPage;
