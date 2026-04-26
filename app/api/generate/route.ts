import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'edge';

// ── Types ──────────────────────────────────────────────────────────────────
interface Article {
  title: string;
  url: string;
  source: string;
  source_color: string;
  source_icon: string;
  time_ago: string;
  published_at?: string;
  summary: string;
}

interface Tweet {
  type: 'story' | 'influencer_voice' | 'news_hook';
  format: string;
  source_url?: string;
  source_name?: string;
  story_date?: string;
  reply_potential: 'HIGH' | 'MEDIUM' | 'LOW';
  best_time: string;
  reply_strategy: string;
  text: string;
  char_count: number;
}

// ── RSS Sources ────────────────────────────────────────────────────────────
const RSS = [
  { name: 'Decrypt',       url: 'https://decrypt.co/feed',                         color: '#6366f1', icon: '🔐' },
  { name: 'The Defiant',   url: 'https://thedefiant.io/api/feeds/rss.xml',         color: '#8b5cf6', icon: '⚡' },
  { name: 'The Block',     url: 'https://www.theblock.co/rss.xml',                 color: '#3b82f6', icon: '🧱' },
  { name: 'Blockworks',    url: 'https://blockworks.co/feed',                       color: '#f59e0b', icon: '🔨' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss',                   color: '#06b6d4', icon: '📡' },
] as const;

const SHOCK_KEYWORDS = [
  'hack', 'exploit', 'rug', 'scam', 'fraud', 'stolen', 'drain', 'crash',
  'collapse', 'bankrupt', 'arrested', 'jail', 'bug', 'breach', 'leaked',
  'lawsuit', 'ban', 'seized', 'lost', 'memecoin', 'meme coin', 'nft drama',
  'whale', 'airdrop', 'drained', 'rugpull', 'rug pull', 'drama', 'indicted',
  'convicted', 'scammed', 'hacked', 'wiped', 'liquidated', 'polymarket',
];

const BORING_KEYWORDS = [
  'price analysis', 'technical analysis', 'institutional', 'etf approval',
  'corporate adoption', 'partnership', 'regulation', 'compliance',
  'quarterly report', 'annual report', 'market cap update', 'trading volume',
  'strategic reserve', 'macro outlook', 'interest rate',
];

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
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

function shockScore(a: Article): number {
  const text = (a.title + ' ' + a.summary).toLowerCase();
  return SHOCK_KEYWORDS.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
}

function boringScore(a: Article): number {
  const text = (a.title + ' ' + a.summary).toLowerCase();
  return BORING_KEYWORDS.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
}

function isRecent(a: Article): boolean {
  if (!a.published_at) return true;
  try {
    return Date.now() - new Date(a.published_at).getTime() <= 48 * 60 * 60 * 1000;
  } catch { return true; }
}

function parseJSON<T>(raw: string): T {
  let s = raw.trim();
  if (s.startsWith('```')) s = s.split('\n').slice(1).join('\n').replace(/```[\s\S]*$/, '').trim();
  const match = s.match(/\[[\s\S]*\]/);
  if (match) s = match[0];
  try {
    return JSON.parse(s) as T;
  } catch {
    const partial = s.replace(/,?\s*\{[^}]*$/, '').replace(/,\s*$/, '') + ']';
    try {
      const result = JSON.parse(partial) as T;
      if (Array.isArray(result) && result.length > 0) return result;
    } catch { /* fall through */ }
    throw new Error(`JSON parse failed — try again (raw length: ${s.length})`);
  }
}

// ── Scraping ───────────────────────────────────────────────────────────────
function parseRSS(xml: string, src: { name: string; color: string; icon: string }): Article[] {
  const items = xml.match(/<item[^>]*>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, 5).flatMap(item => {
    const get = (tag: string) =>
      item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.trim() ?? '';
    const title = get('title');
    if (!title) return [];
    const link   = get('link') || item.match(/<link[^>]+href="([^"]+)"/i)?.[1] || get('guid') || '';
    const pub    = get('pubDate') || get('dc:date') || '';
    const desc   = stripHtml(get('description')).slice(0, 150);
    const pubIso = pub ? (() => { try { return new Date(pub).toISOString(); } catch { return undefined; } })() : undefined;
    return [{ title, url: link, source: src.name, source_color: src.color, source_icon: src.icon, time_ago: pub ? timeAgo(pub) : 'recently', published_at: pubIso, summary: desc }];
  });
}

async function fetchRSS(src: typeof RSS[number]): Promise<Article[]> {
  try {
    const res = await fetch(src.url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) });
    return parseRSS(await res.text(), src);
  } catch { return []; }
}

async function fetchCryptoPanic(): Promise<Article[]> {
  try {
    const res = await fetch(
      'https://cryptopanic.com/api/v1/posts/?auth_token=free&kind=news&filter=important',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
    );
    const d = await res.json() as { results?: { title: string; url: string; published_at: string }[] };
    return (d.results ?? []).slice(0, 8).map(p => ({
      title: p.title, url: p.url, source: 'CryptoPanic',
      source_color: '#f97316', source_icon: '🔥',
      time_ago: timeAgo(p.published_at), published_at: p.published_at, summary: '',
    }));
  } catch { return []; }
}

async function getTrends(): Promise<Article[]> {
  const settled = await Promise.allSettled([fetchCryptoPanic(), ...RSS.map(fetchRSS)]);
  const all = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set<string>();
  return all
    .filter(a => {
      const k = a.title.toLowerCase().slice(0, 50);
      if (seen.has(k)) return false;
      seen.add(k);
      return isRecent(a);
    })
    .sort((a, b) => (shockScore(b) - boringScore(b) * 2) - (shockScore(a) - boringScore(a) * 2))
    .slice(0, 12);
}

// ── Prompt ─────────────────────────────────────────────────────────────────
const SYSTEM_POSTS = `Return ONLY a JSON array. No text before or after. No markdown. No explanation.

Generate exactly 3 posts for @UxGsol (88K crypto followers) in this exact order:

═══ POST 1 — type "story" ═══
Style: @0xSweep — real events, flowing prose, dry wit. No bullet points.
Content: absurd money stories, fraud, bank errors, crypto dramas, unexpected wealth or ruin. Real events with names and approximate dates when available.
Format: 200-250 words. Short paragraphs separated by blank lines (1-2 sentences each). Last sentence: twist or unexpected outcome that reframes everything.
Use a timeless classic story OR a real event from the last 48 hours.
MUST provide source_url (exact article URL or Wikipedia/reference URL), source_name (publication or "Wikipedia"), source_date (e.g. "Apr 27" or year for timeless stories like "2021"). Never leave these empty.

═══ POST 2 — type "influencer_voice" ═══
Style: chronically online CT voice — all lowercase, CT slang, self-aware humor.
Content: IGNORE the crypto news above. Generate from universal crypto culture observations only — no news references.
Topics (pick one):
- BTC/ETH/SOL price psychology — reactions to price moves, selling too early, buying too late
- Bull/bear market personality flips — how people change depending on the market
- Airdrop and memecoin culture — FOMO, eligibility drama, degens
- Daily crypto trader absurdities — price checking, 3am decisions, portfolio refreshes
- "Bro imagine..." scenarios — relatable hypotheticals
- CT character archetypes — the "I called it" guy, the permabull, the permabear
Format: max 2 lines, 1 emoji max as punchline, ends with something reply-worthy.
Examples:
"still holding bags from 2021 but at least i know what a seed phrase is now"
"the audacity of asking 'is it a good time to buy' during a bull market AND a bear market"
"imagine explaining impermanent loss to your girlfriend 💀"
"bro explained DeFi to his dad. his dad bought a memecoin. it 10x'd. bro is still in the red 💀"

═══ POST 3 — type "news_hook" ═══
Style: shocking, specific, story-driven prose.
Content: the single most absurd or shocking crypto/tech story from the last 48 hours only.
Format: 3-4 short paragraphs. Hook → detail → twist → question that demands a reply.
REQUIRED: source_url (exact article URL), source_name (publication name), source_date (e.g. "Apr 27"). Never leave these empty.
SKIP: price analysis, institutional adoption, partnerships, ETF approvals.

You MUST return exactly 3 posts. No more, no less. max 250 words for story, max 2 lines for influencer, max 120 words for news_hook.

Return this exact JSON structure:
[{"type":"story","format":"Story","source_url":"https://...","source_name":"Publication","source_date":"Apr 27","reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 15 min","text":"...","char_count":0},{"type":"influencer_voice","format":"Influencer Voice","reply_potential":"HIGH","best_time":"12:00 UTC","reply_strategy":"Reply within 10 min","text":"...","char_count":0},{"type":"news_hook","format":"News Hook","source_url":"https://...","source_name":"Decrypt","source_date":"Apr 27","reply_potential":"HIGH","best_time":"16:00 UTC","reply_strategy":"Reply within 15 min","text":"...","char_count":0}]`;

// ── Generation ─────────────────────────────────────────────────────────────
async function genPosts(client: Anthropic, trends: Article[], formatHint: string, prevTopics: string[], perfExamples: string[]): Promise<Tweet[]> {
  const trendsText = trends.slice(0, 8).map((t, i) => {
    const dateLabel = t.published_at
      ? (() => { try { return new Date(t.published_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } })()
      : '';
    return `[${i + 1}] ${t.source}${dateLabel ? ` | ${dateLabel}` : ''} | URL: ${t.url || 'n/a'}\n${t.title}${t.summary ? `\n→ ${t.summary.slice(0, 100)}` : ''}`;
  }).join('\n\n');

  const hintLine  = formatHint    ? `\nBest performing format from analytics: "${formatHint}".` : '';
  const avoidLine = prevTopics.length ? `\nDo NOT repeat these recent topics:\n${prevTopics.slice(0, 8).map(t => `- "${t}"`).join('\n')}` : '';
  const perfLine  = perfExamples.length ? `\nTop-performing posts (match this tone):\n${perfExamples.map(e => `"${e}"`).join('\n')}` : '';

  const msg = await client.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 1500,
    system:     SYSTEM_POSTS,
    messages:   [{ role: 'user', content: `Today's crypto news (use for influencer voice + news hook):\n\n${trendsText}\n\nGenerate all 3 posts now.${hintLine}${avoidLine}${perfLine}` }],
  });

  const textBlock = msg.content.find(b => b.type === 'text') as { type: 'text'; text: string } | undefined;
  if (!textBlock) throw new Error(`No text block in response (stop_reason: ${msg.stop_reason})`);
  console.log('[genPosts] raw:', textBlock.text.slice(0, 400));
  const posts = parseJSON<Tweet[]>(textBlock.text);
  return posts.map(p => ({ ...p, char_count: p.text.length }));
}

