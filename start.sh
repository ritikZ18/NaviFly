#!/bin/bash

# NaviFly - Fleet Navigation Platform
# Usage: ./start.sh [--bg]  (use --bg for background/nohup mode)

BACKGROUND_MODE=false

for arg in "$@"; do
    case $arg in
        --bg|--background)
            BACKGROUND_MODE=true
            shift
            ;;
        --stop)
            echo "🛑 Stopping NaviFly..."
            docker compose down 2>/dev/null || docker-compose down 2>/dev/null
            fuser -k 8080/tcp 8081/tcp 8082/tcp 5173/tcp 6379/tcp 2>/dev/null || true
            [ -f navifly.pid ] && rm navifly.pid
            echo "✅ NaviFly stopped"
            exit 0
            ;;
    esac
done

echo "🐳 Starting NaviFly Fleet Navigation Platform..."
echo ""

# Check if docker-compose is installed
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose not found. Please install it."
    exit 1
fi

# Kill any existing local processes to free ports
echo "🧹 Cleaning up ports..."
fuser -k 8080/tcp 8081/tcp 8082/tcp 5173/tcp 6379/tcp 2>/dev/null || true

# Build and Start
if [ "$BACKGROUND_MODE" = true ]; then
    echo "🚀 Starting in BACKGROUND mode (nohup)..."
    if docker compose version &> /dev/null; then
        nohup docker compose up --build > navifly.log 2>&1 &
    else
        nohup docker-compose up --build > navifly.log 2>&1 &
    fi
    echo $! > navifly.pid
    sleep 3
    echo ""
    echo "✅ NaviFly started in background!"
    echo "-----------------------------------"
    echo "📋 PID: $(cat navifly.pid)"
    echo "📝 View logs: tail -f navifly.log"
else
    echo "🚀 Building and Starting Containers..."
    if docker compose version &> /dev/null; then
        docker compose up --build -d
    else
        docker-compose up --build -d
    fi
    echo ""
    echo "✅ Deployment Complete!"
fi

echo "-----------------------------------"
echo "🌐 UI:        http://localhost:5173"
echo "🛣️  Routing:   http://localhost:8080"
echo "🛰️  Telemetry: http://localhost:8081"
echo "🗺️  MapMatch:  http://localhost:8082"
echo "-----------------------------------"
echo "📝 View logs: docker compose logs -f"
echo "🛑 To stop:   ./start.sh --stop"
