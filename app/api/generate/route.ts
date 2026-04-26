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
  summary: string;
}

interface Tweet {
  type: 'influencer_voice' | 'news_hook';
  format: string;
  is_thread: boolean;
  source_url?: string;
  source_name?: string;
  reply_potential: 'HIGH' | 'MEDIUM' | 'LOW';
  best_time: string;
  reply_strategy: string;
  text: string;
  char_count: number;
  reasoning: string;
}

// ── Rotation pools ─────────────────────────────────────────────────────────
const NEWS_CATEGORIES = [
  'crypto hacks, exploits, and security breaches',
  'absurd on-chain data — whale movements, bizarre transactions',
  'government and regulatory crypto absurdity',
  'crypto colliding with mainstream world in unexpected ways',
  'DeFi protocol failures, funny liquidations',
  'NFT and memecoin chaos — rugpulls, ridiculous valuations',
  'macro economy meeting crypto in wild ways',
  'AI and tech intersecting with crypto unexpectedly',
] as const;

const INFLUENCER_THEMES = [
  'trader psychology — irrational decisions, FOMO, vibes-based investing',
  'the absurdity of daily crypto life — price checking, 3am decisions',
  'web3 culture criticism — contradictions, hype, collective cope',
  'money and wealth humor in crypto context',
  'bear and bull market emotional rollercoaster',
  'CT character archetypes — the "I called it" guy, exit-strategy guy',
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
  return {
    newsCategories:   shuffle(NEWS_CATEGORIES).slice(0, 3),
    influencerThemes: shuffle(INFLUENCER_THEMES).slice(0, 3),
  };
}

// ── RSS Sources ────────────────────────────────────────────────────────────
const RSS = [
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', color: '#10b981', icon: '📰' },
  { name: 'Decrypt',       url: 'https://decrypt.co/feed',                          color: '#6366f1', icon: '🔐' },
  { name: 'The Defiant',   url: 'https://thedefiant.io/api/feeds/rss.xml',          color: '#8b5cf6', icon: '⚡' },
  { name: 'CoinTelegraph', url: 'https://cointelegraph.com/rss',                    color: '#06b6d4', icon: '📡' },
] as const;

