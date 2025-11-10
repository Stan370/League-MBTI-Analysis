function tagToPlatformHost(tag: string): string {
  const upper = tag.toUpperCase();
  const map: Record<string, string> = {
    // Americas
    NA1: 'na1', BR1: 'br1', LA1: 'la1', LA2: 'la2', OC1: 'oc1',
    // Europe
    EUW1: 'euw1', EUN1: 'eun1', TR1: 'tr1', RU: 'ru',
    // Asia
    KR: 'kr', JP1: 'jp1',
    // Southeast Asia
    PH2: 'ph2', SG2: 'sg2', TH2: 'th2', TW2: 'tw2', VN2: 'vn2',
  };
  return map[upper] || 'na1';
}

function tagToRegionalHost(tag: string): 'americas' | 'europe' | 'asia' {
  const upper = tag.toUpperCase();
  if ([
    'NA1', 'BR1', 'LA1', 'LA2', 'OC1',
  ].includes(upper)) return 'americas';
  if ([
    'EUN1', 'EUW1', 'TR1', 'RU',
  ].includes(upper)) return 'europe';
  if ([
    'KR', 'JP1', 'PH2', 'SG2', 'TH2', 'TW2', 'VN2',
  ].includes(upper)) return 'asia';
  return 'asia'; // fallback 简化
}

function isKnownPlatformOrRegionalTag(tag: string): boolean {
  if (!tag) return false;
  const upper = tag.toUpperCase();
  const knownPlatform = [
    'NA1','BR1','LA1','LA2','OC1','EUN1','EUW1','TR1','RU','KR','JP1','PH2','SG2','TH2','TW2','VN2'
  ];
  return knownPlatform.includes(upper);
}

function extractPuuidFromPath(pathname: string): string | null {
  // common forms:
  // - /lol/match/v5/matches/by-puuid/{puuid}/ids
  // - /riot/account/v1/region/by-game/{game}/by-puuid/{puuid}
  const byPuuidMatch = pathname.match(/\/by-puuid\/([^/?#]+)/i);
  if (byPuuidMatch && byPuuidMatch[1]) return byPuuidMatch[1];
  return null;
}

function inferGameFromPath(pathname: string): string {
  if (pathname.startsWith('/lol/')) return 'lol';
  if (pathname.startsWith('/riot/account/')) {
    // may include /by-game/{game}/
    const byGame = pathname.match(/\/by-game\/([^/]+)/i);
    if (byGame && byGame[1]) return byGame[1];
  }
  // default to lol for this app
  return 'lol';
}

// CORS 白名单机制
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8788',
  'https://league-mbti-analysis.pages.dev',
];

export async function onRequest(context: {
  request: Request;
  env: { RIOT_API_KEY?: string };
  params: Record<string, string>;
}) {
  const { request, env } = context;
  const url = new URL(request.url);
  const startTime = Date.now();
  const origin = request.headers.get('Origin') || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : '*';

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': corsOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  const apiKey = env.RIOT_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing RIOT_API_KEY' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin },
    });
  }

  // For Pages Functions under functions/api/riot/[[path]].ts, strip the prefix '/api/riot'
  const originalPath = url.pathname.substring('/api/riot'.length) || '/';
  const tagParam = url.searchParams.get('tag') || '';

  let targetHost = '';
  const needsRegional = originalPath.startsWith('/riot/account/') || originalPath.startsWith('/lol/match/v5/');
  if (needsRegional) {
    let resolvedRegional: 'americas' | 'europe' | 'asia' | null = null;
    if (isKnownPlatformOrRegionalTag(tagParam)) {
      resolvedRegional = tagToRegionalHost(tagParam);
    } else {
      // Try resolve via active region API if puuid is present
      const puuid = extractPuuidFromPath(originalPath);
      const game = inferGameFromPath(originalPath);
      if (puuid) {
        try {
          // This endpoint is served from a regional cluster; americas hosts account for global queries reliably
          const regionLookupUrl = `https://americas.api.riotgames.com/riot/account/v1/region/by-game/${encodeURIComponent(game)}/by-puuid/${encodeURIComponent(puuid)}`;
          const lookupResp = await fetch(regionLookupUrl, { headers: { 'X-Riot-Token': apiKey } });
          if (lookupResp.ok) {
            const regionDto: { puuid: string; game: string; region: 'americas' | 'europe' | 'asia' } = await lookupResp.json();
            if (regionDto && regionDto.region) {
              resolvedRegional = regionDto.region;
            }
          } else {
            console.warn('[Functions] Failed to resolve active region', { status: lookupResp.status, originalPath });
          }
        } catch (e) {
          console.error('[Functions] Error resolving active region', { error: e instanceof Error ? e.message : 'Unknown' });
        }
      }
    }

    // As a fallback for account lookups where we can't infer region, default to americas
    if (!resolvedRegional) {
      if (originalPath.startsWith('/riot/account/v1/accounts/by-riot-id')) {
        resolvedRegional = 'americas';
      } else {
        return new Response(JSON.stringify({ error: 'Missing or unknown tag and unable to resolve active region from puuid.' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
        });
      }
    }
    targetHost = `${resolvedRegional}.api.riotgames.com`;
    url.searchParams.delete('tag');
  } else {
    // 其他都允许缺省 tag，但默认取 NA1
    const platform = tagToPlatformHost(tagParam || 'NA1');
    targetHost = `${platform}.api.riotgames.com`;
    url.searchParams.delete('tag');
  }

  const targetUrl = `https://${targetHost}${originalPath}${url.search}`;

  const init: RequestInit = {
    method: request.method,
    headers: { 'X-Riot-Token': apiKey },
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  try {
    const upstream = await fetch(targetUrl, init);
    const durationMs = Date.now() - startTime;
    if (upstream.status === 403) {
      console.warn('[Functions] Forbidden from Riot API - possible invalid/expired API key', {
        status: upstream.status,
        durationMs,
        targetUrl,
      });
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          details: 'Riot API rejected the request. The API key may be invalid or expired.',
        }),
        { status: 403, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
      );
    }
    const response = new Response(upstream.body, upstream);
    response.headers.set('Access-Control-Allow-Origin', corsOrigin);
    console.log('[Functions] /api/riot', {
      status: upstream.status,
      durationMs,
      targetUrl,
    });
    return response;
  } catch (e) {
    console.error('[Functions] Proxy error', {
      targetUrl,
      error: e instanceof Error ? e.message : 'Unknown',
    });
    return new Response(
      JSON.stringify({ error: 'Proxy error', details: e instanceof Error ? e.message : 'Unknown' }),
      { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin } }
    );
  }
}


