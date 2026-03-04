/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ReactNode } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface SpeedSample {
    ts: number;       // epoch ms
    speed: number;    // km/h
}

export interface BreakRecord {
    at: number;         // epoch ms when break started
    durationMin: number;
}

export interface TelemetrySession {
    id: string;
    routeLabel: string;   // "Phoenix → Flagstaff"
    vehicle: string;
    startTime: number;    // epoch ms
    endTime: number | null;
    distanceKm: number;
    durationMin: number;
    avgSpeed: number;     // km/h
    maxSpeed: number;
    speedSamples: SpeedSample[];
    breaks: BreakRecord[];
    waypoints: string[];
}

export interface CarSpeedSample {
    ts: number;
    minSpeed: number;
    maxSpeed: number;
    avgSpeed: number;
    density: 'low' | 'medium' | 'high';
}

interface TelemetryContextType {
    sessions: TelemetrySession[];
    activeSession: TelemetrySession | null;
    liveCarSpeeds: CarSpeedSample[];      // last 60 car fleet speed samples
    startSession: (opts: { routeLabel: string; vehicle: string; waypoints: string[]; distanceKm: number }) => void;
    endSession: () => void;
    recordSpeedSample: (speed: number) => void;
    recordBreak: (durationMin: number) => void;
    pushCarSpeedSample: (sample: CarSpeedSample) => void;
    clearSessions: () => void;
    isTelemetryOpen: boolean;
    setIsTelemetryOpen: (v: boolean) => void;
}

const STORAGE_KEY = 'navifly-telemetry-v2';
const MAX_LIVE_CAR_SAMPLES = 60;
const MAX_SPEED_SAMPLES = 720; // 1hr at 5s intervals

// ── Persistence helpers ────────────────────────────────────────────────────────

function loadSessions(): TelemetrySession[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw) as TelemetrySession[];
    } catch { /* ignore */ }
    return [];
}

function saveSessions(sessions: TelemetrySession[]) {
    try {
        // Keep last 200 sessions max to prevent storage bloat
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions.slice(-200)));
    } catch { /* ignore */ }
}

function generateId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Context ────────────────────────────────────────────────────────────────────

const TelemetryContext = createContext<TelemetryContextType | undefined>(undefined);

export const TelemetryProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [sessions, setSessions] = useState<TelemetrySession[]>(loadSessions);
    const [activeSession, setActiveSession] = useState<TelemetrySession | null>(null);
    const [liveCarSpeeds, setLiveCarSpeeds] = useState<CarSpeedSample[]>([]);
    const [isTelemetryOpen, setIsTelemetryOpen] = useState(false);
    const activeRef = useRef<TelemetrySession | null>(null);

    // Persist whenever sessions change
    useEffect(() => {
        saveSessions(sessions);
    }, [sessions]);

    const startSession = useCallback((opts: {
        routeLabel: string;
        vehicle: string;
        waypoints: string[];
        distanceKm: number;
    }) => {
        const session: TelemetrySession = {
            id: generateId(),
            routeLabel: opts.routeLabel,
            vehicle: opts.vehicle,
            startTime: Date.now(),
            endTime: null,
            distanceKm: opts.distanceKm,
            durationMin: 0,
            avgSpeed: 0,
            maxSpeed: 0,
            speedSamples: [],
            breaks: [],
            waypoints: opts.waypoints,
        };
        activeRef.current = session;
        setActiveSession(session);
    }, []);

    const endSession = useCallback(() => {
        const s = activeRef.current;
        if (!s) return;

        const endTime = Date.now();
        const durationMin = Math.round((endTime - s.startTime) / 60000);
        const speeds = s.speedSamples.map(ss => ss.speed).filter(v => v > 0);
        const avgSpeed = speeds.length > 0 ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : 0;
        const maxSpeed = speeds.length > 0 ? Math.round(Math.max(...speeds)) : 0;

        const completed: TelemetrySession = {
            ...s,
            endTime,
            durationMin,
            avgSpeed,
            maxSpeed,
        };

        activeRef.current = null;
        setActiveSession(null);
        setSessions(prev => [...prev, completed]);
    }, []);

    const recordSpeedSample = useCallback((speed: number) => {
        if (!activeRef.current) return;
        const sample: SpeedSample = { ts: Date.now(), speed: Math.round(speed) };
        activeRef.current = {
            ...activeRef.current,
            speedSamples: [...activeRef.current.speedSamples.slice(-MAX_SPEED_SAMPLES), sample],
        };
        setActiveSession({ ...activeRef.current });
    }, []);

    const recordBreak = useCallback((durationMin: number) => {
        if (!activeRef.current) return;
        const br: BreakRecord = { at: Date.now(), durationMin };
        activeRef.current = {
            ...activeRef.current,
            breaks: [...activeRef.current.breaks, br],
        };
        setActiveSession({ ...activeRef.current });
    }, []);

    const pushCarSpeedSample = useCallback((sample: CarSpeedSample) => {
        setLiveCarSpeeds(prev => [...prev.slice(-MAX_LIVE_CAR_SAMPLES + 1), sample]);
    }, []);

    const clearSessions = useCallback(() => {
        setSessions([]);
        localStorage.removeItem(STORAGE_KEY);
    }, []);

    return (
        <TelemetryContext.Provider value={{
            sessions,
            activeSession,
            liveCarSpeeds,
            startSession,
            endSession,
            recordSpeedSample,
            recordBreak,
            pushCarSpeedSample,
            clearSessions,
            isTelemetryOpen,
            setIsTelemetryOpen,
        }}>
            {children}
        </TelemetryContext.Provider>
    );
};

export const useTelemetry = () => {
    const ctx = useContext(TelemetryContext);
    if (!ctx) throw new Error('useTelemetry must be inside TelemetryProvider');
    return ctx;
};
