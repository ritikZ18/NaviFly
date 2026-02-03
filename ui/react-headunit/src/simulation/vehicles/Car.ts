import type { Vehicle } from '../Vehicle';

export const Car: Vehicle = {
    type: 'car',
    name: 'Sedan',
    maxSpeed: 120,
    avgSpeed: 95,
    acceleration: 15,
    breakProbability: 0.05,  // 5% per 10km segment
    breakDuration: 5,        // 5 min break
    icon: '🚗',
    color: '#3b82f6'         // Blue
};
