import React from 'react';
import { useRoute } from '../context/RouteContext';
import { Plane, Eye, EyeOff, Search, X } from 'lucide-react';

const AircraftControlHUD: React.FC = () => {
    const {
        isAircraftVisible, setIsAircraftVisible,
        aircraftDisplayMode, setAircraftDisplayMode,
        trackedEntityId, setTrackedEntityId
    } = useRoute();

    if (!isAircraftVisible && !trackedEntityId) {
        return (
            <button
                className="hud-btn mini-hud-toggle"
                onClick={() => setIsAircraftVisible(true)}
                title="Show Aircraft"
            >
                <Plane size={18} />
            </button>
        );
    }

    return (
        <div className="aircraft-hud-overlay">
            <div className="hud-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Plane size={16} />
                    <span className="hud-title">AIRCRAFT TRACKING</span>
                </div>
                <button className="hud-close" onClick={() => setIsAircraftVisible(false)}>
                    <X size={14} />
                </button>
            </div>

            <div className="hud-section">
                <div className="hud-label">DISPLAY MODE</div>
                <div className="hud-btn-group">
                    {(['icon', 'name', 'path', 'full'] as const).map(mode => (
                        <button
                            key={mode}
                            className={`hud-btn-sm ${aircraftDisplayMode === mode ? 'active' : ''}`}
                            onClick={() => setAircraftDisplayMode(mode)}
                        >
                            {mode.toUpperCase()}
                        </button>
                    ))}
                </div>
            </div>

            <div className="hud-section">
                <div className="hud-label">SEARCH / TRACK</div>
                <div className="hud-input-wrapper">
                    <Search size={14} className="input-icon" />
                    <input
                        type="text"
                        placeholder="ICAO24 ID..."
                        value={trackedEntityId || ''}
                        onChange={(e) => setTrackedEntityId(e.target.value.toLowerCase())}
                        className="hud-input"
                    />
                    {trackedEntityId && (
                        <button className="input-clear" onClick={() => setTrackedEntityId(null)}>
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            <div className="hud-footer">
                <button
                    className="hud-toggle-visibility"
                    onClick={() => setIsAircraftVisible(!isAircraftVisible)}
                >
                    {isAircraftVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{isAircraftVisible ? 'HIDE ALL' : 'SHOW ALL'}</span>
                </button>
            </div>
        </div>
    );
};

export default AircraftControlHUD;
