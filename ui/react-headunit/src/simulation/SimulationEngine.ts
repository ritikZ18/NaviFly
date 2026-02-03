// Simulation Engine - Animates vehicle along route

import type { Vehicle, SimulationState } from './Vehicle';
import { defaultSimulationState } from './Vehicle';

export type SimulationCallback = (state: SimulationState) => void;

interface SimulationConfig {
    route: [number, number][];  // OSRM coordinates [lng, lat]
    vehicle: Vehicle;
    speedMultiplier?: number;   // 1x, 2x, 4x
    onUpdate: SimulationCallback;
    onComplete: () => void;
    onBreak: (duration: number) => void;
}

/**
 * SimulationEngine animates a vehicle along a route
 * with realistic speed, random breaks, and ETA updates.
 */
export class SimulationEngine {
    private config: SimulationConfig | null = null;
    private state: SimulationState = { ...defaultSimulationState };
    private animationFrame: number | null = null;
    private lastTimestamp: number = 0;
    private totalDistance: number = 0;
    private coveredDistance: number = 0;
    private isOnBreak: boolean = false;
    private breakTimeout: ReturnType<typeof setTimeout> | null = null;

    /**
     * Calculate distance between two coordinates (Haversine)
     */
    private haversineDistance(
        [lng1, lat1]: [number, number],
        [lng2, lat2]: [number, number]
    ): number {
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    /**
     * Calculate total route distance
     */
    private calculateTotalDistance(route: [number, number][]): number {
        let total = 0;
        for (let i = 1; i < route.length; i++) {
            total += this.haversineDistance(route[i - 1], route[i]);
        }
        return total;
    }

    /**
     * Interpolate position between two points
     */
    private interpolate(
        start: [number, number],
        end: [number, number],
        t: number
    ): [number, number] {
        return [
            start[0] + (end[0] - start[0]) * t,
            start[1] + (end[1] - start[1]) * t
        ];
    }

    /**
     * Start simulation
     */
    start(config: SimulationConfig): void {
        this.config = config;
        this.coveredDistance = 0;
        this.totalDistance = this.calculateTotalDistance(config.route);
        this.lastTimestamp = performance.now();
        this.isOnBreak = false;

        this.state = {
            isRunning: true,
            isPaused: false,
            currentPosition: config.route[0],
            progress: 0,
            currentSpeed: 0,
            eta: (this.totalDistance / config.vehicle.avgSpeed) * 60,
            distanceRemaining: this.totalDistance,
            elapsedTime: 0,
            breaks: 0,
            breakPoints: []
        };

        this.config.onUpdate(this.state);
        this.animate();
    }

    /**
     * Main animation loop
     */
    private animate = (): void => {
        if (!this.config || !this.state.isRunning || this.state.isPaused || this.isOnBreak) {
            return;
        }

        const now = performance.now();
        const deltaMs = now - this.lastTimestamp;
        this.lastTimestamp = now;

        const speedMultiplier = this.config.speedMultiplier || 1;
        const { route, vehicle } = this.config;

        // Calculate distance to move (km per frame)
        // Speed in km/h, delta in ms, so: (speed * delta) / (1000 * 3600) = km
        const speedKmPerMs = (vehicle.avgSpeed * speedMultiplier) / 3600000;
        const distanceThisFrame = speedKmPerMs * deltaMs;

        this.coveredDistance += distanceThisFrame;
        this.state.elapsedTime += (deltaMs / 60000) * speedMultiplier;

        // Find current segment
        let accumulatedDistance = 0;
        for (let i = 1; i < route.length; i++) {
            const segmentDistance = this.haversineDistance(route[i - 1], route[i]);
            if (accumulatedDistance + segmentDistance >= this.coveredDistance) {
                // We're in this segment
                const segmentProgress = (this.coveredDistance - accumulatedDistance) / segmentDistance;
                this.state.currentPosition = this.interpolate(route[i - 1], route[i], Math.min(1, segmentProgress));
                break;
            }
            accumulatedDistance += segmentDistance;
        }

        // Update state
        this.state.progress = Math.min(100, (this.coveredDistance / this.totalDistance) * 100);
        this.state.distanceRemaining = Math.max(0, this.totalDistance - this.coveredDistance);
        this.state.currentSpeed = vehicle.avgSpeed * speedMultiplier;
        this.state.eta = (this.state.distanceRemaining / vehicle.avgSpeed) * 60;

        // Random break check (every ~10km of simulated distance)
        if (Math.random() < vehicle.breakProbability * (distanceThisFrame / 10)) {
            this.triggerBreak();
        }

        this.config.onUpdate(this.state);

        // Check completion
        if (this.coveredDistance >= this.totalDistance) {
            this.complete();
            return;
        }

        this.animationFrame = requestAnimationFrame(this.animate);
    };

    /**
     * Trigger a random break
     */
    private triggerBreak(): void {
        if (!this.config || !this.state.currentPosition) return;

        this.isOnBreak = true;
        this.state.breaks++;
        const breakDuration = this.config.vehicle.breakDuration;
        const breakDurationMs = breakDuration * 60000 / (this.config.speedMultiplier || 1);

        // Record break position
        this.state.breakPoints = [
            ...this.state.breakPoints,
            {
                position: this.state.currentPosition,
                duration: breakDuration,
                timestamp: Date.now()
            }
        ];

        this.config.onBreak(breakDuration);
        this.config.onUpdate(this.state);  // Update with new break point

        this.breakTimeout = setTimeout(() => {
            this.isOnBreak = false;
            this.lastTimestamp = performance.now();
            this.animate();
        }, Math.min(breakDurationMs, 3000)); // Cap at 3s real-time for demo
    }

    /**
     * Pause simulation
     */
    pause(): void {
        this.state.isPaused = true;
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        this.config?.onUpdate(this.state);
    }

    /**
     * Resume simulation
     */
    resume(): void {
        if (!this.state.isPaused) return;
        this.state.isPaused = false;
        this.lastTimestamp = performance.now();
        this.animate();
        this.config?.onUpdate(this.state);
    }

    /**
     * Stop simulation
     */
    stop(): void {
        this.state = { ...defaultSimulationState };
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
        if (this.breakTimeout) {
            clearTimeout(this.breakTimeout);
        }
        this.config?.onUpdate(this.state);
    }

    /**
     * Complete simulation
     */
    private complete(): void {
        this.state.isRunning = false;
        this.state.progress = 100;
        this.state.distanceRemaining = 0;
        this.state.currentSpeed = 0;
        this.state.eta = 0;
        this.config?.onUpdate(this.state);
        this.config?.onComplete();
    }

    /**
     * Set speed multiplier
     */
    setSpeedMultiplier(multiplier: number): void {
        if (this.config) {
            this.config.speedMultiplier = multiplier;
        }
    }

    /**
     * Get current state
     */
    getState(): SimulationState {
        return { ...this.state };
    }
}

export default SimulationEngine;
