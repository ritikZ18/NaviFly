import React, { useState, useEffect, useRef } from 'react';
import { Navigation, MapPin, Radio, Settings as SettingsIcon, Play, Pause, Square, Gauge } from 'lucide-react';
import LocationSelector from './LocationSelector';
import SettingsModal, { defaultSettings } from './SettingsModal';
import type { Settings } from './SettingsModal';
import { useRoute } from '../context/RouteContext';
import { VehicleFactory } from '../simulation';
import type { VehicleType } from '../simulation';

interface Location {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

const NavigationPanel: React.FC = () => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>(defaultSettings);
    const [speedMultiplier, setSpeedMultiplier] = useState(1);
    const hasFetched = useRef(false);

    const {
        startId, endId, isNavigating, simulation, vehicle, roadGeometry,
        setStartId, setEndId, setIsNavigating, setVehicle,
        startSimulation, pauseSimulation, resumeSimulation, stopSimulation,
        setSpeedMultiplier: setSimSpeed, clearNavigation
    } = useRoute();

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

                // Set defaults if not already set
                if (data.length >= 2) {
                    const phx = data.find((l: Location) => l.id === 'phx');
                    const tucson = data.find((l: Location) => l.id === 'tucson');
                    setStartId(phx?.id || data[0].id);
                    setEndId(tucson?.id || data[1].id);
                }
            } catch (err) {
                setError('Unable to load locations');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchLocations();
    }, []); // Empty deps - run once

    const handleVehicleSelect = (type: VehicleType) => {
        setVehicle(VehicleFactory.create(type));
    };

    const handleStartNavigation = () => {
        if (!startId || !endId || startId === endId) return;
        setIsNavigating(true);
    };

    const handleStartSimulation = () => {
        if (!roadGeometry || roadGeometry.length < 2) return;
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

    return (
        <div className={`navigation-panel ${settings.darkMode ? 'dark' : 'light'}`}>
            <div className="brand">
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#007bff' }}>NaviFly</h1>
                <p style={{ opacity: 0.6, fontSize: '0.8rem' }}>FLEET COMMAND • ARIZONA</p>
            </div>

            {/* Location Selection */}
            <div className="route-selection">
                {isLoading ? (
                    <div className="loading-state">Loading locations...</div>
                ) : error ? (
                    <div className="error-state">{error}</div>
                ) : (
                    <>
                        <LocationSelector
                            label="Start"
                            value={startId}
                            locations={locations}
                            onChange={setStartId}
                            icon="start"
                        />
                        <LocationSelector
                            label="Destination"
                            value={endId}
                            locations={locations}
                            onChange={setEndId}
                            icon="end"
                        />
                    </>
                )}
            </div>

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
                            <span className="vehicle-icon">{v.icon}</span>
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

            {/* Speed Control */}
            {isNavigating && (
                <div className="speed-control">
                    <Gauge size={16} />
                    <span>Speed: {speedMultiplier}x</span>
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
                        disabled={!startId || !endId || startId === endId || isLoading}
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
                <MapPin size={20} />
                <Radio size={20} />
                <SettingsIcon size={20} onClick={() => setIsSettingsOpen(true)} />
            </div>

            <SettingsModal
                isOpen={isSettingsOpen}
                onClose={() => setIsSettingsOpen(false)}
                settings={settings}
                onSettingsChange={setSettings}
            />
        </div>
    );
};

export default NavigationPanel;
