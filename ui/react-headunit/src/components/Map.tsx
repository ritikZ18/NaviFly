import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useRoute } from '../context/RouteContext';

interface Location {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

const Map: React.FC = () => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const startMarkerRef = useRef<maplibregl.Marker | null>(null);
    const endMarkerRef = useRef<maplibregl.Marker | null>(null);
    const [locations, setLocations] = useState<Location[]>([]);

    const { startId, endId, routeNodes, isNavigating } = useRoute();

    // Fetch locations on mount
    useEffect(() => {
        const fetchLocations = async () => {
            try {
                const response = await fetch('http://localhost:8080/locations');
                const data = await response.json();
                setLocations(data);
            } catch (error) {
                console.error('Failed to fetch locations:', error);
            }
        };
        fetchLocations();
    }, []);

    // Initialize map
    useEffect(() => {
        if (map.current) return;

        if (mapContainer.current) {
            map.current = new maplibregl.Map({
                container: mapContainer.current,
                style: {
                    version: 8,
                    sources: {
                        'osm': {
                            type: 'raster',
                            tiles: [
                                'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
                                'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png'
                            ],
                            tileSize: 256,
                            attribution: '© OpenStreetMap contributors'
                        }
                    },
                    layers: [
                        {
                            id: 'osm',
                            type: 'raster',
                            source: 'osm',
                            minzoom: 0,
                            maxzoom: 19
                        }
                    ]
                },
                center: [-111.9, 34.0],
                zoom: 6,
            });

            map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
        }

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Add location markers
    useEffect(() => {
        if (!map.current || locations.length === 0) return;

        // Clear existing markers
        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        // Add markers for each location (small dots)
        locations.forEach((loc) => {
            const el = document.createElement('div');
            el.className = 'location-dot';
            el.title = loc.name;

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([loc.lon, loc.lat])
                .setPopup(
                    new maplibregl.Popup({ offset: 25 })
                        .setHTML(`<h3>${loc.name}</h3><p>ID: ${loc.id}</p>`)
                )
                .addTo(map.current!);

            markersRef.current.push(marker);
        });

        // Fit bounds
        if (locations.length > 1) {
            const bounds = new maplibregl.LngLatBounds();
            locations.forEach(loc => bounds.extend([loc.lon, loc.lat]));
            map.current.fitBounds(bounds, { padding: 50 });
        }
    }, [locations]);

    // Update start/end markers when selection changes
    useEffect(() => {
        if (!map.current) return;

        // Remove old start marker
        if (startMarkerRef.current) {
            startMarkerRef.current.remove();
            startMarkerRef.current = null;
        }

        // Add new start marker (GREEN)
        if (startId) {
            const startLoc = locations.find(l => l.id === startId);
            if (startLoc) {
                const el = document.createElement('div');
                el.className = 'route-marker start-marker';
                el.innerHTML = `
                    <div class="marker-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                    </div>
                    <div class="marker-label">${startLoc.name}</div>
                `;
                startMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat([startLoc.lon, startLoc.lat])
                    .addTo(map.current!);
            }
        }
    }, [startId, locations]);

    useEffect(() => {
        if (!map.current) return;

        // Remove old end marker
        if (endMarkerRef.current) {
            endMarkerRef.current.remove();
            endMarkerRef.current = null;
        }

        // Add new end marker (ORANGE/YELLOW)
        if (endId) {
            const endLoc = locations.find(l => l.id === endId);
            if (endLoc) {
                const el = document.createElement('div');
                el.className = 'route-marker end-marker';
                el.innerHTML = `
                    <div class="marker-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                    </div>
                    <div class="marker-label">${endLoc.name}</div>
                `;
                endMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat([endLoc.lon, endLoc.lat])
                    .addTo(map.current!);
            }
        }
    }, [endId, locations]);

    // Draw route line when navigating
    useEffect(() => {
        if (!map.current) return;

        const sourceId = 'route-line';
        const layerId = 'route-line-layer';

        // Remove existing layer and source
        if (map.current.getLayer(layerId)) {
            map.current.removeLayer(layerId);
        }
        if (map.current.getSource(sourceId)) {
            map.current.removeSource(sourceId);
        }

        // Draw route if navigating and we have nodes
        if (isNavigating && routeNodes.length >= 2) {
            const coordinates = routeNodes.map(node => [node.lon, node.lat]);

            map.current.addSource(sourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    }
                }
            });

            map.current.addLayer({
                id: layerId,
                type: 'line',
                source: sourceId,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': '#007bff',
                    'line-width': 5,
                    'line-opacity': 0.8
                }
            });

            // Fit map to route
            const bounds = new maplibregl.LngLatBounds();
            routeNodes.forEach(node => bounds.extend([node.lon, node.lat]));
            map.current.fitBounds(bounds, { padding: 80 });
        }
    }, [isNavigating, routeNodes]);

    return (
        <div className="map-wrapper">
            <div ref={mapContainer} className="map-container" />
            <div className="map-overlay">
                <div className="map-legend">
                    <div className="legend-item">
                        <span className="legend-dot green"></span>
                        <span>Start</span>
                    </div>
                    <div className="legend-item">
                        <span className="legend-dot orange"></span>
                        <span>Destination</span>
                    </div>
                    {isNavigating && (
                        <div className="legend-item">
                            <span className="legend-line"></span>
                            <span>Route</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Map;
