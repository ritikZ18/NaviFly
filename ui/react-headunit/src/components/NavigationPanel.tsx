import React, { useState, useEffect } from 'react';
import { Navigation, MapPin, Radio, Settings as SettingsIcon } from 'lucide-react';
import LocationSelector from './LocationSelector';
import SettingsModal, { defaultSettings } from './SettingsModal';
import type { Settings } from './SettingsModal';
import { useRoute } from '../context/RouteContext';

interface Location {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

const NavigationPanel: React.FC = () => {
    const [locations, setLocations] = useState<Location[]>([]);
    const [instructions, setInstructions] = useState<any[]>([]);
    const [eta, setEta] = useState<string>('--:--');
    const [distance, setDistance] = useState<string>('-- km');
    const [duration, setDuration] = useState<string>('-- min');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [settings, setSettings] = useState<Settings>(defaultSettings);

    const {
        startId, endId, isNavigating,
        setStartId, setEndId, setRouteNodes, setIsNavigating
    } = useRoute();

    // Fetch available locations on mount
    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const response = await fetch('http://localhost:8080/locations');
                const data = await response.json();
                data.sort((a: Location, b: Location) => a.name.localeCompare(b.name));
                setLocations(data);
                // Set default selections
                if (data.length >= 2) {
                    const phx = data.find((l: Location) => l.id === 'phx');
                    const tucson = data.find((l: Location) => l.id === 'tucson');
                    setStartId(phx?.id || data[0].id);
                    setEndId(tucson?.id || data[1].id);
                }
            } catch (error) {
                console.error('Failed to fetch locations:', error);
            }
        };
        fetchLocations();
    }, [setStartId, setEndId]);

    const startDrive = async () => {
        if (!startId || !endId) {
            alert('Please select start and destination locations');
            return;
        }
        if (startId === endId) {
            alert('Start and destination cannot be the same');
            return;
        }

        setIsNavigating(true);
        try {
            const response = await fetch('http://localhost:8080/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ start_id: startId, end_id: endId })
            });
            const data = await response.json();

            if (data.nodes && data.nodes.length > 0) {
                // Pass route nodes to context for map drawing
                setRouteNodes(data.nodes);
            }

            if (data.instructions && data.instructions.length > 0) {
                setInstructions(data.instructions);

                const dist = settings.units === 'miles'
                    ? (data.distance * 0.621371).toFixed(1) + ' mi'
                    : data.distance.toFixed(1) + ' km';
                setDistance(dist);

                const durationMin = (data.distance * 1.2).toFixed(0);
                setDuration(durationMin + ' min');

                const now = new Date();
                now.setMinutes(now.getMinutes() + parseFloat(durationMin));
                setEta(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
            }
        } catch (error) {
            console.error('Failed to start drive:', error);
            setIsNavigating(false);
        }
    };

    const stopDrive = () => {
        setIsNavigating(false);
        setRouteNodes([]);
        setInstructions([]);
        setEta('--:--');
        setDistance('-- km');
        setDuration('-- min');
    };

    const currentInstruction = instructions.length > 0 ? instructions[0] : null;

    return (
        <div className={`navigation-panel ${settings.darkMode ? 'dark' : 'light'}`}>
            <div className="brand">
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800, color: '#007bff' }}>NaviFly</h1>
                <p style={{ opacity: 0.6, fontSize: '0.8rem' }}>FLEET COMMAND • ARIZONA</p>
            </div>

            {/* Location Selection */}
            <div className="route-selection">
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
            </div>

            {isNavigating && currentInstruction ? (
                <div className="instruction-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                        <Navigation size={32} color="#007bff" />
                        <div>
                            <div style={{ fontSize: '0.9rem', opacity: 0.6 }}>Next Action</div>
                            <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>{currentInstruction.text}</div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="instruction-card" style={{ opacity: 0.5 }}>
                    <p>Select locations and start route</p>
                </div>
            )}

            <div className="metrics-group">
                <div className="eta-label">{eta}</div>
                <div style={{ opacity: 0.6 }}>Estimated Arrival</div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                        <div style={{ fontWeight: 600 }}>{distance}</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Remaining</div>
                    </div>
                    <div style={{ width: '1px', background: 'rgba(255,255,255,0.1)' }}></div>
                    <div>
                        <div style={{ fontWeight: 600 }}>{duration}</div>
                        <div style={{ fontSize: '0.8rem', opacity: 0.6 }}>Duration</div>
                    </div>
                </div>
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {isNavigating ? (
                    <button className="btn-danger" onClick={stopDrive}>
                        STOP NAVIGATION
                    </button>
                ) : (
                    <button
                        className="btn-primary"
                        onClick={startDrive}
                        disabled={!startId || !endId}
                    >
                        START NAVIGATION
                    </button>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem', opacity: 0.5 }}>
                    <MapPin size={20} style={{ cursor: 'pointer' }} />
                    <Radio size={20} style={{ cursor: 'pointer' }} />
                    <SettingsIcon
                        size={20}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setIsSettingsOpen(true)}
                    />
                </div>
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
