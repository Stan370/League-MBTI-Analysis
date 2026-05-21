/**
 * POST /api/reports
 *
 * Accepts a SerializableReport, stores it in KV under "report:{id}".
 * Returns { id: string }.
 */

export async function onRequestPost(context: {
  request: Request;
  env: { REPORTS_KV?: KVNamespace };
}) {
  const { request, env } = context;

  if (!env.REPORTS_KV) {
    return new Response(
      JSON.stringify({ error: 'KV namespace not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const body = await request.json() as { report: any };
    const report = body?.report;
    if (!report || !report.summonerName) {
      return new Response(
        JSON.stringify({ error: 'Invalid report payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Generate a short deterministic-ish ID
    const raw = `${report.summonerName}#${report.tag}:${report.createdAt ?? Date.now()}`;
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    const id = Array.from(new Uint8Array(hash))
      .slice(0, 4)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Stamp the ID onto the report
    report.id = id;
    if (!report.createdAt) report.createdAt = Date.now();

    // Store in KV with 30-day TTL
    const TTL_SECONDS = 30 * 24 * 60 * 60;
    await env.REPORTS_KV.put(`report:${id}`, JSON.stringify(report), {
      expirationTtl: TTL_SECONDS,
    });

    console.log(`[reports] Saved report ${id} for ${report.summonerName}#${report.tag}`);

    return new Response(
      JSON.stringify({ id }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[reports] Error saving report:', err);
    return new Response(
      JSON.stringify({ error: 'Internal error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
