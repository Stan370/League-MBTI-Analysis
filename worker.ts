export default {
  async fetch(request: Request, env: { RIOT_API_KEY?: string }): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle Riot API proxy requests
    if (url.pathname.startsWith('/api/riot/')) {
      // Handle CORS preflight requests
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
          },
        });
      }
      
      const apiKey = env.RIOT_API_KEY;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'Riot API key is missing. Please check your environment configuration.' }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            } 
          }
        );
      }
      
      // Extract the Riot API path from the request
      const riotApiPath = url.pathname.replace('/api/riot', '');
      const riotApiUrl = `https://asia.api.riotgames.com${riotApiPath}${url.search}`;
      
      // Forward the request to Riot API with the API key
      const riotApiRequest = new Request(riotApiUrl, {
        method: request.method,
        headers: {
          'X-Riot-Token': apiKey,
        },
      });
      
      try {
        const response = await fetch(riotApiRequest);
        const data = await response.text();
        return new Response(data, {
          status: response.status,
          statusText: response.statusText,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        });
      } catch (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch from Riot API', details: error instanceof Error ? error.message : 'Unknown error' }),
          { 
            status: 500, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            } 
          }
        );
      }
    }
    
    // Let Wrangler's assets feature serve static files; for SPA fall back to index.html
    const isAsset = url.pathname.includes('.') || url.pathname.startsWith('/assets/');
    if (isAsset) {
      // Return 404 to let Wrangler's assets serving handle the file
      return new Response(null, { status: 404 });
    }
    // For client-side routes, serve index.html from the assets directory
    const indexRequest = new Request(new URL('/index.html', url.origin), request);
    return fetch(indexRequest);
  },
};
