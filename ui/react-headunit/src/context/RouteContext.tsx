/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Vehicle, SimulationState } from '../simulation/Vehicle';
import { defaultSimulationState, SimulationEngine, VehicleFactory } from '../simulation';

interface RouteNode {
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
    | { type: 'Feature', geometry: { type: 'LineString', coordinates: [number, number][] }, properties: any }
    | { type: 'FeatureCollection', features: any[] };

interface RouteState {
    startId: string;
    endId: string;
    routeNodes: RouteNode[];
    roadGeometry: RoadGeometry | null;
    optimalGeometry: RoadGeometry | null;
    alternativeRoutes: AlternativeRoute[];
    selectedRouteIndex: number;
    isNavigating: boolean;
    vehicle: Vehicle;
    simulation: SimulationState;
}

interface RouteContextType extends RouteState {
    setStartId: (id: string) => void;
    setEndId: (id: string) => void;
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
}

const STORAGE_KEY = 'navifly-route-state';

const defaultVehicle = VehicleFactory.create('car');

const defaultState: RouteState = {
    startId: '',
    endId: '',
    routeNodes: [],
    roadGeometry: null,
    optimalGeometry: null,
    alternativeRoutes: [],
    selectedRouteIndex: 0,
    isNavigating: false,
    vehicle: defaultVehicle,
    simulation: defaultSimulationState
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
                coords = geom.features.flatMap((f: any) => f.geometry.coordinates);
            } else if (geom.type === 'Feature') {
                coords = geom.geometry.coordinates;
            }

            if (coords.length > 0) {
                simulationRef.current.updateRoute(coords);
            }
        }
    }, [state.roadGeometry]);

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
    }, []); // Run once on mount

    const setStartId = (id: string) => setState(prev => ({ ...prev, startId: id }));
    const setEndId = (id: string) => setState(prev => ({ ...prev, endId: id }));
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

    const startSimulation = (initialState?: Partial<SimulationState>) => {
        let route: [number, number][] = [];
        const geom = state.roadGeometry;

        if (Array.isArray(geom)) {
            route = geom;
        } else if (geom && geom.type === 'FeatureCollection') {
            route = geom.features.flatMap((f: any) => f.geometry.coordinates);
        } else if (geom && geom.type === 'Feature') {
            route = geom.geometry.coordinates;
        }

        if (!route || !Array.isArray(route) || route.length < 2) {
            console.error('Invalid route for simulation:', route);
            return;
        }

        simulationRef.current?.start({
            route,
            vehicle: state.vehicle,
            speedMultiplier: initialState?.speedMultiplier || 50, // Default to 50x
            onUpdate: (simState) => {
                setState(prev => ({ ...prev, simulation: simState }));
            },
            onComplete: () => {
                setState(prev => ({
                    ...prev,
                    simulation: { ...prev.simulation, isRunning: false }
                }));
            },
            onBreak: (duration) => {
                console.log(`Vehicle taking a ${duration} minute break`);
            }
        }, initialState);
    };

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
            simulation: defaultSimulationState
        }));
    };

    return (
        <RouteContext.Provider value={{
            ...state,
            setStartId,
            setEndId,
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
            setIsStartingNavigation
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
