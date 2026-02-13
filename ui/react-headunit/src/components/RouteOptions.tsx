import React from 'react';
import { useRoute } from '../context/RouteContext';
import { Clock, Navigation } from 'lucide-react';

const RouteOptions: React.FC = () => {
    const {
        roadGeometry, alternativeRoutes, selectedRouteIndex, selectRoute
    } = useRoute();

    if (!roadGeometry) return null;

    let hasCoords = false;
    if (Array.isArray(roadGeometry)) {
        hasCoords = roadGeometry.length >= 2;
    } else if (roadGeometry.type === 'FeatureCollection') {
        hasCoords = roadGeometry.features.length > 0;
    } else if (roadGeometry.type === 'Feature') {
        hasCoords = true;
    }

    if (!hasCoords) return null;

    const allRoutes = [
        {
            label: 'Optimal',
            distance: 0, // Calculated later if needed or passed from context
            duration: 0,
            index: 0
        },
        ...alternativeRoutes.map((alt, i) => ({
            label: alt.label || `Alt ${i + 1}`,
            distance: alt.distance,
            duration: alt.duration,
            index: i + 1
        }))
    ];

    return (
        <div className="route-options">
            <label className="selector-label">Route Options</label>
            <div className="route-cards">
                {allRoutes.map((route) => (
                    <div
                        key={route.index}
                        className={`route-card ${selectedRouteIndex === route.index ? 'active' : ''}`}
                        onClick={() => selectRoute(route.index)}
                    >
                        <div className="route-card-header">
                            <span className="route-label">{route.label}</span>
                            {route.index === 0 && <span className="badge fastest">fastest</span>}
                        </div>
                        <div className="route-card-meta">
                            <div className="meta-item">
                                <Clock size={14} />
                                <span>{route.index === 0 ? 'Optimal' : `${Math.round(route.duration)} min`}</span>
                            </div>
                            <div className="meta-item">
                                <Navigation size={14} />
                                <span>{route.index === 0 ? 'Direct' : `${route.distance.toFixed(1)} km`}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default RouteOptions;
