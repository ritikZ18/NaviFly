#!/bin/bash

# NaviFly - Fleet Navigation Platform Startup Script
# Robust version with Docker context auto-fix for WSL

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

BACKGROUND_MODE=false
CLEAN_MODE=false
FOLLOW_LOGS=false
NO_CACHE_MODE=false
SYNC_ACTION=""
DO_COMMIT=false
API_URL="http://localhost:8080"

# Usage information
show_usage() {
    echo "Usage: ./start.sh [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  --bg, --background    Start in background mode (shorthand for -d)"
    echo "  --clean               Remove volumes and orphans before starting"
    echo "  --no-cache            Rebuild all containers without Docker layer cache"
    echo "  --logs                Automatically follow logs after startup"
    echo "  --stop                Stop all services"
    echo "  --help                Show this help message"
    echo ""
    echo "Airtable sync (service must be running; needs .env creds):"
    echo "  --airtable-schema     List your Airtable tables + fields"
    echo "  --sync-airtable       Validate Airtable data into staging (dry run, safe)"
    echo "  --sync-airtable --commit   Validate, then promote clean rows to the live DB"
    echo "  --sync-commit         Promote the last validated batch"
}

# Render the Airtable schema as terminal tables (strips the CSV BOM from id fields)
print_airtable_schema_table() {
    python3 -c '
import json
import sys

try:
    payload = json.load(sys.stdin)
except json.JSONDecodeError as error:
    print(f"❌ Invalid JSON response: {error}", file=sys.stderr)
    sys.exit(1)

tables = payload.get("tables", [])

if not tables:
    print("No Airtable tables found.")
    sys.exit(0)

total_fields = sum(len(table.get("fields", [])) for table in tables)

print()
print(f"📚 Airtable Schema: {len(tables)} tables, {total_fields} fields")
print()

for table_number, table in enumerate(tables, start=1):
    table_name = str(table.get("name", "Unnamed table")).lstrip("﻿")
    fields = table.get("fields", [])

    headers = ("#", "Field", "Type")
    rows = []

    for field_number, field in enumerate(fields, start=1):
        field_name = str(field.get("name", "")).lstrip("﻿")
        field_type = str(field.get("type", "unknown"))
        rows.append((str(field_number), field_name, field_type))

    widths = [
        max([len(headers[column])] + [len(row[column]) for row in rows])
        for column in range(len(headers))
    ]

    def border(left, separator, right):
        return left + separator.join(
            "─" * (width + 2) for width in widths
        ) + right

    def render_row(row):
        cells = [
            str(value).ljust(widths[index])
            for index, value in enumerate(row)
        ]
        return "│ " + " │ ".join(cells) + " │"

    print(f"{table_number}. {table_name} ({len(fields)} fields)")
    print(border("┌", "┬", "┐"))
    print(render_row(headers))
    print(border("├", "┼", "┤"))

    for row in rows:
        print(render_row(row))

    print(border("└", "┴", "┘"))
    print()
'
}

