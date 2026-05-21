/**
 * GET /api/reports/:id
 *
 * Reads a stored report from KV and returns it as JSON.
 * Returns 404 if not found.
 */

export async function onRequestGet(context: {
  request: Request;
  env: { REPORTS_KV?: KVNamespace };
  params: { id: string };
}) {
  const { env, params } = context;

  if (!env.REPORTS_KV) {
    return new Response(
      JSON.stringify({ error: 'KV namespace not configured' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const id = params.id;
  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Missing report ID' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const data = await env.REPORTS_KV.get(`report:${id}`);
  if (!data) {
    return new Response(
      JSON.stringify({ error: 'Report not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600', // cache 1h at edge
    },
  });
}
