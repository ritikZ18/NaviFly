import React, { useState, useEffect } from 'react';

interface PreloaderProps {
    isReady: boolean;
}

const STATUS_MESSAGES = [
    "ACQUIRING SATELLITE LINK...",
    "CONNECTING TO ROUTING SERVICE...",
    "QUERYING DISTRIBUTED CACHE...",
    "FETCHING OSRM GEOMETRY...",
    "EXTRACTING ROAD SEGMENTS...",
    "CALCULATING TRAFFIC DENSITY...",
    "RENDERING TACTICAL GRID...",
    "SYSTEM READY."
];

const Preloader: React.FC<PreloaderProps> = ({ isReady }) => {
    const [statusIndex, setStatusIndex] = useState(0);
    const [shouldUnmount, setShouldUnmount] = useState(false);
    const [minTimeElapsed, setMinTimeElapsed] = useState(false);

    useEffect(() => {
        const interval = setInterval(() => {
            setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
        }, 800);
        return () => clearInterval(interval);
    }, []);

    // Ensure minimum display time of 3 seconds for cinematic feel
    useEffect(() => {
        const timer = setTimeout(() => setMinTimeElapsed(true), 3000);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (isReady && minTimeElapsed) {
            // Delay unmounting to allow for fade-out animation
            const timer = setTimeout(() => setShouldUnmount(true), 1200);
            return () => clearTimeout(timer);
        }
    }, [isReady, minTimeElapsed]);

    // Safety fallback: force unmount after 15 seconds if stuck
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!shouldUnmount) {
                console.warn('Preloader safety timeout triggered - forcing unmount');
                setShouldUnmount(true);
            }
        }, 15000);
        return () => clearTimeout(timer);
    }, [shouldUnmount]);

    if (shouldUnmount) return null;

    const isEffectivelyReady = isReady && minTimeElapsed;

    return (
        <div className={`preloader-root ${isEffectivelyReady ? 'fade-out' : ''}`} aria-busy="true" role="status">
            <div className="preloader-glass">
                <div className="preloader-content">
                    <div className="radar-container">
                        <div className="radar-sweep"></div>
                        <div className="radar-rings"></div>
                        <div className="radar-core"></div>

                        {/* Orbiting blips/satellites */}
                        <div className="radar-orbit orbit-1" style={{ '--r': '72px' } as any}>
                            <div className="radar-blip blip-1"></div>
                        </div>

                        <div className="radar-orbit orbit-2" style={{ '--r': '108px' } as any}>
                            <div className="radar-blip blip-2"></div>
                        </div>

                        <div className="radar-orbit orbit-3" style={{ '--r': '140px' } as any}>
                            <div className="radar-satellite sat-1">
                                <span className="sat-label">SAT-A1</span>
                            </div>
                        </div>

                        <div className="radar-orbit orbit-4 reverse" style={{ '--r': '88px' } as any}>
                            <div className="radar-satellite sat-2">
                                <span className="sat-label">NW-45</span>
                            </div>
                        </div>
                    </div>

                    <div className="preloader-text">
                        <h1 className="preloader-title">NAVIFLY</h1>
                        <div className="status-container">
                            <span className="status-label">MISSION STATUS:</span>
                            <span className="status-message">{STATUS_MESSAGES[statusIndex]}</span>
                        </div>

                        <div className="loading-bar-container">
                            <div className="loading-bar-fill"></div>
                        </div>
                    </div>
                </div>

                <div className="preloader-grid"></div>
                <div className="preloader-scanline"></div>
            </div>
        </div>
    );
};

export default Preloader;
