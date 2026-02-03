/* eslint-disable react-refresh/only-export-components */
import React from 'react';
import { X, Moon, Sun, Car, Truck, Bike, Gauge, Ruler } from 'lucide-react';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: Settings;
    onSettingsChange: (settings: Settings) => void;
}

export interface Settings {
    darkMode: boolean;
    vehicleType: 'car' | 'truck' | 'motorcycle';
    showTraffic: boolean;
    units: 'km' | 'miles';
    mapZoom: number;
}

export const defaultSettings: Settings = {
    darkMode: true,
    vehicleType: 'car',
    showTraffic: true,
    units: 'km',
    mapZoom: 10
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
    isOpen,
    onClose,
    settings,
    onSettingsChange
}) => {
    if (!isOpen) return null;

    const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        onSettingsChange({ ...settings, [key]: value });
    };

    return (
        <div className="settings-overlay" onClick={onClose}>
            <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <h2>Settings</h2>
                    <button className="close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="settings-content">
                    {/* Dark Mode Toggle */}
                    <div className="setting-row">
                        <div className="setting-label">
                            {settings.darkMode ? <Moon size={18} /> : <Sun size={18} />}
                            <span>Dark Mode</span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={settings.darkMode}
                                onChange={(e) => updateSetting('darkMode', e.target.checked)}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>

                    {/* Vehicle Type */}
                    <div className="setting-row">
                        <div className="setting-label">
                            <Car size={18} />
                            <span>Vehicle Type</span>
                        </div>
                        <div className="vehicle-options">
                            <button
                                className={`vehicle-btn ${settings.vehicleType === 'car' ? 'active' : ''}`}
                                onClick={() => updateSetting('vehicleType', 'car')}
                            >
                                <Car size={16} />
                            </button>
                            <button
                                className={`vehicle-btn ${settings.vehicleType === 'truck' ? 'active' : ''}`}
                                onClick={() => updateSetting('vehicleType', 'truck')}
                            >
                                <Truck size={16} />
                            </button>
                            <button
                                className={`vehicle-btn ${settings.vehicleType === 'motorcycle' ? 'active' : ''}`}
                                onClick={() => updateSetting('vehicleType', 'motorcycle')}
                            >
                                <Bike size={16} />
                            </button>
                        </div>
                    </div>

                    {/* Traffic Overlay */}
                    <div className="setting-row">
                        <div className="setting-label">
                            <Gauge size={18} />
                            <span>Show Traffic</span>
                        </div>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={settings.showTraffic}
                                onChange={(e) => updateSetting('showTraffic', e.target.checked)}
                            />
                            <span className="toggle-slider"></span>
                        </label>
                    </div>

                    {/* Units */}
                    <div className="setting-row">
                        <div className="setting-label">
                            <Ruler size={18} />
                            <span>Units</span>
                        </div>
                        <div className="unit-options">
                            <button
                                className={`unit-btn ${settings.units === 'km' ? 'active' : ''}`}
                                onClick={() => updateSetting('units', 'km')}
                            >
                                km
                            </button>
                            <button
                                className={`unit-btn ${settings.units === 'miles' ? 'active' : ''}`}
                                onClick={() => updateSetting('units', 'miles')}
                            >
                                mi
                            </button>
                        </div>
                    </div>

                    {/* Map Zoom */}
                    <div className="setting-row">
                        <div className="setting-label">
                            <span>Map Zoom: {settings.mapZoom}</span>
                        </div>
                        <input
                            type="range"
                            min="5"
                            max="18"
                            value={settings.mapZoom}
                            onChange={(e) => updateSetting('mapZoom', parseInt(e.target.value))}
                            className="zoom-slider"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
