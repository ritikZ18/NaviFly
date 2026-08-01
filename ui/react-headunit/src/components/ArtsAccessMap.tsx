import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

// Arts Access Map — the school arts-access instrument for YMU / Arts Access Miami.
// Two lenses over the same data: SCHOOLS (dots keyed by arts-access level) and
// PARTNERS (each arts org placed at the centroid of the schools it serves, with
// reach lines drawn to every school). Heavy detail is fetched one item at a time.

// Same-origin by default: the Vite dev server proxies /schools and /partners to
// the Go routing service, so one shared URL (tunnel / port-forward) works from any device.
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

// Miami-Dade framing
const COUNTY_BOUNDS: [[number, number], [number, number]] = [
    [-80.52, 25.42],
    [-80.11, 25.99],
];

// Simplified Miami-Dade County outline (approximate) — map context for the tracked area
const COUNTY_BOUNDARY: GeoJSON.Feature = {
    type: 'Feature',
    properties: {},
    geometry: {
        type: 'Polygon',
        coordinates: [[
            [-80.874, 25.979],
            [-80.118, 25.979],
            [-80.118, 25.855],
            [-80.122, 25.790],
            [-80.130, 25.730],
            [-80.170, 25.650],
            [-80.240, 25.560],
            [-80.310, 25.470],
            [-80.350, 25.400],
            [-80.430, 25.300],
            [-80.500, 25.230],
            [-80.620, 25.170],
            [-80.760, 25.165],
            [-80.874, 25.230],
            [-80.874, 25.979],
        ]],
    },
};

type AccessLevel = 'high' | 'medium' | 'low' | 'none';
type Lens = 'schools' | 'partners';

const ACCESS: Record<AccessLevel, { color: string; label: string }> = {
    high: { color: '#16a34a', label: 'Well served' },
    medium: { color: '#f5b400', label: 'Partial access' },
    low: { color: '#fb7a1e', label: 'Limited' },
    none: { color: '#ff3d71', label: 'Access gap' },
};

// Discipline → chip/avatar/partner-pin color (Miami palette)
const DISCIPLINE_COLOR: Record<string, string> = {
    'Music': '#0ca8b0',
    'Dance': '#ff5d8f',
    'Visual Arts': '#ff922b',
    'Theater': '#845ef7',
};
const disciplineColor = (d: string) => DISCIPLINE_COLOR[d] ?? '#0fb5a6';
const DISCIPLINES = ['Music', 'Dance', 'Visual Arts', 'Theater'];

const initials = (name: string) =>
    name.split(' ').filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();

// Matches the backend slug so a school's org name maps to its /partners/{id}
const slugify = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const reachLabel = (r: string) =>
    r === 'wide' ? 'Countywide reach' : r === 'regional' ? 'Regional reach' : 'Focused reach';

interface Program {
    id: number;
    organization: string;
    discipline: string;
    students: number;
    participation: number;
    impact: number;
}

interface SchoolDetail {
    id: string;
    name: string;
    address: string;
    region: string;
    students: number;
    access_level: AccessLevel;
    image_url?: string;
    programs?: Program[];
}

interface PartnerSchool {
    id: string;
    name: string;
    region: string;
    discipline: string;
    students: number;
    impact: number;
    lat: number;
    lng: number;
}

interface PartnerDetail {
    id: string;
    organization: string;
    school_count: number;
    students: number;
    disciplines: string[];
    primary_discipline: string;
    reach_level: string;
    lat: number;
    lng: number;
    schools: PartnerSchool[];
}

interface Summary {
    schools: number;
    students: number;
    programs: number;
    organizations: number;
    gaps: number;
    by_access_level: Record<AccessLevel, number>;
    by_region: Record<string, number>;
}

