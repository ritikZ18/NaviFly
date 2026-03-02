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

    useEffect(() => {
        const interval = setInterval(() => {
            setStatusIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
        }, 800);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (isReady) {
            // Delay unmounting to allow for fade-out animation
            const timer = setTimeout(() => setShouldUnmount(true), 1200);
            return () => clearTimeout(timer);
        }
    }, [isReady]);

    if (shouldUnmount) return null;

    return (
        <div className={`preloader-root ${isReady ? 'fade-out' : ''}`} aria-busy="true" role="status">
            <div className="preloader-glass">
                <div className="preloader-content">
                    <div className="radar-container">
                        <div className="radar-sweep"></div>
                        <div className="radar-rings"></div>
                        <div className="radar-core"></div>
                    </div>

                    <div className="preloader-text">
                        <h1 className="preloader-title">NAVIFLY <span className="v-tag">v2.0</span></h1>
                        <div className="status-container">
                            <span className="status-label">MISSION STATUS:</span>
                            <span className="status-message">{STATUS_MESSAGES[statusIndex]}</span>
                        </div>
                    </div>

                    <div className="loading-bar-container">
                        <div className="loading-bar-fill"></div>
                    </div>
                </div>

                <div className="preloader-grid"></div>
                <div className="preloader-scanline"></div>
            </div>
        </div>
    );
};

export default Preloader;
