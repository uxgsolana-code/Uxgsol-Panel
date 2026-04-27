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
  source_date?: string;
  reply_potential: 'HIGH' | 'MEDIUM' | 'LOW';
  best_time: string;
  reply_strategy: string;
  text: string;
  char_count: number;
}

// ── Rotation pools ─────────────────────────────────────────────────────────
const STORY_CATEGORIES = [
  'crypto exchange hack, protocol exploit, or wallet drain with dramatic consequences',
  'memecoin or NFT drama — rug pulls, ridiculous valuations, creator meltdowns',
  'prediction market absurdity — wild bets, unexpected outcomes, market manipulation',
  'unexpected wealth — ordinary people who accidentally got rich from crypto or tech',
  'crypto arrests, indictments, or court cases — founders, traders, hackers',
  'fintech or startup scandal — fundraising fraud, executive betrayal, collapse',
] as const;

function shuffle<T>(arr: readonly T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function getDailyContext() {
  const cats = shuffle(STORY_CATEGORIES);
  return { storyCategory1: cats[0], storyCategory2: cats[1] };
}

// ── RSS Sources ────────────────────────────────────────────────────────────
const RSS = [
  { name: 'Decrypt',       url: 'https://decrypt.co/feed',                         color: '#6366f1', icon: '🔐' },
  { name: 'The Defiant',   url: 'https://thedefiant.io/api/feeds/rss.xml',         color: '#8b5cf6', icon: '⚡' },
  { name: 'The Block',     url: 'https://www.theblock.co/rss.xml',                 color: '#3b82f6', icon: '🧱' },
  { name: 'Blockworks',    url: 'https://blockworks.co/feed',                      color: '#f59e0b', icon: '🔨' },
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
Content: use the real story provided from Category 1. Include real names, exact amounts, dates.
Format: 200-250 words. Short paragraphs separated by blank lines (1-2 sentences each). Last sentence: twist or unexpected outcome.
MUST provide: source_url (real article URL), source_name (publication), source_date (e.g. "Apr 15, 2026").

═══ POST 2 — type "story" ═══
Style and format: identical to Post 1.
Content: use the real story provided from Category 2. Completely different topic from Post 1.
MUST provide: source_url, source_name, source_date.

═══ POST 3 — type "influencer_voice" ═══
Style: chronically online CT voice — all lowercase, CT slang, self-aware humor.
Content: IGNORE the news stories above. Pick one universal crypto experience:
  BTC/ETH/SOL price psychology · bull/bear personality flips · airdrop/memecoin culture
  daily trader absurdities · "bro imagine" scenarios · CT character archetypes
Format: max 2 lines, 1 emoji max as punchline, ends reply-worthy.
Examples: "still holding bags from 2021 but at least i know what a seed phrase is now"
         "the audacity of asking 'is it a good time to buy' during a bull market AND a bear market"
         "imagine explaining impermanent loss to your girlfriend 💀"

You MUST return exactly 3 posts. No more, no less.

Return this exact JSON structure:
[{"type":"story","format":"Story","source_url":"https://...","source_name":"Publication","source_date":"Apr 27, 2026","reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 15 min","text":"...","char_count":0},{"type":"story","format":"Story","source_url":"https://...","source_name":"Publication","source_date":"Apr 27, 2026","reply_potential":"HIGH","best_time":"18:00 UTC","reply_strategy":"Reply within 15 min","text":"...","char_count":0},{"type":"influencer_voice","format":"Influencer Voice","reply_potential":"HIGH","best_time":"12:00 UTC","reply_strategy":"Reply within 10 min","text":"...","char_count":0}]`;

// ── Generation ─────────────────────────────────────────────────────────────
async function genPosts(
  client: Anthropic,
  trends: Article[],
  storyCategory1: string,
  storyCategory2: string,
  formatHint: string,
  prevTopics: string[],
  perfExamples: string[]
): Promise<Tweet[]> {

  // ── STEP 1: Web search (separate call, no JSON output) ──────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webSearchTool = { type: 'web_search_20250305', name: 'web_search' } as any;

  const searchResponse = await client.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 500,
    tools:      [webSearchTool],
    messages: [{
      role: 'user',
      content: `Search for 2 recent (2025-2026) real crypto or finance stories that are shocking, absurd or unexpected.
Category 1: ${storyCategory1}
Category 2: ${storyCategory2}
Return only a brief summary of each story with the source URL and date.`,
    }],
  });

  const searchResults = searchResponse.content
    .map(b => b.type === 'text' ? (b as { type: 'text'; text: string }).text : '')
    .filter(Boolean)
    .join('\n');

  console.log('[genPosts] search results:', searchResults.slice(0, 300));

  // ── STEP 2: JSON generation (no web search tool) ────────────────────────
  const trendsText = trends.slice(0, 6).map((t, i) => {
    const dateLabel = t.published_at
      ? (() => { try { return new Date(t.published_at!).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); } catch { return ''; } })()
      : '';
    return `[${i + 1}] ${t.source}${dateLabel ? ` | ${dateLabel}` : ''}\n${t.title}`;
  }).join('\n');

  const hintLine  = formatHint         ? `\nBest performing format: "${formatHint}".`                                                              : '';
  const avoidLine = prevTopics.length  ? `\nDo NOT repeat these recent story topics:\n${prevTopics.slice(0, 8).map(t => `- "${t}"`).join('\n')}` : '';
  const perfLine  = perfExamples.length ? `\nTop-performing posts (match this tone):\n${perfExamples.map(e => `"${e}"`).join('\n')}`             : '';

  const generateResponse = await client.messages.create({
    model:      'claude-sonnet-4-20250514',
    max_tokens: 1500,
    system:     SYSTEM_POSTS,
    messages: [{
      role: 'user',
      content: `Recent stories found (use these for Story 1 and Story 2):\n${searchResults || 'No search results — use your knowledge of recent 2025-2026 crypto events.'}\n\nToday's crypto context (for influencer voice post only):\n${trendsText}\n\nStory 1 category: ${storyCategory1}\nStory 2 category: ${storyCategory2}\n\nGenerate all 3 posts now.${hintLine}${avoidLine}${perfLine}`,
    }],
  });

  const raw   = generateResponse.content[0]?.type === 'text' ? (generateResponse.content[0] as { type: 'text'; text: string }).text : '';
  const clean = raw.replace(/```json|```/g, '').trim();
  const match = clean.match(/\[[\s\S]*\]/);
  console.log('[genPosts] raw JSON:', raw.slice(0, 400));

  const posts = JSON.parse(match ? match[0] : clean) as Tweet[];
  return posts.map(p => ({ ...p, char_count: p.text.length }));
}

