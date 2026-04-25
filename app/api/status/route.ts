export const runtime = 'edge';

export async function GET() {
  return Response.json({
    api_key_set: Boolean(process.env.ANTHROPIC_API_KEY),
  });
}
