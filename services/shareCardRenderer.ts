/**
 * Native Canvas 2D share card renderer.
 *
 * Generates mobile-format PNG images (1080×1920 Instagram story)
 * with the player's MBTI personality and season stats.
 * Zero external dependencies — pure Canvas API.
 */

import type { AnalysisResult } from '../types';
import { QUEUE_NAMES } from '../types/riotApiTypes';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CARD_W = 1080;
const CARD_H = 1920;
const GOLD = '#F7D879';
const GOLD_DIM = '#8f6b24';
const CYAN = '#00D4FF';
const BG_TOP = '#010A13';
const BG_MID = '#0A1428';
const BG_BOT = '#061527';
const GRAY_300 = '#d1d5db';
const GRAY_500 = '#6b7280';
const GRAY_600 = '#4b5563';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function drawGradientBg(ctx: CanvasRenderingContext2D) {
  const grad = ctx.createLinearGradient(0, 0, 0, CARD_H);
  grad.addColorStop(0, BG_TOP);
  grad.addColorStop(0.4, BG_MID);
  grad.addColorStop(1, BG_BOT);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, CARD_W, CARD_H);
}

function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: {
  font?: string; color?: string; align?: CanvasTextAlign; maxWidth?: number;
} = {}) {
  ctx.font = opts.font || '32px sans-serif';
  ctx.fillStyle = opts.color || '#fff';
  ctx.textAlign = opts.align || 'center';
  if (opts.maxWidth) {
    ctx.fillText(text, x, y, opts.maxWidth);
  } else {
    ctx.fillText(text, x, y);
  }
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    setTimeout(() => reject(new Error(`Timeout loading: ${url}`)), 8000);
    img.src = url;
  });
}

function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

// ---------------------------------------------------------------------------
// Card 1: MBTI Personality Card (Instagram Story 1080×1920)
// ---------------------------------------------------------------------------

