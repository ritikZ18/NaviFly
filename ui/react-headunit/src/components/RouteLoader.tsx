import { useEffect, useRef } from 'react';
import './RouteLoader.css';

interface RouteLoaderProps {
    message?: string;
}

const RouteLoader: React.FC<RouteLoaderProps> = ({ message = 'Finding best route...' }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        const dpr = window.devicePixelRatio || 1;
        const size = 200;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        ctx.scale(dpr, dpr);

        let animationId: number;
        let time = 0;

        // Road path points
        const roadPath = [
            { x: 30, y: 150 },
            { x: 50, y: 120 },
            { x: 80, y: 100 },
            { x: 120, y: 80 },
            { x: 150, y: 60 },
            { x: 170, y: 50 }
        ];

        const animate = () => {
            time += 0.02;
            ctx.clearRect(0, 0, size, size);

            // Draw road/path (dashed line effect)
            ctx.beginPath();
            ctx.setLineDash([8, 6]);
            ctx.lineDashOffset = -time * 30;
            ctx.strokeStyle = 'rgba(0, 123, 255, 0.3)';
            ctx.lineWidth = 4;
            ctx.moveTo(roadPath[0].x, roadPath[0].y);
            for (let i = 1; i < roadPath.length; i++) {
                ctx.lineTo(roadPath[i].x, roadPath[i].y);
            }
            ctx.stroke();

            // Draw solid path on top
            ctx.beginPath();
            ctx.setLineDash([]);
            const gradient = ctx.createLinearGradient(30, 150, 170, 50);
            gradient.addColorStop(0, '#007bff');
            gradient.addColorStop(0.5, '#00c6ff');
            gradient.addColorStop(1, '#0072ff');
            ctx.strokeStyle = gradient;
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';

            // Animate path drawing
            const progress = (Math.sin(time * 1.5) + 1) / 2;
            const pathLength = roadPath.length - 1;
            const currentPoint = progress * pathLength;

            ctx.moveTo(roadPath[0].x, roadPath[0].y);
            for (let i = 1; i <= Math.floor(currentPoint); i++) {
                ctx.lineTo(roadPath[i].x, roadPath[i].y);
            }

            // Interpolate to current position
            const frac = currentPoint - Math.floor(currentPoint);
            const fromPoint = roadPath[Math.floor(currentPoint)];
            const toPoint = roadPath[Math.min(Math.ceil(currentPoint), roadPath.length - 1)];
            const curX = fromPoint.x + (toPoint.x - fromPoint.x) * frac;
            const curY = fromPoint.y + (toPoint.y - fromPoint.y) * frac;
            ctx.lineTo(curX, curY);
            ctx.stroke();

            // Draw vehicle dot
            ctx.beginPath();
            ctx.arc(curX, curY, 8, 0, Math.PI * 2);
            ctx.fillStyle = '#00ff88';
            ctx.shadowColor = '#00ff88';
            ctx.shadowBlur = 15;
            ctx.fill();
            ctx.shadowBlur = 0;

            // Draw pulsing ring around vehicle
            const pulseSize = 12 + Math.sin(time * 4) * 4;
            ctx.beginPath();
            ctx.arc(curX, curY, pulseSize, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(0, 255, 136, ${0.5 - Math.sin(time * 4) * 0.3})`;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw destination marker
            ctx.beginPath();
            ctx.arc(170, 50, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#ff4444';
            ctx.fill();

            // Draw start marker
            ctx.beginPath();
            ctx.arc(30, 150, 6, 0, Math.PI * 2);
            ctx.fillStyle = '#44ff44';
            ctx.fill();

            // Draw scanning lines effect
            for (let i = 0; i < 3; i++) {
                const offset = (time * 50 + i * 80) % size;
                ctx.beginPath();
                ctx.strokeStyle = `rgba(0, 200, 255, ${0.1 - i * 0.03})`;
                ctx.lineWidth = 1;
                ctx.moveTo(0, offset);
                ctx.lineTo(size, offset);
                ctx.stroke();
            }

            animationId = requestAnimationFrame(animate);
        };

        animate();

        return () => {
            cancelAnimationFrame(animationId);
        };
    }, []);

    return (
        <div className="route-loader-overlay">
            <div className="route-loader-container">
                <canvas ref={canvasRef} className="route-loader-canvas" />
                <div className="route-loader-text">
                    <span className="route-loader-message">{message}</span>
                    <div className="route-loader-dots">
                        <span>.</span><span>.</span><span>.</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RouteLoader;
