import React, { useEffect, useRef } from 'react';

export interface ToastMessage {
    id: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'danger';
    icon?: string;
    durationMs?: number;
}

interface ToastProps {
    toasts: ToastMessage[];
    onDismiss: (id: string) => void;
}

const ICONS: Record<ToastMessage['type'], string> = {
    info: 'ℹ️',
    warning: '⚠️',
    success: '✅',
    danger: '🚨',
};

const Toast: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
    return (
        <div className="toast-container">
            {toasts.map(t => (
                <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
};

const ToastItem: React.FC<{ toast: ToastMessage; onDismiss: (id: string) => void }> = ({ toast, onDismiss }) => {
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        const dur = toast.durationMs ?? 5000;
        timerRef.current = setTimeout(() => onDismiss(toast.id), dur);
        return () => { if (timerRef.current) clearTimeout(timerRef.current); };
    }, [toast.id, toast.durationMs, onDismiss]);

    return (
        <div className={`toast toast-${toast.type}`} onClick={() => onDismiss(toast.id)}>
            <span className="toast-icon">{toast.icon ?? ICONS[toast.type]}</span>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={e => { e.stopPropagation(); onDismiss(toast.id); }}>✕</button>
        </div>
    );
};

// Hook to use toasts anywhere
import { useState, useCallback } from 'react';

let _globalPush: ((t: Omit<ToastMessage, 'id'>) => void) | null = null;

export function useToastManager() {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const push = useCallback((t: Omit<ToastMessage, 'id'>) => {
        const msg: ToastMessage = { ...t, id: `${Date.now()}-${Math.random().toString(36).slice(2, 5)}` };
        setToasts(prev => [...prev.slice(-4), msg]); // max 5 toasts
    }, []);

    const dismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Register global push so Map.tsx can call it
    useEffect(() => { _globalPush = push; return () => { _globalPush = null; }; }, [push]);

    return { toasts, push, dismiss };
}

/** Call from anywhere (e.g. Map.tsx effects) to fire a toast */
export function pushToast(t: Omit<ToastMessage, 'id'>) {
    _globalPush?.(t);
}

export default Toast;
