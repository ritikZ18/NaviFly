/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Vehicle, SimulationState } from '../simulation/Vehicle';
import { defaultSimulationState, SimulationEngine, VehicleFactory } from '../simulation';
import { useTelemetry } from './TelemetryContext';

export interface RouteNode {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

interface AlternativeRoute {
    label?: string;
    geometry: [number, number][];
    distance: number;  // km
    duration: number;  // minutes
}

export type RoadGeometry =
    | [number, number][]
    | { type: 'Feature', geometry: { type: 'LineString', coordinates: [number, number][] }, properties: Record<string, unknown> }
    | { type: 'FeatureCollection', features: Record<string, unknown>[] };

interface RouteState {
    startId: string;
    endId: string;
    startLocation: RouteNode | null;
    endLocation: RouteNode | null;
    waypoints: RouteNode[]; // max 5 intermediate stops
    routeNodes: RouteNode[];
    roadGeometry: RoadGeometry | null;
    optimalGeometry: RoadGeometry | null;
    alternativeRoutes: AlternativeRoute[];
    selectedRouteIndex: number;
    isNavigating: boolean;
    vehicle: Vehicle;
    simulation: SimulationState;
    isTracking: boolean;
    visualMode: 'normal' | 'nvg' | 'thermal' | 'mono' | 'amber';
    isScope: boolean;
    isGrid: boolean;
    camSettings: {
        brightness: number;
        contrast: number;
        grain: number;
        vignette: number;
        zoom: number;
    };
    isGlobeView: boolean;
    isTrafficVisible: boolean;
    trackedEntityId: string | null;
}

interface RouteContextType extends RouteState {
    setStartId: (id: string) => void;
    setEndId: (id: string) => void;
    setStartLocation: (loc: RouteNode | null) => void;
    setEndLocation: (loc: RouteNode | null) => void;
    addWaypoint: (loc: RouteNode) => void;
    removeWaypoint: (index: number) => void;
    reorderWaypoints: (from: number, to: number) => void;
    clearWaypoints: () => void;
    setRouteNodes: (nodes: RouteNode[]) => void;
    setRoadGeometry: (geometry: RoadGeometry | null) => void;
    setOptimalGeometry: (geometry: RoadGeometry | null) => void;
    setAlternativeRoutes: (routes: AlternativeRoute[]) => void;
    selectRoute: (index: number) => void;
    setIsNavigating: (nav: boolean) => void;
    setVehicle: (vehicle: Vehicle) => void;
    startSimulation: () => void;
    pauseSimulation: () => void;
    resumeSimulation: () => void;
    stopSimulation: () => void;
    setSpeedMultiplier: (speed: number) => void;
    clearNavigation: () => void;
    isStartingNavigation: boolean;
    setIsStartingNavigation: (isStarting: boolean) => void;
    setIsTracking: (isTracking: boolean) => void;
    setVisualMode: (mode: 'normal' | 'nvg' | 'thermal' | 'mono' | 'amber') => void;
    setIsScope: (isScope: boolean) => void;
    setIsGrid: (isGrid: boolean) => void;
    setCamSettings: (settings: Partial<RouteState['camSettings']>) => void;
    setIsGlobeView: (isGlobe: boolean) => void;
    setIsTrafficVisible: (isVisible: boolean) => void;
    setTrackedEntityId: (id: string | null) => void;
}

const STORAGE_KEY = 'navifly-route-state';

const defaultVehicle = VehicleFactory.create('car');

const defaultState: RouteState = {
    startId: '',
    endId: '',
    startLocation: null,
    endLocation: null,
    waypoints: [],
    routeNodes: [],
    roadGeometry: null,
    optimalGeometry: null,
    alternativeRoutes: [],
    selectedRouteIndex: 0,
    isNavigating: false,
    vehicle: defaultVehicle,
    simulation: defaultSimulationState,
    isTracking: false,
    visualMode: 'normal',
    isScope: false,
    isGrid: false,
    camSettings: {
        brightness: 1.0,
        contrast: 1.0,
        grain: 0.1,
        vignette: 0.3,
        zoom: 12.0
    },
    isGlobeView: false,
    isTrafficVisible: false,
    trackedEntityId: null
};

const RouteContext = createContext<RouteContextType | undefined>(undefined);

const saveState = (state: RouteState) => {
    try {
        const toSave = {
            startId: state.startId,
            endId: state.endId,
            vehicle: state.vehicle,
            isNavigating: state.isNavigating,
            roadGeometry: state.roadGeometry,
            optimalGeometry: state.optimalGeometry,
            alternativeRoutes: state.alternativeRoutes,
            selectedRouteIndex: state.selectedRouteIndex,
            simulation: state.simulation.isRunning ? state.simulation : defaultSimulationState
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.error('Failed to save route state:', e);
    }
};

const loadState = (): RouteState => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                ...defaultState,
                ...parsed,
                // Ensure defaultSimulationState structure if missing
                simulation: parsed.simulation || defaultSimulationState
            };
        }
    } catch (e) {
        console.error('Failed to load route state:', e);
    }
    return defaultState;
};

