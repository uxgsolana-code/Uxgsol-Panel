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

// ── Rotation pools ──────────────────────────────────────────────────────────
// Shuffled fresh on every generate call → different content each time
const NEWS_CATEGORIES = [
  'crypto hacks, exploits, and security breaches',
  'absurd on-chain data — whale movements, bizarre transactions, unusual wallet behaviour',
  'government and regulatory crypto absurdity',
  'crypto colliding with the mainstream world in unexpected or ironic ways',
  'DeFi protocol failures, funny liquidations, absurd situations',
  'NFT and memecoin chaos — rugpulls, scams, ridiculous valuations',
  'macro economy meeting crypto in wild or surprising ways',
  'AI and tech intersecting with crypto in unexpected or ironic ways',
] as const;

const INFLUENCER_THEMES = [
  'trader psychology — irrational decisions, FOMO, paper handing, vibes-based investing',
  'the absurdity of daily crypto life — checking prices, refreshing Coingecko, 3am decisions',
  'web3 culture criticism — the contradictions, the hype, the collective cope',
  'money and wealth humor in crypto — what winning and losing actually look like',
  'bear and bull market emotional rollercoaster — denial, euphoria, cope, hopium',
  'CT character archetypes — the "I called it" guy, the exit-strategy guy, the "we are early" guy',
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
  'hack', 'hacked', 'exploit', 'rug', 'rugpull', 'scam', 'fraud', 'stolen', 'steal',
  'drain', 'drained', 'crash', 'collapse', 'bankrupt', 'arrested', 'jail', 'prison',
  'billion', 'million', 'bug', 'breach', 'leaked', 'lawsuit', 'ban', 'banned', 'seized',
  'emergency', 'bizarre', 'insane', 'wild', 'unusual', 'unexpected', 'shocking',
  'dead', 'death', 'lost', 'loses', 'penalty', 'fine', 'vulnerable', 'vulnerability',
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
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ')
    .trim();
}

function shockScore(a: Article): number {
  const text = (a.title + ' ' + a.summary).toLowerCase();
  return SHOCK_KEYWORDS.reduce((n, kw) => n + (text.includes(kw) ? 1 : 0), 0);
}

// ── RSS scraping ───────────────────────────────────────────────────────────
function parseRSS(xml: string, src: { name: string; color: string; icon: string }): Article[] {
  const items = xml.match(/<item[^>]*>[\s\S]*?<\/item>/g) ?? [];
  return items.slice(0, 6).flatMap(item => {
    const get = (tag: string) =>
      item.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'))?.[1]?.trim() ?? '';
    const title = get('title');
    if (!title) return [];
    const link = get('link') || item.match(/<link[^>]+href="([^"]+)"/i)?.[1] || get('guid') || '';
    const pub  = get('pubDate') || get('dc:date') || '';
    const desc = stripHtml(get('description')).slice(0, 200);
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
    const res = await fetch(
      'https://cryptopanic.com/api/v1/posts/?auth_token=free&kind=news&filter=important',
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(7000) }
    );
    const d = await res.json() as { results?: { title: string; url: string; published_at: string }[] };
    return (d.results ?? []).slice(0, 10).map(p => ({
      title: p.title, url: p.url, source: 'CryptoPanic',
      source_color: '#f97316', source_icon: '🔥',
      time_ago: timeAgo(p.published_at), summary: '',
    }));
  } catch { return []; }
}

// ── Web search via Anthropic built-in tool (supplements RSS) ───────────────
async function searchCryptoNews(client: Anthropic): Promise<Article[]> {
  try {
    const today = new Date().toISOString().split('T')[0];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await (client.messages as any).create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 6 }],
      messages: [{
        role: 'user',
        content: `Today is ${today}. Search for the most shocking and unusual crypto/blockchain news from the last 24-48 hours. Use search queries like: "crypto exploit today", "defi hack 2026", "memecoin rug", "bitcoin whale unusual", "crypto arrest", "crypto scam 2026", "blockchain bug", "crypto regulation absurd".

Find 6-8 genuinely wild or surprising real stories. Return ONLY a JSON array — no explanation, no markdown:
[{"title":"...","url":"https://...","source":"site name","summary":"one sentence on what makes this wild"}]

Exclude: normal price action, standard adoption news, boring partnerships.`,
      }],
    });

    let text = '';
    for (const block of (msg.content as Array<{ type: string; text?: string }>)) {
      if (block.type === 'text' && block.text) text += block.text;
    }
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const results = JSON.parse(jsonMatch[0]) as Array<{ title: string; url: string; source: string; summary: string }>;
    return results.filter(r => r.title && r.url).map(r => ({
      title: r.title, url: r.url,
      source: r.source || 'Web Search',
      source_color: '#06b6d4', source_icon: '🔍',
      time_ago: 'today', summary: r.summary || '',
    }));
  } catch { return []; }
}

