// Vehicle types and base interface

export type VehicleType = 'car' | 'truck' | 'motorcycle';

export interface Vehicle {
    type: VehicleType;
    name: string;
    maxSpeed: number;        // km/h
    avgSpeed: number;        // km/h (typical cruising)
    acceleration: number;    // km/h per second
    breakProbability: number; // 0-1, chance of random delay per km
    breakDuration: number;   // minutes for each break
    icon: string;            // Emoji or icon class
    color: string;           // Vehicle marker color
}

// Vehicle properties for simulation calculations
export interface SimulationState {
    isRunning: boolean;
    isPaused: boolean;
    currentPosition: [number, number] | null;
    progress: number;        // 0-100%
    currentSpeed: number;    // km/h
    eta: number;             // minutes remaining
    distanceRemaining: number; // km
    elapsedTime: number;     // minutes
    breaks: number;          // count of breaks taken
}

export const defaultSimulationState: SimulationState = {
    isRunning: false,
    isPaused: false,
    currentPosition: null,
    progress: 0,
    currentSpeed: 0,
    eta: 0,
    distanceRemaining: 0,
    elapsedTime: 0,
    breaks: 0
};
