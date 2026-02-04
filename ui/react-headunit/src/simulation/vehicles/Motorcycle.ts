import type { Vehicle } from '../Vehicle';

export const Motorcycle: Vehicle = {
    type: 'motorcycle',
    name: 'Sport Bike',
    maxSpeed: 140,
    avgSpeed: 110,
    acceleration: 25,
    breakProbability: 0.03,  // 3% per 10km segment
    breakDuration: 3,        // 3 min break
    icon: '🏍️',
    color: '#22c55e'         // Green
};
