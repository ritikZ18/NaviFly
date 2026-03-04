import { render, act } from '@testing-library/react';
import { RouteProvider, useRoute } from './RouteContext';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock SimulationEngine to avoid side effects
vi.mock('../simulation', () => {
    const MockSimulationEngine = vi.fn().mockImplementation(function () {
        return {
            start: vi.fn(),
            stop: vi.fn(),
            pause: vi.fn(),
            resume: vi.fn(),
            updateRoute: vi.fn(),
            setSpeedMultiplier: vi.fn(),
        };
    });
    return {
        SimulationEngine: MockSimulationEngine,
        VehicleFactory: {
            create: vi.fn().mockReturnValue({ type: 'car', name: 'Car', icon: '🚗', avgSpeed: 60 }),
            getAllVehicles: vi.fn().mockReturnValue([]),
        },
        defaultSimulationState: { isRunning: false, progress: 0, currentSpeed: 0, eta: 0, distanceRemaining: 0, breakPoints: [], breaks: 0 }
    };
});

const TestComponent = ({ onContext }: { onContext: (ctx: any) => void }) => {
    const context = useRoute();
    onContext(context);
    return null;
};

describe('RouteContext', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('should initialize with default values', () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );

        expect(context.startId).toBe('');
        expect(context.endId).toBe('');
        expect(context.waypoints).toEqual([]);
        expect(context.isNavigating).toBe(false);
    });

    it('should set start and end locations', async () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );

        const loc1 = { id: 'p1', name: 'Loc 1', lat: 10, lon: 20 };
        const loc2 = { id: 'p2', name: 'Loc 2', lat: 30, lon: 40 };

        await act(async () => {
            context.setStartLocation(loc1);
            context.setEndLocation(loc2);
        });

        expect(context.startId).toBe('p1');
        expect(context.startLocation).toEqual(loc1);
        expect(context.endId).toBe('p2');
        expect(context.endLocation).toEqual(loc2);
    });

    it('should manage waypoints', async () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );

        const wp1 = { id: 'w1', name: 'WP 1', lat: 1, lon: 1 };
        const wp2 = { id: 'w2', name: 'WP 2', lat: 2, lon: 2 };

        await act(async () => {
            context.addWaypoint(wp1);
        });
        expect(context.waypoints).toHaveLength(1);
        expect(context.waypoints[0]).toEqual(wp1);

        await act(async () => {
            context.addWaypoint(wp2);
        });
        expect(context.waypoints).toHaveLength(2);

        await act(async () => {
            context.reorderWaypoints(0, 1);
        });
        expect(context.waypoints[0]).toEqual(wp2);
        expect(context.waypoints[1]).toEqual(wp1);

        await act(async () => {
            context.removeWaypoint(0);
        });
        expect(context.waypoints).toHaveLength(1);
        expect(context.waypoints[0]).toEqual(wp1);

        await act(async () => {
            context.clearWaypoints();
        });
        expect(context.waypoints).toHaveLength(0);
    });

    it('should respect the maximum limit of 5 waypoints', async () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );

        await act(async () => {
            for (let i = 0; i < 6; i++) {
                context.addWaypoint({ id: `wp${i}`, name: `WP ${i}`, lat: i, lon: i });
            }
        });

        expect(context.waypoints).toHaveLength(5);
    });

    it('should save and load state from localStorage', async () => {
        const savedState = {
            startId: 'saved-start',
            endId: 'saved-end',
            vehicle: { type: 'truck' },
            isNavigating: true,
        };
        localStorage.setItem('navifly-route-state', JSON.stringify(savedState));

        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );

        expect(context.startId).toBe('saved-start');
        expect(context.endId).toBe('saved-end');
        expect(context.isNavigating).toBe(true);
    });

    // ── New: Globe View / Traffic / Aircraft Tracking ──

    it('should initialize isGlobeView as false', () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );
        expect(context.isGlobeView).toBe(false);
    });

    it('should toggle isGlobeView', async () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );

        await act(async () => {
            context.setIsGlobeView(true);
        });
        expect(context.isGlobeView).toBe(true);

        await act(async () => {
            context.setIsGlobeView(false);
        });
        expect(context.isGlobeView).toBe(false);
    });

    it('should initialize isTrafficVisible as false', () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );
        expect(context.isTrafficVisible).toBe(false);
    });

    it('should toggle isTrafficVisible', async () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );

        await act(async () => {
            context.setIsTrafficVisible(true);
        });
        expect(context.isTrafficVisible).toBe(true);
    });

    it('should initialize trackedEntityId as null', () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );
        expect(context.trackedEntityId).toBeNull();
    });

    it('should set and clear trackedEntityId', async () => {
        let context: any;
        render(
            <RouteProvider>
                <TestComponent onContext={(ctx) => { context = ctx; }} />
            </RouteProvider>
        );

        await act(async () => {
            context.setTrackedEntityId('a1b2c3');
        });
        expect(context.trackedEntityId).toBe('a1b2c3');

        await act(async () => {
            context.setTrackedEntityId(null);
        });
        expect(context.trackedEntityId).toBeNull();
    });
});
