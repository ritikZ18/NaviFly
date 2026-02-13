#!/bin/bash

# NaviFly - Fleet Navigation Platform Startup Script
# Robust version with Docker context auto-fix for WSL

set -e

# Colors for output
GREEN='\033[0-32m'
YELLOW='\033[1-33m'
RED='\033[0-31m'
NC='\033[0m' # No Color

BACKGROUND_MODE=false
CLEAN_MODE=false
FOLLOW_LOGS=false

# Usage information
show_usage() {
    echo "Usage: ./start.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --bg, --background    Start in background mode (shorthand for -d)"
    echo "  --clean               Remove volumes and orphans before starting"
    echo "  --logs                Automatically follow logs after startup"
    echo "  --stop                Stop all NaviFly services"
    echo "  --help                Show this help message"
}

for arg in "$@"; do
    case $arg in
        --bg|--background)
            BACKGROUND_MODE=true
            ;;
        --clean)
            CLEAN_MODE=true
            ;;
        --logs)
            FOLLOW_LOGS=true
            ;;
        --stop)
            echo -e "${YELLOW}🛑 Stopping NaviFly...${NC}"
            docker compose down 2>/dev/null || docker-compose down 2>/dev/null
            if command -v fuser &> /dev/null; then
                fuser -k 8080/tcp 8081/tcp 8082/tcp 5173/tcp 6379/tcp 2>/dev/null || true
            fi
            [ -f navifly.pid ] && rm navifly.pid
            echo -e "${GREEN}✅ NaviFly stopped${NC}"
            exit 0
            ;;
        --help)
            show_usage
            exit 0
            ;;
    esac
done

echo -e "${GREEN}🐳 Starting NaviFly Fleet Navigation Platform...${NC}"
echo ""

# 1. Dependency Checks
echo -e "${YELLOW}🔍 Checking Dependencies...${NC}"
MISSING_DEPS=()
if ! command -v docker &> /dev/null; then MISSING_DEPS+=("docker"); fi
if ! docker compose version &> /dev/null && ! command -v docker-compose &> /dev/null; then MISSING_DEPS+=("docker-compose"); fi

if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo -e "${RED}❌ Missing dependencies: ${MISSING_DEPS[*]}${NC}"
    echo "Please install them and try again."
    exit 1
fi

# 2. Docker Health & Context Check (WSL Fix)
echo -e "${YELLOW}🩺 Checking Docker Health...${NC}"
if ! docker info &> /dev/null; then
    echo -e "${YELLOW}⚠️ Docker is not responding. Checking contexts...${NC}"
    CURRENT_CONTEXT=$(docker context show)
    if [ "$CURRENT_CONTEXT" == "desktop-linux" ]; then
        echo -e "${YELLOW}🔄 Detected 'desktop-linux' context failure in WSL. Attempting to switch to 'default'...${NC}"
        if docker context use default &> /dev/null; then
            echo -e "${GREEN}✅ Switched to 'default' context.${NC}"
        else
            echo -e "${RED}❌ Failed to switch Docker context.${NC}"
            echo "Try running: docker context use default"
            exit 1
        fi
    else
        echo -e "${RED}❌ Docker is not running or accessible.${NC}"
        echo "Please ensure Docker Desktop is running and WSL integration is enabled."
        exit 1
    fi
fi

# 3. Check for Credentials Store Issue (WSL specific)
if [ -f ~/.docker/config.json ]; then
    if grep -q "desktop.exe" ~/.docker/config.json; then
        echo -e "${YELLOW}⚠️ Found 'desktop.exe' in Docker credentials store. This often fails in WSL.${NC}"
        echo -e "${YELLOW}💡 Suggestion: Remove 'credsStore' from ~/.docker/config.json if builds fail.${NC}"
        # Only auto-fix if it's a known blocker and we are in WSL
        if grep -q "microsoft" /proc/version 2>/dev/null; then
            echo -e "${YELLOW}🔄 Attempting to temporarily bypass broken credentials store...${NC}"
            sed -i.bak '/"credsStore": "desktop.exe"/d' ~/.docker/config.json
            echo -e "${GREEN}✅ Removed 'desktop.exe' from config (backup created at ~/.docker/config.json.bak).${NC}"
        fi
    fi
fi

# 4. Port Cleanup
echo -e "${YELLOW}🧹 Cleaning up ports...${NC}"
if command -v fuser &> /dev/null; then
    fuser -k 8080/tcp 8081/tcp 8082/tcp 5173/tcp 6379/tcp 2>/dev/null || true
else
    # Fallback for systems without fuser
    lsof -ti :8080,8081,8082,5173,6379 | xargs kill -9 2>/dev/null || true
fi

# 4. Clean if requested
if [ "$CLEAN_MODE" = true ]; then
    echo -e "${YELLOW}🧹 Performing deep clean...${NC}"
    docker compose down -v --remove-orphans
fi

# 5. Build and Start
if [ "$BACKGROUND_MODE" = true ]; then
    echo -e "${YELLOW}🚀 Starting in BACKGROUND mode...${NC}"
    docker compose up --build -d > /dev/null
    echo $! > navifly.pid
    echo -e "${GREEN}✅ NaviFly started in background!${NC}"
else
    echo -e "${YELLOW}🚀 Building and Starting Containers...${NC}"
    docker compose up --build -d
    echo -e "${GREEN}✅ Deployment Complete!${NC}"
fi

echo "-----------------------------------"
echo -e "🌐 UI:        ${GREEN}http://localhost:5173${NC}"
echo -e "🛣️  Routing:   ${GREEN}http://localhost:8080${NC}"
echo -e "🛰️  Telemetry: ${GREEN}http://localhost:8081${NC}"
echo -e "-----------------------------------"

if [ "$FOLLOW_LOGS" = true ]; then
    echo -e "${YELLOW}📋 Following logs... (Ctrl+C to stop following, services will keep running)${NC}"
    docker compose logs -f
else
    echo "📝 View logs: docker compose logs -f"
    echo "🛑 To stop:   ./start.sh --stop"
fi
