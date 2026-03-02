import { useState, useEffect } from 'react'
import Map from './components/Map'
import NavigationPanel from './components/NavigationPanel'
import { RouteProvider, useRoute } from './context/RouteContext'
import './index.css'

function HeadUnit() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isScope, setIsScope] = useState(false)
  const [isGrid, setIsGrid] = useState(false)
  const [isOpsMenuOpen, setIsOpsMenuOpen] = useState(false)

  const {
    isTracking,
    visualMode,
    setIsTracking,
    setVisualMode
  } = useRoute();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)
  const toggleScope = () => setIsScope(!isScope)
  const toggleGrid = () => setIsGrid(!isGrid)

  return (
    <div className={`head-unit-container ${isFullscreen ? 'fullscreen' : ''}`}>
      <NavigationPanel />
      <div className={`map-wrapper ${isScope ? 'ops-scope' : ''} ${isGrid ? 'ops-grid' : ''} vis-${visualMode}`} style={{ position: 'relative' }}>
        <Map />

        {/* Map HUD Controls */}
        <div className="map-hud">
          <div className="hud-cluster">
            <button className={`hud-btn ${isFullscreen ? 'active' : ''}`} title="Fullscreen" onClick={toggleFullscreen}>⛶</button>
            <button className={`hud-btn ${isScope ? 'active' : ''}`} title="Scope Mode" onClick={toggleScope}>◎</button>
            <button className={`hud-btn ${isGrid ? 'active' : ''}`} title="Grid" onClick={toggleGrid}>⌗</button>
            <button className={`hud-btn ${isOpsMenuOpen ? 'active' : ''}`} title="Ops Options" onClick={() => setIsOpsMenuOpen(!isOpsMenuOpen)}>⚙</button>

            <div className={`hud-pop ${isOpsMenuOpen ? 'open' : ''}`}>
              <div className="hud-row">
                <span>Track Vehicle</span>
                <input type="checkbox" checked={isTracking} onChange={(e) => setIsTracking(e.target.checked)} />
              </div>
              <div className="hud-row">
                <span>Visual</span>
                <select value={visualMode} onChange={(e) => setVisualMode(e.target.value as 'normal' | 'nvg' | 'thermal' | 'mono' | 'amber')}>
                  <option value="normal">Normal</option>
                  <option value="nvg">NVG Green</option>
                  <option value="thermal">Thermal</option>
                  <option value="mono">Mono</option>
                  <option value="amber">Amber</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Ops / Scope Overlays */}
        <div className="ops-overlay" aria-hidden="true">
          <div className="ops-reticle"></div>
          <div className="ops-rings"></div>
          <div className="ops-scanlines"></div>
          <div className="ops-readouts">
            <span className="ops-chip">OPS</span>
            <span className="ops-chip">{isTracking ? 'TRACK' : 'LIVE'}</span>
          </div>
        </div>

        <div className="system-status">
          <div className="gps">GPS: FIXED • Arizona</div>
          <div className="time">{formatTime(currentTime)}</div>
        </div>
      </div>
    </div>
  )
}

function App() {
  return (
    <RouteProvider>
      <HeadUnit />
    </RouteProvider>
  )
}

export default App
