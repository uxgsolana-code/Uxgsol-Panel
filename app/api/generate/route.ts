import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'edge'; // no timeout limit for streaming on edge

// ── Types ──────────────────────────────────────────────────────────────────
interface Article {
  title: string;
  url: string;
  source: string;
  source_color: string;
  source_icon: string;
  time_ago: string;
  summary: string;
}

interface Tweet {
  format: string;
  potential: 'HIGH' | 'MEDIUM' | 'LOW';
  text: string;
  char_count: number;
  reasoning: string;
}

// ── Sources ────────────────────────────────────────────────────────────────
const RSS = [
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', color: '#10b981', icon: '📰' },
  { name: 'Decrypt',       url: 'https://decrypt.co/feed',                          color: '#6366f1', icon: '🔐' },
  { name: 'The Defiant',   url: 'https://thedefiant.io/api/feeds/rss.xml',          color: '#8b5cf6', icon: '⚡' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss',                    color: '#06b6d4', icon: '📡' },
] as const;

// ── Helpers ────────────────────────────────────────────────────────────────
function timeAgo(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  } catch { return 'recently'; }
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ')
    .trim();
}

// ── Scraping ───────────────────────────────────────────────────────────────
function parseRSS(xml: string, src: { name: string; color: string; icon: string }): Article[] {
  const items = xml.match(/<item[^>]*>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, 5).flatMap(item => {
    const get = (tag: string) =>
      item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.trim() ?? '';
    const title = get('title');
    if (!title) return [];
    const link   = get('link') || get('guid') || '';
    const pub    = get('pubDate') || get('dc:date') || '';
    const desc   = stripHtml(get('description')).slice(0, 200);
    return [{ title, url: link, source: src.name, source_color: src.color, source_icon: src.icon, time_ago: pub ? timeAgo(pub) : 'recently', summary: desc }];
  });
}

async function fetchRSS(src: typeof RSS[number]): Promise<Article[]> {
  try {
    const res = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(7000) });
    return parseRSS(await res.text(), src);
  } catch { return []; }
}

async function fetchCryptoPanic(): Promise<Article[]> {
  try {
    const res = await fetch('https://cryptopanic.com/api/free/v1/posts/?public=true&kind=news', { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(7000) });
    const d = await res.json() as { results?: { title: string; url: string; published_at: string }[] };
    return (d.results ?? []).slice(0, 8).map(p => ({ title: p.title, url: p.url, source: 'CryptoPanic', source_color: '#f97316', source_icon: '🔥', time_ago: timeAgo(p.published_at), summary: '' }));
  } catch { return []; }
}

async function getTrends(): Promise<Article[]> {
  const settled = await Promise.allSettled([fetchCryptoPanic(), ...RSS.map(fetchRSS)]);
  const all = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set<string>();
  return all.filter(a => { const k = a.title.toLowerCase().slice(0, 50); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 15);
}

// ── Claude ────────────────────────────────────────────────────────────────
const SYSTEM = `You are a Twitter content strategist for @UxGsol (crypto/DeFi/tech, 88K followers).
VOICE: Direct, informative, slightly edgy. Real and genuinely interesting. NOT clickbait.
FORMATS:
1. "Crazy Story" — Hook: [shocking headline]\nBody: who+what → how → surprising result/twist
2. "Hidden Info"  — Hook: [little-known fact]\nBody: bullet timeline\nEnd: why it matters
3. "Unpopular Truth" — Hook: Not sure who needs to hear this, but [bold opinion]\nBody: why + evidence
4. "Data Reveal" — Hook: [surprising stat]\nBody: context (add "(visual recommended)")
RULES: English only. Max 280 chars each. No fake data. First line = hook = irresistible.`;

async function genTweets(trends: Article[], client: Anthropic): Promise<Tweet[]> {
  const trendsText = trends.slice(0, 10)
    .map((t, i) => `${i + 1}. [${t.source}] ${t.title}${t.summary ? `\n   → ${t.summary.slice(0, 100)}` : ''}`)
    .join('\n');

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Today's trending topics:\n\n${trendsText}\n\nGenerate 5 tweet drafts (2× Crazy Story, 1× Hidden Info, 1× Unpopular Truth, 1× Data Reveal).\nReturn ONLY valid JSON array, no markdown:\n[{"format":"Crazy Story","potential":"HIGH","text":"...","char_count":0,"reasoning":"..."}]` }],
  });

  let raw = (msg.content[0] as { type: 'text'; text: string }).text.trim();
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n').replace(/```$/, '').trim();
  const tweets = JSON.parse(raw) as Tweet[];
  return tweets.map(t => ({ ...t, char_count: t.text.length }));
}

async function genTip(trends: Article[], tweets: Tweet[], client: Anthropic): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 180,
    messages: [{ role: 'user', content: `Write a 1-paragraph strategy tip (max 75 words) for @UxGsol (88K crypto Twitter followers).\nTop trend: ${trends[0]?.title ?? 'crypto'}\nBest format: ${tweets[0]?.format ?? 'Crazy Story'}\nInclude: best time to post (UTC), which draft to prioritize, one engagement tactic. Be specific.` }],
  });
  return (msg.content[0] as { type: 'text'; text: string }).text.trim();
}

// ── Handler ────────────────────────────────────────────────────────────────
export async function POST() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set. Add it in Vercel Dashboard → Settings → Environment Variables, then Redeploy.' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (obj: object) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        send({ type: 'progress', stage: 1, message: '🔍 Scanning crypto trends...', sub: 'CryptoPanic · CoinDesk · Decrypt · The Defiant · CoinTelegraph' });
        const trends = await getTrends();
        const safeTrends = trends.length ? trends : [{ title: 'Bitcoin market analysis', url: '', source: 'Fallback', source_color: '#f97316', source_icon: '₿', time_ago: 'now', summary: '' }];
        send({ type: 'trends', data: safeTrends });

        send({ type: 'progress', stage: 2, message: '🤖 Generating tweet drafts with Claude AI...', sub: 'Writing 5 drafts in @UxGsol style...' });
        const tweets = await genTweets(safeTrends, client);
        send({ type: 'tweets', data: tweets });

        send({ type: 'progress', stage: 3, message: '💡 Creating today\'s strategy tip...', sub: 'Almost done...' });
        const tip = await genTip(safeTrends, tweets, client);

        send({ type: 'complete', data: { date: new Date().toISOString().split('T')[0], generated_at: new Date().toISOString(), trends: safeTrends, tweets, tip } });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : 'Generation failed' });
      } finally {
        ctrl.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
  });
}
