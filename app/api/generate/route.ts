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
    const link   = get('link') || item.match(/<link[^>]+href="([^"]+)"/i)?.[1] || get('guid') || '';
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
const SYSTEM = `You are writing tweets for @UxGsol — a crypto CT account with 88K followers. The voice is modelled after @loshmi and top CT influencers. You are NOT a news agency. You are NOT a professional content marketer. You are a real person online who is funny, self-aware, and chronically online in the crypto world.

━━━ TWEET TYPE 1: "Influencer Voice" (write 2 of these) ━━━

This is NOT about news. This is about the lived experience of being a crypto person.

Topics that work:
- the absurdity of crypto life ("i spent 6 hours researching a protocol. it rugged at 6am. gm")
- trader psychology ("the way i check my portfolio every 4 minutes like something changed")
- bull/bear market feelings, the emotional rollercoaster
- web3 contradictions and irony
- relatable fails, delusion, cope, hopium
- observations that make other CT people go "bro literally me"

Style rules (MANDATORY):
- write in lowercase. always.
- minimal punctuation. sentences can just end
- use CT slang naturally: ngl, bro, imagine, no way, not gonna lie, this is wild, gm, ngmi, wagmi, the audacity
- emojis used sparingly for punchlines: 💀 😭 🙏
- short punchy sentences. the punchline lands at the end
- NEVER start with a capital letter
- NEVER sound like a press release or a LinkedIn post
- NEVER include a news headline or cite a source

The tweet MUST end with something that makes people reply — a relatable statement, a question they have an opinion on, or a take so accurate it hurts.

GOOD examples (study these):
"imagine explaining to your 2021 self that bitcoin etf would exist but you'd still be down 40% 💀"
"ngl the funniest part of this cycle is watching people who called bitcoin dead in 2022 quietly buying back in"
"crypto twitter in a bull market: we're so early / crypto twitter in a bear market: we're so early"
"the audacity of a project to launch a token, go to zero, then ask you to migrate to v2 💀"
"not financial advice but also not NOT financial advice you know what i mean"
"bro i spent 3 hours researching a defi protocol last night. it rugged this morning. gm"
"the way crypto people explain bear markets: 'actually this is very healthy for the ecosystem'"
"imagine paper handing eth at $80 and then spending 4 years coping about it on CT 😭"

BAD examples (never write like this):
"The crypto market shows signs of institutional adoption as BlackRock surpasses Deribit."
"AI agents are becoming more prevalent in DeFi ecosystems, signaling a paradigm shift."
"Not sure who needs to hear this, but Bitcoin fundamentals remain strong."

━━━ TWEET TYPE 2: "News Hook" (write 3 of these) ━━━

Use the real trending news provided. Pick the most genuinely wild, surprising, or absurd story.

Format: Crazy Story
- Line 1: the most shocking true fact from the story — written like you just can't believe this happened
- Body: who did what → how → the twist or result
- Tone: like you're telling a friend "bro you won't believe this"
- Still lowercase, still CT energy, not formal
- No links, no sources cited in the tweet
- End naturally — the story speaks for itself, people reply because they're shocked

━━━ ALGORITHM RULES (2026 X) ━━━
- reply = 150× a like — write for replies, not likes
- first 30 min after posting = make or break
- no external links — kills reach
- no engagement bait phrases
- text-only outperforms everything

━━━ HARD RULES ━━━
- English only
- Max 280 characters — count carefully
- Zero fabricated events or statistics
- No thread callouts
- No calls-to-action`;


async function genTweets(trends: Article[], client: Anthropic): Promise<Tweet[]> {
  const trendsText = trends.slice(0, 10)
    .map((t, i) => `${i + 1}. [${t.source}] ${t.title}${t.summary ? `\n   → ${t.summary.slice(0, 100)}` : ''}`)
    .join('\n');

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2500,
    system: SYSTEM,
    messages: [{ role: 'user', content: `Today's trending crypto news:\n\n${trendsText}\n\nGenerate exactly 5 tweets:\n- 2× "Influencer Voice" — lowercase, CT slang, relatable crypto life observation, NO news, ends with something people reply to\n- 3× "News Hook" — pick the wildest story from the news above, tell it like a friend in CT voice, shocking first line\n\nRemember: Influencer Voice tweets are about feelings/experiences/observations, NOT news summaries. Write like @loshmi, not like Reuters.\n\nReturn ONLY a valid JSON array, no markdown:\n[{"type":"influencer_voice","format":"Influencer Voice","reply_potential":"HIGH","best_time":"14:00 UTC","reply_strategy":"Reply within 10 min with a relatable follow-up that keeps the conversation going","text":"...","char_count":0,"reasoning":"..."}]` }],
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
    messages: [{ role: 'user', content: `Write a 1-paragraph strategy tip (max 75 words) for @UxGsol (88K crypto Twitter followers).\nTop trend: ${trends[0]?.title ?? 'crypto'}\nBest tweet type: ${tweets[0]?.format ?? 'Influencer Voice'}\nBest post time: ${tweets[0]?.best_time ?? '14:00 UTC'}\nInclude: which draft to post first, exactly when (UTC), and one specific reply-window tactic for the first 30 minutes. Be precise and actionable.` }],
  });
  return (msg.content[0] as { type: 'text'; text: string }).text.trim();
}

// ── Handler ────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  // Guard: reject requests that don't carry the dashboard token.
  // Set NEXT_PUBLIC_GUARD_TOKEN in Vercel env vars (any random string, e.g. a UUID).
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
        send({ type: 'progress', stage: 1, message: '🔍 Scanning crypto trends...', sub: 'CryptoPanic · CoinDesk · Decrypt · The Defiant · CoinTelegraph' });
        const trends = await getTrends();
        const safeTrends = trends.length ? trends : [{ title: 'Bitcoin market analysis', url: '', source: 'Fallback', source_color: '#f97316', source_icon: '₿', time_ago: 'now', summary: '' }];
        send({ type: 'trends', data: safeTrends });

        send({ type: 'progress', stage: 2, message: '🤖 Generating tweet drafts with Claude AI...', sub: '2× Influencer Voice · 3× News Hook · 2026 algorithm rules...' });
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
