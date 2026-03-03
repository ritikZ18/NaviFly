import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useRoute } from '../context/RouteContext';
import type { RoadGeometry } from '../context/RouteContext';
import { useTelemetry } from '../context/TelemetryContext';
import { pushToast } from './Toast';
import RouteLoader from './RouteLoader';

// TomTom API key (free at developer.tomtom.com — set VITE_TOMTOM_API_KEY in .env)
const TOMTOM_KEY = import.meta.env.VITE_TOMTOM_API_KEY as string | undefined;

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
    const globeAnimRef = useRef<number | null>(null);
    // Aircraft: keyed by ICAO24 → { marker, trail positions }
    type AircraftEntry = { marker: maplibregl.Marker; trail: [number, number][] };
    const aircraftMarkersRef = useRef<globalThis.Map<string, AircraftEntry>>(new globalThis.Map());
    const [locations, setLocations] = useState<Location[]>([]);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [mapStyle, setMapStyle] = useState<'street' | 'satellite'>('street');
    const [isTerrain, setIsTerrain] = useState(false);
    const routesInitialized = useRef(false);
    const initialFitDone = useRef(false);

    const { pushCarSpeedSample } = useTelemetry();

    const {
        startId, endId, roadGeometry, alternativeRoutes, selectedRouteIndex,
        isNavigating, simulation, vehicle, selectRoute, setRoadGeometry, setOptimalGeometry, setAlternativeRoutes,
        isStartingNavigation, isTracking, isScope, camSettings, waypoints,
        isGlobeView, isTrafficVisible, trackedEntityId, setIsGlobeView
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
                    },
                    // TomTom Live Traffic Flow tiles (real road congestion)
                    'tomtom-flow': {
                        type: 'raster',
                        tiles: TOMTOM_KEY
                            ? [`https://api.tomtom.com/maps/orbis/traffic/tile/flow/{z}/{x}/{y}.png?apiVersion=1&key=${TOMTOM_KEY}&style=relative-delay&tileSize=256`]
                            : [],
                        tileSize: 256,
                        attribution: '© TomTom'
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
                    },
                    {
                        id: 'tomtom-flow',
                        type: 'raster',
                        source: 'tomtom-flow',
                        minzoom: 0,
                        maxzoom: 22,
                        layout: { visibility: 'none' },
                        paint: { 'raster-opacity': 0.82 }
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

                // Aircraft trail source (GeoJSON LineString per aircraft)
                map.current.addSource('aircraft-trail', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
                map.current.addLayer({
                    id: 'aircraft-trail',
                    type: 'line',
                    source: 'aircraft-trail',
                    layout: { visibility: 'none' },
                    paint: {
                        'line-color': ['get', 'color'],
                        'line-width': 1.5,
                        'line-opacity': 0.6,
                        'line-dasharray': [3, 2],
                    }
                });

                // Add 3D Terrain source (AWS Terrain Tiles — free, no key required)
                map.current.addSource('terrain-dem', {
                    type: 'raster-dem',
                    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
                    tileSize: 256,
                    encoding: 'terrarium'
                });

                // Sky layer for atmosphere effect when terrain is active
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                map.current.addLayer({
                    id: 'sky',
                    type: 'sky' as any,
                    paint: {
                        'sky-type': 'atmosphere',
                        'sky-atmosphere-sun': [0.0, 90.0],
                        'sky-atmosphere-sun-intensity': 15
                    } as any,
                    layout: { visibility: 'none' }
                });

                // Road Traffic Cars source + symbol layer
                map.current.addSource('road-cars', {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });
                map.current.addLayer({
                    id: 'road-cars',
                    type: 'circle',
                    source: 'road-cars',
                    layout: { visibility: 'none' },
                    paint: {
                        'circle-radius': [
                            'interpolate', ['linear'], ['zoom'],
                            6, 3,
                            10, 5,
                            14, 7
                        ],
                        'circle-color': [
                            'match',
                            ['get', 'density'],
                            'low', '#22c55e',
                            'medium', '#f59e0b',
                            'high', '#ef4444',
                            '#22c55e'
                        ],
                        'circle-opacity': 0.85,
                        'circle-stroke-width': 1.5,
                        'circle-stroke-color': 'rgba(255,255,255,0.6)'
                    }
                });

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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                coords = geom.features.flatMap((f: any) => (f as { geometry: { coordinates: [number, number][] } }).geometry.coordinates);
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

    // Globe View Toggle Logic — with auto-rotate animation
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Stop any existing rotation
        if (globeAnimRef.current) {
            cancelAnimationFrame(globeAnimRef.current);
            globeAnimRef.current = null;
        }

        if (isGlobeView) {
            map.current.setProjection({ type: 'globe' });
            if (map.current.getZoom() > 5) {
                map.current.flyTo({ zoom: 2, duration: 2000 });
            }

            // Start smooth auto-rotation after zoom-out animation completes
            const startRotation = () => {
                if (!map.current || !isGlobeView) return;
                const rotate = () => {
                    if (!map.current) return;
                    const center = map.current.getCenter();
                    map.current.setCenter([center.lng + 0.04, center.lat]);
                    globeAnimRef.current = requestAnimationFrame(rotate);
                };
                globeAnimRef.current = requestAnimationFrame(rotate);
            };

            const stopOnInteraction = () => {
                if (globeAnimRef.current) {
                    cancelAnimationFrame(globeAnimRef.current);
                    globeAnimRef.current = null;
                }
                map.current?.off('mousedown', stopOnInteraction);
                map.current?.off('touchstart', stopOnInteraction);
            };

            // Begin rotation after fly animation
            setTimeout(startRotation, 2200);
            map.current.once('mousedown', stopOnInteraction);
            map.current.once('touchstart', stopOnInteraction);
        } else {
            map.current.setProjection({ type: 'mercator' });
            if (map.current.getZoom() < 5) {
                map.current.flyTo({ center: [-112.0740, 33.4484], zoom: 10, duration: 2000 });
            }
        }

        return () => {
            if (globeAnimRef.current) {
                cancelAnimationFrame(globeAnimRef.current);
                globeAnimRef.current = null;
            }
        };
    }, [isGlobeView, mapLoaded]);

    // 3D Terrain Toggle
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        if (isTerrain) {
            // Enable terrain elevation
            map.current.setTerrain({ source: 'terrain-dem', exaggeration: 1.5 });
            map.current.setPitch(45);
            map.current.setBearing(-20);
            map.current.setLayoutProperty('sky', 'visibility', 'visible');
        } else {
            // Disable terrain - return to flat view
            map.current.setTerrain(null);
            map.current.setPitch(0);
            map.current.setBearing(0);
            map.current.setLayoutProperty('sky', 'visibility', 'none');
        }
    }, [isTerrain, mapLoaded]);

    // ── TomTom Live Traffic: Flow Tiles + Incidents ───────────────────────────
    const incidentMarkersRef = useRef<maplibregl.Marker[]>([]);

    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Clean up incident markers
        const clearIncidents = () => {
            incidentMarkersRef.current.forEach(m => m.remove());
            incidentMarkersRef.current = [];
        };

        if (!isTrafficVisible || !TOMTOM_KEY) {
            // Hide flow overlay
            if (map.current.getLayer('tomtom-flow')) {
                map.current.setLayoutProperty('tomtom-flow', 'visibility', 'none');
            }
            clearIncidents();
            return;
        }

        // Show live flow tile overlay
        map.current.setLayoutProperty('tomtom-flow', 'visibility', 'visible');

        // Fetch TomTom Traffic Incidents for Arizona bounding box
        const fetchIncidents = async () => {
            if (!map.current) return;
            clearIncidents();

            try {
                const bbox = '-115.0,31.0,-109.0,37.0'; // Arizona
                const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?key=${TOMTOM_KEY}&bbox=${bbox}&fields={incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,events{description,code,iconCategory},startTime,endTime,from,to,length,delay,roadNumbers,timeValidity}}}&language=en-GB&t=1111&categoryFilter=0,1,2,3,4,5,6,7,8,9,10,11,14&timeValidityFilter=present`;

                const res = await fetch(url);
                if (!res.ok) return;
                const data = await res.json();

                if (!data.incidents) return;

                data.incidents.forEach((incident: {
                    type: string;
                    geometry: { type: string; coordinates: [number, number] | [number, number][] };
                    properties: {
                        iconCategory: number;
                        events?: { description: string }[];
                        from?: string;
                        to?: string;
                        delay?: number;
                    };
                }) => {
                    const geom = incident.geometry;
                    let coords: [number, number] | null = null;

                    if (geom.type === 'Point') {
                        coords = geom.coordinates as [number, number];
                    } else if (geom.type === 'LineString' && Array.isArray(geom.coordinates)) {
                        // Use midpoint of line
                        const mid = Math.floor((geom.coordinates as [number, number][]).length / 2);
                        coords = (geom.coordinates as [number, number][])[mid];
                    }

                    if (!coords || !map.current) return;

                    const cat = incident.properties.iconCategory;
                    const emoji =
                        cat === 1 ? '🚗💥' :  // accident
                            cat === 2 ? '🚧' :     // dangerous conditions
                                cat === 3 ? '🌧️' :     // rain / weather
                                    cat === 6 ? '🚦' :     // lane restriction
                                        cat === 7 ? '🚫' :     // road closed
                                            cat === 8 ? '🔧' :     // road works
                                                cat === 14 ? '⚡' :    // broken down vehicle
                                                    '⚠️';

                    const desc = incident.properties.events?.[0]?.description
                        || `${incident.properties.from || ''} → ${incident.properties.to || ''}`;
                    const delaySec = incident.properties.delay ?? 0;
                    const delayMin = Math.round(delaySec / 60);

                    const el = document.createElement('div');
                    el.className = 'incident-marker';
                    el.textContent = emoji;
                    el.title = desc;

                    const marker = new maplibregl.Marker({ element: el })
                        .setLngLat(coords)
                        .setPopup(
                            new maplibregl.Popup({ offset: 15, closeButton: false })
                                .setHTML(`<div class="incident-popup"><strong>${emoji} ${desc}</strong>${delayMin > 0 ? `<br/>+${delayMin} min delay` : ''}</div>`)
                        )
                        .addTo(map.current!);

                    incidentMarkersRef.current.push(marker);
                });
            } catch (e) {
                console.error('TomTom incidents fetch failed:', e);
            }
        };

        fetchIncidents();
        const incidentInterval = setInterval(fetchIncidents, 5 * 60 * 1000); // refresh every 5 min

        return () => {
            clearInterval(incidentInterval);
            clearIncidents();
            if (map.current?.getLayer('tomtom-flow')) {
                map.current.setLayoutProperty('tomtom-flow', 'visibility', 'none');
            }
        };
    }, [isTrafficVisible, mapLoaded]);

    // ── Live Aircraft Tracking (OpenSky API) — rotating icon + trail
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        // Clear markers when traffic turned off
        if (!isTrafficVisible) {
            aircraftMarkersRef.current.forEach(({ marker }) => marker.remove());
            aircraftMarkersRef.current.clear();
            const trailSrc = map.current.getSource('aircraft-trail') as maplibregl.GeoJSONSource;
            if (trailSrc) trailSrc.setData({ type: 'FeatureCollection', features: [] });
            if (map.current.getLayer('aircraft-trail')) {
                map.current.setLayoutProperty('aircraft-trail', 'visibility', 'none');
            }
            return;
        }

        if (map.current.getLayer('aircraft-trail')) {
            map.current.setLayoutProperty('aircraft-trail', 'visibility', 'visible');
        }

        // Route bbox for traffic-in-route detection
        let routeBbox: [number, number, number, number] | null = null;
        if (roadGeometry) {
            let coords: [number, number][] = [];
            if (Array.isArray(roadGeometry)) coords = roadGeometry;
            else if (roadGeometry.type === 'Feature') coords = (roadGeometry as { geometry: { coordinates: [number, number][] } }).geometry.coordinates;
            else if (roadGeometry.type === 'FeatureCollection') coords = (roadGeometry.features as { geometry: { coordinates: [number, number][] } }[]).flatMap(f => f.geometry.coordinates);
            if (coords.length) {
                const lons = coords.map(c => c[0]);
                const lats = coords.map(c => c[1]);
                routeBbox = [
                    Math.min(...lons) - 0.05, Math.min(...lats) - 0.05,
                    Math.max(...lons) + 0.05, Math.max(...lats) + 0.05
                ];
            }
        }

        let routeToastFired = false;

        const fetchAircraftData = async () => {
            try {
                const response = await fetch(
                    'https://opensky-network.org/api/states/all?lamin=31.0&lomin=-115.0&lamax=37.0&lomax=-109.0'
                );
                if (!response.ok) return;
                const data = await response.json();
                if (!data.states || !map.current) return;

                const zoom = map.current.getZoom();
                const seenIds = new Set<string>();
                const trailFeatures: GeoJSON.Feature[] = [];

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                data.states.forEach((s: any[]) => {
                    const icao24 = s[0] as string;
                    const callsign = (s[1] as string)?.trim() || icao24;
                    const lon = s[5] as number | null;
                    const lat = s[6] as number | null;
                    const heading = (s[10] as number | null) ?? 0;
                    const altitude = s[7] as number | null;
                    const velocity = s[9] as number | null;

                    if (lon == null || lat == null) return;
                    seenIds.add(icao24);

                    const isTracked = trackedEntityId === icao24;
                    const isNearRoute = routeBbox != null &&
                        lon >= routeBbox[0] && lon <= routeBbox[2] &&
                        lat >= routeBbox[1] && lat <= routeBbox[3];

                    // Route-traffic toast (fire once per effect lifecycle)
                    if (isNearRoute && !routeToastFired) {
                        routeToastFired = true;
                        pushToast({
                            type: 'warning',
                            icon: '✈️',
                            message: `Air traffic near route: ${callsign} at ${altitude ? Math.round(altitude) + 'm' : 'unknown alt'}`,
                            durationMs: 7000,
                        });
                    }

                    // Build or update marker
                    const existing = aircraftMarkersRef.current.get(icao24);
                    const trail: [number, number][] = existing
                        ? [...existing.trail.slice(-19), [lon, lat]]
                        : [[lon, lat]];

                    if (existing) {
                        // Update position + heading rotation
                        existing.marker.setLngLat([lon, lat]);
                        const el = existing.marker.getElement();
                        el.style.transform = `rotate(${heading}deg)`;
                        if (isTracked) {
                            el.classList.add('aircraft-tracked');
                            map.current?.easeTo({ center: [lon, lat], duration: 1000 });
                        } else {
                            el.classList.remove('aircraft-tracked');
                        }
                        aircraftMarkersRef.current.set(icao24, { marker: existing.marker, trail });
                    } else {
                        // Create new marker element
                        const el = document.createElement('div');
                        el.className = `aircraft-icon-marker${isTracked ? ' aircraft-tracked' : ''}`;
                        el.style.transform = `rotate(${heading}deg)`;
                        el.title = `${callsign} | Alt: ${altitude ? Math.round(altitude) + 'm' : '?'} | ${velocity ? Math.round(velocity * 3.6) + ' km/h' : '?'}`;

                        // Click → track this aircraft
                        el.addEventListener('click', () => {
                            pushToast({
                                type: 'info',
                                icon: '✈️',
                                message: `Tracking ${callsign} (${icao24})`,
                                durationMs: 4000,
                            });
                        });

                        // Popup on hover
                        const popup = new maplibregl.Popup({ offset: 18, closeButton: false, closeOnClick: false })
                            .setHTML(`
                                <div class="aircraft-popup">
                                    <strong>✈️ ${callsign}</strong>
                                    <div>ICAO: <code>${icao24}</code></div>
                                    <div>Alt: ${altitude ? Math.round(altitude) + ' m' : 'N/A'}</div>
                                    <div>Speed: ${velocity ? Math.round(velocity * 3.6) + ' km/h' : 'N/A'}</div>
                                    <div>Hdg: ${Math.round(heading)}°</div>
                                </div>
                            `);

                        const marker = new maplibregl.Marker({ element: el, rotation: 0 })
                            .setLngLat([lon, lat])
                            .setPopup(popup)
                            .addTo(map.current!);

                        aircraftMarkersRef.current.set(icao24, { marker, trail });
                    }

                    // Show trail when zoomed in enough
                    if (zoom >= 7 && trail.length >= 2) {
                        trailFeatures.push({
                            type: 'Feature',
                            id: icao24,
                            properties: { color: isTracked ? '#facc15' : '#60a5fa' },
                            geometry: { type: 'LineString', coordinates: trail }
                        });
                    }
                });

                // Remove stale markers (aircraft left the region)
                aircraftMarkersRef.current.forEach((entry, id) => {
                    if (!seenIds.has(id)) {
                        entry.marker.remove();
                        aircraftMarkersRef.current.delete(id);
                    }
                });

                // Update trail source
                const trailSrc = map.current?.getSource('aircraft-trail') as maplibregl.GeoJSONSource;
                if (trailSrc) {
                    trailSrc.setData({ type: 'FeatureCollection', features: trailFeatures });
                }

                // Focus tracked aircraft
                if (trackedEntityId) {
                    const tracked = aircraftMarkersRef.current.get(trackedEntityId);
                    if (tracked) {
                        map.current?.easeTo({ center: tracked.marker.getLngLat(), duration: 1000 });
                    }
                }
            } catch (e) {
                console.error('Failed to fetch OpenSky data:', e);
            }
        };

        fetchAircraftData();
        const interval = setInterval(fetchAircraftData, 10000);
        return () => {
            clearInterval(interval);
            aircraftMarkersRef.current.forEach(({ marker }) => marker.remove());
            aircraftMarkersRef.current.clear();
        };
    }, [isTrafficVisible, mapLoaded, trackedEntityId, roadGeometry]);

    // ── Moving Car Traffic Animation ──────────────────────────────────────────
    useEffect(() => {
        if (!map.current || !mapLoaded) return;

        const carLayer = map.current.getLayer('road-cars');
        if (!carLayer) return;

        // When TomTom key is present, real flow tiles already show traffic — hide simulated cars
        if (!isTrafficVisible || TOMTOM_KEY) {
            map.current.setLayoutProperty('road-cars', 'visibility', 'none');
            if (!isTrafficVisible) return;
            // TomTom key present: don't run the simulator
            return;
        }

        // Major AZ highway segments: [lon, lat] pairs
        const ROUTES: { path: [number, number][]; density: 'low' | 'medium' | 'high' }[] = [
            // I-10: PHX → Tucson
            { density: 'high', path: [[-112.074, 33.448], [-111.93, 33.30], [-111.58, 32.95], [-111.20, 32.58], [-110.97, 32.22]] },
            // I-10: PHX West → Buckeye
            { density: 'medium', path: [[-112.074, 33.448], [-112.25, 33.44], [-112.45, 33.42], [-112.58, 33.37]] },
            // I-17: PHX → Flagstaff
            { density: 'medium', path: [[-112.074, 33.448], [-112.10, 33.65], [-112.05, 34.00], [-111.85, 34.55], [-111.65, 35.20]] },
            // US-60: PHX → Mesa → Apache Junction
            { density: 'high', path: [[-112.074, 33.448], [-111.93, 33.43], [-111.83, 33.42], [-111.55, 33.42]] },
            // AZ-101: Scottsdale Loop
            { density: 'medium', path: [[-111.93, 33.63], [-111.92, 33.50], [-111.93, 33.43], [-112.00, 33.37], [-112.07, 33.37]] },
            // I-40: Flagstaff → Winslow
            { density: 'low', path: [[-111.65, 35.20], [-111.10, 35.10], [-110.70, 35.02]] },
            // SR-89A: Sedona → Flagstaff
            { density: 'low', path: [[-111.76, 34.87], [-111.72, 35.00], [-111.65, 35.20]] },
        ];

        // Spawn N cars per route with spread initial positions
        type Car = { routeIdx: number; t: number; speed: number; density: 'low' | 'medium' | 'high' };
        const CARS_PER_ROUTE = [6, 3, 4, 6, 4, 2, 2]; // match density
        const cars: Car[] = [];

        ROUTES.forEach((route, ri) => {
            const count = CARS_PER_ROUTE[ri] ?? 3;
            for (let i = 0; i < count; i++) {
                cars.push({
                    routeIdx: ri,
                    t: Math.random(), // staggered start along route
                    speed: (0.0008 + Math.random() * 0.0006) * (route.density === 'high' ? 0.7 : 1),
                    density: route.density
                });
            }
        });

        const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

        const getPositionAlongPath = (path: [number, number][], t: number): [number, number] => {
            const segments = path.length - 1;
            const scaled = t * segments;
            const segIdx = Math.min(Math.floor(scaled), segments - 1);
            const segT = scaled - segIdx;
            const from = path[segIdx];
            const to = path[segIdx + 1];
            return [lerp(from[0], to[0], segT), lerp(from[1], to[1], segT)];
        };

        let tickCount = 0;
        const tick = () => {
            tickCount++;
            cars.forEach(car => {
                car.t += car.speed;
                if (car.t > 1) car.t -= 1; // loop
            });

            const features = cars.map((car, idx) => {
                const path = ROUTES[car.routeIdx].path;
                const [lon, lat] = getPositionAlongPath(path, car.t);
                // add tiny jitter so cars spread across lane width
                const jitter = 0.0003;
                return {
                    type: 'Feature' as const,
                    id: idx,
                    properties: { density: car.density },
                    geometry: {
                        type: 'Point' as const,
                        coordinates: [lon + (Math.random() - 0.5) * jitter, lat + (Math.random() - 0.5) * jitter]
                    }
                };
            });

            const source = map.current?.getSource('road-cars') as maplibregl.GeoJSONSource;
            source?.setData({ type: 'FeatureCollection', features });

            // Every 5th tick (~3s) push fleet speed sample to telemetry
            if (tickCount % 5 === 0) {
                const speedMap: Record<string, number[]> = { low: [], medium: [], high: [] };
                cars.forEach(c => speedMap[c.density].push(c.speed * 100000));
                const allSpeeds = cars.map(c => c.speed * 100000);
                const avgSpeed = allSpeeds.reduce((a, b) => a + b, 0) / allSpeeds.length;
                const densityCounts = cars.reduce((acc, c) => { acc[c.density] = (acc[c.density] || 0) + 1; return acc; }, {} as Record<string, number>);
                const dominantDensity = (['high', 'medium', 'low'] as const).find(d => (densityCounts[d] || 0) > 0) ?? 'low';
                pushCarSpeedSample({
                    ts: Date.now(),
                    minSpeed: Math.min(...allSpeeds),
                    maxSpeed: Math.max(...allSpeeds),
                    avgSpeed,
                    density: dominantDensity,
                });
            }
        };

        const animInterval = setInterval(tick, 600); // update every 600ms — smooth but light
        return () => {
            clearInterval(animInterval);
            // Clear cars when traffic turned off
            const src = map.current?.getSource('road-cars') as maplibregl.GeoJSONSource;
            src?.setData({ type: 'FeatureCollection', features: [] });
        };
    }, [isTrafficVisible, mapLoaded]);

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

                {/* Live Traffic Legend */}
                {isTrafficVisible && (
                    <div className="traffic-legend">
                        <div className="traffic-legend-title">🚦 Live Traffic</div>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#22c55e' }}></span>
                            <span>Light</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#f59e0b' }}></span>
                            <span>Moderate</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#ef4444' }}></span>
                            <span>Heavy</span>
                        </div>
                        <div className="legend-item">
                            <span className="legend-dot" style={{ background: '#3b82f6' }}></span>
                            <span>Aircraft</span>
                        </div>
                    </div>
                )}
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

            {/* Globe Toggle */}
            <button
                className={`globe-view-toggle ${isGlobeView ? 'active' : ''}`}
                onClick={() => setIsGlobeView(!isGlobeView)}
                title={isGlobeView ? 'Switch to Local View' : 'Switch to Globe View'}
            >
                🌍
                <span className="style-label">{isGlobeView ? 'Local' : 'Globe'}</span>
            </button>

            {/* Terrain Toggle */}
            <button
                className={`globe-view-toggle terrain-toggle ${isTerrain ? 'active' : ''}`}
                onClick={() => setIsTerrain(!isTerrain)}
                title={isTerrain ? 'Disable 3D Terrain' : 'Enable 3D Terrain'}
                style={{ bottom: '140px' }}
            >
                ⛰️
                <span className="style-label">{isTerrain ? 'Flat' : '3D'}</span>
            </button>
        </div>
    );
};

export default Map;
