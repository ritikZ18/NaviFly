# Deployment Strategy: NaviFly 🚀

NaviFly is a microservices-based platform. Depending on your needs (Portfolio vs. Production), here are the recommended free deployment strategies.

## ✨ Recommended Strategy: The "All-in-One" VPS
This is the most reliable method for NaviFly because it keeps all Go services and Redis in a single network, exactly like `docker-compose` on your local machine.

### 🏢 Platform: Oracle Cloud (Always Free Tier)
Oracle offers the most generous free tier currently available.
- **Specs**: 4 ARM Ampere A1 Compute instances with 24 GB of RAM.
- **Workflow**:
    1. Create an Ubuntu instance on Oracle Cloud.
    2. Install Docker and Docker Compose.
    3. Clone `NaviFly` and run `./start.sh`.
    4. Open ports `5173` (UI), `8080-8082` (APIs) in the Oracle VCN security list.

---

## ☁️ Option 2: Distributed Hosting (PaaS)
If you prefer not to manage a server, you can split the application across specialized platforms.

| Component | Platform | Why? |
| :--- | :--- | :--- |
| **Frontend (UI)** | [Vercel](https://vercel.com/) | Auto-deploys from GitHub; amazing performance. |
| **Go Services** | [Render](https://render.com/) | Supports Go binaries & Docker; free tier available. |
| **Redis** | [Upstash](https://upstash.com/) | Serverless Redis with a generous free tier. |

### ⚠️ Important: Environment Variables
When splitting services, you MUST update the URLs in the UI and Simulator:
- `VITE_ROUTING_URL`: `https://your-routing-service.onrender.com`
- `VITE_TELEMETRY_URL`: `https://your-telemetry-service.onrender.com`

---

## 🛠️ Step-by-Step Production Setup

### 1. Optimize for Production
Before deploying, ensure you are using the production builds:
```bash
# Frontend
cd ui/react-headunit
npm run build
```

### 2. CI/CD Pipeline
You already have a [CI/CD workflow](.github/workflows/ci.yml) that builds and pushes images to **GitHub Container Registry (GHCR)**.
- **Strategy**: Configure your VPS to pull the latest images from GHCR whenever you push to the `main` branch.

### 3. SSL & Domain
Use [Caddy](https://caddyserver.com/) or [Nginx Proxy Manager](https://nginxproxymanager.com/) to handle SSL (HTTPS) for free using Let's Encrypt.
- This allows you to access your dashboard at `https://navifly.yourdomain.com` instead of an IP address.

---

## 💰 Free Tier Comparison Table

| Service | Free Provider | Monthly Limit |
| :--- | :--- | :--- |
| **Compute/Docker** | **Oracle Cloud** | 4 CPUs / 24GB RAM (Ideal for pre-calculation) |
| **Database (SQL)** | **Supabase / Render** | ~500MB (JSONB is space-efficient) |
| **Go Services** | **Render** | 750 hours (Go/Docker) |
| **Frontend** | **Netlify / Vercel** | Unlimited personal use |
| **Redis** | **Upstash Redis** | 10k requests/day |

### ⚡ Performance Note
The **Pre-calculation Routine** runs at system startup. If deploying to a server with limited CPU, increase the `time.Sleep` in `main.go` to avoid rate-limiting by the OSRM demo server. On Oracle Cloud ARM instances, the default settings work perfectly.
