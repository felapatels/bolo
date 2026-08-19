import { useState } from 'react';

// ─── Inline SVG icons ───────────────────────────────────────────────────────

function FlameIcon({ color = '#fff', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <path d="M12 2C12 2 7 8 7 13a5 5 0 0 0 10 0c0-3-2-6-2-6s-.5 2-2 2c-1.1 0-2-.9-2-2 0-2 1-5 1-5z" />
    </svg>
  );
}

function StarIcon({ color = '#fff', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26" />
    </svg>
  );
}

function TrophyIcon({ color = '#fff', size = 20 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="8,21 12,17 16,21" />
      <line x1="12" y1="17" x2="12" y2="11" />
      <path d="M7 4H4a2 2 0 0 0-2 2v2c0 3.3 2.2 6 5.3 7" />
      <path d="M17 4h3a2 2 0 0 1 2 2v2c0 3.3-2.2 6-5.3 7" />
      <rect x="7" y="2" width="10" height="9" rx="1" />
    </svg>
  );
}

function ArrowRightIcon({ color = '#fff', size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12,5 19,12 12,19" />
    </svg>
  );
}

function SparklesIcon({ color = '#fff', size = 18 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z" />
      <path d="M19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75z" />
      <path d="M5 15l.75 2.25L8 18l-2.25.75L5 21l-.75-2.25L2 18l2.25-.75z" />
    </svg>
  );
}

function HomeIconSvg({ color = '#6B7280', size = 22 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  );
}

