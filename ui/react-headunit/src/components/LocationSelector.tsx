import React from 'react';
import { MapPin, Navigation } from 'lucide-react';

interface Location {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

interface LocationSelectorProps {
    label: string;
    value: string;
    locations: Location[];
    onChange: (id: string) => void;
    icon: 'start' | 'end';
}

export const LocationSelector: React.FC<LocationSelectorProps> = ({
    label,
    value,
    locations,
    onChange,
    icon
}) => {
    return (
        <div className="location-selector">
            <label className="location-label">
                {icon === 'start' ? (
                    <Navigation size={16} className="icon-start" />
                ) : (
                    <MapPin size={16} className="icon-end" />
                )}
                {label}
            </label>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="location-dropdown"
            >
                <option value="">Select location...</option>
                {locations.map((loc) => (
                    <option key={loc.id} value={loc.id}>
                        {loc.name}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default LocationSelector;
