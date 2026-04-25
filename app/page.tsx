'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ────────────────────────────────────────────────────────────────────
interface Trend  { title: string; url: string; source: string; source_color: string; source_icon: string; time_ago: string; summary: string; }
interface Tweet  { format: string; potential: string; text: string; char_count: number; reasoning: string; }
interface Report { date: string; generated_at: string; trends: Trend[]; tweets: Tweet[]; tip: string; }
interface Toast  { id: number; type: 'success' | 'error' | 'info'; message: string; }

// ── Persistence ───────────────────────────────────────────────────────────────
const KEY = 'uxgsol_reports';
function loadHistory(): Report[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
function saveReport(r: Report) {
  try {
    const prev = loadHistory().filter(x => x.date !== r.date);
    localStorage.setItem(KEY, JSON.stringify([r, ...prev].slice(0, 30)));
  } catch {}
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
function fmtBadge(f: string) {
  const s = f.toLowerCase();
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
function todayStr() { return new Date().toISOString().split('T')[0]; }

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Page() {
  const [tab,        setTab]        = useState<'today' | 'history' | 'settings'>('today');
  const [report,     setReport]     = useState<Report | null>(null);
  const [history,    setHistory]    = useState<Report[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [stage,      setStage]      = useState(1);
  const [stageMsg,   setStageMsg]   = useState('');
  const [stageSub,   setStageSub]   = useState('');
  const [apiKeySet,  setApiKeySet]  = useState(false);
  const [preview,    setPreview]    = useState('');
  const [toasts,     setToasts]     = useState<Toast[]>([]);
  const [saved,      setSaved]      = useState<Set<number>>(new Set());
  const [skipped,    setSkipped]    = useState<Set<number>>(new Set());
  const [dateLabel,  setDateLabel]  = useState('');

  // init
  useEffect(() => {
    setDateLabel(new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }));
    const hist = loadHistory();
    setHistory(hist);
    const todayReport = hist.find(r => r.date === todayStr());
    if (todayReport) setReport(todayReport);
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
      const s = await r.json() as { api_key_set: boolean; api_key_preview: string };
      setApiKeySet(s.api_key_set);
      setPreview(s.api_key_preview ?? '');
    } catch {}
  }, []);

  const generateReport = useCallback(async () => {
    setLoading(true); setStage(1);
    setStageMsg('🔍 Scanning crypto trends...');
    setStageSub('CryptoPanic · CoinDesk · Decrypt · The Defiant');
    setSaved(new Set()); setSkipped(new Set());

    try {
      const res = await fetch('/api/generate', { method: 'POST' });
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
    setSaved(new Set()); setSkipped(new Set());
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
          {(['today', 'history', 'settings'] as const).map(t => (
            <div key={t} className={`nav-item${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              <span>{t === 'today' ? '📊' : t === 'history' ? '🕐' : '⚙️'}</span>
              <span>{t === 'today' ? "Today's Report" : t === 'history' ? 'History' : 'Settings'}</span>
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
            <div>Account: <span className="stat-val">@UxGsol</span></div>
            <div>Followers: <span className="stat-val">~88K</span></div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="main">

        {/* Header */}
        <div className="header">
          <div>
            <div className="header-title">
              {tab === 'today' ? "Today's Report" : tab === 'history' ? 'History' : 'Settings'}
            </div>
            <div className="header-sub">
              {tab === 'today'   ? (report && report.date !== todayStr() ? `Viewing report from ${report.date}` : 'AI-powered tweet drafts from today\'s crypto trends')
               : tab === 'history' ? 'Browse previously generated reports'
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
                  <div className="empty-desc">Click &quot;Generate Report&quot; to scan today&apos;s crypto trends and create 5 high-engagement tweet drafts.</div>
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
                          <span className={potBadge(tw.potential)} style={{ fontSize: 9 }}>{potLabel(tw.potential)}</span>
                          <span className="tweet-char">{tw.char_count}/280</span>
                        </div>
                        <div className="tweet-body">{tw.text}</div>
                        <div className="char-bar-bg">
                          <div className="char-bar-fill" style={{ width: `${pct}%`, background: barColor(tw.char_count) }} />
                        </div>
                        {tw.reasoning && <div className="tweet-reasoning">💡 {tw.reasoning}</div>}
                        <div className="tweet-actions">
                          <button className="btn-action btn-copy" onClick={() => { navigator.clipboard.writeText(tw.text).then(() => toast('success', '📋 Copied!')).catch(() => toast('error', 'Copy failed')); }}>📋 Copy</button>
                          <button className="btn-action btn-save" disabled={saved.has(i)} onClick={() => { setSaved(p => new Set(p).add(i)); toast('success', '✅ Saved!'); }}>{saved.has(i) ? '✓ Saved' : '✅ Save'}</button>
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

          {/* SETTINGS */}
          {tab === 'settings' && (
            <div>
              <div className="settings-card">
                <div className="settings-title">API Status</div>
                <div className="settings-sub">Your Anthropic API key powers the tweet generation.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: apiKeySet ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border: `1px solid ${apiKeySet ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`, borderRadius: 9, marginBottom: 14 }}>
                  <div className={`status-dot ${apiKeySet ? 'on' : 'off'}`} style={{ width: 9, height: 9 }} />
                  <span style={{ fontSize: 13, fontWeight: 500, color: apiKeySet ? '#4ade80' : '#f87171' }}>
                    {apiKeySet ? `Connected — ${preview}` : 'Not set'}
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
                    ['🔥', '#f97316', 'CryptoPanic', 'free API'],
                    ['📰', '#10b981', 'CoinDesk',    'RSS'],
                    ['🔐', '#6366f1', 'Decrypt',     'RSS'],
                    ['⚡', '#8b5cf6', 'The Defiant', 'RSS'],
                    ['📡', '#06b6d4', 'CoinTelegraph','RSS'],
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