async function genTip(posts: Tweet[], client: Anthropic): Promise<string> {
  const firstStory = posts.find(p => p.type === 'story')?.text.split('\n')[0] ?? 'story';
  const msg = await client.messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `1-paragraph tip (max 60 words) for @UxGsol.\nToday's story: "${firstStory.slice(0, 80)}"\nBest time: ${posts[0]?.best_time ?? '14:00 UTC'}\nInclude: which post to publish first, exact time (UTC), one 30-min reply tactic.`,
    }],
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
    formatHint          = typeof body.format_hint         === 'string' ? body.format_hint          : '';
    previousTopics      = Array.isArray(body.previous_topics)          ? body.previous_topics      : [];
    performanceExamples = Array.isArray(body.performance_examples)     ? body.performance_examples : [];
  } catch { /* no body */ }

  const client = new Anthropic({
    apiKey,
    defaultHeaders: { 'anthropic-beta': 'web-search-2025-03-05' },
  });
  const context = getDailyContext();

  try {
    const trends     = await getTrends();
    const safeTrends = trends.length
      ? trends
      : [{ title: 'Bitcoin market analysis', url: '', source: 'Fallback', source_color: '#f97316', source_icon: '₿', time_ago: 'now', summary: '' }];

    let posts = await genPosts(client, safeTrends, context.storyCategory1, context.storyCategory2, formatHint, previousTopics, performanceExamples);
    if (posts.length < 3) {
      posts = await genPosts(client, safeTrends, context.storyCategory1, context.storyCategory2, formatHint, previousTopics, performanceExamples);
    }

    const tip = await genTip(posts, client);

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