export async function renderMBTICard(analysis: AnalysisResult): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  // Background
  drawGradientBg(ctx);

  // Try to load champion splash as background
  try {
    const splashUrl = analysis.archetype.imageUrl;
    const splash = await loadImage(splashUrl);
    ctx.globalAlpha = 0.2;
    const aspect = splash.width / splash.height;
    const drawH = CARD_W / aspect;
    ctx.drawImage(splash, 0, 0, CARD_W, drawH);
    ctx.globalAlpha = 1;
    // Fade overlay
    const fade = ctx.createLinearGradient(0, 0, 0, drawH);
    fade.addColorStop(0, 'rgba(1,10,19,0)');
    fade.addColorStop(0.7, 'rgba(1,10,19,0.8)');
    fade.addColorStop(1, 'rgba(1,10,19,1)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, CARD_W, drawH);
  } catch { /* ok, no splash */ }

  let y = 120;

  // Header: "League MBTI Analytics"
  drawText(ctx, 'LEAGUE MBTI ANALYTICS', CARD_W / 2, y, {
    font: 'bold 36px sans-serif', color: GRAY_500,
  });
  y += 80;

  // Player name
  drawText(ctx, analysis.summonerName, CARD_W / 2, y, {
    font: 'bold 96px sans-serif', color: '#fff',
  });
  y += 40;
  drawText(ctx, `#${analysis.tag}`, CARD_W / 2, y, {
    font: '36px monospace', color: GRAY_500,
  });
  y += 100;

  // MBTI letters in boxes
  const letters = analysis.archetype.mbti.split('');
  const boxSize = 120;
  const boxGap = 24;
  const totalBoxW = letters.length * boxSize + (letters.length - 1) * boxGap;
  let bx = (CARD_W - totalBoxW) / 2;
  for (const letter of letters) {
    // Box background
    ctx.fillStyle = 'rgba(247,216,121,0.12)';
    drawRoundedRect(ctx, bx, y, boxSize, boxSize, 12);
    ctx.fill();
    // Box border
    ctx.strokeStyle = 'rgba(247,216,121,0.4)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, bx, y, boxSize, boxSize, 12);
    ctx.stroke();
    // Letter
    drawText(ctx, letter, bx + boxSize / 2, y + boxSize * 0.75, {
      font: 'bold 72px sans-serif', color: GOLD,
    });
    bx += boxSize + boxGap;
  }
  y += boxSize + 40;

  // Archetype title
  drawText(ctx, analysis.archetype.title.toUpperCase(), CARD_W / 2, y, {
    font: 'bold italic 52px sans-serif', color: GOLD,
  });
  y += 100;

  // Stats row
  const statsRow = [
    { value: String(analysis.aggregatedSummary.totalGames), label: 'Games' },
    { value: `${analysis.aggregatedSummary.winRate.toFixed(1)}%`, label: 'Win Rate', highlight: true },
    { value: analysis.aggregatedSummary.avgKDA.toFixed(2), label: 'KDA' },
  ];
  const statW = CARD_W / statsRow.length;
  for (let i = 0; i < statsRow.length; i++) {
    const s = statsRow[i];
    const sx = statW * i + statW / 2;
    drawText(ctx, s.value, sx, y, {
      font: 'bold 64px monospace', color: s.highlight ? GOLD : CYAN,
    });
    drawText(ctx, s.label, sx, y + 42, {
      font: '28px sans-serif', color: GRAY_500,
    });
  }
  y += 130;

  // Divider
  ctx.strokeStyle = 'rgba(247,216,121,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, y);
  ctx.lineTo(CARD_W - 80, y);
  ctx.stroke();
  y += 60;

  // Top 3 champions
  drawText(ctx, 'TOP CHAMPIONS', CARD_W / 2, y, {
    font: 'bold 36px sans-serif', color: GRAY_600,
  });
  y += 50;

  const champSlotW = (CARD_W - 160) / 3;
  for (let i = 0; i < Math.min(3, analysis.topChampions.length); i++) {
    const champ = analysis.topChampions[i];
    const cx = 80 + champSlotW * i + champSlotW / 2;

    // Try to load champion icon
    try {
      const icon = await loadImage(champ.imageUrl);
      const iconSize = 100;
      ctx.save();
      drawRoundedRect(ctx, cx - iconSize / 2, y, iconSize, iconSize, 12);
      ctx.clip();
      ctx.drawImage(icon, cx - iconSize / 2, y, iconSize, iconSize);
      ctx.restore();
      // Border
      ctx.strokeStyle = 'rgba(247,216,121,0.3)';
      ctx.lineWidth = 2;
      drawRoundedRect(ctx, cx - iconSize / 2, y, iconSize, iconSize, 12);
      ctx.stroke();
    } catch { /* no icon */ }

    drawText(ctx, champ.name, cx, y + 130, {
      font: 'bold 32px sans-serif', color: '#fff', maxWidth: champSlotW - 20,
    });
    drawText(ctx, `${champ.gamesPlayed} games`, cx, y + 165, {
      font: '26px sans-serif', color: GRAY_500,
    });
    drawText(ctx, `${champ.winRate}% WR`, cx, y + 198, {
      font: 'bold 28px monospace', color: CYAN,
    });
  }
  y += 260;

  // Divider
  ctx.strokeStyle = 'rgba(45,137,155,0.2)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(80, y);
  ctx.lineTo(CARD_W - 80, y);
  ctx.stroke();
  y += 60;

  // Confidence + Role
  const infoRow = [
    { value: `${(analysis.mbtiDetails.confidence * 100).toFixed(0)}%`, label: 'Confidence' },
    { value: analysis.recapStats.mostPlayedRole, label: 'Main Role' },
  ];
  const infoW = CARD_W / infoRow.length;
  for (let i = 0; i < infoRow.length; i++) {
    const info = infoRow[i];
    const ix = infoW * i + infoW / 2;
    drawText(ctx, info.value, ix, y, {
      font: 'bold 52px sans-serif', color: i === 0 ? GOLD : '#fff',
    });
    drawText(ctx, info.label, ix, y + 40, {
      font: '26px sans-serif', color: GRAY_500,
    });
  }
  y += 120;

  // Description snippet
  const desc = analysis.archetype.description;
  if (desc.length > 0) {
    ctx.font = '28px sans-serif';
    ctx.fillStyle = GRAY_300;
    ctx.textAlign = 'center';
    // Simple word wrap
    const words = desc.split(' ');
    let line = '';
    const maxW = CARD_W - 160;
    for (const word of words) {
      const test = line + word + ' ';
      if (ctx.measureText(test).width > maxW && line.length > 0) {
        ctx.fillText(line.trim(), CARD_W / 2, y);
        y += 38;
        line = word + ' ';
      } else {
        line = test;
      }
    }
    if (line.trim()) {
      ctx.fillText(line.trim(), CARD_W / 2, y);
      y += 38;
    }
  }

  // Footer watermark
  drawText(ctx, 'leaguembti.com · Discover your playstyle personality', CARD_W / 2, CARD_H - 60, {
    font: '24px sans-serif', color: GRAY_600,
  });

  downloadCanvas(canvas, `${analysis.summonerName}-${analysis.archetype.mbti}-league-mbti.png`);
}

// ---------------------------------------------------------------------------
// Card 2: Year Stats Card (yearin.lol style, 1080×1920)
// ---------------------------------------------------------------------------

