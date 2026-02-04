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
    geometry: [number, number][];
    distance: number;  // km
    duration: number;  // minutes
}

interface RouteState {
    startId: string;
    endId: string;
    routeNodes: RouteNode[];
    roadGeometry: [number, number][] | null;
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
    setRoadGeometry: (geometry: [number, number][] | null) => void;
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
    alternativeRoutes: [],
    selectedRouteIndex: 0,
    isNavigating: false,
    vehicle: defaultVehicle,
    simulation: defaultSimulationState
};

const RouteContext = createContext<RouteContextType | undefined>(undefined);

const loadState = (): RouteState => {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            // Restore navigation state but fetch fresh route geometry
            return {
                ...defaultState,
                startId: parsed.startId || '',
                endId: parsed.endId || '',
                vehicle: parsed.vehicle || defaultVehicle,
                isNavigating: parsed.isNavigating || false,  // Persist navigation state
                // These should be fetched fresh:
                roadGeometry: null,
                alternativeRoutes: [],
                simulation: defaultSimulationState
            };
        }
    } catch (e) {
        console.error('Failed to load route state:', e);
    }
    return defaultState;
};

const saveState = (state: RouteState) => {
    try {
        // Save essential state including navigation status
        const toSave = {
            startId: state.startId,
            endId: state.endId,
            vehicle: state.vehicle,
            isNavigating: state.isNavigating
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
        console.error('Failed to save route state:', e);
    }
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
        if (simulationRef.current && state.roadGeometry && state.roadGeometry.length > 0) {
            // Hot-update the route if simulation is running
            simulationRef.current.updateRoute(state.roadGeometry);
        }
    }, [state.roadGeometry]);

    // Initialize simulation engine
    useEffect(() => {
        simulationRef.current = new SimulationEngine();
        return () => {
            simulationRef.current?.stop();
        };
    }, []);

    const setStartId = (id: string) => setState(prev => ({ ...prev, startId: id }));
    const setEndId = (id: string) => setState(prev => ({ ...prev, endId: id }));
    const setRouteNodes = (nodes: RouteNode[]) => setState(prev => ({ ...prev, routeNodes: nodes }));
    const setRoadGeometry = (geometry: [number, number][] | null) =>
        setState(prev => ({ ...prev, roadGeometry: geometry }));
    const setAlternativeRoutes = (routes: AlternativeRoute[]) =>
        setState(prev => ({ ...prev, alternativeRoutes: routes }));

    const selectRoute = (index: number) => {
        setState(prev => {
            if (index === 0) {
                return { ...prev, selectedRouteIndex: 0 };
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

    const startSimulation = () => {
        const route = state.roadGeometry;
        if (!route || route.length < 2) return;

        simulationRef.current?.start({
            route,
            vehicle: state.vehicle,
            speedMultiplier: 50, // Speed up for demo (50x)
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
        });
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