async function getTrends(client: Anthropic): Promise<Article[]> {
  // Web search + RSS run in parallel; web results get priority (already filtered)
  const [webResult, cryptoPanicResult, ...rssResults] = await Promise.allSettled([
    searchCryptoNews(client),
    fetchCryptoPanic(),
    ...RSS.map(fetchRSS),
  ]);

  const webArticles  = webResult.status        === 'fulfilled' ? webResult.value        : [];
  const cpArticles   = cryptoPanicResult.status === 'fulfilled' ? cryptoPanicResult.value : [];
  const rssArticles  = rssResults.flatMap(r => r.status === 'fulfilled' ? r.value : []);

  const seen = new Set<string>();
  const all  = [...webArticles, ...cpArticles, ...rssArticles].filter(a => {
    const k = a.title.toLowerCase().slice(0, 50);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return all.sort((a, b) => shockScore(b) - shockScore(a)).slice(0, 15);
}

// ── Prompts ────────────────────────────────────────────────────────────────
const SYSTEM_INFLUENCER = `You write casual, funny CT tweets for @UxGsol (88K crypto Twitter followers). Voice: @loshmi — chronically online, self-aware, dry humor.

These tweets have ZERO connection to any news or current events. Timeless observations about the crypto experience.

MANDATORY STYLE:
- all lowercase always
- minimal punctuation — sentences end without periods
- CT slang naturally: ngl, bro, imagine, no way, this is wild, gm, ngmi, the audacity
- emoji ONLY as punchline, max 1 per tweet: 💀 😭 🙏
- short punchy sentences, punchline lands last
- NEVER start with capital letter
- NEVER mention specific prices, news events, or company names
- NEVER sound like a newsletter or LinkedIn post
- max 50 words — short and punchy, no padding

Must end with something that triggers replies: a statement so accurate it hurts, or a question CT has strong opinions on.

REFERENCE ENERGY (do not copy, match the vibe):
"my trading strategy is basically just checking crypto twitter at 3am and making decisions based on vibes"
"bro explained his exit strategy for 20 minutes. he doesn't have one."
"the way crypto people say 'we're early' after every single disaster 💀"
"4 years in crypto and the only thing i've mastered is refreshing coingecko"
"imagine losing money AND having to explain what a blockchain is to your family at dinner"
"crypto twitter in a bull market: we're so early / crypto twitter in a bear market: we're so early"
"not financial advice but also not NOT financial advice you know what i mean"

Return ONLY a valid JSON array, no markdown:
[{"type":"influencer_voice","format":"Influencer Voice","is_thread":false,"source_url":"","source_name":"","reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 10 min with a self-aware follow-up that extends the joke","text":"...","char_count":0,"reasoning":"..."}]`;

const SYSTEM_NEWS = `You write long-form "News Hook" thread posts for @UxGsol (88K crypto followers).

Pick ONLY shocking, absurd, or genuinely wild stories. Ignore price action and boring adoption news.

Each post is a LONG-FORM THREAD-STYLE DRAFT (max 150 words):

Line 1 — HOOK: most jaw-dropping true fact. Pure "wait, what?" energy.

[blank line]

Paragraph 1 (2-3 lines): who, what, how — the setup, story unfolding.

[blank line]

Paragraph 2 (2-3 lines): details, scale, what makes it genuinely wild.

[blank line]

Final line — TWIST or QUESTION: punchline, consequence, or question that demands a reply.

Rules:
- lowercase throughout, CT energy, not a press release
- no "1/3" numbering
- no links in tweet text
- zero fabricated details
- blank lines between sections

For source_url: use the exact URL of the article you based this tweet on.
For source_name: the publication name (CoinDesk, Decrypt, etc.).

Return ONLY a valid JSON array, no markdown:
[{"type":"news_hook","format":"News Hook","is_thread":true,"source_url":"https://...","source_name":"CoinDesk","reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 15 min with one extra shocking detail to keep the story alive","text":"...","char_count":0,"reasoning":"..."}]`;

// ── Generation ─────────────────────────────────────────────────────────────
async function genInfluencerTweets(client: Anthropic, formatHint: string, themes: string[], prevTopics: string[]): Promise<Tweet[]> {
  const themesText = themes.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('\n');
  const hintLine = formatHint
    ? `\n\nPerformance data: "${formatHint}" gets the highest engagement — lean into that energy for at least one tweet.`
    : '';
  const avoidLine = prevTopics.length
    ? `\n\nDo NOT repeat or reuse any of these topics from previous sessions:\n${prevTopics.map(t => `- "${t}"`).join('\n')}`
    : '';

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: SYSTEM_INFLUENCER,
    messages: [{
      role: 'user',
      content: `Write 3 Influencer Voice tweets. No news, no current events. All lowercase. Max 50 words each. One tweet per theme, in order:

${themesText}
${hintLine}${avoidLine}`,
    }],
  });

  let raw = (msg.content[0] as { type: 'text'; text: string }).text.trim();
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n').replace(/```[\s\S]*$/, '').trim();
  const tweets = JSON.parse(raw) as Tweet[];
  return tweets.map(t => ({ ...t, char_count: t.text.length }));
}

