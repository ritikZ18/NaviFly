import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navigation, Play, Pause, Square, Gauge, Plus, X, ChevronUp, ChevronDown, Route, Globe, Map as MapIcon, Satellite, Radio, Car, Truck, Bike, CircleDot } from 'lucide-react';
import SearchableLocationInput from './SearchableLocationInput';
import type { Location } from './SearchableLocationInput';
import SettingsModal, { defaultSettings } from './SettingsModal';
import type { Settings } from './SettingsModal';
import { useRoute } from '../context/RouteContext';
import { VehicleFactory } from '../simulation';
import type { VehicleType } from '../simulation';
import RouteOptions from './RouteOptions';

const NavigationPanel: React.FC = () => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [speedMultiplier, setSpeedMultiplier] = useState(1);
    const [isRouteConfirmed, setIsRouteConfirmed] = useState(false);
    const [isFindingRoute, setIsFindingRoute] = useState(false);
    const hasFetched = useRef(false);

    const {
        startId, endId, isNavigating, simulation, vehicle, roadGeometry,
        startLocation, endLocation, waypoints, camSettings,
        setStartId, setEndId, setStartLocation, setEndLocation,
        addWaypoint, removeWaypoint, reorderWaypoints,
        setIsNavigating, setVehicle,
        startSimulation, pauseSimulation, resumeSimulation, stopSimulation,
        setSpeedMultiplier: setSimSpeed, clearNavigation, setIsStartingNavigation,
        isGlobeView, isTrafficVisible, setIsGlobeView, setIsTrafficVisible,
        setCamSettings, routingPreference, setRoutingPreference
    } = useRoute();

    // Sync local speed multiplier with context simulation state (for resumption)
    useEffect(() => {
        if (simulation.speedMultiplier && simulation.speedMultiplier !== speedMultiplier) {
            setSpeedMultiplier(simulation.speedMultiplier);
        }
    }, [simulation.speedMultiplier, speedMultiplier]);

    // Fetch locations ONCE
    useEffect(() => {
        if (hasFetched.current) return;
        hasFetched.current = true;

        const fetchLocations = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const response = await fetch('http://localhost:8080/locations');
                if (!response.ok) throw new Error('Failed to load');
                const data = await response.json();
                data.sort((a: Location, b: Location) => a.name.localeCompare(b.name));
                setLocations(data);
            } catch (err) {
                setError('Unable to load locations');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLocations();
    }, []);

    const handleVehicleSelect = (type: VehicleType) => {
        setVehicle(VehicleFactory.create(type));
    };

    const handleFindRoute = useCallback(async () => {
        if (!startId || !endId || startId === endId) return;
        setIsFindingRoute(true);
        try {
            const fetchFn = (window as unknown as Record<string, unknown>).__naviflyFetchRoute as (() => Promise<void>) | undefined;
            if (fetchFn) {
                await fetchFn();
            }
            setIsRouteConfirmed(true);
        } catch (e) {
            console.error('Route fetch failed:', e);
        } finally {
            setIsFindingRoute(false);
        }
    }, [startId, endId]);

    // Reset route confirmation when locations change
    useEffect(() => {
        setIsRouteConfirmed(false);
    }, [startId, endId, waypoints]);

    const handleStartNavigation = () => {
        if (!startId || !endId || startId === endId || !isRouteConfirmed) return;

        // Transition immediately to navigation mode
        setIsStartingNavigation(false);
        setIsNavigating(true);

        // startSimulation will wait for geometry to be present via useEffect in context
        startSimulation();
    };

    const handleStartSimulation = () => {
        const route = roadGeometry;
        if (!route) return;

        let hasCoords = false;
        if (Array.isArray(route)) {
            hasCoords = route.length >= 2;
        } else if (route.type === 'FeatureCollection') {
            hasCoords = route.features.length > 0;
        } else if (route.type === 'Feature') {
            hasCoords = true; // LineString feature
        }

        if (!hasCoords) return;
        setSimSpeed(speedMultiplier);
        startSimulation();
    };

    const handleSpeedChange = (val: number) => {
        setSpeedMultiplier(val);
        setSimSpeed(val);
    };

    const handleStopNavigation = () => {
        stopSimulation();
        clearNavigation();
    };

    const formatEta = (minutes: number): string => {
        if (!minutes || minutes <= 0) return '--:--';
        const now = new Date();
        now.setMinutes(now.getMinutes() + minutes);
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDuration = (minutes: number): string => {
        if (!minutes || minutes <= 0) return '-- min';
        const hrs = Math.floor(minutes / 60);
        const mins = Math.round(minutes % 60);
        return hrs > 0 ? `${hrs}h ${mins}m` : `${mins} min`;
    };

    const formatDistance = (km: number): string => {
        if (!km || km <= 0) return '-- km';
        return settings.units === 'miles'
            ? `${(km * 0.621371).toFixed(1)} mi`
            : `${km.toFixed(1)} km`;
    };

    const allVehicles = VehicleFactory.getAllVehicles();

    // Helper: move waypoint up/down
    const moveWaypoint = (index: number, direction: 'up' | 'down') => {
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex >= 0 && newIndex < waypoints.length) {
            reorderWaypoints(index, newIndex);
        }
    };

    return (
        <div className={`navigation-panel ${settings.darkMode ? 'dark' : 'light'}`}>
            <div className="brand">
                <h1>NaviFly</h1>
                <p>FLEET COMMAND • ARIZONA</p>
            </div>

            {/* Location Selection - Google Maps Style */}
            <div className="route-selection">
                {isLoading ? (
                    <div className="loading-state">Loading locations...</div>
                ) : error ? (
                    <div className="error-state">{error}</div>
                ) : (
                    <>
                        <SearchableLocationInput
                            label="Start"
                            value={startLocation}
                            locations={locations}
                            onChange={(loc) => {
                                setStartLocation(loc);
                                if (loc) setStartId(loc.id);
                                else setStartId('');
                            }}
                            icon="start"
                            placeholder="Search start location..."
                        />

                        {/* Intermediate Stops */}
                        {waypoints.length > 0 && (
                            <div className="waypoints-list">
                                {waypoints.map((wp, i) => (
                                    <div key={`wp-${i}-${wp.id}`} className="waypoint-row">
                                        <div className="waypoint-number">{i + 1}</div>
                                        <SearchableLocationInput
                                            label={`Stop ${i + 1}`}
                                            value={wp}
                                            locations={locations.filter(l =>
                                                l.id !== startId && l.id !== endId &&
                                                !waypoints.some((w, j) => j !== i && w.id === l.id)
                                            )}
                                            onChange={(loc) => {
                                                if (loc) {
                                                    // Replace waypoint at index
                                                    removeWaypoint(i);
                                                    // Need to use timeout to ensure state updates
                                                    setTimeout(() => {
                                                        addWaypoint(loc);
                                                    }, 0);
                                                } else {
                                                    removeWaypoint(i);
                                                }
                                            }}
                                            icon="stop"
                                            placeholder="Search stop..."
                                        />
                                        <div className="waypoint-actions">
                                            <button
                                                className="wp-btn"
                                                onClick={() => moveWaypoint(i, 'up')}
                                                disabled={i === 0}
                                                title="Move up"
                                            >
                                                <ChevronUp size={12} />
                                            </button>
                                            <button
                                                className="wp-btn"
                                                onClick={() => moveWaypoint(i, 'down')}
                                                disabled={i === waypoints.length - 1}
                                                title="Move down"
                                            >
                                                <ChevronDown size={12} />
                                            </button>
                                            <button
                                                className="wp-btn wp-remove"
                                                onClick={() => removeWaypoint(i)}
                                                title="Remove stop"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Add Stop Button */}
                        {waypoints.length < 5 && (
                            <button
                                className="add-stop-btn"
                                onClick={() => {
                                    // Add a placeholder that will be replaced on selection
                                    addWaypoint({ id: `temp-${Date.now()}`, name: '', lat: 0, lon: 0 });
                                }}
                            >
                                <Plus size={14} />
                                Add Stop {waypoints.length > 0 && `(${waypoints.length}/5)`}
                            </button>
                        )}

                        <SearchableLocationInput
                            label="Destination"
                            value={endLocation}
                            locations={locations.filter(l => l.id !== startId)}
                            onChange={(loc) => {
                                setEndLocation(loc);
                                if (loc) setEndId(loc.id);
                                else setEndId('');
                            }}
                            icon="end"
                            placeholder="Search destination..."
                        />

                        {/* Find Route Button */}
                        {startId && endId && startId !== endId && !isNavigating && (
                            <button
                                className={`btn-find-route ${isRouteConfirmed ? 'route-confirmed' : ''}`}
                                onClick={handleFindRoute}
                                disabled={isFindingRoute}
                            >
                                <Route size={16} />
                                {isFindingRoute ? 'Finding Route...' : isRouteConfirmed ? '✓ Route Found — Recalculate' : 'FIND ROUTE'}
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Route Selection Cards (Stage 1) */}
            {isNavigating && <RouteOptions />}

            {/* Vehicle Selector */}
            <div className="vehicle-selector">
                <label className="selector-label">Vehicle</label>
                <div className="vehicle-buttons">
                    {allVehicles.map(v => (
                        <button
                            key={v.type}
                            className={`vehicle-btn ${vehicle.type === v.type ? 'active' : ''}`}
                            onClick={() => handleVehicleSelect(v.type)}
                            title={`${v.name} (${v.avgSpeed} km/h)`}
                        >
                            <span className="vehicle-icon">
                                {v.icon === 'Car' && <Car size={16} />}
                                {v.icon === 'Truck' && <Truck size={16} />}
                                {v.icon === 'Bike' && <Bike size={16} />}
                            </span>
                            <span className="vehicle-name">{v.name}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Simulation Info */}
            {simulation.isRunning && (
                <div className="simulation-info">
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${simulation.progress}%` }} />
                    </div>
                    <div className="simulation-stats">
                        <div className="stat">
                            <span className="stat-value">{Math.round(simulation.progress)}%</span>
                            <span className="stat-label">Complete</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">{Math.round(simulation.currentSpeed)}</span>
                            <span className="stat-label">km/h</span>
                        </div>
                        <div className="stat">
                            <span className="stat-value">{simulation.breaks}</span>
                            <span className="stat-label">Breaks</span>
                        </div>
                    </div>

                    {simulation.breakPoints.length > 0 && (
                        <div className="upcoming-stops">
                            <label className="selector-label" style={{ marginTop: '1rem', display: 'block' }}>Upcoming Stops</label>
                            <div className="stops-list">
                                {simulation.breakPoints.slice(-3).map((bp, i) => (
                                    <div key={i} className="stop-item">
                                        <span className="stop-icon"><CircleDot size={12} color="#ef4444" /></span>
                                        <span className="stop-desc">{bp.duration}m break scheduled</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ETA Card */}
            <div className="metrics-group">
                <div className="eta-label">{formatEta(simulation.eta)}</div>
                <div style={{ opacity: 0.6 }}>Estimated Arrival</div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', justifyContent: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 600 }}>{formatDistance(simulation.distanceRemaining)}</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Remaining</div>
                    </div>
                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                    <div>
                        <div style={{ fontWeight: 600 }}>{formatDuration(simulation.eta)}</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Duration</div>
                    </div>
                </div>
            </div>

            {/* Tactical Control Center */}
            <div className="system-controls">
                <div className="control-label-sm">ROADWAYS & VIEW</div>
                <div className="control-row">
                    <button
                        className={`system-btn ${isGlobeView ? 'active' : ''}`}
                        onClick={() => setIsGlobeView(!isGlobeView)}
                    >
                        {isGlobeView ? <><Globe size={14} style={{ marginRight: '6px' }} /> Globe</> : <><MapIcon size={14} style={{ marginRight: '6px' }} /> Mercator</>}
                    </button>
                    <button
                        className={`system-btn ${isTrafficVisible ? 'active' : ''}`}
                        onClick={() => setIsTrafficVisible(!isTrafficVisible)}
                    >
                        {isTrafficVisible ? <><Radio size={14} style={{ marginRight: '6px' }} /> Traffic</> : <><Satellite size={14} style={{ marginRight: '6px' }} /> Satellite</>}
                    </button>
                </div>

                <div className="control-label-sm" style={{ marginTop: '0.8rem' }}>ROUTING PREFERENCE</div>
                <div className="control-row secondary-btns">
                    {(['fastest', 'scenic', 'balanced'] as const).map(pref => (
                        <button
                            key={pref}
                            className={`system-btn-sm ${routingPreference === pref ? 'active' : ''}`}
                            onClick={() => setRoutingPreference(pref)}
                        >
                            {pref.toUpperCase()}
                        </button>
                    ))}
                </div>


                <div className="control-row zoom-control" style={{ marginTop: '0.8rem' }}>
                    <span className="control-label">Zoom: {camSettings.zoom.toFixed(1)}</span>
                    <input
                        type="range"
                        min="2"
                        max="18"
                        step="0.1"
                        value={camSettings.zoom}
                        onChange={(e) => setCamSettings({ zoom: parseFloat(e.target.value) })}
                        className="zoom-slider"
                    />
                </div>
            </div>

            {/* Speed Control */}
            {isNavigating && (
                <div className="speed-control">
                    <Gauge size={16} />
                    <span>Sim Speed: {speedMultiplier}x</span>
                    <input
                        type="range"
                        min="1"
                        max="100"
                        value={speedMultiplier}
                        onChange={(e) => handleSpeedChange(parseInt(e.target.value))}
                        className="speed-slider"
                    />
                </div>
            )}

            {/* Action Buttons */}
            <div className="action-buttons">
                {!isNavigating ? (
                    <button
                        className="btn-primary"
                        onClick={handleStartNavigation}
                        disabled={!startId || !endId || startId === '' || endId === '' || startId === endId || isLoading || !isRouteConfirmed}
                    >
                        <Navigation size={18} />
                        START NAVIGATION
                    </button>
                ) : !simulation.isRunning ? (
                    <button className="btn-primary simulation-btn" onClick={handleStartSimulation}>
                        <Play size={18} />
                        START SIMULATION
                    </button>
                ) : (
                    <div className="simulation-controls">
                        {simulation.isPaused ? (
                            <button className="btn-control" onClick={resumeSimulation}>
                                <Play size={20} />
                            </button>
                        ) : (
                            <button className="btn-control" onClick={pauseSimulation}>
                                <Pause size={20} />
                            </button>
                        )}
                        <button className="btn-control btn-stop" onClick={stopSimulation}>
                            <Square size={20} />
                        </button>
                    </div>
                )}
                {isNavigating && (
                    <button className="btn-danger" onClick={handleStopNavigation}>
                        STOP NAVIGATION
                    </button>
                )}
            </div>

            {/* Footer Icons */}
            <div className="footer-icons">
                <SettingsModal
                    isOpen={isSettingsOpen}
                    onClose={() => setIsSettingsOpen(false)}
                    settings={settings}
                    onSettingsChange={setSettings}
                />
            </div>
        </div>
    );
};

export default NavigationPanel;
