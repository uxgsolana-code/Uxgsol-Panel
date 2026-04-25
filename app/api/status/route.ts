export const runtime = 'edge';

export async function GET() {
  const k = process.env.ANTHROPIC_API_KEY ?? '';
  return Response.json({
    api_key_set: Boolean(k),
    api_key_preview: k ? `${k.slice(0, 8)}...` : '',
  });
}
