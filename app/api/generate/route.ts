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
  reply_potential: 'HIGH' | 'MEDIUM' | 'LOW';
  best_time: string;
  reply_strategy: string;
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

// Keywords that signal a story is actually interesting
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

// ── Scraping ───────────────────────────────────────────────────────────────
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

async function getTrends(): Promise<Article[]> {
  const settled = await Promise.allSettled([fetchCryptoPanic(), ...RSS.map(fetchRSS)]);
  const all = settled.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set<string>();
  const deduped = all.filter(a => {
    const k = a.title.toLowerCase().slice(0, 50);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // Sort by shock score so the most interesting stories float to the top
  return deduped.sort((a, b) => shockScore(b) - shockScore(a)).slice(0, 15);
}

// ── Claude ────────────────────────────────────────────────────────────────

// Influencer Voice: completely independent of news — pure CT culture/humor
const SYSTEM_INFLUENCER = `You write casual, funny CT tweets for @UxGsol (88K crypto Twitter followers). The voice is modelled after @loshmi — chronically online, self-aware, dry humor.

These tweets have ZERO connection to any news or current events. They are timeless observations about the lived experience of being a crypto person.

Pick from these topic buckets (use a different one for each tweet):
1. The daily absurdity of being a crypto trader (checking price every 4 minutes, making decisions on vibes, 3am CT browsing)
2. Bear/bull market psychology (the cope, the delusion, the "we're early" energy in every situation)
3. Making fun of "crypto bro" culture and stereotypes (the guy explaining his exit strategy, the guy who "did his research")
4. The absurdity of seed phrases, gas fees, wallets, bridges, L2s (everyday life but make it blockchain)
5. General money/wealth/failure humor in a crypto context (paper handing, missed tops, watching others win)

MANDATORY STYLE RULES:
- all lowercase. always. no exceptions.
- minimal punctuation — end sentences without periods. comma only when needed.
- CT slang used naturally: ngl, bro, imagine, no way, this is wild, gm, ngmi, the audacity, not gonna lie
- emoji ONLY as a punchline, max 1 per tweet: 💀 😭 🙏
- short sentences. rhythm matters. the punchline is the last line.
- NEVER start with a capital letter
- NEVER mention a specific coin price, specific news event, or real company announcement
- NEVER sound like a newsletter, press release, or LinkedIn post

The tweet must end with something that triggers replies — either a statement so accurate it physically hurts, or a question that CT people have very strong opinions about.

REFERENCE TWEETS (match this energy exactly, do not copy):
"my trading strategy is basically just checking crypto twitter at 3am and making decisions based on vibes"
"bro explained his exit strategy for 20 minutes. he doesn't have one."
"the way crypto people say 'we're early' after every single disaster 💀"
"4 years in crypto and the only thing i've mastered is refreshing coingecko"
"imagine losing money AND having to explain what a blockchain is to your family at dinner"
"ngl the funniest part of this cycle is watching people who called bitcoin dead in 2022 quietly buying back in"
"crypto twitter in a bull market: we're so early / crypto twitter in a bear market: we're so early"
"the audacity of a project to launch a token, go to zero, then ask you to migrate to v2 💀"
"not financial advice but also not NOT financial advice you know what i mean"

Return ONLY a valid JSON array with exactly 2 tweets, no markdown:
[{"type":"influencer_voice","format":"Influencer Voice","reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 10 min with a self-aware follow-up that extends the joke or adds a harder truth","text":"...","char_count":0,"reasoning":"..."}]`;

// News Hook: picks wildest real stories, tells them in casual CT voice
const SYSTEM_NEWS = `You write 3 "News Hook" tweets for @UxGsol (88K crypto followers) in the style of a chronically online CT person.

You will receive today's real crypto/tech news. Your job:
1. Pick the 3 MOST shocking, absurd, or genuinely wild stories — hacks, exploits, rugpulls, insane amounts lost, arrests, bans, bizarre plot twists. Ignore boring price action or standard "adoption" news.
2. Tell each story like you're texting a friend who is also very online: casual, lowercase, no formality.

Format per tweet:
- First line: the single most jaw-dropping true fact from the story — "wait, what?" energy
- 1-2 lines: who did what → how → the twist or result
- End naturally. No call-to-action. The story is wild enough.

Rules:
- lowercase throughout
- no links, no "source: X", no citations in the tweet text
- max 280 characters — count carefully
- zero fabricated details — only what's in the news provided
- CT slang welcome but don't force it

Return ONLY a valid JSON array with exactly 3 tweets, no markdown:
[{"type":"news_hook","format":"News Hook","reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 15 min with one extra detail or a shocked reaction to keep the story alive","text":"...","char_count":0,"reasoning":"..."}]`;

async function genInfluencerTweets(client: Anthropic): Promise<Tweet[]> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: SYSTEM_INFLUENCER,
    messages: [{ role: 'user', content: 'Write 2 Influencer Voice tweets now. Remember: no news, no current events, pure CT culture humor. All lowercase. Punchline at the end.' }],
  });
  let raw = (msg.content[0] as { type: 'text'; text: string }).text.trim();
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n').replace(/```[\s\S]*$/, '').trim();
  const tweets = JSON.parse(raw) as Tweet[];
  return tweets.map(t => ({ ...t, char_count: t.text.length }));
}

