'use client';

import { useState, useEffect, useCallback } from 'react';
import type { CSSProperties } from 'react';

const GUARD_TOKEN = process.env.NEXT_PUBLIC_GUARD_TOKEN ?? '';
const AUTH_HEADERS: Record<string, string> = GUARD_TOKEN ? { 'x-guard-token': GUARD_TOKEN } : {};

// ── Types ────────────────────────────────────────────────────────────────────
interface Trend       { title: string; url: string; source: string; source_color: string; source_icon: string; time_ago: string; summary: string; }
interface Tweet       { type: 'influencer_voice' | 'news_hook'; format: string; reply_potential: 'HIGH' | 'MEDIUM' | 'LOW'; best_time: string; reply_strategy: string; text: string; char_count: number; reasoning: string; }
interface Report      { date: string; generated_at: string; trends: Trend[]; tweets: Tweet[]; tip: string; }
interface PostedTweet { id: string; posted_at: string; text: string; format: string; type: 'influencer_voice' | 'news_hook'; views: number; likes: number; replies: number; reposts: number; }
interface FormatStats { format: string; type: string; count: number; avg_views: number; avg_likes: number; avg_replies: number; avg_reposts: number; eng_rate: number; }
interface Toast       { id: number; type: 'success' | 'error' | 'info'; message: string; }

// ── Persistence ───────────────────────────────────────────────────────────────
const KEY        = 'uxgsol_reports';
const POSTED_KEY = 'uxgsol_posted';

