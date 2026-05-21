/**
 * SSR handler for /report/:id
 *
 * 1. Reads the report from KV
 * 2. Reads the built index.html (SPA shell)
 * 3. Injects dynamic OG meta tags + embedded report JSON into <head>
 * 4. Returns the modified HTML
 *
 * Crawlers/social bots get proper preview cards.
 * The React SPA reads __REPORT_DATA__ on hydration to skip API calls.
 */

export async function onRequest(context: {
  request: Request;
  env: { REPORTS_KV?: KVNamespace; ASSETS: { fetch: (req: Request) => Promise<Response> } };
  params: { id: string };
}) {
  const { request, env, params } = context;
  const id = params.id;

  // Fetch the SPA shell (Vite-built index.html) from static assets
  const assetUrl = new URL('/', request.url);
  const assetResp = await env.ASSETS.fetch(new Request(assetUrl.toString(), request));
  let html = await assetResp.text();

  // If KV is not configured or no ID, return the shell as-is
  if (!env.REPORTS_KV || !id) {
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  // Try to load the report from KV
  const data = await env.REPORTS_KV.get(`report:${id}`);

  if (!data) {
    // Report not found — still serve the SPA (client will show a "not found" state)
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    const report = JSON.parse(data);

    // Build dynamic OG tags
    const playerName = `${report.summonerName}#${report.tag}`;
    const archetype = report.archetype?.title || 'Unknown';
    const mbti = report.archetype?.mbti || '????';
    const topChamp = report.topChampions?.[0]?.name || 'Champion';
    const winRate = report.aggregatedSummary?.winRate?.toFixed(1) || '??';
    const ogImage = report.archetype?.imageUrl || '';

    const ogTitle = `${playerName} — ${archetype} (${mbti})`;
    const ogDescription = `${topChamp} main · ${winRate}% WR · ${report.aggregatedSummary?.totalGames || 0} games analyzed. Discover your League MBTI personality!`;

    // Inject OG tags before </head> and embedded report data before </body>
    const ogTags = `
    <!-- SSR: Dynamic OG Tags -->
    <meta property="og:title" content="${escapeAttr(ogTitle)}" />
    <meta property="og:description" content="${escapeAttr(ogDescription)}" />
    <meta property="og:image" content="${escapeAttr(ogImage)}" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeAttr(ogTitle)}" />
    <meta name="twitter:description" content="${escapeAttr(ogDescription)}" />
    <meta name="twitter:image" content="${escapeAttr(ogImage)}" />
    <title>${escapeHtml(ogTitle)} | League MBTI Analytics</title>`;

    const embeddedData = `<script id="__REPORT_DATA__" type="application/json">${escapeScript(data)}</script>`;

    // Replace the static OG tags with dynamic ones
    // Remove existing static OG tags to avoid duplicates
    html = html
      .replace(/<meta property="og:title"[^>]*>/g, '')
      .replace(/<meta property="og:description"[^>]*>/g, '')
      .replace(/<meta property="og:type"[^>]*>/g, '')
      .replace(/<meta name="twitter:card"[^>]*>/g, '')
      .replace(/<meta name="twitter:title"[^>]*>/g, '')
      .replace(/<meta name="twitter:description"[^>]*>/g, '')
      .replace(/<title>[^<]*<\/title>/, '');

    // Inject dynamic tags
    html = html.replace('</head>', `${ogTags}\n</head>`);
    html = html.replace('</body>', `${embeddedData}\n</body>`);

    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[SSR /report] Error injecting report data:', err);
    // Fallback: serve the unmodified SPA shell
    return new Response(html, {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Prevent </script> injection inside embedded JSON */
function escapeScript(json: string): string {
  return json.replace(/<\//g, '<\\/');
}
