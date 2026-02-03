import React, { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

interface RouteNode {
    id: string;
    name: string;
    lat: number;
    lon: number;
}

interface RouteContextType {
    startId: string;
    endId: string;
    routeNodes: RouteNode[];
    isNavigating: boolean;
    setStartId: (id: string) => void;
    setEndId: (id: string) => void;
    setRouteNodes: (nodes: RouteNode[]) => void;
    setIsNavigating: (nav: boolean) => void;
}

const RouteContext = createContext<RouteContextType | undefined>(undefined);

export const RouteProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [startId, setStartId] = useState<string>('');
    const [endId, setEndId] = useState<string>('');
    const [routeNodes, setRouteNodes] = useState<RouteNode[]>([]);
    const [isNavigating, setIsNavigating] = useState(false);

    return (
        <RouteContext.Provider value={{
            startId,
            endId,
            routeNodes,
            isNavigating,
            setStartId,
            setEndId,
            setRouteNodes,
            setIsNavigating
        }}>
            {children}
        </RouteContext.Provider>
    );
};

export const useRoute = () => {
    const context = useContext(RouteContext);
    if (!context) {
        throw new Error('useRoute must be used within a RouteProvider');
    }
    return context;
};