function loadHistory(): Report[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function saveReport(r: Report) {
  try {
    const prev = loadHistory().filter(x => x.date !== r.date);
    localStorage.setItem(KEY, JSON.stringify([r, ...prev].slice(0, 30)));
  } catch {}
}
function loadPostedTweets(): PostedTweet[] {
  try { return JSON.parse(localStorage.getItem(POSTED_KEY) ?? '[]'); } catch { return []; }
}
function savePostedTweet(tw: PostedTweet) {
  const prev = loadPostedTweets();
  localStorage.setItem(POSTED_KEY, JSON.stringify([tw, ...prev].slice(0, 200)));
}
function updatePostedTweet(id: string, metrics: Partial<PostedTweet>) {
  const prev = loadPostedTweets();
  localStorage.setItem(POSTED_KEY, JSON.stringify(prev.map(t => t.id === id ? { ...t, ...metrics } : t)));
}
function computeFormatStats(tweets: PostedTweet[]): FormatStats[] {
  const tracked = tweets.filter(t => t.views > 0);
  const groups = new Map<string, PostedTweet[]>();
  for (const t of tracked) {
    if (!groups.has(t.format)) groups.set(t.format, []);
    groups.get(t.format)!.push(t);
  }
  return Array.from(groups.entries()).map(([format, ts]) => {
    const count       = ts.length;
    const avg_views   = Math.round(ts.reduce((s, t) => s + t.views,   0) / count);
    const avg_likes   = Math.round(ts.reduce((s, t) => s + t.likes,   0) / count);
    const avg_replies = Math.round(ts.reduce((s, t) => s + t.replies, 0) / count);
    const avg_reposts = Math.round(ts.reduce((s, t) => s + t.reposts, 0) / count);
    const eng_rate    = avg_views > 0 ? Math.round(((avg_likes + avg_replies + avg_reposts) / avg_views) * 1000) / 10 : 0;
    return { format, type: ts[0].type, count, avg_views, avg_likes, avg_replies, avg_reposts, eng_rate };
  }).sort((a, b) => b.eng_rate - a.eng_rate);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtBadge(f: string) {
  const s = f.toLowerCase();
  if (s.includes('influencer')) return 'badge b-truth';
  if (s.includes('news') || s.includes('hook')) return 'badge b-crazy';
  if (s.includes('crazy'))  return 'badge b-crazy';
  if (s.includes('hidden') || s.includes('timeline')) return 'badge b-hidden';
  if (s.includes('truth') || s.includes('unpopular')) return 'badge b-truth';
  if (s.includes('data'))   return 'badge b-data';
  return 'badge b-crazy';
}
function potBadge(p: string) {
  if (p === 'HIGH')   return 'badge b-high';
  if (p === 'MEDIUM') return 'badge b-medium';
  return 'badge b-low';
}
function potLabel(p: string) { return p === 'HIGH' ? '▲ HIGH' : p === 'MEDIUM' ? '◆ MED' : '▼ LOW'; }
function barColor(n: number) { const r = n / 280; return r > .9 ? '#ef4444' : r > .75 ? '#eab308' : '#7c3aed'; }
function fmtTime(iso: string) { try { return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
function fmtDate(iso: string) { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return ''; } }
function todayStr() { return new Date().toISOString().split('T')[0]; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }

const INPUT_STYLE: CSSProperties = {
  background: '#1e293b', border: '1px solid #2d3f57', color: '#f1f5f9',
  padding: '6px 10px', borderRadius: 7, fontSize: 13, width: '100%',
  fontFamily: 'inherit', outline: 'none',
};

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [tab,          setTab]          = useState<'today' | 'history' | 'mytweets' | 'settings'>('today');
  const [report,       setReport]       = useState<Report | null>(null);
  const [history,      setHistory]      = useState<Report[]>([]);
  const [postedTweets, setPostedTweets] = useState<PostedTweet[]>([]);
  const [stats,        setStats]        = useState<FormatStats[]>([]);
  const [metricDraft,  setMetricDraft]  = useState<Record<string, { views: string; likes: string; replies: string; reposts: string }>>({});
  const [loading,      setLoading]      = useState(false);
  const [stage,        setStage]        = useState(1);
  const [stageMsg,     setStageMsg]     = useState('');
  const [stageSub,     setStageSub]     = useState('');
  const [apiKeySet,    setApiKeySet]    = useState(false);
  const [toasts,       setToasts]       = useState<Toast[]>([]);
  const [saved,        setSaved]        = useState<Set<number>>(new Set());
  const [skipped,      setSkipped]      = useState<Set<number>>(new Set());
  const [posted,       setPosted]       = useState<Set<number>>(new Set());
  const [dateLabel,    setDateLabel]    = useState('');

  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
    const hist = loadHistory();
    setHistory(hist);
    const todayReport = hist.find(r => r.date === todayStr());
    if (todayReport) setReport(todayReport);
    const pt = loadPostedTweets();
    setPostedTweets(pt);
    setStats(computeFormatStats(pt));
    fetchStatus();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toast = useCallback((type: Toast['type'], message: string) => {
    const id = Date.now();
    setToasts(p => [...p, { id, type, message }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch('/api/status');
      const s = await r.json() as { api_key_set: boolean };
      setApiKeySet(s.api_key_set);
    } catch {}
  }, []);

  const markAsPosted = useCallback((tw: Tweet, index: number) => {
    const pt: PostedTweet = {
      id: uid(), posted_at: new Date().toISOString(),
      text: tw.text, format: tw.format, type: tw.type,
      views: 0, likes: 0, replies: 0, reposts: 0,
    };
    savePostedTweet(pt);
    const updated = loadPostedTweets();
    setPostedTweets(updated);
    setStats(computeFormatStats(updated));
    setPosted(p => new Set(p).add(index));
    toast('success', '📤 Marked as posted! Add metrics in My Tweets.');
  }, [toast]);

  const initMetricDraft = useCallback((tw: PostedTweet) => {
    setMetricDraft(p => ({
      ...p,
      [tw.id]: {
        views:   tw.views   > 0 ? String(tw.views)   : '',
        likes:   tw.likes   > 0 ? String(tw.likes)   : '',
        replies: tw.replies > 0 ? String(tw.replies) : '',
        reposts: tw.reposts > 0 ? String(tw.reposts) : '',
      },
    }));
  }, []);

  const saveMetrics = useCallback((id: string) => {
    const draft = metricDraft[id];
    if (!draft) return;
    updatePostedTweet(id, {
      views:   parseInt(draft.views)   || 0,
      likes:   parseInt(draft.likes)   || 0,
      replies: parseInt(draft.replies) || 0,
      reposts: parseInt(draft.reposts) || 0,
    });
    const updated = loadPostedTweets();
    setPostedTweets(updated);
    setStats(computeFormatStats(updated));
    setMetricDraft(p => { const n = { ...p }; delete n[id]; return n; });
    toast('success', '✅ Metrics saved!');
  }, [metricDraft, toast]);

  const generateReport = useCallback(async () => {
    setLoading(true); setStage(1);
    setStageMsg('🔍 Scanning crypto news for wild stories...');
    setStageSub('CryptoPanic · CoinDesk · Decrypt · The Defiant');
    setSaved(new Set()); setSkipped(new Set()); setPosted(new Set());

    const currentStats = computeFormatStats(loadPostedTweets());
    const formatHint = currentStats[0]?.format ?? '';

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { ...AUTH_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ format_hint: formatHint }),
      });
      if (!res.ok) { const e = await res.json() as { error: string }; throw new Error(e.error); }

      const reader = res.body!.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as Record<string, unknown>;
            if (ev.type === 'progress') {
              setStage((ev.stage as number) ?? 1);
              setStageMsg((ev.message as string) ?? '');
              setStageSub((ev.sub as string) ?? '');
            } else if (ev.type === 'complete') {
              const r = ev.data as Report;
              setReport(r); saveReport(r);
              setHistory(loadHistory());
              toast('success', '✅ Report generated!');
              setTab('today');
            } else if (ev.type === 'error') {
              throw new Error((ev.message as string) ?? 'Generation failed');
            }
          } catch (e) { if (e instanceof SyntaxError) continue; throw e; }
        }
      }
    } catch (e) {
      toast('error', `❌ ${e instanceof Error ? e.message : 'Generation failed. Check API key.'}`);
    } finally { setLoading(false); }
  }, [toast]);

  const viewHistoryReport = useCallback((r: Report) => {
    setReport(r); setTab('today');
    setSaved(new Set()); setSkipped(new Set()); setPosted(new Set());
    toast('info', `📅 Viewing report from ${r.date}`);
  }, [toast]);

  return (
    <div className="layout">

      {/* Loading Overlay */}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner" />
          <div>
            <div className="loading-stage">{stageMsg}</div>
            <div className="loading-sub">{stageSub}</div>
          </div>
          <div className="stage-dots">
            {[1, 2, 3].map(i => <div key={i} className={`stage-dot${i <= stage ? ' active' : ''}`} />)}
          </div>
        </div>
      )}

      {/* Toasts */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="logo-icon">⚡</div>
          <div>
            <div className="logo-name">UxGsol AI</div>
            <div className="logo-sub">Content Assistant</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {([
            ['today',    '📊', "Today's Report"],
            ['history',  '🕐', 'History'],
            ['mytweets', '📤', 'My Tweets'],
            ['settings', '⚙️', 'Settings'],
          ] as const).map(([t, icon, label]) => (
            <div key={t} className={`nav-item${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              <span>{icon}</span>
              <span>{label}</span>
              {t === 'mytweets' && postedTweets.length > 0 && (
                <span style={{ marginLeft: 'auto', background: '#7c3aed', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                  {postedTweets.length}
                </span>
              )}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="status-row">
            <div className={`status-dot ${apiKeySet ? 'on' : 'off'}`} />
            <span className="stat-row" style={{ color: 'var(--muted)' }}>{apiKeySet ? 'API Connected' : 'Key Missing'}</span>
          </div>
          <div className="stat-row">
            <div>Reports: <span className="stat-val">{history.length}</span></div>
            <div>Posted: <span className="stat-val">{postedTweets.length}</span></div>
            <div>Account: <span className="stat-val">@UxGsol</span></div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main">

        {/* Header */}
        <div className="header">
          <div>
            <div className="header-title">
              {tab === 'today' ? "Today's Report" : tab === 'history' ? 'History' : tab === 'mytweets' ? 'My Tweets' : 'Settings'}
            </div>
            <div className="header-sub">
              {tab === 'today'    ? (report && report.date !== todayStr() ? `Viewing report from ${report.date}` : "AI-powered tweet drafts from today's crypto trends")
               : tab === 'history'  ? 'Browse previously generated reports'
               : tab === 'mytweets' ? 'Track performance and improve future generations'
               : 'API key and account configuration'}
            </div>
          </div>
          <div className="header-right">
            <div className="date-badge">{dateLabel}</div>
            <button className="btn-primary" onClick={generateReport} disabled={loading}>
              <span>⚡</span>
              <span>{loading ? 'Generating...' : 'Generate Report'}</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="content">

          {/* TODAY */}
          {tab === 'today' && (
            !report
              ? (
                <div className="empty-state">
                  <div className="empty-icon">📡</div>
                  <div className="empty-title">No Report Generated Yet</div>
                  <div className="empty-desc">Click &quot;Generate Report&quot; to scan today&apos;s crypto trends and create 5 high-engagement tweet drafts — 2 Influencer Voice + 3 News Hook — optimised for the 2026 X algorithm.</div>
                  <button className="btn-primary" onClick={generateReport}>
                    <span>⚡</span> Generate Today&apos;s Report
                  </button>
                </div>
              ) : (
                <>
                  {/* Tip */}
                  <div className="tip-banner">
                    <div className="tip-header">
                      <span style={{ fontSize: 18 }}>💡</span>
                      <span className="tip-label">Today&apos;s Strategy</span>
                    </div>
                    <p className="tip-body">{report.tip}</p>
                  </div>

                  {/* Trends */}
                  <div className="section-label">📈 Trending Topics</div>
                  <div className="trends-grid">
                    {report.trends.map((t, i) => (
                      <div key={i} className="trend-card slide-in" style={{ animationDelay: `${i * 0.04}s` }}>
                        <div>
                          <span className="trend-src" style={{ background: `${t.source_color}18`, color: t.source_color, border: `1px solid ${t.source_color}30` }}>
                            {t.source_icon} {t.source}
                          </span>
                        </div>
                        <div className="trend-title">{t.title}</div>
                        {t.summary && <div className="trend-summary">{t.summary}</div>}
                        <div className="trend-meta">
                          <span className="trend-time">{t.time_ago}</span>
                          {t.url && <a href={t.url} target="_blank" rel="noopener noreferrer" className="trend-link">Read →</a>}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Tweets */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div className="section-label" style={{ marginBottom: 0 }}>✍️ Tweet Drafts</div>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>{report.tweets.length} drafts</span>
                  </div>

                  {report.tweets.map((tw, i) => {
                    const pct = Math.min(100, Math.round((tw.char_count / 280) * 100));
                    return (
                      <div key={i} id={`tw-${i}`} className={`tweet-card slide-in${skipped.has(i) ? ' skipped' : ''}`} style={{ animationDelay: `${i * 0.07}s` }}>
                        <div className="tweet-header">
                          <span className={fmtBadge(tw.format)}>{tw.format}</span>
                          <span className={potBadge(tw.reply_potential)} style={{ fontSize: 9 }}>{potLabel(tw.reply_potential)}</span>
                          <span className="tweet-char">{tw.char_count}/280</span>
                        </div>
                        <div className="tweet-body">{tw.text}</div>
                        <div className="char-bar-bg">
                          <div className="char-bar-fill" style={{ width: `${pct}%`, background: barColor(tw.char_count) }} />
                        </div>
                        {tw.best_time && (
                          <div style={{ fontSize: 12, color: '#a78bfa', marginTop: 8, fontWeight: 500 }}>
                            🕐 Best time: {tw.best_time}
                          </div>
                        )}
                        {tw.reply_strategy && (
                          <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 6, background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.15)', borderRadius: 7, padding: '7px 10px', lineHeight: 1.5 }}>
                            💬 <strong style={{ color: '#a78bfa' }}>Reply strategy:</strong> {tw.reply_strategy}
                          </div>
                        )}
                        {tw.reasoning && <div className="tweet-reasoning">💡 {tw.reasoning}</div>}
                        <div className="tweet-actions">
                          <button className="btn-action btn-copy" onClick={() => { navigator.clipboard.writeText(tw.text).then(() => toast('success', '📋 Copied!')).catch(() => toast('error', 'Copy failed')); }}>📋 Copy</button>
                          <button className="btn-action btn-save" disabled={saved.has(i)} onClick={() => { setSaved(p => new Set(p).add(i)); toast('success', '✅ Saved!'); }}>{saved.has(i) ? '✓ Saved' : '✅ Save'}</button>
                          <button
                            className="btn-action"
                            disabled={posted.has(i)}
                            style={{ background: posted.has(i) ? 'rgba(34,197,94,.15)' : 'rgba(99,102,241,.15)', color: posted.has(i) ? '#4ade80' : '#818cf8', border: `1px solid ${posted.has(i) ? 'rgba(34,197,94,.3)' : 'rgba(99,102,241,.3)'}` }}
                            onClick={() => markAsPosted(tw, i)}
                          >
                            {posted.has(i) ? '✓ Posted' : '📤 Mark as Posted'}
                          </button>
                          <button className="btn-action btn-skip" onClick={() => setSkipped(p => new Set(p).add(i))}>✕ Skip</button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )
          )}

          {/* HISTORY */}
          {tab === 'history' && (
            history.length === 0
              ? (
                <div className="empty-state">
                  <div className="empty-icon">🕐</div>
                  <div className="empty-title">No History Yet</div>
                  <div className="empty-desc">Generated reports are saved here automatically.</div>
                </div>
              ) : (
                <div>
                  {history.map((r, i) => (
                    <div key={i} className="history-card" onClick={() => viewHistoryReport(r)}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{r.date}</div>
                        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3 }}>{r.tweets.length} tweets · {r.trends.length} trends · {fmtTime(r.generated_at)}</div>
                      </div>
                      <div style={{ color: 'var(--primary)', fontSize: 18 }}>→</div>
                    </div>
                  ))}
                </div>
              )
          )}

          {/* MY TWEETS */}
          {tab === 'mytweets' && (
            <div>
              {/* Analytics — only show when we have tracked data */}
              {stats.length > 0 && (
                <div className="settings-card" style={{ marginBottom: 24 }}>
                  <div className="settings-title">📊 Format Analytics</div>
                  <div className="settings-sub" style={{ marginBottom: 16 }}>
                    Based on {postedTweets.filter(t => t.views > 0).length} tracked tweet{postedTweets.filter(t => t.views > 0).length !== 1 ? 's' : ''} with metrics
                    {stats[0] && <span style={{ color: '#a78bfa', marginLeft: 8, fontWeight: 600 }}>· Best: {stats[0].format}</span>}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {stats.map((s, i) => (
                      <div key={s.format} style={{ background: i === 0 ? 'rgba(124,58,237,.08)' : 'rgba(255,255,255,.02)', border: `1px solid ${i === 0 ? 'rgba(124,58,237,.25)' : '#1e293b'}`, borderRadius: 10, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span className={fmtBadge(s.format)}>{s.format}</span>
                          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.count} tweet{s.count !== 1 ? 's' : ''}</span>
                          {i === 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#4ade80', fontWeight: 600 }}>⭐ top performer</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12 }}>
                          <span style={{ color: 'var(--dim)' }}>👁 <strong style={{ color: '#f1f5f9' }}>{s.avg_views.toLocaleString()}</strong> avg views</span>
                          <span style={{ color: 'var(--dim)' }}>❤️ <strong style={{ color: '#f1f5f9' }}>{s.avg_likes}</strong> likes</span>
                          <span style={{ color: 'var(--dim)' }}>💬 <strong style={{ color: '#f1f5f9' }}>{s.avg_replies}</strong> replies</span>
                          <span style={{ color: 'var(--dim)' }}>🔁 <strong style={{ color: '#f1f5f9' }}>{s.avg_reposts}</strong> reposts</span>
                          <span style={{ color: '#a78bfa', fontWeight: 600 }}>{s.eng_rate}% eng</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {stats[0] && (
                    <div style={{ marginTop: 14, fontSize: 12, color: 'var(--dim)', background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.15)', borderRadius: 8, padding: '8px 12px' }}>
                      🤖 Next report will prioritise <strong style={{ color: '#a78bfa' }}>{stats[0].format}</strong> based on your performance data.
                    </div>
                  )}
                </div>
              )}

              {/* Posted tweets list */}
              {postedTweets.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📤</div>
                  <div className="empty-title">No Posted Tweets Yet</div>
                  <div className="empty-desc">Hit &quot;Mark as Posted&quot; on a draft after you publish it. Then come back here to log your views, likes, replies, and reposts — the AI will use this data to improve future drafts.</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {postedTweets.map(tw => {
                    const draft = metricDraft[tw.id];
                    const hasMetrics = tw.views > 0;
                    const engRate = hasMetrics
                      ? Math.round(((tw.likes + tw.replies + tw.reposts) / tw.views) * 1000) / 10
                      : null;
                    return (
                      <div key={tw.id} className="tweet-card">
                        <div className="tweet-header">
                          <span className={fmtBadge(tw.format)}>{tw.format}</span>
                          {hasMetrics && engRate !== null && (
                            <span style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600 }}>{engRate}% eng</span>
                          )}
                          <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 'auto' }}>📅 {fmtDate(tw.posted_at)}</span>
                        </div>
                        <div className="tweet-body" style={{ fontSize: 13 }}>{tw.text}</div>

                        {/* Saved metrics display */}
                        {hasMetrics && !draft && (
                          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12, marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
                            <span style={{ color: 'var(--dim)' }}>👁 <strong style={{ color: '#f1f5f9' }}>{tw.views.toLocaleString()}</strong></span>
                            <span style={{ color: 'var(--dim)' }}>❤️ <strong style={{ color: '#f1f5f9' }}>{tw.likes}</strong></span>
                            <span style={{ color: 'var(--dim)' }}>💬 <strong style={{ color: '#f1f5f9' }}>{tw.replies}</strong></span>
                            <span style={{ color: 'var(--dim)' }}>🔁 <strong style={{ color: '#f1f5f9' }}>{tw.reposts}</strong></span>
                          </div>
                        )}

                        {/* Metric entry form */}
                        {draft ? (
                          <div style={{ marginTop: 10, padding: '12px', background: 'rgba(124,58,237,.06)', border: '1px solid rgba(124,58,237,.15)', borderRadius: 9 }}>
                            <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 10 }}>Performance Metrics</div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 10 }}>
                              {(['views', 'likes', 'replies', 'reposts'] as const).map(field => (
                                <div key={field}>
                                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 4 }}>{field}</div>
                                  <input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={draft[field]}
                                    onChange={e => setMetricDraft(p => ({ ...p, [tw.id]: { ...p[tw.id], [field]: e.target.value } }))}
                                    style={INPUT_STYLE}
                                  />
                                </div>
                              ))}
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button className="btn-action btn-save" onClick={() => saveMetrics(tw.id)}>✅ Save Metrics</button>
                              <button className="btn-action btn-skip" onClick={() => setMetricDraft(p => { const n = { ...p }; delete n[tw.id]; return n; })}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="tweet-actions" style={{ marginTop: 8 }}>
                            <button
                              className="btn-action"
                              style={{ background: 'rgba(99,102,241,.12)', color: '#818cf8', border: '1px solid rgba(99,102,241,.25)' }}
                              onClick={() => initMetricDraft(tw)}
                            >
                              {hasMetrics ? '✏️ Edit Metrics' : '📊 Add Metrics'}
                            </button>
                            <button className="btn-action btn-copy" onClick={() => navigator.clipboard.writeText(tw.text).then(() => toast('success', '📋 Copied!')).catch(() => toast('error', 'Copy failed'))}>📋 Copy</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div>
              <div className="settings-card">
                <div className="settings-title">API Status</div>
                <div className="settings-sub">Your Anthropic API key powers the tweet generation.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: apiKeySet ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border: `1px solid ${apiKeySet ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`, borderRadius: 9, marginBottom: 14 }}>
                  <div className={`status-dot ${apiKeySet ? 'on' : 'off'}`} style={{ width: 9, height: 9 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: apiKeySet ? '#4ade80' : '#f87171' }}>
                    {apiKeySet ? 'Connected ✓' : 'Not set'}
                  </span>
                </div>
                {!apiKeySet && (
                  <div style={{ background: 'rgba(124,58,237,.08)', border: '1px solid rgba(124,58,237,.2)', borderRadius: 9, padding: '14px 16px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary-light)', marginBottom: 8 }}>How to add your API key on Vercel:</div>
                    <ol style={{ fontSize: 13, color: 'var(--dim)', lineHeight: 2.2, paddingLeft: 18 }}>
                      <li>Go to <span style={{ color: 'var(--primary-light)' }}>vercel.com</span> → your project</li>
                      <li>Settings → <strong style={{ color: 'var(--text)' }}>Environment Variables</strong></li>
                      <li>Add: <code style={{ background: '#1e293b', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>ANTHROPIC_API_KEY</code></li>
                      <li>Click <strong style={{ color: 'var(--text)' }}>Save</strong> → then <strong style={{ color: 'var(--text)' }}>Redeploy</strong></li>
                    </ol>
                  </div>
                )}
              </div>

              <div className="settings-card">
                <div className="settings-title">Account Profile</div>
                <div className="info-row">
                  <div>Twitter: <span style={{ color: '#a78bfa', fontWeight: 500 }}>@UxGsol</span></div>
                  <div>Niche: <span style={{ color: 'var(--dim)' }}>Crypto · DeFi · Tech</span></div>
                  <div>Language: <span style={{ color: 'var(--dim)' }}>English</span></div>
                  <div>Followers: <span style={{ color: 'var(--dim)' }}>~88K</span></div>
                </div>
              </div>

              <div className="settings-card">
                <div className="settings-title">News Sources</div>
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {[
                    ['🔥', '#f97316', 'CryptoPanic',  'free API · important filter'],
                    ['📰', '#10b981', 'CoinDesk',     'RSS'],
                    ['🔐', '#6366f1', 'Decrypt',      'RSS'],
                    ['⚡', '#8b5cf6', 'The Defiant',  'RSS'],
                    ['📡', '#06b6d4', 'CoinTelegraph', 'RSS'],
                  ].map(([icon, color, name, type]) => (
                    <div key={name as string} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                      <span style={{ color: color as string }}>{icon}</span>
                      <span style={{ color: 'var(--dim)' }}>{name}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
