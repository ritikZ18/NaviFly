import type { Vehicle } from '../Vehicle';

export const Truck: Vehicle = {
    type: 'truck',
    name: 'Semi Truck',
    maxSpeed: 90,
    avgSpeed: 70,
    acceleration: 8,
    breakProbability: 0.15,  // 15% per 10km segment (rest stops)
    breakDuration: 15,       // 15 min break
    icon: '🚛',
    color: '#f59e0b'         // Orange
};