async function genTip(trends: Article[], posts: Tweet[], client: Anthropic): Promise<string> {
  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages:   [{ role: 'user', content: `1-paragraph tip (max 60 words) for @UxGsol.\nTop story: ${trends[0]?.title ?? 'crypto'}\nBest time: ${posts[0]?.best_time ?? '14:00 UTC'}\nInclude: which post to publish first, exact time (UTC), one 30-min reply tactic.` }],
  });
  return (msg.content[0] as { type: 'text'; text: string }).text.trim();
}

// ── Handler ────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const guardToken = process.env.NEXT_PUBLIC_GUARD_TOKEN;
  if (guardToken && req.headers.get('x-guard-token') !== guardToken) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not set — add it in Vercel → Settings → Environment Variables, then Redeploy.' }, { status: 400 });
  }

  let formatHint = '';
  let previousTopics: string[] = [];
  let performanceExamples: string[] = [];
  try {
    const body = await req.json() as { format_hint?: string; previous_topics?: string[]; performance_examples?: string[] };
    formatHint          = typeof body.format_hint         === 'string' ? body.format_hint         : '';
    previousTopics      = Array.isArray(body.previous_topics)          ? body.previous_topics     : [];
    performanceExamples = Array.isArray(body.performance_examples)     ? body.performance_examples: [];
  } catch { /* no body */ }

  const client = new Anthropic({ apiKey });

  try {
    const trends = await getTrends();
    const safeTrends = trends.length
      ? trends
      : [{ title: 'Bitcoin market analysis', url: '', source: 'Fallback', source_color: '#f97316', source_icon: '₿', time_ago: 'now', summary: '' }];

    let posts = await genPosts(client, safeTrends, formatHint, previousTopics, performanceExamples);
    if (posts.length < 3) {
      posts = await genPosts(client, safeTrends, formatHint, previousTopics, performanceExamples);
    }

    const tip = await genTip(safeTrends, posts, client);

    return Response.json({
      date:         new Date().toISOString().split('T')[0],
      generated_at: new Date().toISOString(),
      trends:       safeTrends,
      tweets:       posts,
      tip,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Generation failed';
    console.error('[POST] error:', errMsg);
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
