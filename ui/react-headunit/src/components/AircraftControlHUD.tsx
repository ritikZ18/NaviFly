import React, { useState } from 'react';
import { useRoute } from '../context/RouteContext';
import { Plane, Eye, EyeOff, Search, X, Radio } from 'lucide-react';

const AircraftControlHUD: React.FC = () => {
    const {
        isAircraftVisible, setIsAircraftVisible,
        aircraftDisplayMode, setAircraftDisplayMode,
        trackedEntityId, setTrackedEntityId,
        persistAircraftTraffic, setPersistAircraftTraffic
    } = useRoute();

    // Local UI state: whether the panel is open (separate from marker visibility)
    const [isPanelOpen, setIsPanelOpen] = useState(true);

    // If aircraft tracking is fully off (no markers, no persist), show mini button
    if (!isAircraftVisible && !persistAircraftTraffic) {
        return (
            <button
                className="hud-btn mini-hud-toggle"
                onClick={() => { setIsAircraftVisible(true); setIsPanelOpen(true); }}
                title="Show Aircraft"
            >
                <Plane size={18} />
            </button>
        );
    }

    // Panel is collapsed but markers still showing (persist ON or aircraft ON)
    if (!isPanelOpen) {
        return (
            <button
                className="hud-btn mini-hud-toggle"
                style={{ background: 'rgba(250,204,21,0.15)', borderColor: 'rgba(250,204,21,0.4)' }}
                onClick={() => setIsPanelOpen(true)}
                title="Expand Aircraft Panel"
            >
                <Plane size={18} style={{ color: '#facc15' }} />
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
                {/* X closes the panel UI, but keeps markers if persist is on */}
                <button className="hud-close" onClick={() => setIsPanelOpen(false)}>
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

            <div className="hud-footer" style={{ flexDirection: 'column', gap: 6 }}>
                {/* Persistent traffic toggle */}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>
                    <Radio size={13} style={{ color: persistAircraftTraffic ? '#facc15' : 'rgba(255,255,255,0.35)' }} />
                    <span>Keep aircraft on map</span>
                    <input
                        type="checkbox"
                        checked={persistAircraftTraffic}
                        onChange={e => setPersistAircraftTraffic(e.target.checked)}
                        style={{ marginLeft: 'auto', accentColor: '#facc15' }}
                    />
                </label>
                <button
                    className="hud-toggle-visibility"
                    onClick={() => setIsAircraftVisible(!isAircraftVisible)}
                >
                    {isAircraftVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{isAircraftVisible ? 'HIDE MARKERS' : 'SHOW MARKERS'}</span>
                </button>
            </div>
        </div>
    );
};

export default AircraftControlHUD;