async function genNewsHooks(trends: Article[], client: Anthropic, categories: string[], prevTopics: string[]): Promise<Tweet[]> {
  const categoriesText = categories.slice(0, 3).map((c, i) => `${i + 1}. ${c}`).join('\n');
  const trendsText = trends.slice(0, 10).map((t, i) =>
    `[${i + 1}] SOURCE: ${t.source} | URL: ${t.url || 'n/a'}\nHEADLINE: ${t.title}${t.summary ? `\nSUMMARY: ${t.summary.slice(0, 120)}` : ''}`
  ).join('\n\n');
  const avoidLine = prevTopics.length
    ? `\n\nDo NOT write about topics covered in previous sessions:\n${prevTopics.map(t => `- "${t}"`).join('\n')}`
    : '';

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: SYSTEM_NEWS,
    messages: [{
      role: 'user',
      content: `Today's crypto news:\n\n${trendsText}\n\nFor THIS session, prioritise stories from these categories:\n${categoriesText}\n\nWrite 3 News Hook thread posts. Match each to the best category. Use the URL in source_url. Follow hook → para 1 → para 2 → twist structure with blank lines.${avoidLine}`,
    }],
  });

  let raw = (msg.content[0] as { type: 'text'; text: string }).text.trim();
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n').replace(/```[\s\S]*$/, '').trim();
  const tweets = JSON.parse(raw) as Tweet[];
  return tweets.map(t => ({ ...t, char_count: t.text.length }));
}

async function genTip(trends: Article[], tweets: Tweet[], client: Anthropic): Promise<string> {
  const newsHook   = tweets.find(t => t.type === 'news_hook');
  const influencer = tweets.find(t => t.type === 'influencer_voice');
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 180,
    messages: [{
      role: 'user',
      content: `Write a 1-paragraph strategy tip (max 75 words) for @UxGsol (88K crypto followers).\nTop story: ${trends[0]?.title ?? 'crypto'}\nBest News Hook time: ${newsHook?.best_time ?? '14:00 UTC'}\nBest Influencer Voice time: ${influencer?.best_time ?? '18:00 UTC'}\nInclude: post order, exact times (UTC), and one specific first-30-minute reply tactic. Be precise.`,
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
    return Response.json({ error: 'ANTHROPIC_API_KEY not set. Add it in Vercel → Settings → Environment Variables, then Redeploy.' }, { status: 400 });
  }

  let formatHint = '';
  let previousTopics: string[] = [];
  try {
    const body = await req.json() as { format_hint?: string; previous_topics?: string[] };
    formatHint     = typeof body.format_hint === 'string'  ? body.format_hint      : '';
    previousTopics = Array.isArray(body.previous_topics)   ? body.previous_topics  : [];
  } catch { /* no body — fine */ }

  const client = new Anthropic({ apiKey });
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (obj: object) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        send({ type: 'progress', stage: 1, message: '🔍 Searching for today\'s wildest crypto stories...', sub: 'Web search · CryptoPanic · CoinDesk · Decrypt · The Defiant · CoinTelegraph' });
        const trends = await getTrends(client);
        const safeTrends = trends.length ? trends : [{ title: 'Bitcoin market analysis', url: '', source: 'Fallback', source_color: '#f97316', source_icon: '₿', time_ago: 'now', summary: '' }];
        send({ type: 'trends', data: safeTrends });

        const context = getDailyContext();

        send({ type: 'progress', stage: 2, message: '🤖 Generating 10 tweets with Claude AI...', sub: '5× Influencer Voice · 5× News Hook thread · category rotation active...' });
        const [influencerTweets, newsHooks] = await Promise.all([
          genInfluencerTweets(client, formatHint, context.influencerThemes, previousTopics),
          genNewsHooks(safeTrends, client, context.newsCategories, previousTopics),
        ]);
        const tweets = [...influencerTweets, ...newsHooks];
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
