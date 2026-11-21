export default async function handler(_req, res) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).json({
      ok: false,
      error: 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY environment variables',
    });
  }

  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/households?select=id&limit=1`, {
      method: 'GET',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        ok: false,
        status: response.status,
        error: `Supabase returned HTTP ${response.status}`,
      });
    }

    return res.status(200).json({
      ok: true,
      status: response.status,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
