function tagToPlatformHost(tag: string): string {
  const upper = tag.toUpperCase();
  const map: Record<string, string> = {
    NA1: 'na1', BR1: 'br1', LA1: 'la1', LA2: 'la2', OC1: 'oc1',
    EUW1: 'euw1', EUN1: 'eun1', TR1: 'tr1', RU: 'ru',
    KR: 'kr', JP1: 'jp1',
    PH2: 'ph2', SG2: 'sg2', TH2: 'th2', TW2: 'tw2', VN2: 'vn2',
  };
  return map[upper] || 'na1';
}

function tagToRegionalHost(tag: string): 'americas' | 'europe' | 'asia' | 'sea' {
  const upper = tag.toUpperCase();
  if (['NA1', 'BR1', 'LA1', 'LA2', 'OC1'].includes(upper)) return 'americas';
  if (['EUN1', 'EUW1', 'TR1', 'RU'].includes(upper)) return 'europe';
  if (['JP1', 'KR'].includes(upper)) return 'asia';
  if (['PH2', 'SG2', 'TH2', 'TW2', 'VN2'].includes(upper)) return 'sea';
  return 'americas';
}

export default {
  async fetch(request: Request, env: { RIOT_API_KEY?: string }): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/riot')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
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
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const originalPath = url.pathname.substring('/api/riot'.length) || '/';
      const tagParam = url.searchParams.get('tag') || '';

      let targetHost = '';
      if (originalPath.startsWith('/riot/account/')) {
        // Account API uses regional routing; pick by player's tagline
        const regional = tagToRegionalHost(tagParam || 'NA1');
        targetHost = `${regional}.api.riotgames.com`;
        url.searchParams.delete('tag');
      } else if (originalPath.startsWith('/lol/match/v5/')) {
        const regional = tagToRegionalHost(tagParam || 'NA1');
        targetHost = `${regional}.api.riotgames.com`;
        url.searchParams.delete('tag');
      } else {
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
        const response = new Response(upstream.body, upstream);
        response.headers.set('Access-Control-Allow-Origin', '*');
        return response;
      } catch (e) {
        return new Response(
          JSON.stringify({ error: 'Proxy error', details: e instanceof Error ? e.message : 'Unknown' }),
          { status: 502, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
        );
      }
    }

    return new Response('Not Found', { status: 404 });
  },
};