function UsersIcon({ color = '#6B7280', size = 22 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function BarChartIcon({ color = '#6B7280', size = 22 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}

function UserIcon({ color = '#6B7280', size = 22 }: { color?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function ParrotIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0D9488" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="11" rx="6" ry="7" />
      <path d="M9 8c0-2 1.5-3 3-3s3 1 3 3" />
      <circle cx="10" cy="10" r="1" fill="#0D9488" />
      <path d="M9 14c1 1 3 1 4 0" />
    </svg>
  );
}

// ─── Colour palette ──────────────────────────────────────────────────────────

const PRIMARY   = '#5B4FE8';
const ORANGE    = '#F97316';
const TEAL      = '#0D9488';
const MUTED_TXT = '#6B7280';
const DIVIDER   = '#E5E7EB';

// ─── Topic data ──────────────────────────────────────────────────────────────

const TOPICS = [
  { label: 'Greetings',  native: 'નમસ્કાર', accent: PRIMARY,   progress: 72, icon: '👋' },
  { label: 'Numbers',    native: 'સંખ્યા',  accent: TEAL,      progress: 45, icon: '🔢' },
  { label: 'Food',       native: 'ખોરાક',  accent: ORANGE,    progress: 18, icon: '🍛' },
  { label: 'Family',     native: 'કુટુંબ', accent: '#EC4899', progress: 55, icon: '👨‍👩‍👧' },
  { label: 'Travel',     native: 'પ્રવાસ', accent: '#10B981', progress: 8,  icon: '✈️' },
  { label: 'Daily Life', native: 'દૈનિક',  accent: '#8B5CF6', progress: 31, icon: '☀️' },
];

// ─── Bottom nav ───────────────────────────────────────────────────────────────

function BottomNav({ active }: { active: string }) {
  const tabs = [
    { id: 'home',     label: 'Home',     Icon: HomeIconSvg },
    { id: 'friends',  label: 'Friends',  Icon: UsersIcon },
    { id: 'bolo',     label: 'Bolo',     Icon: ParrotIcon },
    { id: 'progress', label: 'Progress', Icon: BarChartIcon },
    { id: 'profile',  label: 'Me',       Icon: UserIcon },
  ];
  return (
    <div style={{
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 72,
      background: '#FFFFFF',
      borderTop: `1px solid ${DIVIDER}`,
      display: 'flex',
      alignItems: 'center',
      padding: '0 4px 8px',
    }}>
      {tabs.map(({ id, label, Icon }) => {
        const isActive = id === active;
        const color = isActive ? PRIMARY : '#9CA3AF';
        return (
          <div key={id} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}>
            <Icon color={color} size={22} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Slim inline stat strip ───────────────────────────────────────────────────

function StatStrip() {
  const stats = [
    { icon: <FlameIcon color={ORANGE} size={16} />, value: 7,    label: 'Day Streak' },
    { icon: <StarIcon color={PRIMARY} size={16} />,  value: 1240, label: 'Total XP'  },
    { icon: <TrophyIcon color={TEAL} size={16} />,   value: 34,   label: 'Mastered'  },
  ];
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      marginTop: 18,
      background: 'transparent',
    }}>
      {stats.map((s, i) => (
        <div key={i} style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
          {/* Stat cell */}
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              {s.icon}
              <span style={{ fontSize: 18, fontWeight: 900, color: '#1A1A2E', lineHeight: 1 }}>{s.value}</span>
            </div>
            <span style={{ fontSize: 10, color: MUTED_TXT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</span>
          </div>
          {/* Divider, between items, not after last */}
          {i < stats.length - 1 && (
            <div style={{ width: 1, height: 32, background: DIVIDER, flexShrink: 0 }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Pill CTA ─────────────────────────────────────────────────────────────────

function PillCta() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 22 }}>
      <div style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        background: `linear-gradient(135deg, ${PRIMARY}, #8B5CF6)`,
        color: '#fff',
        borderRadius: 100,
        padding: '12px 24px',
        fontSize: 14,
        fontWeight: 800,
        boxShadow: `0 6px 20px ${PRIMARY}55`,
        cursor: 'pointer',
      }}>
        <FlameIcon size={18} color="#fff" />
        <span>Start Daily Practice</span>
        <div style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.22)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <ArrowRightIcon size={14} color="#fff" />
        </div>
      </div>
    </div>
  );
}

// ─── Topic tile (minimal border) ──────────────────────────────────────────────

function TopicTile({ topic }: { topic: typeof TOPICS[number] }) {
  return (
    <div style={{
      background: '#FFFFFF',
      border: `1px solid ${DIVIDER}`,
      borderRadius: 18,
      padding: '12px 10px 10px',
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
        <div style={{
          width: 34,
          height: 34,
          borderRadius: 10,
          background: `${topic.accent}18`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 17,
        }}>{topic.icon}</div>
        <span style={{ fontSize: 10, fontWeight: 800, color: topic.accent }}>{topic.progress}%</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 800, color: '#1A1A2E', lineHeight: 1.2 }}>{topic.label}</div>
      <div style={{ fontSize: 10, color: MUTED_TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.native}</div>
      <div style={{ marginTop: 4, height: 4, borderRadius: 2, background: '#F3F4F6', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${topic.progress}%`, background: topic.accent, borderRadius: 2 }} />
      </div>
    </div>
  );
}

// ─── Phone frame ─────────────────────────────────────────────────────────────

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      width: 375,
      height: 780,
      borderRadius: 44,
      background: '#FFFFFF',
      boxShadow: '0 40px 100px rgba(0,0,0,0.16), 0 0 0 2px #D1D5DB',
      position: 'relative',
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {/* Notch */}
      <div style={{
        position: 'absolute',
        top: 14,
        left: '50%',
        transform: 'translateX(-50%)',
        width: 126,
        height: 34,
        background: '#1A1A2E',
        borderRadius: 20,
        zIndex: 10,
      }} />
      {/* Status bar space */}
      <div style={{ height: 52, flexShrink: 0 }} />
      {/* Content */}
      <div style={{ position: 'absolute', top: 52, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
        {children}
      </div>
    </div>
  );
}

// ─── Home screen content ──────────────────────────────────────────────────────

function HomeScreenB() {
  return (
    <div style={{
      position: 'absolute',
      inset: 0,
      background: '#FFFFFF',
      overflowY: 'auto',
      overflowX: 'hidden',
      paddingBottom: 80,
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Header, more breathing room */}
      <div style={{ padding: '30px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p style={{ margin: '0 0 4px', fontSize: 12, fontWeight: 700, color: MUTED_TXT, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Gujarati · Wednesday
            </p>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#1A1A2E', lineHeight: 1.15 }}>Hello, Priya!</h1>
            <p style={{ margin: '6px 0 0', fontSize: 14, color: MUTED_TXT, fontWeight: 400, lineHeight: 1.5 }}>
              Ready to speak some <span style={{ color: PRIMARY, fontWeight: 600 }}>Gujarati</span> today?
            </p>
          </div>
          {/* Avatar/settings */}
          <div style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: `${PRIMARY}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={PRIMARY} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        </div>

        {/* ── OPTION B: Slim inline stat strip ── */}
        <StatStrip />

        {/* ── OPTION B: Pill CTA ── */}
        <PillCta />
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: DIVIDER, margin: '20px 24px 0' }} />

      {/* Topic grid */}
      <div style={{ padding: '20px 24px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#1A1A2E', letterSpacing: '-0.01em' }}>Topics</span>
          <span style={{ fontSize: 12, color: PRIMARY, fontWeight: 700 }}>6 available</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {TOPICS.map((t) => <TopicTile key={t.label} topic={t} />)}
        </div>
      </div>

      {/* Review row, minimal ghost */}
      <div style={{ padding: '16px 24px 0' }}>
        <div style={{
          border: `1.5px solid ${TEAL}`,
          borderRadius: 18,
          padding: '13px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'transparent',
        }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `${TEAL}12`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={TEAL} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1A1A2E' }}>Review weakest phrases</div>
            <div style={{ fontSize: 11, color: MUTED_TXT, marginTop: 1 }}>8 phrases to sharpen up</div>
          </div>
          <ArrowRightIcon size={16} color={TEAL} />
        </div>
      </div>

      <BottomNav active="home" />
    </div>
  );
}

// ─── Callout box ─────────────────────────────────────────────────────────────

function WhatChangedB() {
  const items = [
    { emoji: '📏', text: 'Stat banner replaced with a slim inline strip, icon + number + label on a plain white background, separated by hairline dividers. No card, no shadow.' },
    { emoji: '💊', text: '"Start Daily Practice" becomes a centered gradient pill button, auto-width, not full-bleed. It anchors the eye without dominating the screen.' },
    { emoji: '🧘', text: 'Header gets extra vertical breathing room; the topic grid starts higher. Overall feel is minimal, editorial, grown-up, less gamified.' },
  ];
  return (
    <div style={{
      width: 375,
      marginTop: 24,
      background: '#F0FDF9',
      border: '1.5px solid #99F6E4',
      borderRadius: 20,
      padding: '18px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      <div style={{ fontSize: 12, fontWeight: 900, color: TEAL, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>What changed</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>{item.emoji}</span>
            <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{item.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root export ─────────────────────────────────────────────────────────────

export default function HomeDesignB() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F5F7FA',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 24px 64px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    }}>
      {/* Label */}
      <div style={{ marginBottom: 20, textAlign: 'center' }}>
        <div style={{
          display: 'inline-block',
          background: TEAL,
          color: '#fff',
          fontSize: 11,
          fontWeight: 900,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          padding: '5px 14px',
          borderRadius: 100,
          marginBottom: 8,
        }}>Option B · Minimal Clean</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#1A1A2E' }}>Inline stat strip + pill CTA</div>
        <div style={{ fontSize: 14, color: MUTED_TXT, marginTop: 4 }}>Minimal, editorial, grown-up, less gamified</div>
      </div>

      <PhoneFrame>
        <HomeScreenB />
      </PhoneFrame>

      <WhatChangedB />
    </div>
  );
}