const SHOCK_KEYWORDS = [
  'hack', 'exploit', 'rug', 'scam', 'fraud', 'stolen', 'drain', 'crash',
  'collapse', 'bankrupt', 'arrested', 'jail', 'billion', 'million', 'bug',
  'breach', 'leaked', 'lawsuit', 'ban', 'seized', 'unusual', 'wild', 'lost',
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

function parseJSON<T>(raw: string): T {
  let s = raw.trim();
  // Strip markdown code fences
  if (s.startsWith('```')) s = s.split('\n').slice(1).join('\n').replace(/```[\s\S]*$/, '').trim();
  // Extract JSON array
  const match = s.match(/\[[\s\S]*\]/);
  if (match) s = match[0];
  try {
    return JSON.parse(s) as T;
  } catch {
    // If truncated, try to close the array and parse partial results
    const partial = s.replace(/,?\s*\{[^}]*$/, '').replace(/,\s*$/, '') + ']';
    try {
      const result = JSON.parse(partial) as T;
      if (Array.isArray(result) && result.length > 0) return result;
    } catch { /* fall through */ }
    throw new Error(`Claude response was cut off — try again (JSON parse failed at length ${s.length})`);
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
    const link = get('link') || item.match(/<link[^>]+href="([^"]+)"/i)?.[1] || get('guid') || '';
    const pub  = get('pubDate') || get('dc:date') || '';
    const desc = stripHtml(get('description')).slice(0, 150);
    return [{ title, url: link, source: src.name, source_color: src.color, source_icon: src.icon, time_ago: pub ? timeAgo(pub) : 'recently', summary: desc }];
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
      time_ago: timeAgo(p.published_at), summary: '',
    }));
  } catch { return []; }
}

async function getTrends(): Promise<Article[]> {
  const settled = await Promise.allSettled([fetchCryptoPanic(), ...RSS.map(fetchRSS)]);
  const all = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set<string>();
  return all
    .filter(a => { const k = a.title.toLowerCase().slice(0, 50); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => shockScore(b) - shockScore(a))
    .slice(0, 12);
}

// ── Prompts ────────────────────────────────────────────────────────────────
const SYSTEM_INFLUENCER = `You write casual CT tweets for @UxGsol (88K crypto followers). Voice: @loshmi — chronically online, self-aware, dry humor.

No news. No current events. Timeless crypto life observations.

Style (mandatory):
- all lowercase, always
- minimal punctuation
- CT slang: ngl, bro, imagine, no way, gm, ngmi, the audacity
- emoji as punchline only, max 1: 💀 😭 🙏
- punchline lands on the last line
- NEVER start with capital letter

CRITICAL: Keep each tweet under 80 words. Return valid complete JSON only. Do not truncate.

Return ONLY a valid JSON array, no markdown, no explanation:
[{"type":"influencer_voice","format":"Influencer Voice","is_thread":false,"reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 10 min","text":"...","char_count":0}]`;

const SYSTEM_NEWS = `You write News Hook posts for @UxGsol (88K crypto followers).

Pick ONLY shocking, absurd, or wild stories. Ignore price action and boring news.

Format per post (max 80 words):
Line 1 — HOOK: most jaw-dropping true fact. "Wait, what?" energy.
[blank line]
Body (2-3 lines): who, what, how, the twist.
[blank line]
Final line — consequence or question that demands a reply.

Rules: lowercase, no links in text, zero fabricated details.
Set source_url to the article URL you used, source_name to publication name.

CRITICAL: Keep each post under 80 words. Return valid complete JSON only. Do not truncate.

Return ONLY a valid JSON array, no markdown, no explanation:
[{"type":"news_hook","format":"News Hook","is_thread":true,"source_url":"https://...","source_name":"CoinDesk","reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 15 min","text":"...","char_count":0}]`;

// ── Generation ─────────────────────────────────────────────────────────────
async function genInfluencerTweets(client: Anthropic, themes: string[], formatHint: string, prevTopics: string[]): Promise<Tweet[]> {
  const themesText  = themes.map((t, i) => `${i + 1}. ${t}`).join('\n');
  const hintLine    = formatHint ? `\nPerformance data: "${formatHint}" format gets the highest engagement.` : '';
  const avoidLine   = prevTopics.length ? `\nDo NOT repeat these topics from previous sessions:\n${prevTopics.slice(0, 10).map(t => `- "${t}"`).join('\n')}` : '';

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_INFLUENCER,
    messages: [{ role: 'user', content: `Write exactly 3 Influencer Voice tweets. All lowercase. Max 80 words each. One tweet per theme:\n${themesText}${hintLine}${avoidLine}` }],
  });

  const tweets = parseJSON<Tweet[]>((msg.content[0] as { type: 'text'; text: string }).text);
  return tweets.slice(0, 3).map(t => ({ ...t, char_count: t.text.length }));
}

async function genNewsHooks(trends: Article[], client: Anthropic, categories: string[], prevTopics: string[]): Promise<Tweet[]> {
  const categoriesText = categories.map((c, i) => `${i + 1}. ${c}`).join('\n');
  const trendsText = trends.slice(0, 8).map((t, i) =>
    `[${i + 1}] ${t.source} | URL: ${t.url || 'n/a'}\n${t.title}${t.summary ? `\n→ ${t.summary.slice(0, 100)}` : ''}`
  ).join('\n\n');
  const avoidLine = prevTopics.length ? `\nDo NOT repeat topics from previous sessions:\n${prevTopics.slice(0, 10).map(t => `- "${t}"`).join('\n')}` : '';

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: SYSTEM_NEWS,
    messages: [{ role: 'user', content: `Today's crypto news:\n\n${trendsText}\n\nPrioritise these categories:\n${categoriesText}\n\nWrite exactly 3 News Hook posts. Max 80 words each. Use article URL as source_url.${avoidLine}` }],
  });

  const tweets = parseJSON<Tweet[]>((msg.content[0] as { type: 'text'; text: string }).text);
  return tweets.slice(0, 3).map(t => ({ ...t, char_count: t.text.length }));
}

async function genTip(trends: Article[], tweets: Tweet[], client: Anthropic): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    messages: [{ role: 'user', content: `1-paragraph tip (max 60 words) for @UxGsol.\nTop story: ${trends[0]?.title ?? 'crypto'}\nBest time: ${tweets[0]?.best_time ?? '14:00 UTC'}\nInclude: which tweet to post first, exact time (UTC), one 30-min reply tactic.` }],
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
  try {
    const body = await req.json() as { format_hint?: string; previous_topics?: string[] };
    formatHint     = typeof body.format_hint      === 'string' ? body.format_hint      : '';
    previousTopics = Array.isArray(body.previous_topics)       ? body.previous_topics  : [];
  } catch { /* no body */ }

  const client  = new Anthropic({ apiKey });
  const context = getDailyContext();

  try {
    const trends = await getTrends();
    const safeTrends = trends.length
      ? trends
      : [{ title: 'Bitcoin market analysis', url: '', source: 'Fallback', source_color: '#f97316', source_icon: '₿', time_ago: 'now', summary: '' }];

    const [influencerTweets, newsHooks] = await Promise.all([
      genInfluencerTweets(client, context.influencerThemes, formatHint, previousTopics),
      genNewsHooks(safeTrends, client, context.newsCategories, previousTopics),
    ]);

    const tweets = [...influencerTweets, ...newsHooks];
    const tip    = await genTip(safeTrends, tweets, client);

    return Response.json({
      date:         new Date().toISOString().split('T')[0],
      generated_at: new Date().toISOString(),
      trends:       safeTrends,
      tweets,
      tip,
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'Generation failed' }, { status: 500 });
  }
}