const ArtsAccessMap: React.FC = () => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<maplibregl.Map | null>(null);
    const sheetTouchStartY = useRef<number | null>(null);
    const [mapLoaded, setMapLoaded] = useState(false);
    const [summary, setSummary] = useState<Summary | null>(null);
    const [lens, setLens] = useState<Lens>('schools');
    const [selected, setSelected] = useState<SchoolDetail | null>(null);
    const [selectedPartner, setSelectedPartner] = useState<PartnerDetail | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [gapMode, setGapMode] = useState<boolean>(
        () => new URLSearchParams(window.location.search).get('gaps') === '1',
    );
    const [imageOpen, setImageOpen] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [basemap, setBasemap] = useState<'map' | 'satellite'>('map');
    const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

    // ── Load county summary (drives the default overview panel) ──
    useEffect(() => {
        fetch(`${API_BASE}/schools/summary`)
            .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
            .then(setSummary)
            .catch(() => setError('Could not reach the Arts Access service on :8080.'));
    }, []);

    const selectSchool = useCallback(async (id: string) => {
        setLoadingDetail(true);
        try {
            const res = await fetch(`${API_BASE}/schools/${id}`);
            if (!res.ok) throw new Error(String(res.status));
            const data: SchoolDetail = await res.json();
            setSelected(data);
        } catch {
            setError('Could not load that school.');
        } finally {
            setLoadingDetail(false);
        }
    }, []);

    const selectPartner = useCallback(async (id: string) => {
        try {
            const res = await fetch(`${API_BASE}/partners/${id}`);
            if (!res.ok) throw new Error(String(res.status));
            const data: PartnerDetail = await res.json();
            setSelectedPartner(data);
        } catch {
            setError('Could not load that partner.');
        }
    }, []);

    // Reset the photo flyout each time a new school is opened
    useEffect(() => {
        if (selected) setImageOpen(true);
    }, [selected?.id]);

    // On mobile a new selection starts collapsed (breadcrumb) — tap to expand
    useEffect(() => {
        setMobileSheetOpen(false);
    }, [selected?.id, selectedPartner?.id]);

    // ── Initialize map once ──
    useEffect(() => {
        if (map.current || !mapContainer.current) return;

        map.current = new maplibregl.Map({
            container: mapContainer.current,
            style: {
                version: 8,
                glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
                sources: {
                    'carto-light': {
                        type: 'raster',
                        tiles: [
                            'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                            'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                            'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
                        ],
                        tileSize: 256,
                        attribution: '© OpenStreetMap © CARTO',
                    },
                    'satellite': {
                        type: 'raster',
                        tiles: [
                            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
                        ],
                        tileSize: 256,
                        maxzoom: 19,
                        attribution: '© Esri, Maxar, Earthstar Geographics',
                    },
                },
                layers: [
                    { id: 'carto-light', type: 'raster', source: 'carto-light' },
                    { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' } },
                ],
            },
            center: [-80.30, 25.70],
            zoom: 9.2,
            attributionControl: false,
        });

        map.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
        map.current.addControl(new maplibregl.ScaleControl({ maxWidth: 90, unit: 'imperial' }), 'bottom-left');

        map.current.on('load', () => {
            const m = map.current!;

            // Miami-Dade County boundary — the tracked area (drawn beneath everything)
            m.addSource('county', { type: 'geojson', data: COUNTY_BOUNDARY });
            m.addLayer({
                id: 'county-fill', type: 'fill', source: 'county',
                paint: { 'fill-color': '#0a9488', 'fill-opacity': 0.05 },
            });
            m.addLayer({
                id: 'county-outline', type: 'line', source: 'county',
                paint: { 'line-color': '#0a9488', 'line-width': 2.5, 'line-opacity': 0.75, 'line-dasharray': [3, 2] },
            });

            const accessColor: maplibregl.ExpressionSpecification = [
                'match', ['get', 'access_level'],
                'high', ACCESS.high.color,
                'medium', ACCESS.medium.color,
                'low', ACCESS.low.color,
                'none', ACCESS.none.color,
                '#94a3b8',
            ];
            const radiusByStudents: maplibregl.ExpressionSpecification = [
                'interpolate', ['linear'], ['get', 'students'], 500, 7, 1500, 12, 3000, 20,
            ];
            const disciplineColorExpr: maplibregl.ExpressionSpecification = [
                'match', ['get', 'primary_discipline'],
                'Music', DISCIPLINE_COLOR['Music'],
                'Dance', DISCIPLINE_COLOR['Dance'],
                'Visual Arts', DISCIPLINE_COLOR['Visual Arts'],
                'Theater', DISCIPLINE_COLOR['Theater'],
                '#0a9488',
            ];
            const partnerRadius: maplibregl.ExpressionSpecification = [
                'interpolate', ['linear'], ['get', 'school_count'], 1, 11, 9, 27,
            ];

            // ── Schools lens ──
            m.addSource('schools', {
                type: 'geojson',
                data: `${API_BASE}/schools.geojson`,
                cluster: true,
                clusterMaxZoom: 8,
                clusterRadius: 40,
            });
            m.addLayer({
                id: 'school-glow', type: 'circle', source: 'schools',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': accessColor,
                    'circle-radius': ['*', radiusByStudents, 1.8] as maplibregl.ExpressionSpecification,
                    'circle-blur': 1, 'circle-opacity': 0.28,
                },
            });
            m.addLayer({
                id: 'unclustered-point', type: 'circle', source: 'schools',
                filter: ['!', ['has', 'point_count']],
                paint: {
                    'circle-color': accessColor, 'circle-radius': radiusByStudents,
                    'circle-opacity': 0.92, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff',
                },
            });
            m.addLayer({
                id: 'clusters', type: 'circle', source: 'schools',
                filter: ['has', 'point_count'],
                paint: {
                    'circle-color': '#ffffff', 'circle-opacity': 0.96,
                    'circle-radius': ['step', ['get', 'point_count'], 17, 5, 23, 15, 30],
                    'circle-stroke-width': 3, 'circle-stroke-color': '#0a9488',
                },
            });
            m.addLayer({
                id: 'cluster-count', type: 'symbol', source: 'schools',
                filter: ['has', 'point_count'],
                layout: {
                    'text-field': '{point_count_abbreviated}',
                    'text-font': ['Open Sans Bold', 'Noto Sans Bold'], 'text-size': 14,
                },
                paint: { 'text-color': '#0a9488' },
            });

            // ── Partners lens (hidden until toggled) ──
            m.addSource('partners', { type: 'geojson', data: `${API_BASE}/partners.geojson` });
            m.addSource('reach-lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
            m.addSource('reach-endpoints', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

            m.addLayer({
                id: 'reach-lines', type: 'line', source: 'reach-lines',
                layout: { 'line-cap': 'round', visibility: 'none' },
                paint: { 'line-color': '#0a9488', 'line-width': 2, 'line-opacity': 0.55, 'line-dasharray': [1.5, 1.2] },
            });
            m.addLayer({
                id: 'reach-endpoints', type: 'circle', source: 'reach-endpoints',
                layout: { visibility: 'none' },
                paint: { 'circle-radius': 6, 'circle-color': '#ffffff', 'circle-stroke-width': 2.5, 'circle-stroke-color': '#0a9488' },
            });
            m.addLayer({
                id: 'reach-endpoint-labels', type: 'symbol', source: 'reach-endpoints',
                layout: {
                    visibility: 'none',
                    'text-field': ['get', 'name'],
                    'text-font': ['Open Sans Bold', 'Noto Sans Bold'],
                    'text-size': 11,
                    'text-offset': [0, 1.2],
                    'text-anchor': 'top',
                    'text-max-width': 9,
                },
                paint: {
                    'text-color': '#0a2540',
                    'text-halo-color': '#ffffff',
                    'text-halo-width': 1.6,
                },
            });
            m.addLayer({
                id: 'partners-glow', type: 'circle', source: 'partners',
                layout: { visibility: 'none' },
                paint: {
                    'circle-color': disciplineColorExpr,
                    'circle-radius': ['*', partnerRadius, 1.5] as maplibregl.ExpressionSpecification,
                    'circle-blur': 1, 'circle-opacity': 0.22,
                },
            });
            m.addLayer({
                id: 'partners-layer', type: 'circle', source: 'partners',
                layout: { visibility: 'none' },
                paint: {
                    'circle-color': disciplineColorExpr, 'circle-radius': partnerRadius,
                    'circle-opacity': 0.92, 'circle-stroke-width': 2.5, 'circle-stroke-color': '#ffffff',
                },
            });
            m.addLayer({
                id: 'partners-count', type: 'symbol', source: 'partners',
                layout: {
                    visibility: 'none', 'text-field': ['to-string', ['get', 'school_count']],
                    'text-font': ['Open Sans Bold', 'Noto Sans Bold'], 'text-size': 13,
                },
                paint: { 'text-color': '#ffffff' },
            });

            // Interactions
            m.on('click', 'unclustered-point', (e) => {
                const id = e.features?.[0]?.properties?.id as string | undefined;
                if (id) selectSchool(id);
            });
            m.on('click', 'partners-layer', (e) => {
                const id = e.features?.[0]?.properties?.id as string | undefined;
                if (id) selectPartner(id);
            });
            m.on('click', 'clusters', (e) => {
                const f = m.queryRenderedFeatures(e.point, { layers: ['clusters'] })[0];
                const clusterId = f?.properties?.cluster_id;
                const src = m.getSource('schools') as maplibregl.GeoJSONSource;
                if (clusterId != null && src) {
                    src.getClusterExpansionZoom(clusterId).then((zoom) => {
                        m.easeTo({ center: (f.geometry as GeoJSON.Point).coordinates as [number, number], zoom });
                    }).catch(() => { });
                }
            });
            ['unclustered-point', 'clusters', 'partners-layer'].forEach((id) => {
                m.on('mouseenter', id, () => { m.getCanvas().style.cursor = 'pointer'; });
                m.on('mouseleave', id, () => { m.getCanvas().style.cursor = ''; });
            });

            m.fitBounds(COUNTY_BOUNDS, { padding: 50, duration: 0 });
            setMapLoaded(true);
        });

        return () => {
            map.current?.remove();
            map.current = null;
        };
    }, [selectSchool, selectPartner]);

    // ── Lens toggle: show/hide the two layer sets ──
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const m = map.current;
        const school = ['school-glow', 'unclustered-point', 'clusters', 'cluster-count'];
        const partner = ['partners-glow', 'partners-layer', 'partners-count'];
        const reach = ['reach-lines', 'reach-endpoints', 'reach-endpoint-labels'];
        school.forEach(id => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', lens === 'schools' ? 'visible' : 'none'));
        partner.forEach(id => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', lens === 'partners' ? 'visible' : 'none'));
        reach.forEach(id => m.getLayer(id) && m.setLayoutProperty(id, 'visibility', lens === 'partners' ? 'visible' : 'none'));
    }, [lens, mapLoaded]);

    // ── Partner reach lines: draw org → each school it serves ──
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const m = map.current;
        const lineSrc = m.getSource('reach-lines') as maplibregl.GeoJSONSource | undefined;
        const endSrc = m.getSource('reach-endpoints') as maplibregl.GeoJSONSource | undefined;
        if (!lineSrc || !endSrc) return;

        const partnerLayers = ['partners-layer', 'partners-glow', 'partners-count'];

        if (lens === 'partners' && selectedPartner) {
            const p = selectedPartner;
            lineSrc.setData({
                type: 'FeatureCollection',
                features: p.schools.map(s => ({
                    type: 'Feature', properties: {},
                    geometry: { type: 'LineString', coordinates: [[p.lng, p.lat], [s.lng, s.lat]] },
                })),
            });
            endSrc.setData({
                type: 'FeatureCollection',
                features: p.schools.map(s => ({
                    type: 'Feature', properties: { name: s.name },
                    geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
                })),
            });
            // Isolate the selected org — hide every other partner pin
            const onlyThis = ['==', ['get', 'id'], p.id] as maplibregl.FilterSpecification;
            partnerLayers.forEach(id => { if (m.getLayer(id)) m.setFilter(id, onlyThis); });
            // Frame the org's footprint
            const b = new maplibregl.LngLatBounds([p.lng, p.lat], [p.lng, p.lat]);
            p.schools.forEach(s => b.extend([s.lng, s.lat]));
            m.fitBounds(b, { padding: 90, maxZoom: 12, duration: 600 });
        } else {
            lineSrc.setData({ type: 'FeatureCollection', features: [] });
            endSrc.setData({ type: 'FeatureCollection', features: [] });
            // Deselected → show all partners again
            partnerLayers.forEach(id => { if (m.getLayer(id)) m.setFilter(id, null); });
        }
    }, [selectedPartner, lens, mapLoaded]);

    // ── Gap-highlight toggle (schools lens): dim served, spotlight gaps ──
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const m = map.current;
        const radiusByStudents: maplibregl.ExpressionSpecification = [
            'interpolate', ['linear'], ['get', 'students'], 500, 7, 1500, 12, 3000, 20,
        ];
        if (gapMode) {
            m.setPaintProperty('unclustered-point', 'circle-opacity', ['match', ['get', 'access_level'], 'none', 1, 'low', 0.95, 0.12]);
            m.setPaintProperty('unclustered-point', 'circle-radius', ['match', ['get', 'access_level'], 'none', 18, 'low', 15, radiusByStudents]);
            m.setPaintProperty('unclustered-point', 'circle-stroke-width', ['match', ['get', 'access_level'], 'none', 3.5, 'low', 3, 0.5]);
            m.setPaintProperty('unclustered-point', 'circle-stroke-color', ['match', ['get', 'access_level'], 'none', '#ffffff', 'low', '#ffffff', 'rgba(255,255,255,0.4)']);
            m.setPaintProperty('school-glow', 'circle-opacity', ['match', ['get', 'access_level'], 'none', 0.5, 'low', 0.38, 0.04]);
            m.setPaintProperty('school-glow', 'circle-radius', [
                'match', ['get', 'access_level'],
                'none', ['*', radiusByStudents, 3] as maplibregl.ExpressionSpecification,
                'low', ['*', radiusByStudents, 2.6] as maplibregl.ExpressionSpecification,
                ['*', radiusByStudents, 1.8] as maplibregl.ExpressionSpecification,
            ]);
        } else {
            m.setPaintProperty('unclustered-point', 'circle-opacity', 0.92);
            m.setPaintProperty('unclustered-point', 'circle-radius', radiusByStudents);
            m.setPaintProperty('unclustered-point', 'circle-stroke-width', 2.5);
            m.setPaintProperty('unclustered-point', 'circle-stroke-color', '#ffffff');
            m.setPaintProperty('school-glow', 'circle-opacity', 0.28);
            m.setPaintProperty('school-glow', 'circle-radius', ['*', radiusByStudents, 1.8] as maplibregl.ExpressionSpecification);
        }
    }, [gapMode, mapLoaded]);

    // ── Basemap toggle: map ⇄ satellite; recolor overlays so they pop on imagery ──
    useEffect(() => {
        if (!map.current || !mapLoaded) return;
        const m = map.current;
        const sat = basemap === 'satellite';
        m.setLayoutProperty('carto-light', 'visibility', sat ? 'none' : 'visible');
        m.setLayoutProperty('satellite', 'visibility', sat ? 'visible' : 'none');

        // Reach lines + county outline need high contrast on dark satellite imagery
        if (m.getLayer('reach-lines')) {
            m.setPaintProperty('reach-lines', 'line-color', sat ? '#ffd60a' : '#0a9488');
            m.setPaintProperty('reach-lines', 'line-width', sat ? 2.6 : 2);
            m.setPaintProperty('reach-lines', 'line-opacity', sat ? 0.95 : 0.55);
        }
        if (m.getLayer('reach-endpoints')) {
            m.setPaintProperty('reach-endpoints', 'circle-stroke-color', sat ? '#ffd60a' : '#0a9488');
        }
        if (m.getLayer('reach-endpoint-labels')) {
            m.setPaintProperty('reach-endpoint-labels', 'text-color', sat ? '#ffffff' : '#0a2540');
            m.setPaintProperty('reach-endpoint-labels', 'text-halo-color', sat ? 'rgba(0,0,0,0.85)' : '#ffffff');
        }
        if (m.getLayer('county-outline')) {
            m.setPaintProperty('county-outline', 'line-color', sat ? '#ffd60a' : '#0a9488');
            m.setPaintProperty('county-outline', 'line-opacity', sat ? 0.9 : 0.75);
            m.setPaintProperty('county-outline', 'line-width', sat ? 3 : 2.5);
        }
        if (m.getLayer('county-fill')) {
            m.setPaintProperty('county-fill', 'fill-color', sat ? '#ffffff' : '#0a9488');
        }
    }, [basemap, mapLoaded]);

    const switchLens = (l: Lens) => {
        setLens(l);
        setSelected(null);
        setSelectedPartner(null);
    };

    // From a school's partner card → jump to that org's countywide reach
    const openPartnerByOrg = (org: string) => {
        setSelected(null);
        setLens('partners');
        selectPartner(slugify(org));
    };

    // Hide the sheet entirely (back to full-screen map)
    const dismissSheet = () => {
        setSelected(null);
        setSelectedPartner(null);
    };

    // Mobile sheet swipe: up = expand · down = collapse · down again = hide
    const onSheetTouchStart = (e: React.TouchEvent) => {
        sheetTouchStartY.current = e.touches[0].clientY;
    };
    const onSheetTouchEnd = (e: React.TouchEvent) => {
        if (sheetTouchStartY.current == null) return;
        const dy = e.changedTouches[0].clientY - sheetTouchStartY.current;
        sheetTouchStartY.current = null;
        if (dy < -30) {
            setMobileSheetOpen(true);
        } else if (dy > 30) {
            if (mobileSheetOpen) setMobileSheetOpen(false);
            else dismissSheet();
        }
    };

    const showSchoolImage = lens === 'schools' && selected && imageOpen;
    const hasSelection = lens === 'partners' ? !!selectedPartner : !!selected;
    const breadcrumbTitle = lens === 'partners'
        ? (selectedPartner?.organization ?? 'Partners')
        : (selected?.name ?? 'Overview');

    return (
        <div className="aa-root">
            {/* Header */}
            <header className="aa-header">
                <div className="aa-brand">
                    <img className="aa-logo-img" src="/assets/artacesslogo.png" alt="Arts Access Miami" />
                    <div>
                        <h1>Arts Access Miami</h1>
                        <p>School Arts-Access Map · Miami-Dade County</p>
                    </div>
                </div>
                <div className="aa-header-right">
                    <span className="aa-sample-tag">illustrative sample data</span>
                    {lens === 'schools' && (
                        <button
                            className={`aa-gap-btn ${gapMode ? 'active' : ''}`}
                            onClick={() => setGapMode(v => !v)}
                        >
                            {gapMode ? '● Showing access gaps' : 'Highlight access gaps'}
                        </button>
                    )}
                </div>
            </header>

            <div className="aa-body">
                <div ref={mapContainer} className="aa-map" />

                {/* Basemap toggle */}
                <button
                    className="aa-basemap-toggle"
                    onClick={() => setBasemap(b => (b === 'map' ? 'satellite' : 'map'))}
                    title={basemap === 'map' ? 'Switch to satellite imagery' : 'Switch to map view'}
                >
                    <span className="aa-basemap-icon">{basemap === 'map' ? '🛰️' : '🗺️'}</span>
                    <span className="aa-basemap-label">{basemap === 'map' ? 'Satellite view' : 'Map view'}</span>
                </button>

                {/* Lens toggle: Schools | Partners */}
                <div className="aa-lens" role="tablist">
                    <button className={lens === 'schools' ? 'active' : ''} onClick={() => switchLens('schools')}>Schools</button>
                    <button className={lens === 'partners' ? 'active' : ''} onClick={() => switchLens('partners')}>Partners</button>
                </div>

                {/* Legend (lens-aware) */}
                <div className="aa-legend">
                    {lens === 'schools' ? (
                        <>
                            <div className="aa-legend-title">Arts access level</div>
                            {(Object.keys(ACCESS) as AccessLevel[]).map(k => (
                                <div className="aa-legend-item" key={k}>
                                    <span className="aa-dot" style={{ background: ACCESS[k].color }} />
                                    <span>{ACCESS[k].label}</span>
                                </div>
                            ))}
                            <div className="aa-legend-note">Dot size = student enrollment</div>
                        </>
                    ) : (
                        <>
                            <div className="aa-legend-title">Partner discipline</div>
                            {DISCIPLINES.map(d => (
                                <div className="aa-legend-item" key={d}>
                                    <span className="aa-dot" style={{ background: disciplineColor(d) }} />
                                    <span>{d}</span>
                                </div>
                            ))}
                            <div className="aa-legend-note">Dot size = schools reached · tap a partner to trace its lines</div>
                        </>
                    )}
                    {/* "Confused? ask me" helper — attached to the legend's bottom border */}
                    <MapAssistant />
                </div>

                {/* School photo flyout — opens to the left of the detail panel */}
                {showSchoolImage && (
                    <div className="aa-image-flyout">
                        <button className="aa-image-close" onClick={() => setImageOpen(false)} title="Close photo">✕</button>
                        <SchoolImage school={selected!} />
                        <div className="aa-image-caption">{selected!.name}</div>
                    </div>
                )}
                {lens === 'schools' && selected && !imageOpen && (
                    <button className="aa-image-open" onClick={() => setImageOpen(true)} title="Show school photo">📷</button>
                )}

                {/* Right panel — desktop: docked card · mobile: on-demand bottom sheet */}
                <aside className={`aa-panel ${hasSelection ? 'has-selection' : 'no-selection'} ${mobileSheetOpen ? 'sheet-open' : 'sheet-collapsed'}`}>
                    <div
                        className="aa-sheet-handle"
                        role="button"
                        tabIndex={0}
                        aria-expanded={mobileSheetOpen}
                        onClick={() => setMobileSheetOpen(o => !o)}
                        onTouchStart={onSheetTouchStart}
                        onTouchEnd={onSheetTouchEnd}
                    >
                        <span className="aa-sheet-grip" />
                        <span className="aa-sheet-title">{breadcrumbTitle}</span>
                        <span className="aa-sheet-caret">{mobileSheetOpen ? 'Hide ▾' : 'Details ▸'}</span>
                        <button
                            className="aa-sheet-close"
                            onClick={(e) => { e.stopPropagation(); dismissSheet(); }}
                            aria-label="Close details"
                            title="Close"
                        >✕</button>
                    </div>
                    <div className="aa-panel-body">
                        {error && <div className="aa-error">{error}</div>}

                        {lens === 'partners' ? (
                            selectedPartner
                                ? <PartnerPanel partner={selectedPartner} onBack={() => setSelectedPartner(null)} />
                                : <PartnersOverview summary={summary} />
                        ) : (
                            selected
                                ? <SchoolPanel school={selected} loading={loadingDetail} onBack={() => setSelected(null)} onOpenPartner={openPartnerByOrg} />
                                : <SummaryPanel summary={summary} />
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

// ── Map assistant ─────────────────────────────────────────────────────────
// A small, friendly helper that answers common questions about the map.
// It runs entirely client-side (a keyword resolver over a tiny knowledge base),
// so it needs no API key and works on the static build. To make it Claude-backed
// later, replace resolveQuery() with a fetch to a server endpoint that proxies
// the Anthropic API — keep the key on the server, never in the browser.
type ChatMsg = { role: 'user' | 'assistant'; text: string };

const ASSISTANT_KB: { keys: string[]; answer: string }[] = [
    {
        keys: ['color', 'colour', 'red', 'green', 'orange', 'yellow', 'level', 'mean', 'legend'],
        answer: 'Each pin is a school, colored by how much arts access it has: green = strong, yellow = medium, orange = low, and red = little to none. Bigger dots mean more students — so a large red pin is a big school with a real gap.',
    },
    {
        keys: ['size', 'dot', 'big', 'small', 'enrollment', 'students', 'bigger'],
        answer: 'Dot size = student enrollment. The bigger the pin, the more kids at that school — handy for spotting where a gap affects the most students.',
    },
    {
        keys: ['partner', 'partners', 'serve', 'serves', 'who', 'line', 'lines', 'reach', 'organization', 'org', 'provider'],
        answer: 'Switch to the Partners lens at the top of the map to see arts organizations. Each partner sits at the center of the schools it serves, and the lines trace who serves whom. Tap a partner to isolate just its connections.',
    },
    {
        keys: ['gap', 'gaps', 'highlight', 'underserved', 'need', 'missing', 'where'],
        answer: 'Use the "Highlight access gaps" button in the top-right. It fades the well-served schools so the ones with low or no arts access stand out — that’s where a new program would help most.',
    },
    {
        keys: ['satellite', 'map view', 'basemap', 'imagery', 'aerial', 'view'],
        answer: 'Tap the 🛰️ button on the map to switch between the street map and satellite imagery. The connection lines brighten on satellite so they stay easy to read.',
    },
    {
        keys: ['real', 'sample', 'data', 'accurate', 'fake', 'illustrative', 'actual', 'source'],
        answer: 'This view uses illustrative sample data to show how the map works. In the live version it’s fed from the real Airtable base and cleaned through a validation step before anything reaches the map.',
    },
    {
        keys: ['click', 'tap', 'detail', 'details', 'school', 'info', 'panel', 'program', 'programs'],
        answer: 'Click any school pin to open its details on the right — access level, enrollment, and the arts programs it offers. Click a partner name there to jump straight to that partner.',
    },
    {
        keys: ['what', 'about', 'purpose', 'why', 'arts access', 'do', 'this'],
        answer: 'This map shows where arts access is strong or thin across Miami-Dade schools, and which partners already serve them — so it’s easy to see the gaps and decide where the next program should go.',
    },
    {
        keys: ['hi', 'hello', 'hey', 'help', 'thanks', 'thank'],
        answer: 'Hi! I can explain the colors, the partner lines, how to find gaps, or anything else on the map. Tap a question below or just ask.',
    },
];

const ASSISTANT_FALLBACK =
    'I’m not sure about that one — but I can help with the map itself: the colors, dot sizes, partners and their lines, finding access gaps, or the satellite view. Try one of the questions below.';

function resolveQuery(input: string): string {
    const q = input.toLowerCase();
    let best = { score: 0, answer: ASSISTANT_FALLBACK };
    for (const item of ASSISTANT_KB) {
        const score = item.keys.reduce((n, k) => (q.includes(k) ? n + 1 : n), 0);
        if (score > best.score) best = { score, answer: item.answer };
    }
    return best.answer;
}

const ASSISTANT_SUGGESTIONS = [
    'What do the colors mean?',
    "What's a partner?",
    'How do I find gaps?',
    'Is this real data?',
];

// Crisp inline sparkle mark — the "AI helper" cue, sharp at any size
const SparkleIcon: React.FC = () => (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
            d="M12 2.5l1.7 5.2a3 3 0 0 0 1.9 1.9l5.2 1.7-5.2 1.7a3 3 0 0 0-1.9 1.9L12 20.1l-1.7-5.2a3 3 0 0 0-1.9-1.9L3.2 11.3l5.2-1.7a3 3 0 0 0 1.9-1.9L12 2.5z"
            fill="currentColor"
        />
        <path
            d="M19 3.2l.66 1.74L21.4 5.6l-1.74.66L19 8l-.66-1.74L16.6 5.6l1.74-.66L19 3.2z"
            fill="currentColor"
            opacity="0.85"
        />
    </svg>
);

const MapAssistant: React.FC = () => {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [typing, setTyping] = useState(false);
    const [messages, setMessages] = useState<ChatMsg[]>([
        { role: 'assistant', text: "Hi! I'm here if the map feels confusing. Ask me about the colors, partners, or how to spot arts-access gaps." },
    ]);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = scrollRef.current;
        if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    }, [messages, typing, open]);

    const send = useCallback((raw: string) => {
        const text = raw.trim();
        if (!text) return;
        setMessages(m => [...m, { role: 'user', text }]);
        setInput('');
        setTyping(true);
        const answer = resolveQuery(text);
        window.setTimeout(() => {
            setMessages(m => [...m, { role: 'assistant', text: answer }]);
            setTyping(false);
        }, 380);
    }, []);

    return (
        <div className="aa-assistant">
            {open && (
                <div className="aa-assist-panel" role="dialog" aria-label="Map assistant">
                    <div className="aa-assist-head">
                        <span className="aa-assist-avatar"><SparkleIcon /></span>
                        <div className="aa-assist-titles">
                            <span className="aa-assist-title">Map assistant</span>
                            <span className="aa-assist-sub"><span className="aa-assist-status" />Online · here to help</span>
                        </div>
                        <button className="aa-assist-x" onClick={() => setOpen(false)} aria-label="Close assistant">✕</button>
                    </div>
                    <div className="aa-assist-body" ref={scrollRef}>
                        {messages.map((m, i) => (
                            <div key={i} className={`aa-msg ${m.role}`}>{m.text}</div>
                        ))}
                        {typing && (
                            <div className="aa-msg assistant aa-typing">
                                <span /><span /><span />
                            </div>
                        )}
                        {messages.length <= 1 && (
                            <div className="aa-suggests">
                                {ASSISTANT_SUGGESTIONS.map(s => (
                                    <button key={s} className="aa-suggest" onClick={() => send(s)}>{s}</button>
                                ))}
                            </div>
                        )}
                    </div>
                    <form className="aa-assist-input" onSubmit={e => { e.preventDefault(); send(input); }}>
                        <input
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Ask about the map…"
                            aria-label="Ask about the map"
                        />
                        <button type="submit" aria-label="Send" disabled={!input.trim()}>➤</button>
                    </form>
                </div>
            )}
            <button
                className={`aa-assist-fab ${open ? 'open' : ''}`}
                onClick={() => setOpen(o => !o)}
                aria-label={open ? 'Close map assistant' : 'Open map assistant'}
                title="Confused? Ask the map assistant"
            >
                {open ? '✕' : <SparkleIcon />}
            </button>
        </div>
    );
};

// School photo with graceful fallback to an initials tile
const SchoolImage: React.FC<{ school: SchoolDetail }> = ({ school }) => {
    const [err, setErr] = useState(false);
    if (err || !school.image_url) {
        return <div className="aa-image-fallback">{initials(school.name)}</div>;
    }
    return <img className="aa-image-photo" src={school.image_url} alt={school.name} onError={() => setErr(true)} />;
};

// ── County overview (schools lens, default) ──
const SummaryPanel: React.FC<{ summary: Summary | null }> = ({ summary }) => {
    if (!summary) return <div className="aa-muted">Loading county overview…</div>;
    const lvl = summary.by_access_level;
    return (
        <>
            <div className="aa-panel-kicker">Miami-Dade County</div>
            <h2 className="aa-panel-title">Where the arts reach students — and where they don't</h2>

            <div className="aa-goal">
                <div className="aa-goal-num">{summary.gaps}</div>
                <div className="aa-goal-text">
                    <b>schools</b> have limited or no arts programming. Closing that gap is the goal —
                    tap <b>Highlight access gaps</b> to see exactly where to invest next.
                </div>
            </div>

            <div className="aa-stat-grid">
                <Stat value={summary.schools} label="Schools mapped" />
                <Stat value={summary.organizations} label="Arts partners" />
                <Stat value={summary.students.toLocaleString()} label="Students reached" />
                <Stat value={summary.programs} label="Active programs" />
            </div>

            <div className="aa-section-label">Access at a glance</div>
            {(['high', 'medium', 'low', 'none'] as AccessLevel[]).map(k => (
                <div className="aa-dist-row" key={k}>
                    <span className="aa-dot sm" style={{ background: ACCESS[k].color }} />
                    <span className="aa-dist-label">{ACCESS[k].label}</span>
                    <span className="aa-dist-count">{lvl[k] ?? 0}</span>
                </div>
            ))}

            <div className="aa-hint">Tap any school to see its arts partners and impact.</div>
        </>
    );
};

// ── Partners overview (partners lens, default) ──
const PartnersOverview: React.FC<{ summary: Summary | null }> = ({ summary }) => (
    <>
        <div className="aa-panel-kicker">Partners lens</div>
        <h2 className="aa-panel-title">Who's serving Miami-Dade</h2>
        <div className="aa-goal">
            <div className="aa-goal-num" style={{ color: 'var(--aa-teal-deep)' }}>{summary?.organizations ?? '—'}</div>
            <div className="aa-goal-text">
                <b>arts partners</b> deliver every program on this map. Each pin sits at the
                heart of the schools it serves — <b>tap one</b> to trace its reach across the county.
            </div>
        </div>
        <div className="aa-section-label">How to read it</div>
        <div className="aa-dist-row"><span className="aa-dot sm" style={{ background: '#0a9488' }} /><span className="aa-dist-label">Lines connect an org to every school it reaches</span></div>
        <div className="aa-dist-row"><span className="aa-dot sm" style={{ background: disciplineColor('Music') }} /><span className="aa-dist-label">Pin color = the org's main discipline</span></div>
        <div className="aa-dist-row"><span className="aa-dot sm" style={{ background: '#94a3b8' }} /><span className="aa-dist-label">Pin size = how many schools it reaches</span></div>
        <div className="aa-hint">Empty areas = neighborhoods no partner reaches yet.</div>
    </>
);

// ── Single school detail (schools lens, on click) ──
const SchoolPanel: React.FC<{ school: SchoolDetail; loading: boolean; onBack: () => void; onOpenPartner: (org: string) => void }> = ({ school, loading, onBack, onOpenPartner }) => {
    const a = ACCESS[school.access_level] ?? ACCESS.none;
    const programs = school.programs ?? [];
    return (
        <>
            <button className="aa-back" onClick={onBack}>← County overview</button>
            <div className="aa-panel-kicker">{school.region}</div>
            <h2 className="aa-panel-title">{school.name}</h2>
            <div className="aa-badge-row">
                <span className="aa-badge" style={{ background: a.color }}>{a.label}</span>
                <span className="aa-badge ghost">{school.students.toLocaleString()} students</span>
            </div>

            {loading ? (
                <div className="aa-muted">Loading…</div>
            ) : programs.length === 0 ? (
                <div className="aa-empty">
                    <div className="aa-empty-icon">○</div>
                    <div>No arts organization is currently active at this school.</div>
                    <div className="aa-empty-sub">This is an access gap — a target for new programming.</div>
                </div>
            ) : (
                <>
                    <div className="aa-section-label">Arts partners · {programs.length}</div>
                    <div className="aa-subnote">Tap a partner to trace its reach across the county.</div>
                    {programs.map(p => (
                        <div
                            className="aa-program aa-program--link"
                            key={p.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => onOpenPartner(p.organization)}
                            onKeyDown={(e) => { if (e.key === 'Enter') onOpenPartner(p.organization); }}
                        >
                            <div className="aa-avatar" style={{ background: disciplineColor(p.discipline) }}>
                                {initials(p.organization)}
                            </div>
                            <div className="aa-program-body">
                                <div className="aa-program-head">
                                    <span className="aa-program-org">{p.organization}</span>
                                    <span className="aa-program-disc" style={{ background: disciplineColor(p.discipline) }}>
                                        {p.discipline}
                                    </span>
                                </div>
                                <div className="aa-program-meta">
                                    <span><b>{p.students}</b> students</span>
                                    <span><b>{p.participation}%</b> take part</span>
                                </div>
                                <div className="aa-impact">
                                    <div className="aa-impact-bar">
                                        <div className="aa-impact-fill" style={{ width: `${p.impact}%` }} />
                                    </div>
                                    <span className="aa-impact-val">{p.impact} impact</span>
                                </div>
                                <div className="aa-program-cta">See countywide reach ↗</div>
                            </div>
                        </div>
                    ))}
                </>
            )}
        </>
    );
};

// ── Single partner detail (partners lens, on click) ──
const PartnerPanel: React.FC<{ partner: PartnerDetail; onBack: () => void }> = ({ partner, onBack }) => {
    const color = disciplineColor(partner.primary_discipline);
    return (
        <>
            <button className="aa-back" onClick={onBack}>← All partners</button>
            <div className="aa-panel-kicker">{reachLabel(partner.reach_level)} · {partner.disciplines.join(', ')}</div>
            <h2 className="aa-panel-title">{partner.organization}</h2>
            <div className="aa-badge-row">
                <span className="aa-badge" style={{ background: color }}>{partner.school_count} schools</span>
                <span className="aa-badge ghost">{partner.students.toLocaleString()} students reached</span>
            </div>

            <div className="aa-section-label">Schools served</div>
            {partner.schools.map(s => (
                <div className="aa-program" key={s.id}>
                    <div className="aa-avatar" style={{ background: disciplineColor(s.discipline) }}>
                        {initials(s.name)}
                    </div>
                    <div className="aa-program-body">
                        <div className="aa-program-head">
                            <span className="aa-program-org">{s.name}</span>
                            <span className="aa-program-disc" style={{ background: disciplineColor(s.discipline) }}>
                                {s.discipline}
                            </span>
                        </div>
                        <div className="aa-program-meta">
                            <span>{s.region}</span>
                            <span><b>{s.students}</b> students</span>
                        </div>
                        <div className="aa-impact">
                            <div className="aa-impact-bar">
                                <div className="aa-impact-fill" style={{ width: `${s.impact}%` }} />
                            </div>
                            <span className="aa-impact-val">{s.impact} impact</span>
                        </div>
                    </div>
                </div>
            ))}
        </>
    );
};

const Stat: React.FC<{ value: React.ReactNode; label: string }> = ({ value, label }) => (
    <div className="aa-stat">
        <div className="aa-stat-value">{value}</div>
        <div className="aa-stat-label">{label}</div>
    </div>
);

export default ArtsAccessMap;
