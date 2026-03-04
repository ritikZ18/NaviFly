import React from 'react';
import { useRoute } from '../context/RouteContext';
import { Plane, Car, Train, X, Activity, Clock, Video } from 'lucide-react';

const TacticalInfoPanes: React.FC = () => {
    const {
        trackedEntityId, trackedAircraftData, setTrackedEntityId, setTrackedAircraftData,
        trafficStats, trainStats,
        isAircraftVisible, isTrafficVisible,
        attachedWebcams, setAttachedWebcam
    } = useRoute();

    const opsWebcam = attachedWebcams['ops-1'];
    const hasAnyPane = (trackedEntityId && trackedAircraftData) || trafficStats || trainStats || opsWebcam;
    if (!hasAnyPane) return null;

    const formatAlt = (alt: number | null) => (alt != null ? `${Math.round(alt)} m` : 'N/A');
    const formatSpeed = (v: number | null) => (v != null ? `${Math.round(v * 1.944)} kts` : 'N/A');
    const formatHeading = (h: number | null) => (h != null ? `${Math.round(h)}°` : 'N/A');

    return (
        <div className="tac-panes-row">
            {/* ── Aircraft Info Pane ── */}
            {isAircraftVisible && trackedEntityId && trackedAircraftData && (
                <div className="tac-pane tac-pane--aircraft" role="region" aria-label="Aircraft Info">
                    <div className="tac-pane__header">
                        <div className="tac-pane__icon-title">
                            <Plane size={14} />
                            <span className="tac-pane__title">ABOUT FLIGHT</span>
                        </div>
                        <button
                            className="tac-pane__close"
                            onClick={() => { setTrackedEntityId(null); setTrackedAircraftData(null); }}
                            title="Close"
                        >
                            <X size={12} />
                        </button>
                    </div>
                    <div className="tac-pane__body">
                        <div className="tac-pane__callsign">
                            {trackedAircraftData.callsign || trackedAircraftData.icao24}
                        </div>
                        <div className="tac-pane__grid">
                            <div className="tac-pane__stat">
                                <span className="tac-pane__stat-label">ICAO24</span>
                                <span className="tac-pane__stat-value mono">{trackedAircraftData.icao24.toUpperCase()}</span>
                            </div>
                            <div className="tac-pane__stat">
                                <span className="tac-pane__stat-label">ALTITUDE</span>
                                <span className="tac-pane__stat-value">{formatAlt(trackedAircraftData.altitude)}</span>
                            </div>
                            <div className="tac-pane__stat">
                                <span className="tac-pane__stat-label">SPEED</span>
                                <span className="tac-pane__stat-value">{formatSpeed(trackedAircraftData.velocity)}</span>
                            </div>
                            <div className="tac-pane__stat">
                                <span className="tac-pane__stat-label">HEADING</span>
                                <span className="tac-pane__stat-value">{formatHeading(trackedAircraftData.heading)}</span>
                            </div>
                        </div>
                        <div className="tac-pane__trail-legend">
                            <span className="trail-dot trail-dot--yellow" /> Planned path
                            <span className="trail-dot trail-dot--green" style={{ marginLeft: 10 }} /> Completed
                        </div>
                    </div>
                </div>
            )}

            {/* ── Vehicle Traffic Pane ── */}
            {isTrafficVisible && trafficStats && (
                <div className="tac-pane tac-pane--traffic" role="region" aria-label="Traffic Stats">
                    <div className="tac-pane__header">
                        <div className="tac-pane__icon-title">
                            <Car size={14} />
                            <span className="tac-pane__title">VEHICLE TRAFFIC</span>
                        </div>
                    </div>
                    <div className="tac-pane__body">
                        <div className={`tac-pane__density density--${trafficStats.density}`}>
                            <Activity size={12} />
                            <span>{trafficStats.density.toUpperCase()} DENSITY</span>
                        </div>
                        <div className="tac-pane__grid">
                            <div className="tac-pane__stat">
                                <span className="tac-pane__stat-label">VEHICLES</span>
                                <span className="tac-pane__stat-value">{trafficStats.count}</span>
                            </div>
                            <div className="tac-pane__stat">
                                <span className="tac-pane__stat-label">AVG SPEED</span>
                                <span className="tac-pane__stat-value">{trafficStats.avgSpeed} km/h</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Train Pane (placeholder — no data source yet) ── */}
            {trainStats && (
                <div className="tac-pane tac-pane--train" role="region" aria-label="Train Info">
                    <div className="tac-pane__header">
                        <div className="tac-pane__icon-title">
                            <Train size={14} />
                            <span className="tac-pane__title">RAIL TRANSIT</span>
                        </div>
                    </div>
                    <div className="tac-pane__body">
                        <div className="tac-pane__grid">
                            <div className="tac-pane__stat">
                                <span className="tac-pane__stat-label">ACTIVE TRAINS</span>
                                <span className="tac-pane__stat-value">{trainStats.activeTrains}</span>
                            </div>
                            <div className="tac-pane__stat">
                                <span className="tac-pane__stat-label">NEXT STATION</span>
                                <span className="tac-pane__stat-value">{trainStats.nextStation}</span>
                            </div>
                        </div>
                        <div className="tac-pane__badge">
                            <Clock size={10} /> No live API — demo mode
                        </div>
                    </div>
                </div>
            )}

            {/* ── Attached Webcam Pane ── */}
            {opsWebcam && (
                <div className="tac-pane tac-pane--webcam" role="region" aria-label="Webcam Feed">
                    <div className="tac-pane__header">
                        <div className="tac-pane__icon-title" style={{ color: '#facc15' }}>
                            <Video size={14} />
                            <span className="tac-pane__title">WEB FEED</span>
                        </div>
                        <button
                            className="tac-pane__close"
                            onClick={() => setAttachedWebcam('ops-1', null)}
                            title="Detach"
                        >
                            <X size={12} />
                        </button>
                    </div>
                    <div className="tac-pane__body">
                        <div className="tac-pane__callsign" style={{ fontSize: '11px', marginBottom: '6px' }}>
                            {opsWebcam.title}
                        </div>
                        <div className="tac-pane__feed-container">
                            {opsWebcam.streamUrl ? (
                                <iframe
                                    className="webcam-iframe"
                                    src={opsWebcam.streamUrl}
                                    frameBorder="0"
                                    allowFullScreen
                                />
                            ) : (
                                <img src={opsWebcam.previewUrl} className="webcam-img" alt="" />
                            )}
                        </div>
                        <div className="tac-pane__badge">
                            <Activity size={10} /> Sensor: Ops-1 Attachment
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default TacticalInfoPanes;
