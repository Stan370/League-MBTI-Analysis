/**
 * Client-side report service.
 *
 * - Converts AnalysisResult ↔ SerializableReport (strips ReactNode icons)
 * - Saves/loads reports via the /api/reports endpoints (backed by KV)
 */

import React from 'react';
import type { AnalysisResult } from '../types';
import type { SerializableReport, StrengthIconKey } from '../types/report';
import { BrainCircuitIcon, CrosshairIcon, ShieldCheckIcon, SwordsIcon } from '../components/icons';

// ---------------------------------------------------------------------------
// Icon key ↔ ReactNode mapping
// ---------------------------------------------------------------------------

const ICON_MAP: Record<StrengthIconKey, (props: { className?: string }) => React.ReactNode> = {
  SwordsIcon,
  BrainCircuitIcon,
  ShieldCheckIcon,
  CrosshairIcon,
};

/** Best-effort reverse lookup: match component reference to a key string */
function iconToKey(icon: React.ReactNode): StrengthIconKey {
  if (!React.isValidElement(icon)) return 'BrainCircuitIcon';
  const type = (icon as React.ReactElement).type;
  if (type === SwordsIcon) return 'SwordsIcon';
  if (type === ShieldCheckIcon) return 'ShieldCheckIcon';
  if (type === CrosshairIcon) return 'CrosshairIcon';
  return 'BrainCircuitIcon';
}

function keyToIcon(key: StrengthIconKey): React.ReactNode {
  const Component = ICON_MAP[key] ?? BrainCircuitIcon;
  return React.createElement(Component, { className: 'w-8 h-8 text-[#CDA434]' });
}

// ---------------------------------------------------------------------------
// Serialize / Deserialize
// ---------------------------------------------------------------------------

export function toSerializableReport(
  analysis: AnalysisResult,
  id: string,
): SerializableReport {
  return {
    id,
    createdAt: Date.now(),
    summonerName: analysis.summonerName,
    tag: analysis.tag,
    archetype: analysis.archetype,
    strengths: analysis.strengths.map((s) => ({
      title: s.title,
      description: s.description,
      iconKey: iconToKey(s.icon),
    })),
    growthCurve: analysis.growthCurve,
    topChampions: analysis.topChampions,
    matchData: analysis.matchData,
    aggregatedSummary: analysis.aggregatedSummary,
    recapStats: analysis.recapStats,
    mbtiDetails: analysis.mbtiDetails,
    aiInsights: analysis.aiInsights,
  };
}

export function fromSerializableReport(report: SerializableReport): AnalysisResult {
  return {
    summonerName: report.summonerName,
    tag: report.tag,
    archetype: report.archetype,
    strengths: report.strengths.map((s) => ({
      title: s.title,
      description: s.description,
      icon: keyToIcon(s.iconKey),
    })),
    growthCurve: report.growthCurve,
    topChampions: report.topChampions,
    matchData: report.matchData,
    aggregatedSummary: report.aggregatedSummary,
    recapStats: report.recapStats,
    mbtiDetails: report.mbtiDetails,
    aiInsights: report.aiInsights,
  };
}

// ---------------------------------------------------------------------------
// API helpers + in-memory cache
// ---------------------------------------------------------------------------

/** Module-level cache: avoids re-fetching reports on browser back/forward */
const reportCache = new Map<string, SerializableReport>();

/** Manually seed the cache (e.g. after analysis completes) */
export function cacheReport(report: SerializableReport): void {
  if (report.id) reportCache.set(report.id, report);
}

export async function saveReport(
  report: SerializableReport,
): Promise<{ id: string }> {
  const resp = await fetch('/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ report }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to save report: ${resp.status}`);
  }
  const { id } = await resp.json() as { id: string };
  // Populate cache so future navigations are instant
  report.id = id;
  reportCache.set(id, report);
  return { id };
}

export async function loadReport(
  id: string,
): Promise<SerializableReport | null> {
  // 1. Check in-memory cache first
  const cached = reportCache.get(id);
  if (cached) return cached;

  // 2. Fetch from KV
  const resp = await fetch(`/api/reports/${encodeURIComponent(id)}`);
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`Failed to load report: ${resp.status}`);
  const report = await resp.json() as SerializableReport;

  // 3. Cache for future navigations
  reportCache.set(id, report);
  return report;
}

// ---------------------------------------------------------------------------
// Embedded SSR data
// ---------------------------------------------------------------------------

/**
 * Try to read report data embedded by the SSR function in a <script> tag.
 * Returns null if not present (e.g. landing page, dev mode without wrangler).
 */
export function getEmbeddedReport(): SerializableReport | null {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById('__REPORT_DATA__');
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent) as SerializableReport;
  } catch {
    return null;
  }
}