# Compact summary + table for a sync validate/commit response (no raw JSON)
print_sync_report() {
    python3 -c '
import json, sys

try:
    d = json.load(sys.stdin)
except Exception:
    print("  (no response — is the routing service running?)")
    sys.exit(0)

def border(widths, left, mid, right):
    return left + mid.join("─" * (w + 2) for w in widths) + right

def render(cells, widths):
    return "│ " + " │ ".join(str(cells[i]).ljust(widths[i]) for i in range(len(cells))) + " │"

def table(headers, rows):
    allrows = [headers] + rows
    widths = [max(len(str(r[c])) for r in allrows) for c in range(len(headers))]
    lines = [border(widths, "┌", "┬", "┐"), render(headers, widths), border(widths, "├", "┼", "┤")]
    for r in rows:
        lines.append(render(r, widths))
    lines.append(border(widths, "└", "┴", "┘"))
    return "\n".join(lines)

batch = str(d.get("batch_id", "?"))
print()

if "promoted" in d:
    promoted = int(d.get("promoted", 0) or 0)
    failed = int(d.get("failed", 0) or 0)
    print("  Commit " + batch + "   ->   promoted " + str(promoted) + ", failed " + str(failed))
    rows = []
    for i, f in enumerate(d.get("failures", []) or [], 1):
        rows.append((str(i), str(f.get("school_id") or "?"), str(len(f.get("issues", []) or [])) + " issue(s)"))
    if rows:
        print()
        print(table(("#", "Not migrated", "Reason count"), rows))
else:
    total = int(d.get("total", 0) or 0)
    acc = int(d.get("accepted", 0) or 0)
    cle = int(d.get("cleaned", 0) or 0)
    flg = int(d.get("flagged", 0) or 0)
    print("  Batch " + batch + "   ->   " + str(total) + " scanned   |   accepted " + str(acc) + ", cleaned " + str(cle) + ", flagged " + str(flg) + "   |   " + str(acc + cle) + "/" + str(total) + " ready")
    rows = []
    for i, r in enumerate(d.get("records", []) or [], 1):
        rows.append((str(i), str(r.get("name") or r.get("school_id") or "?"), str(r.get("status", "")).upper(), str(len(r.get("issues", []) or []))))
    if rows:
        print()
        print(table(("#", "School", "Status", "Changes"), rows))

print()
'
}

for arg in "$@"; do
    case $arg in
        --bg|--background)
            BACKGROUND_MODE=true
            ;;
        --no-cache|--no-cache-build)
            NO_CACHE_MODE=true
            ;;
        --clean)
            CLEAN_MODE=true
            ;;
        --logs)
            FOLLOW_LOGS=true
            ;;
        --airtable-schema)
            echo -e "${YELLOW}📋 Fetching your Airtable schema...${NC}"

            curl -sf "$API_URL/health" >/dev/null 2>&1 || {
                echo -e "${RED}❌ Service not running.${NC}"
                echo "Start it first: ./start.sh"
                exit 1
            }

            SCHEMA_JSON=$(curl -fsS "$API_URL/sync/airtable/schema") || {
                echo -e "${RED}❌ Failed to fetch Airtable schema.${NC}"
                exit 1
            }

            if command -v python3 >/dev/null 2>&1; then
                printf '%s\n' "$SCHEMA_JSON" | print_airtable_schema_table
            else
                echo -e "${YELLOW}⚠️ Python 3 not found; displaying raw JSON.${NC}"
                printf '%s\n' "$SCHEMA_JSON"
            fi

            exit 0
            ;;
        --sync-airtable)
            echo -e "${YELLOW}🔎 Validating Airtable data into staging (dry run — the live DB is NOT touched)...${NC}"
            curl -sf "$API_URL/health" >/dev/null 2>&1 || { echo -e "${RED}❌ Service not running. Start it first: ./start.sh${NC}"; exit 1; }
            curl -s -X POST "$API_URL/sync/validate?source=airtable" | print_sync_report
            echo -e "${GREEN}✅ Validated into staging — review the report above (accepted / cleaned / flagged).${NC}"
            echo -e "   To promote the clean rows to the live map, run: ${GREEN}./start.sh --sync-commit${NC}"
            exit 0
            ;;
        --sync-commit)
            echo -e "${YELLOW}⬆️  Promoting the last validated batch to the live database...${NC}"
            curl -sf "$API_URL/health" >/dev/null 2>&1 || { echo -e "${RED}❌ Service not running. Start it first: ./start.sh${NC}"; exit 1; }
            curl -s -X POST "$API_URL/sync/commit" | print_sync_report
            echo -e "${GREEN}✅ Committed. Flagged rows were skipped (their reasons are shown above).${NC}"
            exit 0
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
if [ "$NO_CACHE_MODE" = true ]; then
    echo -e "${YELLOW}♻️  --no-cache: rebuilding all images from scratch...${NC}"
    # --no-cache goes to 'build', not 'up'
    docker compose build --no-cache
    echo -e "${GREEN}✅ Images rebuilt (no cache)${NC}"
fi

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
