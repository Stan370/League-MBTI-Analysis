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
  const isAccountEndpoint = url.pathname.includes('by-riot-id');

  let originalPath;
  if (isAccountEndpoint) {
    originalPath = url.pathname.substring('/api'.length);
  } else {
    originalPath = url.pathname.substring('/api/riot'.length);
  }

  let regionalHost: 'americas' | 'europe' | 'asia' | 'sea' | any;

  // extract gameName/tagLine from path
  const match = originalPath.match(/by-riot-id\/([^/]+)\/([^/]+)/);
  let tagLine = '';
  if (match) {
    console.log("matched by-riot-id endpoint",match)
    const gameName = match[1];
    tagLine = match[2];
  }

  let needsRegionalLookup: boolean = false;
  let puuid = '';
  const regionParam = url.searchParams.get('_region');

  // Priority 1: Explicit region parameter
  if (regionParam && ['americas', 'europe', 'asia', 'sea'].includes(regionParam)) {
    console.log('[onRequest] Using explicit _region param:', regionParam);
    regionalHost = regionParam as 'americas' | 'europe' | 'asia' | 'sea';
  }
  // Priority 2: Extract region from Match ID (e.g., EUW1_7604740916 -> europe)
  console.log("check region: ", tagLine, isAccountEndpoint)
  if (isAccountEndpoint && tagToRegionalHost(tagLine) !== '') {
    regionalHost = tagToRegionalHost(tagLine);
  } else if (originalPath.includes('/matches/')) {
    const matchIdRegion = extractRegionFromMatchId(originalPath);
    if (matchIdRegion) {
      console.log('[onRequest] Extracted region from Match ID:', matchIdRegion);
      regionalHost = matchIdRegion;
    }
  } else if (originalPath.includes('/by-puuid/')) {
    console.log('[onRequest] by-puuid endpoint, need region lookup');
    const puuidMatch = originalPath.match(/by-puuid\/([^/]+)/);
    if (puuidMatch) {
      puuid = puuidMatch[1];
    }
    needsRegionalLookup = true;
  }

  let targetHost = '';
  // Only do region lookup if we have a valid puuid and need it
  if (needsRegionalLookup && puuid !== '' || regionalHost === ''|| regionalHost === undefined) {
    try {
      console.log('[onRequest] Starting region lookup with puuid:', puuid);
      const regionLookupUrl = `https://asia.api.riotgames.com/riot/account/v1/region/by-game/lol/by-puuid/${encodeURIComponent(puuid)}`;
      const lookupResp = await fetch(regionLookupUrl, {
        headers: {
          'X-Riot-Token': apiKey
        }
      });
      if (lookupResp.ok) {
        const regionDto: { puuid: string; game: string; region: string } = await lookupResp.json();
        console.log('[onRequest] Region lookup result:', regionDto);
        const resolvedRegion = tagToRegionalHost(regionDto.region);
        regionalHost = resolvedRegion;
      } else {
        console.warn('[Functions] Region lookup failed', { status: lookupResp.status, originalPath });
        // Fall back to default
        regionalHost = 'asia';
      }
    } catch (e) {
      console.error('[Functions] Region lookup error', { error: e instanceof Error ? e.message : 'Unknown', originalPath });
      // Fall back to default
      regionalHost = 'asia';
    }
  }
  targetHost = `${regionalHost}.api.riotgames.com`;

  //这是代理服务器的核心：接收前端请求 → 转发到 Riot API → 拿到结果 → 返回给前端。整个过程隐藏了 API 密钥，并解决了跨域问题。
  const targetUrl = `https://${targetHost}${originalPath}${url.search}`;
  console.log('targetURL', targetUrl);

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
    response.headers.set('X-Region-Used', regionalHost);

    console.log('[Functions] /api/riot', {
      status: upstream.status,
      durationMs,
      targetUrl,
      regionUsed: regionalHost,
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