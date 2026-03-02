import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useRoute } from '../context/RouteContext';
import type { RoadGeometry } from '../context/RouteContext';
import RouteLoader from './RouteLoader';

interface Location {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

interface MapProps {
    onLoaded?: () => void;
}

const Map: React.FC<MapProps> = ({ onLoaded }) => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const markersRef = useRef<maplibregl.Marker[]>([]);
    const startMarkerRef = useRef<maplibregl.Marker | null>(null);
    const endMarkerRef = useRef<maplibregl.Marker | null>(null);
    const vehicleMarkerRef = useRef<maplibregl.Marker | null>(null);
    const [locations, setLocations] = useState<Location[]>([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street');
    const routesInitialized = useRef(false);
    const initialFitDone = useRef(false);

    const {
        startId, endId, roadGeometry, alternativeRoutes, selectedRouteIndex,
        isNavigating, simulation, vehicle, selectRoute, setRoadGeometry, setOptimalGeometry, setAlternativeRoutes,
        isStartingNavigation, isTracking, isScope, camSettings, waypoints
    } = useRoute();

    const hasFetchedLocations = useRef(false);
    const [locationsReady, setLocationsReady] = useState(false);

    // Fetch locations ONCE
    useEffect(() => {
        if (hasFetchedLocations.current) return;
        hasFetchedLocations.current = true;

        const fetchLocations = async () => {
            try {
                const response = await fetch('http://localhost:8080/locations');
                const data = await response.json();
                setLocations(data);
                setLocationsReady(true);
            } catch (error) {
                console.error('Failed to fetch locations:', error);
            }
        };
        fetchLocations();
    }, []);

    // Call onLoaded only when BOTH map and data are ready
    useEffect(() => {
        if (mapLoaded && locationsReady && onLoaded) {
            onLoaded();
        }
    }, [mapLoaded, locationsReady, onLoaded]);

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
                    },
                    'satellite': {
                        type: 'raster',
                        tiles: [
                            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
                        ],
                        tileSize: 256,
                        maxzoom: 18,
                        attribution: '© Esri, Maxar, Earthstar Geographics'
                    }
                },
                layers: [
                    {
                        id: 'osm',
                        type: 'raster',
                        source: 'osm',
                        minzoom: 0,
                        maxzoom: 19
                    },
                    {
                        id: 'satellite',
                        type: 'raster',
                        source: 'satellite',
                        minzoom: 0,
                        maxzoom: 19,
                        layout: { visibility: 'none' }
                    }
                ]
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
    }, [onLoaded]);

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

        // Filter valid waypoints (non-temp, with real coordinates)
        const validWaypoints = waypoints.filter(wp => wp.id && !wp.id.startsWith('temp-') && wp.lat !== 0);

        let isHighQualityActive = false;

        // Cache only works for direct A→B routes (no waypoints)
        if (validWaypoints.length === 0) {
            const cacheKey = `route-cache-${startId}-${endId}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    if (data.optimal) {
                        setOptimalGeometry(data.optimal);
                        setAlternativeRoutes(data.alternatives);
                        console.log('Loaded route from cache');
                        if (data.optimal.type === 'FeatureCollection') {
                            isHighQualityActive = true;
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse cached route:', e);
                }
            }
        }

        const startLoc = locations.find(l => l.id === startId);
        const endLoc = locations.find(l => l.id === endId);
        if (!startLoc || !endLoc) return;

        // Optimistic first pass (only for direct routes without waypoints)
        if (!isHighQualityActive && validWaypoints.length === 0) {
            try {
                const localUrl = `http://localhost:8080/route?start=${startId}&end=${endId}`;
                const response = await fetch(localUrl);
                if (response.ok) {
                    const data = await response.json();
                    if (data.road_geometry && data.road_geometry.length > 0) {
                        const coords: [number, number][] = data.road_geometry.map(
                            (p: [number, number]) => [p[1], p[0]] as [number, number]
                        );
                        setRoadGeometry({
                            type: 'Feature',
                            properties: { quality: 'interpolated' },
                            geometry: { type: 'LineString', coordinates: coords }
                        } as RoadGeometry);
                    }
                }
            } catch (e) {
                console.warn('Local interpolation failed:', e);
            }
        }

        // Main route fetch: include stops if present
        try {
            let proxyUrl = `http://localhost:8080/osrm-route?start=${startId}&end=${endId}`;
            if (validWaypoints.length > 0) {
                const stopIds = validWaypoints.map(wp => wp.id).join(',');
                proxyUrl += `&stops=${stopIds}`;
                console.log(`Multi-stop route: ${startId} → [${stopIds}] → ${endId}`);
            }

            const response = await fetch(proxyUrl);
            if (response.ok) {
                const data = await response.json();
                if (data.routes && data.routes.length > 0) {
                    const bestRoute = data.routes[0];
                    setOptimalGeometry(bestRoute.geometry);

                    interface EnhancedRoute {
                        geometry: [number, number][];
                        distance: number;
                        duration: number;
                        label: string;
                    }
                    const alternatives = data.routes.slice(1).map((route: EnhancedRoute) => ({
                        label: route.label,
                        geometry: route.geometry as [number, number][],
                        distance: route.distance / 1000,
                        duration: route.duration / 60
                    }));
                    setAlternativeRoutes(alternatives);

                    // Cache only direct routes
                    if (validWaypoints.length === 0) {
                        const cacheKey = `route-cache-${startId}-${endId}`;
                        localStorage.setItem(cacheKey, JSON.stringify({
                            optimal: bestRoute.geometry,
                            alternatives: alternatives,
                            timestamp: Date.now()
                        }));
                    }
                }
            }
        } catch (proxyError) {
            console.warn('OSRM proxy failed, adhering to persistent geometry:', proxyError);
        }
    }, [startId, endId, waypoints, locations, setRoadGeometry, setOptimalGeometry, setAlternativeRoutes]);

    // Expose fetchRouteWithAlternatives to parent via routeContext
    // Instead of auto-fetching, we store the function on a ref that NavigationPanel can trigger
    const fetchRouteRef = useRef(fetchRouteWithAlternatives);
    fetchRouteRef.current = fetchRouteWithAlternatives;

    // Make the fetch function available globally through window for cross-component communication
    useEffect(() => {
        (window as unknown as Record<string, unknown>).__naviflyFetchRoute = fetchRouteWithAlternatives;
        return () => {
            delete (window as unknown as Record<string, unknown>).__naviflyFetchRoute;
        };
    }, [fetchRouteWithAlternatives]);

    // Waypoint markers (yellow numbered stops)
    const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);

    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Clear old waypoint markers
        waypointMarkersRef.current.forEach(m => m.remove());
        waypointMarkersRef.current = [];

        const validWaypoints = waypoints.filter(wp => wp.id && !wp.id.startsWith('temp-') && wp.lat !== 0);

        validWaypoints.forEach((wp, i) => {
            const el = document.createElement('div');
            el.className = 'route-marker waypoint-marker';
            el.innerHTML = `
                <div class="marker-glow yellow"></div>
                <div class="waypoint-marker-number">${i + 1}</div>
                <div class="marker-label">${wp.name}</div>
            `;
            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([wp.lon, wp.lat])
                .addTo(map.current!);
            waypointMarkersRef.current.push(marker);
        });
    }, [waypoints, mapLoaded]);

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
        if (mainSource && isNavigating && roadGeometry) {
            // roadGeometry might be FeatureCollection now
            mainSource.setData(roadGeometry as unknown as GeoJSON.Feature | GeoJSON.FeatureCollection);
            map.current.setLayoutProperty('route-main', 'visibility', 'visible');

            // Apply traffic colors if it's a FeatureCollection
            const isFC = !Array.isArray(roadGeometry) && roadGeometry.type === 'FeatureCollection';
            if (isFC) {
                map.current.setPaintProperty('route-main', 'line-color', [
                    'match',
                    ['get', 'congestion'],
                    'low', '#22c55e',
                    'moderate', '#eab308',
                    'high', '#ef4444',
                    '#007bff'
                ]);
                map.current.setPaintProperty('route-main', 'line-opacity', 1.0);
            } else {
                map.current.setPaintProperty('route-main', 'line-color', selectedRouteIndex === 0 ? '#007bff' : '#64748b');
                map.current.setPaintProperty('route-main', 'line-opacity', selectedRouteIndex === 0 ? 0.9 : 0.4);
            }
        } else if (mainSource) {
            map.current.setLayoutProperty('route-main', 'visibility', 'none');
        }

        // Update alternative routes
        for (let i = 0; i < 3; i++) {
            const altSource = map.current.getSource(`route-alt-${i}`) as maplibregl.GeoJSONSource;
            if (altSource && isNavigating && alternativeRoutes[i]) {
                altSource.setData(alternativeRoutes[i].geometry as unknown as GeoJSON.Feature);
                map.current.setLayoutProperty(`route-alt-${i}`, 'visibility', 'visible');

                const isSelected = selectedRouteIndex === i + 1;
                const geom = alternativeRoutes[i].geometry;
                const isFC = !Array.isArray(geom) && (geom as { type?: string }).type === 'FeatureCollection';

                if (isFC && isSelected) {
                    map.current.setPaintProperty(`route-alt-${i}`, 'line-color', [
                        'match',
                        ['get', 'congestion'],
                        'low', '#22c55e',
                        'moderate', '#eab308',
                        'high', '#ef4444',
                        '#007bff'
                    ]);
                    map.current.setPaintProperty(`route-alt-${i}`, 'line-opacity', 1.0);
                } else if (isSelected) {
                    map.current.setPaintProperty(`route-alt-${i}`, 'line-color', '#007bff');
                    map.current.setPaintProperty(`route-alt-${i}`, 'line-opacity', 0.9);
                } else {
                    map.current.setPaintProperty(`route-alt-${i}`, 'line-color', '#64748b');
                    map.current.setPaintProperty(`route-alt-${i}`, 'line-opacity', 0.4);
                }
            } else if (altSource) {
                map.current.setLayoutProperty(`route-alt-${i}`, 'visibility', 'none');
            }
        }

        // Fit bounds once when navigation starts
        if (isNavigating && roadGeometry && !simulation.isRunning) {
            let coords: [number, number][] = [];
            const geom = roadGeometry;
            if (Array.isArray(geom)) {
                coords = geom;
            } else if (geom.type === 'FeatureCollection') {
                coords = geom.features.flatMap((f) => (f as { geometry: { coordinates: [number, number][] } }).geometry.coordinates);
            } else if (geom.type === 'Feature') {
                coords = geom.geometry.coordinates;
            }

            if (coords.length >= 2) {
                const bounds = new maplibregl.LngLatBounds();
                coords.forEach((coord: [number, number]) => bounds.extend(coord));
                map.current.fitBounds(bounds, { padding: 80, duration: 500 });
            }
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

    // Tracking Logic: Auto-center map on vehicle
    useEffect(() => {
        if (!map.current || !mapLoaded || !isTracking || !simulation.currentPosition || !simulation.isRunning) return;

        if (isScope) {
            // Perfect Centering: zero duration for scope/ops mode
            map.current.jumpTo({
                center: simulation.currentPosition,
                zoom: camSettings.zoom // Use user-defined zoom
            });
        } else {
            // Adaptive easing: faster updates at higher simulation speeds to prevent lag
            const speedFactor = simulation.speedMultiplier || 1;
            const duration = Math.max(150, Math.min(800, 1000 / Math.sqrt(speedFactor)));

            map.current.easeTo({
                center: simulation.currentPosition,
                duration: duration,
                essential: true
            });
        }
    }, [simulation.currentPosition, isTracking, mapLoaded, simulation.isRunning, simulation.speedMultiplier, isScope, camSettings.zoom]);

    // Break point markers - red dots with duration tooltip
    const breakMarkersRef = useRef<maplibregl.Marker[]>([]);

    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Add new break markers
        const existingCount = breakMarkersRef.current.length;
        const newBreaks = simulation.breakPoints.slice(existingCount);

        newBreaks.forEach((bp) => {
            const el = document.createElement('div');
            el.className = 'break-marker';
            el.title = `Break: ${bp.duration} min`;

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat(bp.position)
                .setPopup(
                    new maplibregl.Popup({ offset: 15, closeButton: false })
                        .setHTML(`<div class="break-popup">🛑 ${bp.duration} min break</div>`)
                )
                .addTo(map.current!);

            breakMarkersRef.current.push(marker);
        });

        // Clear markers when simulation stops
        if (!simulation.isRunning && breakMarkersRef.current.length > 0) {
            breakMarkersRef.current.forEach(m => m.remove());
            breakMarkersRef.current = [];
        }
    }, [simulation.breakPoints, simulation.isRunning, mapLoaded]);

    return (
        <div className="map-view-root">
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
            {isStartingNavigation && <RouteLoader message="Finding best route..." />}

            {/* Map Style Toggle */}
            <button
                className="map-style-toggle"
                onClick={() => {
                    const newStyle = mapStyle === 'street' ? 'satellite' : 'street';
                    setMapStyle(newStyle);
                    if (map.current) {
                        map.current.setLayoutProperty('osm', 'visibility', newStyle === 'street' ? 'visible' : 'none');
                        map.current.setLayoutProperty('satellite', 'visibility', newStyle === 'satellite' ? 'visible' : 'none');
                    }
                }}
                title={mapStyle === 'street' ? 'Switch to Satellite' : 'Switch to Street'}
            >
                {mapStyle === 'street' ? '🛰️' : '🗺️'}
                <span className="style-label">{mapStyle === 'street' ? 'Satellite' : 'Street'}</span>
            </button>
        </div>
    );
};

export default Map;
