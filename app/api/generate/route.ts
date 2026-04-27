import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const webSearchTool = { type: 'web_search_20250305', name: 'web_search' } as any;

function makeClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultHeaders: { 'anthropic-beta': 'web-search-2025-03-05' },
  });
}

export async function POST(req: Request) {
  const guardToken = process.env.NEXT_PUBLIC_GUARD_TOKEN;
  if (guardToken && req.headers.get('x-guard-token') !== guardToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set — add it in Vercel → Settings → Environment Variables, then Redeploy.' }, { status: 400 });
  }

  const client = makeClient();

  try {
    // ADIM 1: Web search ile güncel haberler bul
    const searchRes = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 800,
      tools:      [webSearchTool],
      messages: [{
        role:    'user',
        content: 'Search for 2 shocking or absurd crypto/finance news stories from 2025 or 2026. For each story give me: title, 2-3 sentence summary, source URL, date.',
      }],
    });

    const searchText = searchRes.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('\n');

    console.log('[search] result length:', searchText.length);

    // ADIM 2: Ayrı call ile JSON üret (tools YOK)
    const genRes = await client.messages.create({
      model:      'claude-sonnet-4-5',
      max_tokens: 1500,
      messages: [{
        role:    'user',
        content: `Here are today's news stories:\n${searchText || 'No search results — use your knowledge of recent 2025-2026 crypto events.'}\n\nNow write 3 social media posts for a crypto Twitter account (@UxGsol, 88K followers). Return ONLY a JSON array, no other text:\n[\n  {\n    "id": 1,\n    "type": "story",\n    "text": "Long story post in @0xSweep style, 200-250 words, paragraph by paragraph, shocking ending",\n    "source_url": "actual url here",\n    "source_name": "source name",\n    "source_date": "date",\n    "best_time": "14:00 UTC",\n    "reply_potential": "HIGH"\n  },\n  {\n    "id": 2,\n    "type": "story",\n    "text": "Second long story post, different topic, 200-250 words",\n    "source_url": "actual url here",\n    "source_name": "source name",\n    "source_date": "date",\n    "best_time": "16:00 UTC",\n    "reply_potential": "HIGH"\n  },\n  {\n    "id": 3,\n    "type": "influencer_voice",\n    "text": "Short funny crypto CT style post, all lowercase, relatable, ends with a question or hot take. Max 2 lines.",\n    "source_url": null,\n    "source_name": null,\n    "source_date": null,\n    "best_time": "12:00 UTC",\n    "reply_potential": "HIGH"\n  }\n]`,
      }],
    });

    const raw   = genRes.content[0]?.type === 'text' ? (genRes.content[0] as { type: 'text'; text: string }).text : '[]';
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error(`No JSON array found in response (raw: ${raw.slice(0, 200)})`);

    console.log('[gen] raw JSON start:', raw.slice(0, 200));

    const posts = JSON.parse(match[0]) as Array<{
      id: number;
      type: string;
      text: string;
      source_url: string | null;
      source_name: string | null;
      source_date: string | null;
      best_time: string;
      reply_potential: string;
    }>;

    // Map to the shape page.tsx expects
    const tweets = posts.map(p => ({
      type:           (p.type === 'story' ? 'story' : 'influencer_voice') as 'story' | 'influencer_voice',
      format:         p.type === 'story' ? 'Story' : 'Influencer Voice',
      source_url:     p.source_url  ?? undefined,
      source_name:    p.source_name ?? undefined,
      source_date:    p.source_date ?? undefined,
      reply_potential: (p.reply_potential ?? 'HIGH') as 'HIGH' | 'MEDIUM' | 'LOW',
      best_time:      p.best_time ?? '14:00 UTC',
      reply_strategy: 'Reply within 15 min',
      text:           p.text,
      char_count:     p.text.length,
    }));

    return NextResponse.json({
      date:         new Date().toISOString().split('T')[0],
      generated_at: new Date().toISOString(),
      trends:       [],
      tweets,
      tip:          '',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[POST] error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