async function genNewsHooks(trends: Article[], client: Anthropic): Promise<Tweet[]> {
  const trendsText = trends.slice(0, 10)
    .map((t, i) => `${i + 1}. [${t.source}] ${t.title}${t.summary ? `\n   → ${t.summary.slice(0, 120)}` : ''}`)
    .join('\n');
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: SYSTEM_NEWS,
    messages: [{ role: 'user', content: `Today's crypto news (sorted by interestingness):\n\n${trendsText}\n\nWrite 3 News Hook tweets. Pick the 3 wildest stories. Tell them in CT casual voice.` }],
  });
  let raw = (msg.content[0] as { type: 'text'; text: string }).text.trim();
  if (raw.startsWith('```')) raw = raw.split('\n').slice(1).join('\n').replace(/```[\s\S]*$/, '').trim();
  const tweets = JSON.parse(raw) as Tweet[];
  return tweets.map(t => ({ ...t, char_count: t.text.length }));
}

async function genTip(trends: Article[], tweets: Tweet[], client: Anthropic): Promise<string> {
  const newsHook = tweets.find(t => t.type === 'news_hook');
  const influencer = tweets.find(t => t.type === 'influencer_voice');
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 180,
    messages: [{ role: 'user', content: `Write a 1-paragraph strategy tip (max 75 words) for @UxGsol (88K crypto Twitter followers).\nTop story today: ${trends[0]?.title ?? 'crypto'}\nBest News Hook time: ${newsHook?.best_time ?? '14:00 UTC'}\nBest Influencer Voice time: ${influencer?.best_time ?? '18:00 UTC'}\nInclude: post order, exact times (UTC), and one specific tactic for the first 30-minute reply window. Be precise and actionable.` }],
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
    return Response.json({ error: 'ANTHROPIC_API_KEY not set. Add it in Vercel Dashboard → Settings → Environment Variables, then Redeploy.' }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(ctrl) {
      const send = (obj: object) => ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`));

      try {
        send({ type: 'progress', stage: 1, message: '🔍 Scanning crypto news for wild stories...', sub: 'CryptoPanic · CoinDesk · Decrypt · The Defiant · CoinTelegraph' });
        const trends = await getTrends();
        const safeTrends = trends.length ? trends : [{ title: 'Bitcoin market analysis', url: '', source: 'Fallback', source_color: '#f97316', source_icon: '₿', time_ago: 'now', summary: '' }];
        send({ type: 'trends', data: safeTrends });

        send({ type: 'progress', stage: 2, message: '🤖 Generating tweets with Claude AI...', sub: 'Influencer Voice (no news) + News Hook (wildest stories)...' });
        // Run both generation calls in parallel — they're fully independent
        const [influencerTweets, newsHooks] = await Promise.all([
          genInfluencerTweets(client),
          genNewsHooks(safeTrends, client),
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
