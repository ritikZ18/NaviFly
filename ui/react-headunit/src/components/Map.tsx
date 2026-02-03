import React, { useEffect, useRef, useState, useCallback } from 'react';
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
    const vehicleMarkerRef = useRef<maplibregl.Marker | null>(null);
    const [locations, setLocations] = useState<Location[]>([]);
    const [mapLoaded, setMapLoaded] = useState(false);

    const {
        startId, endId, roadGeometry, alternativeRoutes, selectedRouteIndex,
        isNavigating, simulation, vehicle, selectRoute, setRoadGeometry, setAlternativeRoutes
    } = useRoute();

    // Fetch locations
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
                    layers: [{
                        id: 'osm',
                        type: 'raster',
                        source: 'osm',
                        minzoom: 0,
                        maxzoom: 19
                    }]
                },
                center: [-111.9, 34.0],
                zoom: 6,
            });

            map.current.addControl(new maplibregl.NavigationControl(), 'top-right');
            map.current.addControl(new maplibregl.ScaleControl({ maxWidth: 100 }), 'bottom-right');

            map.current.on('load', () => setMapLoaded(true));
        }

        return () => {
            if (map.current) {
                map.current.remove();
                map.current = null;
            }
        };
    }, []);

    // Add location dots
    useEffect(() => {
        if (!map.current || !mapLoaded || locations.length === 0) return;

        markersRef.current.forEach(marker => marker.remove());
        markersRef.current = [];

        locations.forEach((loc) => {
            const el = document.createElement('div');
            el.className = 'location-dot';
            el.title = loc.name;

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([loc.lon, loc.lat])
                .setPopup(new maplibregl.Popup({ offset: 25 }).setHTML(`<h3>${loc.name}</h3>`))
                .addTo(map.current!);

            markersRef.current.push(marker);
        });

        if (locations.length > 1) {
            const bounds = new maplibregl.LngLatBounds();
            locations.forEach(loc => bounds.extend([loc.lon, loc.lat]));
            map.current.fitBounds(bounds, { padding: 50 });
        }
    }, [locations, mapLoaded]);

    // Fetch route with alternatives from OSRM
    const fetchRouteWithAlternatives = useCallback(async () => {
        if (!startId || !endId) return;

        const startLoc = locations.find(l => l.id === startId);
        const endLoc = locations.find(l => l.id === endId);
        if (!startLoc || !endLoc) return;

        const coords = `${startLoc.lon},${startLoc.lat};${endLoc.lon},${endLoc.lat}`;
        const url = `https://router.project-osrm.org/route/v1/driving/${coords}?alternatives=3&overview=full&geometries=geojson`;

        try {
            const response = await fetch(url);
            const data = await response.json();

            if (data.routes && data.routes.length > 0) {
                setRoadGeometry(data.routes[0].geometry.coordinates);

                const alternatives = data.routes.slice(1).map((route: any) => ({
                    geometry: route.geometry.coordinates,
                    distance: route.distance / 1000,
                    duration: route.duration / 60
                }));
                setAlternativeRoutes(alternatives);
            }
        } catch (error) {
            console.error('OSRM routing failed:', error);
        }
    }, [startId, endId, locations, setRoadGeometry, setAlternativeRoutes]);

    // Fetch routes when start/end changes
    useEffect(() => {
        if (startId && endId && locations.length > 0) {
            fetchRouteWithAlternatives();
        }
    }, [startId, endId, locations, fetchRouteWithAlternatives]);

    // Start marker
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        startMarkerRef.current?.remove();

        if (startId) {
            const loc = locations.find(l => l.id === startId);
            if (loc) {
                const el = document.createElement('div');
                el.className = 'route-marker start-marker';
                el.innerHTML = `<div class="marker-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div><div class="marker-label">${loc.name}</div>`;
                startMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat([loc.lon, loc.lat])
                    .addTo(map.current!);
            }
        }
    }, [startId, locations, mapLoaded]);

    // End marker
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        endMarkerRef.current?.remove();

        if (endId) {
            const loc = locations.find(l => l.id === endId);
            if (loc) {
                const el = document.createElement('div');
                el.className = 'route-marker end-marker';
                el.innerHTML = `<div class="marker-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div><div class="marker-label">${loc.name}</div>`;
                endMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat([loc.lon, loc.lat])
                    .addTo(map.current!);
            }
        }
    }, [endId, locations, mapLoaded]);

    // Draw routes (main + alternatives)
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Remove existing route layers
        ['route-main', 'route-alt-0', 'route-alt-1', 'route-alt-2'].forEach(id => {
            if (map.current?.getLayer(id)) map.current.removeLayer(id);
            if (map.current?.getSource(id)) map.current.removeSource(id);
        });

        // Draw alternative routes (faint blue, clickable)
        alternativeRoutes.forEach((alt, index) => {
            const id = `route-alt-${index}`;
            map.current!.addSource(id, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: { index: index + 1 },
                    geometry: { type: 'LineString', coordinates: alt.geometry }
                }
            });
            map.current!.addLayer({
                id,
                type: 'line',
                source: id,
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': selectedRouteIndex === index + 1 ? '#007bff' : '#94a3b8',
                    'line-width': selectedRouteIndex === index + 1 ? 5 : 3,
                    'line-opacity': selectedRouteIndex === index + 1 ? 0.9 : 0.4
                }
            });

            // Click to select
            map.current!.on('click', id, () => selectRoute(index + 1));
            map.current!.on('mouseenter', id, () => {
                map.current!.getCanvas().style.cursor = 'pointer';
            });
            map.current!.on('mouseleave', id, () => {
                map.current!.getCanvas().style.cursor = '';
            });
        });

        // Draw main route
        if (roadGeometry && roadGeometry.length >= 2) {
            map.current!.addSource('route-main', {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: roadGeometry }
                }
            });
            map.current!.addLayer({
                id: 'route-main',
                type: 'line',
                source: 'route-main',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                    'line-color': selectedRouteIndex === 0 ? '#007bff' : '#94a3b8',
                    'line-width': selectedRouteIndex === 0 ? 5 : 3,
                    'line-opacity': selectedRouteIndex === 0 ? 0.9 : 0.4
                }
            });

            map.current!.on('click', 'route-main', () => selectRoute(0));

            // Fit bounds
            const bounds = new maplibregl.LngLatBounds();
            roadGeometry.forEach(coord => bounds.extend(coord));
            map.current.fitBounds(bounds, { padding: 80 });
        }
    }, [roadGeometry, alternativeRoutes, selectedRouteIndex, mapLoaded, selectRoute]);

    // Vehicle marker during simulation
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        vehicleMarkerRef.current?.remove();

        if (simulation.isRunning && simulation.currentPosition) {
            const el = document.createElement('div');
            el.className = 'vehicle-marker';
            el.innerHTML = `<span class="vehicle-icon">${vehicle.icon}</span>`;

            vehicleMarkerRef.current = new maplibregl.Marker({ element: el })
                .setLngLat(simulation.currentPosition)
                .addTo(map.current!);

            // Center map on vehicle
            map.current.panTo(simulation.currentPosition, { duration: 100 });
        }
    }, [simulation.currentPosition, simulation.isRunning, vehicle.icon, mapLoaded]);

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
                        <span>End</span>
                    </div>
                    {alternativeRoutes.length > 0 && (
                        <div className="legend-item">
                            <span className="legend-line faint"></span>
                            <span>{alternativeRoutes.length} alternatives</span>
                        </div>
                    )}
                    {simulation.isRunning && (
                        <div className="legend-item">
                            <span className="vehicle-icon-small">{vehicle.icon}</span>
                            <span>{Math.round(simulation.progress)}%</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Map;
