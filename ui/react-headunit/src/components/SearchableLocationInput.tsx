import React, { useState, useRef, useEffect } from 'react';
import { MapPin, Navigation, X, Search } from 'lucide-react';

export interface Location {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

interface SearchableLocationInputProps {
    label: string;
    value: Location | null;
    locations: Location[];
    onChange: (loc: Location | null) => void;
    icon: 'start' | 'end' | 'stop';
    placeholder?: string;
}

const SearchableLocationInput: React.FC<SearchableLocationInputProps> = ({
    label,
    value,
    locations,
    onChange,
    icon,
    placeholder = 'Search location...'
}) => {
    const [query, setQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const filtered = query.length === 0
        ? locations
        : locations.filter(loc =>
            loc.name.toLowerCase().includes(query.toLowerCase())
        );

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (loc: Location) => {
        onChange(loc);
        setQuery(loc.name);
        setIsOpen(false);
    };

    const handleClear = () => {
        onChange(null);
        setQuery('');
        setIsOpen(false);
        inputRef.current?.focus();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
        setIsOpen(true);
        setHighlightIndex(0);
    };

    const handleFocus = () => {
        setIsOpen(true);
        if (value) {
            setQuery(''); // Clear to show all options on focus
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
                setIsOpen(true);
                e.preventDefault();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setHighlightIndex(prev => Math.min(prev + 1, filtered.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setHighlightIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (filtered[highlightIndex]) {
                    handleSelect(filtered[highlightIndex]);
                }
                break;
            case 'Escape':
                setIsOpen(false);
                if (value) setQuery(value.name);
                break;
        }
    };

    const iconElement = icon === 'start'
        ? <Navigation size={14} className="search-icon icon-start" />
        : icon === 'stop'
            ? <MapPin size={14} className="search-icon icon-stop" />
            : <MapPin size={14} className="search-icon icon-end" />;

    const highlightMatch = (text: string) => {
        if (!query) return text;
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        if (idx === -1) return text;
        return (
            <>
                {text.slice(0, idx)}
                <mark className="search-highlight">{text.slice(idx, idx + query.length)}</mark>
                {text.slice(idx + query.length)}
            </>
        );
    };

    return (
        <div className="searchable-input-wrapper" ref={wrapperRef}>
            <label className="location-label">
                {iconElement}
                {label}
            </label>
            <div className="search-input-container">
                <Search size={14} className="search-field-icon" />
                <input
                    ref={inputRef}
                    type="text"
                    className="search-input"
                    value={isOpen ? query : (value?.name || query)}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    autoComplete="off"
                />
                {(value || query) && (
                    <button className="search-clear-btn" onClick={handleClear} title="Clear">
                        <X size={14} />
                    </button>
                )}
            </div>

            {isOpen && (
                <div className="search-dropdown">
                    {filtered.length === 0 ? (
                        <div className="search-no-results">No locations found</div>
                    ) : (
                        <ul className="search-results-list">
                            {filtered.map((loc, i) => (
                                <li
                                    key={loc.id}
                                    className={`search-result-item ${i === highlightIndex ? 'highlighted' : ''} ${value?.id === loc.id ? 'selected' : ''}`}
                                    onClick={() => handleSelect(loc)}
                                    onMouseEnter={() => setHighlightIndex(i)}
                                >
                                    <MapPin size={12} className="result-pin" />
                                    <span className="result-name">{highlightMatch(loc.name)}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default SearchableLocationInput;
