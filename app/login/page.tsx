'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [shake,    setShake]    = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        setError('Wrong password. Try again.');
        setPassword('');
        setShake(true);
        setTimeout(() => setShake(false), 600);
        inputRef.current?.focus();
      }
    } catch {
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: '#030712', padding: 20,
    }}>
      <style>{`
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-8px); }
          40%      { transform: translateX(8px); }
          60%      { transform: translateX(-6px); }
          80%      { transform: translateX(6px); }
        }
        .shake { animation: shake 0.5s ease; }
        @keyframes fadeIn { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .card { animation: fadeIn 0.4s ease-out; }
      `}</style>

      <div className={`card${shake ? ' shake' : ''}`} style={{
        width: '100%', maxWidth: 380,
        background: '#0a1120',
        border: '1px solid #1e293b',
        borderRadius: 16, padding: '36px 32px',
        boxShadow: '0 0 60px rgba(124,58,237,0.12)',
      }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52,
            background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
            borderRadius: 14, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: 26, marginBottom: 14,
            boxShadow: '0 0 24px rgba(124,58,237,0.4)',
          }}>⚡</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#f1f5f9', letterSpacing: '-0.3px' }}>
            UxGsol AI
          </div>
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            Content Assistant
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <label style={{
            display: 'block', fontSize: 11, fontWeight: 700,
            color: '#64748b', letterSpacing: '1px',
            textTransform: 'uppercase', marginBottom: 8,
          }}>
            Dashboard Password
          </label>

          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Enter password..."
            autoFocus
            required
            style={{
              width: '100%', background: '#1e293b',
              border: `1px solid ${error ? '#ef444460' : '#2d3f57'}`,
              color: '#f1f5f9', padding: '11px 14px',
              borderRadius: 9, fontSize: 14, outline: 'none',
              marginBottom: 16, transition: 'border-color .15s',
              fontFamily: 'inherit',
            }}
            onFocus={e => { e.target.style.borderColor = '#7c3aed'; }}
            onBlur={e  => { e.target.style.borderColor = error ? '#ef444460' : '#2d3f57'; }}
          />

          {error && (
            <div style={{
              fontSize: 13, color: '#f87171',
              background: 'rgba(239,68,68,.08)',
              border: '1px solid rgba(239,68,68,.2)',
              borderRadius: 8, padding: '9px 13px',
              marginBottom: 16,
            }}>
              ❌ {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%', padding: '12px',
              background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
              color: 'white', fontWeight: 600, fontSize: 14,
              border: 'none', borderRadius: 9, cursor: loading || !password ? 'not-allowed' : 'pointer',
              opacity: loading || !password ? 0.5 : 1,
              transition: 'opacity .2s',
              boxShadow: '0 0 20px rgba(124,58,237,0.3)',
            }}
          >
            {loading ? '⏳ Checking...' : '🔑 Enter Dashboard'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: '#334155' }}>
          @UxGsol · Powered by Claude AI
        </div>
      </div>
    </div>
  );
}