export const RouteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [state, setState] = useState<RouteState>(loadState);
    const [isStartingNavigation, setIsStartingNavigation] = useState(false);
    const simulationRef = useRef<SimulationEngine | null>(null);
    const { startSession, endSession, recordSpeedSample, recordBreak } = useTelemetry();

    useEffect(() => {
        saveState(state);
    }, [state]);

    // Update simulation route when geometry changes (e.g. from interpolated to OSRM)
    useEffect(() => {
        if (simulationRef.current && state.roadGeometry) {
            let coords: [number, number][] = [];
            const geom = state.roadGeometry;
            if (Array.isArray(geom)) {
                coords = geom;
            } else if (geom.type === 'FeatureCollection') {
                coords = (geom.features as { geometry: { coordinates: [number, number][] } }[]).flatMap(f => f.geometry.coordinates);
            } else if (geom.type === 'Feature') {
                coords = (geom as { geometry: { coordinates: [number, number][] } }).geometry.coordinates;
            }

            if (coords.length > 0) {
                simulationRef.current.updateRoute(coords);
            }
        }
    }, [state.roadGeometry]);

    const startSimulation = (initialState?: Partial<SimulationState>) => {
        let route: [number, number][] = [];
        const geom = state.roadGeometry;

        if (Array.isArray(geom)) {
            route = geom;
        } else if (geom && geom.type === 'FeatureCollection') {
            route = (geom.features as { geometry: { coordinates: [number, number][] } }[]).flatMap(f => f.geometry.coordinates);
        } else if (geom && geom.type === 'Feature') {
            route = (geom as { geometry: { coordinates: [number, number][] } }).geometry.coordinates;
        }

        if (!route || !Array.isArray(route) || route.length < 2) {
            console.error('Invalid route for simulation:', route);
            return;
        }

        // Start a telemetry session
        const startName = state.startLocation?.name ?? 'Start';
        const endName = state.endLocation?.name ?? 'End';
        const wps = state.waypoints.map(w => w.name);
        startSession({
            routeLabel: `${startName} → ${endName}`,
            vehicle: state.vehicle.type ?? 'car',
            waypoints: wps,
            distanceKm: 0, // will be calculated when session ends
        });

        simulationRef.current?.start({
            route,
            vehicle: state.vehicle,
            speedMultiplier: initialState?.speedMultiplier || 50,
            onUpdate: (simState) => {
                setState(prev => ({ ...prev, simulation: simState }));
                // Sample speed every ~5s (engine calls onUpdate ~10x/s, sample 1 in 50)
                if (Math.random() < 0.02) {
                    const speedKmh = Math.round((simState.currentSpeed ?? 0) * 3.6);
                    recordSpeedSample(speedKmh);
                }
            },
            onComplete: () => {
                setState(prev => ({
                    ...prev,
                    simulation: { ...prev.simulation, isRunning: false }
                }));
                endSession();
            },
            onBreak: (duration) => {
                console.log(`Vehicle taking a ${duration} minute break`);
                recordBreak(duration);
            }
        }, initialState);
    };

    // Initialize simulation engine and auto-resume if needed
    useEffect(() => {
        simulationRef.current = new SimulationEngine();

        // Auto-resume if it was running
        if (state.simulation.isRunning && state.roadGeometry) {
            console.log('Auto-resuming simulation from saved state');
            startSimulation(state.simulation);
        }

        return () => {
            simulationRef.current?.stop();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run once on mount

    const setStartId = (id: string) => setState(prev => ({ ...prev, startId: id }));
    const setEndId = (id: string) => setState(prev => ({ ...prev, endId: id }));
    const setStartLocation = (loc: RouteNode | null) => setState(prev => ({ ...prev, startLocation: loc, startId: loc?.id || '' }));
    const setEndLocation = (loc: RouteNode | null) => setState(prev => ({ ...prev, endLocation: loc, endId: loc?.id || '' }));

    const addWaypoint = (loc: RouteNode) => {
        setState(prev => {
            if (prev.waypoints.length >= 5) return prev;
            return { ...prev, waypoints: [...prev.waypoints, loc] };
        });
    };
    const removeWaypoint = (index: number) => {
        setState(prev => ({
            ...prev,
            waypoints: prev.waypoints.filter((_, i) => i !== index)
        }));
    };
    const reorderWaypoints = (from: number, to: number) => {
        setState(prev => {
            const wps = [...prev.waypoints];
            const [moved] = wps.splice(from, 1);
            wps.splice(to, 0, moved);
            return { ...prev, waypoints: wps };
        });
    };
    const clearWaypoints = () => setState(prev => ({ ...prev, waypoints: [] }));
    const setRouteNodes = (nodes: RouteNode[]) => setState(prev => ({ ...prev, routeNodes: nodes }));
    const setRoadGeometry = (geometry: RoadGeometry | null) =>
        setState(prev => ({ ...prev, roadGeometry: geometry }));
    const setOptimalGeometry = (geometry: RoadGeometry | null) =>
        setState(prev => ({ ...prev, optimalGeometry: geometry, roadGeometry: prev.selectedRouteIndex === 0 ? geometry : prev.roadGeometry }));
    const setAlternativeRoutes = (routes: AlternativeRoute[]) =>
        setState(prev => ({ ...prev, alternativeRoutes: routes }));

    const selectRoute = (index: number) => {
        setState(prev => {
            if (index === 0) {
                return {
                    ...prev,
                    selectedRouteIndex: 0,
                    roadGeometry: prev.optimalGeometry
                };
            }
            const alt = prev.alternativeRoutes[index - 1];
            if (alt) {
                return {
                    ...prev,
                    selectedRouteIndex: index,
                    roadGeometry: alt.geometry
                };
            }
            return prev;
        });
    };

    const setIsNavigating = (nav: boolean) => setState(prev => ({ ...prev, isNavigating: nav }));

    const setVehicle = (vehicle: Vehicle) => setState(prev => ({ ...prev, vehicle }));


    const pauseSimulation = () => simulationRef.current?.pause();
    const resumeSimulation = () => simulationRef.current?.resume();
    const stopSimulation = () => {
        simulationRef.current?.stop();
        setState(prev => ({ ...prev, simulation: defaultSimulationState }));
    };

    const setSpeedMultiplier = (speed: number) => {
        simulationRef.current?.setSpeedMultiplier(speed);
    };

    const clearNavigation = () => {
        simulationRef.current?.stop();
        setState(prev => ({
            ...prev,
            routeNodes: [],
            roadGeometry: null,
            alternativeRoutes: [],
            selectedRouteIndex: 0,
            isNavigating: false,
            simulation: defaultSimulationState,
            isTracking: false,
            visualMode: 'normal'
        }));
    };

    const setIsTracking = (isTracking: boolean) => setState(prev => ({ ...prev, isTracking }));
    const setVisualMode = (mode: RouteState['visualMode']) => {
        setState(prev => ({ ...prev, visualMode: mode }));
    };

    const setIsScope = (isScope: boolean) => setState(prev => ({ ...prev, isScope }));
    const setIsGrid = (isGrid: boolean) => setState(prev => ({ ...prev, isGrid }));

    const setCamSettings = (settings: Partial<RouteState['camSettings']>) => {
        setState(prev => ({
            ...prev,
            camSettings: { ...prev.camSettings, ...settings }
        }));
    };

    return (
        <RouteContext.Provider value={{
            ...state,
            setStartId,
            setEndId,
            setStartLocation,
            setEndLocation,
            addWaypoint,
            removeWaypoint,
            reorderWaypoints,
            clearWaypoints,
            setRouteNodes,
            setRoadGeometry,
            setOptimalGeometry,
            setAlternativeRoutes,
            selectRoute,
            setIsNavigating,
            setVehicle,
            startSimulation,
            pauseSimulation,
            resumeSimulation,
            stopSimulation,
            setSpeedMultiplier,
            clearNavigation,
            isStartingNavigation,
            setIsStartingNavigation,
            setIsTracking,
            setVisualMode,
            setIsScope,
            setIsGrid,
            setCamSettings,
            setIsGlobeView: (isGlobe: boolean) => setState(prev => ({ ...prev, isGlobeView: isGlobe })),
            setIsTrafficVisible: (isVisible: boolean) => setState(prev => ({ ...prev, isTrafficVisible: isVisible })),
            setTrackedEntityId: (id: string | null) => setState(prev => ({ ...prev, trackedEntityId: id }))
        }}>
            {children}
        </RouteContext.Provider>
    );
};

export const useRoute = () => {
    const context = useContext(RouteContext);
    if (!context) {
        throw new Error('useRoute must be used within a RouteProvider');
    }
    return context;
};
