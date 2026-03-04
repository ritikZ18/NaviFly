import React, { useState } from 'react';
import { useRoute } from '../context/RouteContext';
import { Car, Eye, EyeOff, Radio, X } from 'lucide-react';

const VehicleControlHUD: React.FC = () => {
    const {
        isTrafficVisible, setIsTrafficVisible,
        persistVehicleTraffic, setPersistVehicleTraffic,
        trafficStats
    } = useRoute();

    // Local UI state: whether the panel is open (separate from marker visibility)
    const [isPanelOpen, setIsPanelOpen] = useState(true);

    // If traffic is fully off, show mini button
    if (!isTrafficVisible && !persistVehicleTraffic) {
        return (
            <button
                className="hud-btn mini-hud-toggle vehicle-mini-toggle"
                onClick={() => { setIsTrafficVisible(true); setIsPanelOpen(true); }}
                title="Show Vehicle Traffic"
            >
                <Car size={18} />
            </button>
        );
    }

    // Panel collapsed but markers still showing (persist ON or traffic ON)
    if (!isPanelOpen) {
        return (
            <button
                className="hud-btn mini-hud-toggle vehicle-mini-toggle"
                style={{ background: 'rgba(34,197,94,0.15)', borderColor: 'rgba(34,197,94,0.4)' }}
                onClick={() => setIsPanelOpen(true)}
                title="Expand Traffic Panel"
            >
                <Car size={18} style={{ color: '#22c55e' }} />
            </button>
        );
    }

    const density = trafficStats?.density ?? 'low';
    const densityColor = density === 'high' ? '#ef4444' : density === 'medium' ? '#f59e0b' : '#22c55e';

    return (
        <div className="aircraft-hud-overlay vehicle-hud-overlay">
            <div className="hud-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Car size={16} />
                    <span className="hud-title">ROAD TRAFFIC</span>
                </div>
                {/* X collapses the panel, keeps markers if persist is on */}
                <button className="hud-close" onClick={() => setIsPanelOpen(false)}>
                    <X size={14} />
                </button>
            </div>

            {/* Live stats */}
            {trafficStats && (
                <div className="hud-section">
                    <div className="hud-label">LIVE STATUS</div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                        <span style={{
                            background: densityColor,
                            color: '#000',
                            fontSize: '10px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: 3,
                            letterSpacing: '0.05em'
                        }}>
                            {density.toUpperCase()}
                        </span>
                        <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>
                            {trafficStats.count} vehicles · {trafficStats.avgSpeed} km/h avg
                        </span>
                    </div>
                </div>
            )}

            {/* Marker legend — now matches actual GeoJSON circle colors */}
            <div className="hud-section">
                <div className="hud-label">CIRCLE LEGEND</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                    {[
                        { color: '#22c55e', label: 'Low density' },
                        { color: '#f59e0b', label: 'Medium density' },
                        { color: '#ef4444', label: 'High density' },
                    ].map(({ color, label }) => (
                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '11px' }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, display: 'inline-block', flexShrink: 0 }} />
                            <span style={{ color: 'rgba(255,255,255,0.7)' }}>{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Persistent traffic toggle */}
            <div className="hud-footer" style={{ flexDirection: 'column', gap: 6 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: '11px', color: 'rgba(255,255,255,0.85)' }}>
                    <Radio size={13} style={{ color: persistVehicleTraffic ? '#22c55e' : 'rgba(255,255,255,0.35)' }} />
                    <span>Keep traffic on map</span>
                    <input
                        type="checkbox"
                        checked={persistVehicleTraffic}
                        onChange={e => setPersistVehicleTraffic(e.target.checked)}
                        style={{ marginLeft: 'auto', accentColor: '#22c55e' }}
                    />
                </label>
                <button
                    className="hud-toggle-visibility"
                    onClick={() => setIsTrafficVisible(!isTrafficVisible)}
                >
                    {isTrafficVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                    <span>{isTrafficVisible ? 'HIDE MARKERS' : 'SHOW MARKERS'}</span>
                </button>
            </div>
        </div>
    );
};

export default VehicleControlHUD;
