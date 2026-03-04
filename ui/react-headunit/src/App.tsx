import { useState, useEffect, useCallback } from 'react'
import MapView from './components/MapView'
import NavigationPanel from './components/NavigationPanel'
import Preloader from './components/Preloader'
import TelemetryPanel from './components/TelemetryPanel'
import Toast, { useToastManager } from './components/Toast'
import AircraftControlHUD from './components/AircraftControlHUD'
import VehicleControlHUD from './components/VehicleControlHUD'
import TacticalInfoPanes from './components/TacticalInfoPanes'
import { RouteProvider, useRoute } from './context/RouteContext'
import { TelemetryProvider } from './context/TelemetryContext'
import { Maximize, Target, Grid3X3, Settings, Video } from 'lucide-react'
import WebcamSearch from './components/WebcamSearch'
import './index.css'

function HeadUnit() {
  const [currentTime, setCurrentTime] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isOpsMenuOpen, setIsOpsMenuOpen] = useState(false)
  const [isMapReady, setIsMapReady] = useState(false)
  const { toasts, dismiss } = useToastManager();

  const {
    isTracking,
    visualMode,
    isScope,
    isGrid,
    camSettings,
    setIsTracking,
    setVisualMode,
    setIsScope,
    setIsGrid,
    setCamSettings,
    isTrafficVisible,
    isWebcamEnabled, setIsWebcamEnabled
  } = useRoute();

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatTime = (date: Date) => {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
    const parts = timeStr.split(':');
    if (parts.length < 2) return timeStr;
    return (
      <>
        {parts[0]}<span className="time-colon-blink">:</span>{parts[1]}
      </>
    );
  }

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen)
  const toggleScope = () => setIsScope(!isScope)
  const toggleGrid = () => setIsGrid(!isGrid)

  const isCamOn = visualMode !== 'normal';

  const handleMapLoaded = useCallback(() => {
    setIsMapReady(true);
  }, []);

  return (
    <div className={`head-unit-container ${isFullscreen ? 'fullscreen' : ''}`}>
      <Preloader isReady={isMapReady} />
      <NavigationPanel />
      <div
        className={`map-wrapper ${isScope ? 'ops-scope' : ''} ${isGrid ? 'ops-grid' : ''} vis-${visualMode} ${isCamOn ? 'cam-on' : ''}`}
        style={{
          position: 'relative',
          '--cam-brightness': camSettings.brightness,
          '--cam-contrast': camSettings.contrast,
          '--cam-grain': camSettings.grain,
          '--cam-vignette': camSettings.vignette
        } as React.CSSProperties}
      >
        <MapView onLoaded={handleMapLoaded} />

        {/* Map HUD Controls */}
        <div className="map-hud">
          <div className="hud-cluster">
            <button className={`hud-btn ${isFullscreen ? 'active' : ''}`} title="Fullscreen" onClick={toggleFullscreen}><Maximize size={18} /></button>
            <button className={`hud-btn ${isScope ? 'active' : ''}`} title="Scope Mode" onClick={toggleScope}><Target size={18} /></button>
            <button className={`hud-btn ${isGrid ? 'active' : ''}`} title="Grid" onClick={toggleGrid}><Grid3X3 size={18} /></button>
            <button className={`hud-btn ${isOpsMenuOpen ? 'active' : ''}`} title="Ops Options" onClick={() => setIsOpsMenuOpen(!isOpsMenuOpen)}><Settings size={18} /></button>

            <div className={`hud-pop ${isOpsMenuOpen ? 'open' : ''}`}>
              <div className="hud-header">OPERATIONS CENTER</div>

              <div className="hud-row">
                <span>Track Vehicle</span>
                <input type="checkbox" checked={isTracking} onChange={(e) => setIsTracking(e.target.checked)} />
              </div>

              <div className="hud-row">
                <span>Visual Mode</span>
                <select value={visualMode} onChange={(e) => setVisualMode(e.target.value as 'normal' | 'nvg' | 'thermal' | 'mono' | 'amber')}>
                  <option value="normal">Normal</option>
                  <option value="nvg">NVG Green</option>
                  <option value="thermal">Thermal IR</option>
                  <option value="mono">Mono B/W</option>
                  <option value="amber">Amber High-Contrast</option>
                </select>
              </div>

              <div className="hud-row">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Video size={14} />
                  <span>Webcam Discovery</span>
                </div>
                <input type="checkbox" checked={isWebcamEnabled} onChange={(e) => setIsWebcamEnabled(e.target.checked)} />
              </div>

              <WebcamSearch />

              {isCamOn && (
                <div className="hud-settings-group">
                  <div className="hud-row-slider">
                    <div className="slider-label">
                      <span>Brightness</span>
                      <span>{camSettings.brightness.toFixed(1)}x</span>
                    </div>
                    <input type="range" min="0.5" max="2.0" step="0.1" value={camSettings.brightness}
                      onChange={(e) => setCamSettings({ brightness: parseFloat(e.target.value) })} />
                  </div>
                  <div className="hud-row-slider">
                    <div className="slider-label">
                      <span>Contrast</span>
                      <span>{camSettings.contrast.toFixed(1)}x</span>
                    </div>
                    <input type="range" min="0.5" max="2.5" step="0.1" value={camSettings.contrast}
                      onChange={(e) => setCamSettings({ contrast: parseFloat(e.target.value) })} />
                  </div>
                  <div className="hud-row-slider">
                    <div className="slider-label">
                      <span>Grain</span>
                      <span>{(camSettings.grain * 100).toFixed(0)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={camSettings.grain}
                      onChange={(e) => setCamSettings({ grain: parseFloat(e.target.value) })} />
                  </div>
                  <div className="hud-row-slider">
                    <div className="slider-label">
                      <span>Vignette</span>
                      <span>{(camSettings.vignette * 100).toFixed(0)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={camSettings.vignette}
                      onChange={(e) => setCamSettings({ vignette: parseFloat(e.target.value) })} />
                  </div>
                  <div className="hud-row-slider">
                    <div className="slider-label">
                      <span>Tracking Zoom</span>
                      <span>{camSettings.zoom.toFixed(1)}x</span>
                    </div>
                    <input type="range" min="8" max="18" step="0.5" value={camSettings.zoom}
                      onChange={(e) => setCamSettings({ zoom: parseFloat(e.target.value) })} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tactical Info Panes — below HUD cluster */}
          <TacticalInfoPanes />
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
          <div className="status-segment-top">ARIZONA COMMAND</div>
          <div className="time">{formatTime(currentTime)}</div>
          <div className="status-divider" />
          <div className="gps">GPS: FIXED</div>
          {isTrafficVisible && (
            <div className="gps traffic-live">
              <span className="live-blip" />
              LIVE TRAFFIC
            </div>
          )}
        </div>

        {/* Advanced Tactical Filters */}
        <svg style={{ position: 'absolute', width: 0, height: 0 }}>
          <filter id="thermal-filter">
            <feColorMatrix type="matrix" values="
            0.5 0.5 0.5 0 0
            1 0 0 0 0
            0 0 1 0 0
            0 0 0 1 0" />
            <feComponentTransfer>
              <feFuncR type="table" tableValues="0 0.1 0.4 1 1" />
              <feFuncG type="table" tableValues="0 0 0.2 0.8 1" />
              <feFuncB type="table" tableValues="0.4 0.6 0.2 0 0.2" />
            </feComponentTransfer>
          </filter>
        </svg>

        {/* Telemetry slide-in panel */}
        <TelemetryPanel />

        {/* Floating Aircraft Tracking HUD */}
        <AircraftControlHUD />

        {/* Floating Vehicle Traffic HUD */}
        <VehicleControlHUD />

        {/* Toast notifications */}
        <Toast toasts={toasts} onDismiss={dismiss} />
      </div>
    </div>
  );
}

function App() {
  return (
    <TelemetryProvider>
      <RouteProvider>
        <HeadUnit />
      </RouteProvider>
    </TelemetryProvider>
  );
}

export default App;
