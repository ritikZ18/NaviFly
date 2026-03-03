import React, { useState, useMemo } from 'react';
import { useTelemetry } from '../context/TelemetryContext';
import type { TelemetrySession } from '../context/TelemetryContext';

// ── Time bucket helpers ────────────────────────────────────────────────────────

type TimeBucket = '5min' | '1hr' | '12hr' | '1day' | 'all';

function filterByBucket(sessions: TelemetrySession[], bucket: TimeBucket): TelemetrySession[] {
    const now = Date.now();
    const cutoffs: Record<TimeBucket, number> = {
        '5min': now - 5 * 60 * 1000,
        '1hr': now - 60 * 60 * 1000,
        '12hr': now - 12 * 60 * 60 * 1000,
        '1day': now - 24 * 60 * 60 * 1000,
        'all': 0,
    };
    return sessions.filter(s => s.startTime >= cutoffs[bucket]);
}

function groupByDate(sessions: TelemetrySession[]): Record<string, TelemetrySession[]> {
    const groups: Record<string, TelemetrySession[]> = {};
    [...sessions].reverse().forEach(s => {
        const d = new Date(s.startTime);
        const key = d.toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
        if (!groups[key]) groups[key] = [];
        groups[key].push(s);
    });
    return groups;
}

function fmtTime(ms: number): string {
    return new Date(ms).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function fmtDuration(min: number): string {
    if (min < 60) return `${min}m`;
    return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function speedColor(speed: number): string {
    if (speed >= 80) return '#22c55e';
    if (speed >= 45) return '#f59e0b';
    return '#ef4444';
}

// ── Micro SVG Line Chart ───────────────────────────────────────────────────────

interface MiniChartProps {
    samples: { speed: number }[];
    width?: number;
    height?: number;
    color?: string;
}

const MiniChart: React.FC<MiniChartProps> = ({ samples, width = 200, height = 40, color = '#3b82f6' }) => {
    if (samples.length < 2) return <div style={{ height }} className="mini-chart-empty">No data yet</div>;

    const speeds = samples.map(s => s.speed);
    const max = Math.max(...speeds, 1);
    const pts = speeds.map((v, i) => {
        const x = (i / (speeds.length - 1)) * width;
        const y = height - (v / max) * (height - 4) - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');

    return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="mini-chart">
            <polyline
                points={pts}
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
            />
            <polyline
                points={`0,${height} ${pts} ${width},${height}`}
                fill={color}
                fillOpacity="0.12"
                stroke="none"
            />
        </svg>
    );
};

// ── Live Speed Panel ───────────────────────────────────────────────────────────

const LiveSpeedTab: React.FC = () => {
    const { activeSession, liveCarSpeeds } = useTelemetry();

    const simSamples = activeSession?.speedSamples.slice(-60) ?? [];
    const carSamples = liveCarSpeeds.slice(-60);

    // Density → expected speed (km/h) band
    const densityBand = carSamples.length > 0 ? {
        avg: Math.round(carSamples.reduce((a, b) => a + b.avgSpeed, 0) / carSamples.length),
        min: Math.round(Math.min(...carSamples.map(c => c.minSpeed))),
        max: Math.round(Math.max(...carSamples.map(c => c.maxSpeed))),
        density: carSamples[carSamples.length - 1]?.density ?? 'low',
    } : null;

    const latestSimSpeed = simSamples.at(-1)?.speed ?? 0;

    return (
        <div className="telem-live">
            {/* Simulation vehicle speed */}
            <div className="telem-chart-card">
                <div className="telem-chart-header">
                    <span>🚗 Simulation Vehicle Speed</span>
                    <span className="telem-badge" style={{ background: speedColor(latestSimSpeed) }}>
                        {latestSimSpeed} km/h
                    </span>
                </div>
                <MiniChart samples={simSamples} color="#3b82f6" width={320} height={50} />
                {simSamples.length === 0 && (
                    <p className="telem-hint">Start a navigation session to record speed data.</p>
                )}
            </div>

            {/* Car fleet speed */}
            <div className="telem-chart-card">
                <div className="telem-chart-header">
                    <span>🚙 Traffic Fleet Avg Speed</span>
                    {densityBand && (
                        <span className="telem-badge" style={{ background: speedColor(densityBand.avg) }}>
                            {densityBand.avg} km/h
                        </span>
                    )}
                </div>
                <MiniChart samples={carSamples.map(c => ({ speed: c.avgSpeed }))} color="#f59e0b" width={320} height={50} />
                {densityBand ? (
                    <div className="telem-band-row">
                        <span className="telem-band-label">Min</span>
                        <span style={{ color: speedColor(densityBand.min) }}>{densityBand.min} km/h</span>
                        <span className="telem-band-label">Max</span>
                        <span style={{ color: speedColor(densityBand.max) }}>{densityBand.max} km/h</span>
                        <span className="telem-band-label">Density</span>
                        <span className="telem-density" data-density={densityBand.density}>
                            {densityBand.density === 'low' ? '🟢 Light' : densityBand.density === 'medium' ? '🟡 Moderate' : '🔴 Heavy'}
                        </span>
                    </div>
                ) : (
                    <p className="telem-hint">Enable 📡 Traffic Live to track fleet speed.</p>
                )}
            </div>

            {/* TomTom density → speed mapping legend */}
            <div className="telem-chart-card telem-density-legend">
                <div className="telem-chart-header"><span>🚦 TomTom Density → Speed Reference</span></div>
                <div className="telem-density-grid">
                    <div className="telem-density-row"><span className="dot green" />Light traffic<span>~80 km/h</span></div>
                    <div className="telem-density-row"><span className="dot amber" />Moderate traffic<span>~50 km/h</span></div>
                    <div className="telem-density-row"><span className="dot red" />Heavy traffic<span>~20 km/h</span></div>
                </div>
            </div>
        </div>
    );
};

// ── Session Card ───────────────────────────────────────────────────────────────

const SessionCard: React.FC<{ session: TelemetrySession }> = ({ session: s }) => {
    const [expanded, setExpanded] = useState(false);
    const vehicleEmoji: Record<string, string> = { car: '🚗', truck: '🚛', motorcycle: '🏍️', drone: '🛸' };
    const durationMin = s.endTime
        ? Math.round((s.endTime - s.startTime) / 60000)
        : s.durationMin;

    return (
        <div className={`telem-session-card ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(e => !e)}>
            <div className="telem-session-header">
                <span className="telem-session-title">
                    {vehicleEmoji[s.vehicle] ?? '🚗'} {s.routeLabel}
                </span>
                <span className="telem-session-time">{fmtTime(s.startTime)}</span>
            </div>
            <div className="telem-session-stats">
                <span title="Duration">⏱ {fmtDuration(durationMin)}</span>
                <span title="Distance">📏 {s.distanceKm.toFixed(1)} km</span>
                <span title="Avg Speed" style={{ color: speedColor(s.avgSpeed) }}>💨 {s.avgSpeed} km/h avg</span>
                <span title="Max Speed">⚡ {s.maxSpeed} km/h max</span>
            </div>

            {expanded && (
                <div className="telem-session-detail" onClick={e => e.stopPropagation()}>
                    {/* Mini speed chart for session */}
                    {s.speedSamples.length > 1 && (
                        <div className="telem-session-chart">
                            <span className="telem-chart-label">Speed over time</span>
                            <MiniChart samples={s.speedSamples} color={speedColor(s.avgSpeed)} width={280} height={40} />
                        </div>
                    )}

                    {/* Breaks */}
                    {s.breaks.length > 0 && (
                        <div className="telem-detail-section">
                            <span className="telem-detail-title">🛑 Breaks ({s.breaks.length})</span>
                            {s.breaks.map((b, i) => (
                                <div key={i} className="telem-detail-row">
                                    {fmtTime(b.at)} — {b.durationMin} min
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Waypoints */}
                    {s.waypoints.length > 0 && (
                        <div className="telem-detail-section">
                            <span className="telem-detail-title">📍 Waypoints</span>
                            {s.waypoints.map((w, i) => (
                                <div key={i} className="telem-detail-row">↳ {w}</div>
                            ))}
                        </div>
                    )}

                    {s.breaks.length === 0 && s.waypoints.length === 0 && (
                        <p className="telem-hint" style={{ marginTop: 8 }}>No intermediate stops recorded.</p>
                    )}
                </div>
            )}
        </div>
    );
};

// ── Session Log Tab ────────────────────────────────────────────────────────────

const SessionLogTab: React.FC = () => {
    const { sessions, activeSession, clearSessions } = useTelemetry();
    const [bucket, setBucket] = useState<TimeBucket>('1day');

    const buckets: { label: string; value: TimeBucket }[] = [
        { label: '5 min', value: '5min' },
        { label: '1 hr', value: '1hr' },
        { label: '12 hr', value: '12hr' },
        { label: '1 day', value: '1day' },
        { label: 'All', value: 'all' },
    ];

    const filtered = useMemo(() => filterByBucket(sessions, bucket), [sessions, bucket]);
    const grouped = useMemo(() => groupByDate(filtered), [filtered]);
    const dateKeys = Object.keys(grouped);

    return (
        <div className="telem-log">
            {/* Active session banner */}
            {activeSession && (
                <div className="telem-active-banner">
                    <span>🔴 Recording session: <strong>{activeSession.routeLabel}</strong></span>
                    <span className="telem-active-samples">{activeSession.speedSamples.length} samples</span>
                </div>
            )}

            {/* Time bucket filter */}
            <div className="telem-bucket-bar">
                {buckets.map(b => (
                    <button
                        key={b.value}
                        className={`telem-bucket-btn ${bucket === b.value ? 'active' : ''}`}
                        onClick={() => setBucket(b.value)}
                    >
                        {b.label}
                    </button>
                ))}
                {sessions.length > 0 && (
                    <button className="telem-bucket-btn telem-clear-btn" onClick={clearSessions} title="Clear all sessions">
                        🗑
                    </button>
                )}
            </div>

            {/* Session groups */}
            {dateKeys.length === 0 ? (
                <div className="telem-empty">
                    <p>No sessions in this time range.</p>
                    <p className="telem-hint">Start a navigation to begin recording.</p>
                </div>
            ) : (
                dateKeys.map(date => (
                    <div key={date} className="telem-date-group">
                        <div className="telem-date-header">{date}</div>
                        {grouped[date].map(s => <SessionCard key={s.id} session={s} />)}
                    </div>
                ))
            )}
        </div>
    );
};

// ── Main Panel ─────────────────────────────────────────────────────────────────

const TelemetryPanel: React.FC = () => {
    const { isTelemetryOpen, setIsTelemetryOpen, sessions, activeSession } = useTelemetry();
    const [activeTab, setActiveTab] = useState<'log' | 'live'>('log');

    return (
        <>
            {/* Floating toggle button */}
            <button
                className={`telem-toggle-btn ${isTelemetryOpen ? 'active' : ''}`}
                onClick={() => setIsTelemetryOpen(!isTelemetryOpen)}
                title="Open Telemetry Dashboard"
            >
                📊
                {sessions.length > 0 && !isTelemetryOpen && (
                    <span className="telem-badge-count">{sessions.length}</span>
                )}
                {activeSession && <span className="telem-recording-dot" />}
            </button>

            {/* Slide-in panel */}
            <div className={`telem-panel ${isTelemetryOpen ? 'open' : ''}`}>
                <div className="telem-panel-header">
                    <span className="telem-panel-title">📊 NaviFly Telemetry</span>
                    <button className="telem-close-btn" onClick={() => setIsTelemetryOpen(false)}>✕</button>
                </div>

                {/* Tabs */}
                <div className="telem-tabs">
                    <button
                        className={`telem-tab ${activeTab === 'log' ? 'active' : ''}`}
                        onClick={() => setActiveTab('log')}
                    >
                        📋 Session Log
                    </button>
                    <button
                        className={`telem-tab ${activeTab === 'live' ? 'active' : ''}`}
                        onClick={() => setActiveTab('live')}
                    >
                        📈 Live Speed
                    </button>
                </div>

                <div className="telem-panel-body">
                    {activeTab === 'log' ? <SessionLogTab /> : <LiveSpeedTab />}
                </div>
            </div>
        </>
    );
};

export default TelemetryPanel;