export async function renderYearCard(analysis: AnalysisResult): Promise<void> {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d')!;

  drawGradientBg(ctx);

  let y = 100;

  // Header
  drawText(ctx, '#yearinlol #leaguembti', CARD_W - 80, y, {
    font: 'bold 28px sans-serif', color: CYAN, align: 'right',
  });
  y += 40;

  // Badge area
  ctx.fillStyle = 'rgba(45,137,155,0.15)';
  drawRoundedRect(ctx, 60, y, CARD_W - 120, 160, 16);
  ctx.fill();

  drawText(ctx, '2026 Statistics', 100, y + 50, {
    font: 'bold 36px sans-serif', color: CYAN, align: 'left',
  });
  drawText(ctx, analysis.summonerName, 100, y + 100, {
    font: 'bold 56px sans-serif', color: '#fff', align: 'left',
  });
  drawText(ctx, `#${analysis.tag}`, 100 + ctx.measureText(analysis.summonerName).width + 10, y + 100, {
    font: 'bold 36px sans-serif', color: GRAY_500, align: 'left',
  });

  y += 200;

  // Big stats row: Games | Winrate | Playtime
  const totalMinutes = analysis.matchData.reduce((sum, m) => sum + m.gameDuration / 60, 0);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = Math.floor(totalMinutes % 60);
  const playtime = days > 0 ? `${days}d ${hours}h ${mins}m` : `${hours}h ${mins}m`;

  const bigStats = [
    { value: String(analysis.aggregatedSummary.totalGames), label: 'Games' },
    { value: `${analysis.aggregatedSummary.winRate.toFixed(2)}%`, label: 'Winrate' },
    { value: playtime, label: 'Playtime' },
  ];
  const bsW = (CARD_W - 120) / bigStats.length;
  for (let i = 0; i < bigStats.length; i++) {
    const s = bigStats[i];
    const sx = 60 + bsW * i;
    drawText(ctx, s.label, sx + bsW / 2, y, {
      font: '26px sans-serif', color: GRAY_500,
    });
    drawText(ctx, s.value, sx + bsW / 2, y + 55, {
      font: 'bold 48px monospace', color: '#fff',
    });
  }
  y += 120;

  // Divider
  ctx.strokeStyle = 'rgba(247,216,121,0.15)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(CARD_W - 60, y); ctx.stroke();
  y += 40;

  // Champions section header
  const uniqueChamps = new Set(analysis.matchData.map(m => m.championName)).size;
  drawText(ctx, `Champions  ${uniqueChamps} total`, 80, y, {
    font: 'bold 32px sans-serif', color: GRAY_300, align: 'left',
  });
  y += 50;

  // Top 6 champions in a 3×2 grid
  const champCols = 3;
  const champRows = 2;
  const cellW = (CARD_W - 160) / champCols;
  const cellH = 170;
  for (let r = 0; r < champRows; r++) {
    for (let c = 0; c < champCols; c++) {
      const idx = r * champCols + c;
      if (idx >= analysis.topChampions.length) break;
      const champ = analysis.topChampions[idx];
      const cx = 80 + c * cellW;
      const cy = y + r * cellH;

      // Champion icon
      try {
        const icon = await loadImage(champ.imageUrl);
        ctx.save();
        drawRoundedRect(ctx, cx, cy, 72, 72, 8);
        ctx.clip();
        ctx.drawImage(icon, cx, cy, 72, 72);
        ctx.restore();
      } catch { /* no icon */ }

      // Stats next to icon
      drawText(ctx, `${champ.gamesPlayed} games`, cx + 84, cy + 25, {
        font: '24px sans-serif', color: GRAY_300, align: 'left',
      });
      const totalKills = parseInt(champ.kda.split('/')[0]) * champ.gamesPlayed;
      drawText(ctx, `${totalKills} kills`, cx + 84, cy + 52, {
        font: '22px sans-serif', color: GRAY_500, align: 'left',
      });
      drawText(ctx, `${champ.winRate}% WR`, cx + 84, cy + 79, {
        font: 'bold 22px monospace', color: CYAN, align: 'left',
      });
    }
  }
  y += champRows * cellH + 20;

  // Divider
  ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(CARD_W - 60, y); ctx.stroke();
  y += 40;

  // Game mode breakdown
  drawText(ctx, 'Game Modes', 80, y, {
    font: 'bold 32px sans-serif', color: GRAY_300, align: 'left',
  });
  y += 50;

  const modeCounts: Record<string, { games: number; wins: number }> = {};
  for (const m of analysis.matchData) {
    const name = QUEUE_NAMES[m.queueId] || `Queue ${m.queueId}`;
    if (!modeCounts[name]) modeCounts[name] = { games: 0, wins: 0 };
    modeCounts[name].games++;
    if (m.win) modeCounts[name].wins++;
  }
  const sortedModes = Object.entries(modeCounts).sort((a, b) => b[1].games - a[1].games);

  for (let i = 0; i < Math.min(5, sortedModes.length); i++) {
    const [mode, stats] = sortedModes[i];
    const wr = stats.games > 0 ? ((stats.wins / stats.games) * 100).toFixed(1) : '0';

    drawText(ctx, mode, 100, y, {
      font: '28px sans-serif', color: '#fff', align: 'left',
    });
    drawText(ctx, `${stats.games} games`, CARD_W / 2 + 40, y, {
      font: '26px monospace', color: CYAN, align: 'left',
    });
    drawText(ctx, `${wr}% WR`, CARD_W - 100, y, {
      font: 'bold 26px monospace', color: GRAY_500, align: 'right',
    });
    y += 48;
  }
  y += 20;

  // Divider
  ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(CARD_W - 60, y); ctx.stroke();
  y += 40;

  // Roles section
  drawText(ctx, 'Roles', 80, y, {
    font: 'bold 32px sans-serif', color: GRAY_300, align: 'left',
  });
  y += 50;

  const roleCounts: Record<string, { games: number; wins: number }> = {};
  for (const m of analysis.matchData) {
    const role = m.position || 'UNKNOWN';
    if (!roleCounts[role]) roleCounts[role] = { games: 0, wins: 0 };
    roleCounts[role].games++;
    if (m.win) roleCounts[role].wins++;
  }
  const roleIcons: Record<string, string> = {
    TOP: '⚔️', JUNGLE: '🌲', MIDDLE: '🔮', BOTTOM: '🏹', UTILITY: '🛡️',
  };
  const sortedRoles = Object.entries(roleCounts).sort((a, b) => b[1].games - a[1].games);

  const roleGridW = (CARD_W - 120) / 3;
  for (let i = 0; i < Math.min(6, sortedRoles.length); i++) {
    const [role, stats] = sortedRoles[i];
    const col = i % 3;
    const row = Math.floor(i / 3);
    const rx = 60 + col * roleGridW + roleGridW / 2;
    const ry = y + row * 80;
    const icon = roleIcons[role] || '🎮';
    const wr = stats.games > 0 ? ((stats.wins / stats.games) * 100).toFixed(1) : '0';

    drawText(ctx, `${icon} ${stats.games} games`, rx, ry, {
      font: '26px sans-serif', color: '#fff',
    });
    drawText(ctx, `${wr}% WR`, rx, ry + 32, {
      font: '22px monospace', color: GRAY_500,
    });
  }
  y += Math.ceil(sortedRoles.length / 3) * 80 + 20;

  // Divider
  ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(CARD_W - 60, y); ctx.stroke();
  y += 40;

  // Extras
  drawText(ctx, 'Extras', 80, y, {
    font: 'bold 32px sans-serif', color: GRAY_300, align: 'left',
  });
  y += 50;

  const totalDmg = analysis.matchData.reduce((s, m) => s + m.totalDamageDealtToChampions, 0);
  const totalKills = analysis.matchData.reduce((s, m) => s + m.kills, 0);
  const totalCS = analysis.matchData.reduce((s, m) => s + m.totalMinionsKilled + m.neutralMinionsKilled, 0);
  const totalGold = analysis.matchData.reduce((s, m) => s + m.goldEarned, 0);

  function fmtBig(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
  }

  const extras = [
    { value: fmtBig(totalDmg), label: 'Damage dealt' },
    { value: fmtBig(totalKills), label: 'Total kills' },
    { value: fmtBig(totalCS), label: 'CS' },
    { value: fmtBig(totalGold), label: 'Gold earned' },
  ];
  const extW = (CARD_W - 120) / 2;
  for (let i = 0; i < extras.length; i++) {
    const e = extras[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const ex = 60 + col * extW + extW / 2;
    const ey = y + row * 80;
    drawText(ctx, e.value, ex, ey, {
      font: 'bold 44px monospace', color: '#fff',
    });
    drawText(ctx, e.label, ex, ey + 34, {
      font: '24px sans-serif', color: GRAY_500,
    });
  }

  // Footer
  drawText(ctx, 'leaguembti.com · Discover your playstyle personality', CARD_W / 2, CARD_H - 60, {
    font: '24px sans-serif', color: GRAY_600,
  });

  downloadCanvas(canvas, `${analysis.summonerName}-2026-year-stats.png`);
}
