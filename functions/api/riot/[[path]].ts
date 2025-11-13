function tagToRegionalHost(tag: string): 'americas' | 'europe' | 'asia' | 'sea' |''{
  const t = tag.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();                 
  console.log('tagToRegionalHost input tag:', tag, 'processed tag:', t);
  // americas group
  if (t.startsWith('NA') || t.startsWith('BR') || t.startsWith('LA') || t.startsWith('OC')) {
    return 'americas';
  }
  // europe group
  if (t.startsWith('EU') || t.startsWith('TR') || t.startsWith('RU')) {
    return 'europe';
  }
  // asia group
  if (t.startsWith('KR') || t.startsWith('JP')) {
    return 'asia';
  }
  // sea group
  if (['PH2','SG2','TH2','TW2','VN2'].includes(t)) {
    return 'sea';
  }
  return '';
}

// Helper function to extract region from match ID in path
function extractRegionFromMatchId(pathname: string): string {
  // Match endpoints with matchId (e.g., /lol/match/v5/matches/KR_680830235)
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
  const originalPath = url.pathname.substring('/api/riot'.length);
  console.log('originalPath', originalPath);
  const isAccountEndpoint = originalPath.includes('by-riot-id');
  const match = originalPath.match(/by-riot-id\/([^/]+)\/([^/]+)/);
  let tagLine = ''
  if (match) {
    const gameName = match[1];
    tagLine = match[2];
  }
  const regionalHost = tagToRegionalHost(tagLine) 
  || extractRegionFromMatchId(originalPath)
  || "asia";
  // Extract puuid from match endpoints for region lookup
  let puuid = '';
  const puuidMatch = originalPath.match(/by-puuid\/([^/]+)/);
  if (puuidMatch) {
    puuid = puuidMatch[1];
  }
  const needsRegionalLookup = regionalHost === '' && puuid !== '' && !extractRegionFromMatchId(originalPath);
  
  let targetHost = '';
  if (needsRegionalLookup) {
    try{
        const regionLookupUrl = `https://asia.api.riotgames.com/riot/account/v1/region/by-game/lol/by-puuid/${encodeURIComponent(puuid)}`;
        const lookupResp = await fetch(regionLookupUrl, { 
          headers: { 
            'X-Riot-Token': apiKey 
          } 
        });
        if (lookupResp.ok) {
          const regionDto: { puuid: string; game: string; region: string } = await lookupResp.json();
          targetHost = `${tagToRegionalHost(regionDto.region)}.api.riotgames.com`;
        } else {
          console.warn('[Functions] Region lookup response missing region field', { status: lookupResp.status, originalPath });
          return new Response(JSON.stringify({ 
            error: 'Region lookup failed', 
            details: 'Region lookup response did not contain a valid region field. Please check the puuid or provide a ?tag parameter.' 
          }), {
            status: 400,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': corsOrigin }
          });
        }
    }catch (e) {
      console.error('[Functions] Region lookup error', { error: e instanceof Error ? e.message : 'Unknown', originalPath }); 
    }
  }else{
    targetHost = `${regionalHost}.api.riotgames.com`;
  }

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
  console.log('targetHost', targetHost);

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


