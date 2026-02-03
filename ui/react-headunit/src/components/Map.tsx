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
    const routesInitialized = useRef(false);
    const initialFitDone = useRef(false);

    const {
        startId, endId, roadGeometry, alternativeRoutes, selectedRouteIndex,
        isNavigating, simulation, vehicle, selectRoute, setRoadGeometry, setAlternativeRoutes
    } = useRoute();

    const hasFetchedLocations = useRef(false);

    // Fetch locations ONCE
    useEffect(() => {
        if (hasFetchedLocations.current) return;
        hasFetchedLocations.current = true;

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

    // Initialize map - ONLY ONCE
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

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

        map.current.on('load', () => {
            setMapLoaded(true);
            // Initialize empty route sources
            if (map.current) {
                map.current.addSource('route-main', {
                    type: 'geojson',
                    data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
                });
                map.current.addLayer({
                    id: 'route-main',
                    type: 'line',
                    source: 'route-main',
                    layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'none' },
                    paint: { 'line-color': '#007bff', 'line-width': 6, 'line-opacity': 0.9 }
                });

                for (let i = 0; i < 3; i++) {
                    map.current.addSource(`route-alt-${i}`, {
                        type: 'geojson',
                        data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [] } }
                    });
                    map.current.addLayer({
                        id: `route-alt-${i}`,
                        type: 'line',
                        source: `route-alt-${i}`,
                        layout: { 'line-join': 'round', 'line-cap': 'round', 'visibility': 'none' },
                        paint: { 'line-color': '#64748b', 'line-width': 4, 'line-opacity': 0.4, 'line-dasharray': [2, 2] }
                    });
                }
                routesInitialized.current = true;
            }
        });

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

        // Initial fit
        if (locations.length > 1 && !initialFitDone.current) {
            const bounds = new maplibregl.LngLatBounds();
            locations.forEach(loc => bounds.extend([loc.lon, loc.lat]));
            map.current.fitBounds(bounds, { padding: 50 });
            initialFitDone.current = true;
        }
    }, [locations, mapLoaded]);

    // Fetch route with alternatives
    const fetchRouteWithAlternatives = useCallback(async () => {
        if (!startId || !endId || startId === endId) return;

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

    // Start marker with glow
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        startMarkerRef.current?.remove();

        if (startId) {
            const loc = locations.find(l => l.id === startId);
            if (loc) {
                const el = document.createElement('div');
                el.className = 'route-marker start-marker';
                el.innerHTML = `
                    <div class="marker-glow green"></div>
                    <div class="marker-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
                    <div class="marker-label">${loc.name}</div>
                `;
                startMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat([loc.lon, loc.lat])
                    .addTo(map.current!);
            }
        }
    }, [startId, locations, mapLoaded]);

    // End marker with glow
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        endMarkerRef.current?.remove();

        if (endId) {
            const loc = locations.find(l => l.id === endId);
            if (loc) {
                const el = document.createElement('div');
                el.className = 'route-marker end-marker';
                el.innerHTML = `
                    <div class="marker-glow orange"></div>
                    <div class="marker-icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg></div>
                    <div class="marker-label">${loc.name}</div>
                `;
                endMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat([loc.lon, loc.lat])
                    .addTo(map.current!);
            }
        }
    }, [endId, locations, mapLoaded]);

    // Update route data - NO re-adding layers
    useEffect(() => {
        if (!map.current || !mapLoaded || !routesInitialized.current) return;

        // Update main route
        const mainSource = map.current.getSource('route-main') as maplibregl.GeoJSONSource;
        if (mainSource && isNavigating && roadGeometry && roadGeometry.length >= 2) {
            mainSource.setData({
                type: 'Feature',
                properties: {},
                geometry: { type: 'LineString', coordinates: roadGeometry }
            });
            map.current.setLayoutProperty('route-main', 'visibility', 'visible');
            map.current.setPaintProperty('route-main', 'line-color', selectedRouteIndex === 0 ? '#007bff' : '#64748b');
            map.current.setPaintProperty('route-main', 'line-opacity', selectedRouteIndex === 0 ? 0.9 : 0.4);
        } else if (mainSource) {
            map.current.setLayoutProperty('route-main', 'visibility', 'none');
        }

        // Update alternative routes
        for (let i = 0; i < 3; i++) {
            const altSource = map.current.getSource(`route-alt-${i}`) as maplibregl.GeoJSONSource;
            if (altSource && isNavigating && alternativeRoutes[i]) {
                altSource.setData({
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: alternativeRoutes[i].geometry }
                });
                map.current.setLayoutProperty(`route-alt-${i}`, 'visibility', 'visible');
                const isSelected = selectedRouteIndex === i + 1;
                map.current.setPaintProperty(`route-alt-${i}`, 'line-color', isSelected ? '#007bff' : '#64748b');
                map.current.setPaintProperty(`route-alt-${i}`, 'line-opacity', isSelected ? 0.9 : 0.4);
            } else if (altSource) {
                map.current.setLayoutProperty(`route-alt-${i}`, 'visibility', 'none');
            }
        }

        // Fit bounds once when navigation starts
        if (isNavigating && roadGeometry && roadGeometry.length >= 2 && !simulation.isRunning) {
            const bounds = new maplibregl.LngLatBounds();
            roadGeometry.forEach(coord => bounds.extend(coord));
            map.current.fitBounds(bounds, { padding: 80, duration: 500 });
        }
    }, [roadGeometry, alternativeRoutes, selectedRouteIndex, mapLoaded, isNavigating, simulation.isRunning]);

    // Set up click handlers for routes
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const handleMainClick = () => selectRoute(0);
        const handleAlt0Click = () => selectRoute(1);
        const handleAlt1Click = () => selectRoute(2);
        const handleAlt2Click = () => selectRoute(3);

        map.current.on('click', 'route-main', handleMainClick);
        map.current.on('click', 'route-alt-0', handleAlt0Click);
        map.current.on('click', 'route-alt-1', handleAlt1Click);
        map.current.on('click', 'route-alt-2', handleAlt2Click);

        return () => {
            if (map.current) {
                map.current.off('click', 'route-main', handleMainClick);
                map.current.off('click', 'route-alt-0', handleAlt0Click);
                map.current.off('click', 'route-alt-1', handleAlt1Click);
                map.current.off('click', 'route-alt-2', handleAlt2Click);
            }
        };
    }, [mapLoaded, selectRoute]);

    // Vehicle marker - just update position
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        if (simulation.isRunning && simulation.currentPosition) {
            if (vehicleMarkerRef.current) {
                vehicleMarkerRef.current.setLngLat(simulation.currentPosition);
            } else {
                const el = document.createElement('div');
                el.className = 'vehicle-marker';
                el.innerHTML = `<span class="vehicle-icon">${vehicle.icon}</span>`;

                vehicleMarkerRef.current = new maplibregl.Marker({ element: el })
                    .setLngLat(simulation.currentPosition)
                    .addTo(map.current!);
            }
        } else if (!simulation.isRunning && vehicleMarkerRef.current) {
            vehicleMarkerRef.current.remove();
            vehicleMarkerRef.current = null;
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
                    {isNavigating && alternativeRoutes.length > 0 && (
                        <div className="legend-item">
                            <span className="legend-line faint"></span>
                            <span>{alternativeRoutes.length} alt routes</span>
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
