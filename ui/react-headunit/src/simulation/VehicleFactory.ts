// Vehicle Factory - GoF Factory Pattern

import type { Vehicle, VehicleType } from './Vehicle';
import { Car } from './vehicles/Car';
import { Truck } from './vehicles/Truck';
import { Motorcycle } from './vehicles/Motorcycle';

/**
 * VehicleFactory implements the Factory design pattern
 * to create vehicle instances based on type.
 */
export class VehicleFactory {
    private static vehicles: Record<VehicleType, Vehicle> = {
        car: Car,
        truck: Truck,
        motorcycle: Motorcycle
    };

    /**
     * Create a vehicle instance by type
     */
    static create(type: VehicleType): Vehicle {
        const vehicle = this.vehicles[type];
        if (!vehicle) {
            throw new Error(`Unknown vehicle type: ${type}`);
        }
        return { ...vehicle }; // Return a copy
    }

    /**
     * Get all available vehicle types
     */
    static getAvailableTypes(): VehicleType[] {
        return Object.keys(this.vehicles) as VehicleType[];
    }

    /**
     * Get all vehicles for UI display
     */
    static getAllVehicles(): Vehicle[] {
        return Object.values(this.vehicles);
    }

    /**
     * Calculate ETA for a given distance and vehicle
     */
    static calculateETA(distanceKm: number, vehicle: Vehicle): number {
        // Base time at average speed
        const baseTime = (distanceKm / vehicle.avgSpeed) * 60; // minutes

        // Estimate breaks (one per 100km on average)
        const segments = Math.floor(distanceKm / 100);
        const expectedBreaks = segments * vehicle.breakProbability;
        const breakTime = expectedBreaks * vehicle.breakDuration;

        return Math.round(baseTime + breakTime);
    }
}

export default VehicleFactory;
