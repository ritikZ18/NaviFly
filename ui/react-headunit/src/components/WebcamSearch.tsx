import React, { useState } from 'react';
import { useRoute } from '../context/RouteContext';
import type { WebcamData } from '../context/RouteContext';
import { Search, MapPin, Video, ExternalLink, Paperclip, Loader2 } from 'lucide-react';
import { pushToast } from './Toast';

const WebcamSearch: React.FC = () => {
    const {
        simulation, isWebcamEnabled, setSearchWebcams,
        searchWebcams, setAttachedWebcam, attachedWebcams
    } = useRoute();

    const [radius, setRadius] = useState<number>(10);
    const [isLoading, setIsLoading] = useState(false);

    if (!isWebcamEnabled) return null;

    const findWebcams = async () => {
        // Fallback to Phoenix center if simulation is not running
        const lon = simulation.currentPosition?.[0] || -112.0740;
        const lat = simulation.currentPosition?.[1] || 33.4484;

        setIsLoading(true);
        try {
            const url = `http://localhost:8081/api/webcams/nearby?lat=${lat}&lon=${lon}&radiusKm=${radius}`;
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Failed to fetch webcams');

            const data = await resp.json();
            // Windy API v3 returns { webcams: [...] }
            const results = data.webcams || [];

            const mapped: WebcamData[] = results.map((w: any) => ({
                id: w.webcamId.toString(),
                title: w.title,
                lat: w.location.latitude,
                lon: w.location.longitude,
                previewUrl: w.images?.current?.thumbnail || w.images?.daylight?.thumbnail,
                streamUrl: w.player?.daylight?.embed || w.player?.current?.embed,
                providerUrl: w.urls?.detail,
                distance: 0 // Ideally computed on backend or here
            }));

            // Basic distance calculation
            const finalResults = mapped.map(w => {
                const d = Math.sqrt(Math.pow(w.lat - lat, 2) + Math.pow(w.lon - lon, 2)) * 111; // rough km
                return { ...w, distance: Math.round(d * 10) / 10 };
            }).sort((a, b) => (a.distance || 0) - (b.distance || 0));

            setSearchWebcams(finalResults);
            pushToast({ type: 'success', message: `Found ${finalResults.length} webcams within ${radius}km` });
        } catch (err) {
            console.error(err);
            pushToast({ type: 'danger', message: 'Webcam API error: Service may be offline or quota exceeded.' });
        } finally {
            setIsLoading(false);
        }
    };

    const handleAttach = (webcam: WebcamData) => {
        // For now, attach to the main "Ops scope" (id='ops-1')
        setAttachedWebcam('ops-1', webcam);
        pushToast({ type: 'success', message: `Linked: ${webcam.title}` });
    };

    const isAttached = (id: string) => attachedWebcams['ops-1']?.id === id;

    return (
        <div className="webcam-search-box">
            <div className="hud-label">NEARBY WEB DISCOVERY</div>

            <div className="webcam-controls">
                <div className="radius-picker">
                    {[2, 5, 10, 25, 50].map(r => (
                        <button
                            key={r}
                            className={`radius-btn ${radius === r ? 'active' : ''}`}
                            onClick={() => setRadius(r)}
                        >
                            {r}k
                        </button>
                    ))}
                </div>

                <button className="webcam-search-btn" onClick={findWebcams} disabled={isLoading}>
                    {isLoading ? <Loader2 size={12} className="spin" /> : <Search size={12} />}
                    <span>SEARCH</span>
                </button>
            </div>

            <div className="webcam-results-list">
                {searchWebcams.length === 0 && !isLoading && (
                    <div className="webcam-empty">No webcams found. Try increasing radius.</div>
                )}

                {searchWebcams.map(w => (
                    <div key={w.id} className={`webcam-result-item ${isAttached(w.id) ? 'attached' : ''}`}>
                        <div className="webcam-thumb">
                            {w.previewUrl ? <img src={w.previewUrl} alt="" /> : <Video size={16} />}
                        </div>
                        <div className="webcam-info">
                            <div className="webcam-name">{w.title}</div>
                            <div className="webcam-meta">
                                <MapPin size={10} /> {w.distance} km away
                            </div>
                        </div>
                        <div className="webcam-actions">
                            {isAttached(w.id) ? (
                                <button className="webcam-action-btn active" onClick={() => setAttachedWebcam('ops-1', null)} title="Detach">
                                    <Paperclip size={12} />
                                </button>
                            ) : (
                                <button className="webcam-action-btn" onClick={() => handleAttach(w)} title="Attach to scope">
                                    <Paperclip size={12} />
                                </button>
                            )}
                            {w.providerUrl && (
                                <a href={w.providerUrl} target="_blank" rel="noreferrer" className="webcam-action-btn">
                                    <ExternalLink size={12} />
                                </a>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default WebcamSearch;
