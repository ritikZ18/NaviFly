import React from 'react'
import Map from './components/Map'
import NavigationPanel from './components/NavigationPanel'
import { RouteProvider } from './context/RouteContext'
import './index.css'

function App() {
  return (
    <RouteProvider>
      <div className="head-unit-container">
        <NavigationPanel />
        <div className="map-wrapper" style={{ position: 'relative' }}>
          <Map />
          <div style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: 'rgba(0,0,0,0.5)',
            padding: '10px 20px',
            borderRadius: '50px',
            backdropFilter: 'blur(5px)',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: '0.8rem'
          }}>
            GPS: FIXED • Arizona
          </div>
        </div>
      </div>
    </RouteProvider>
  )
}

export default App
