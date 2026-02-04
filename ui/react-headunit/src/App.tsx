import { useState, useEffect } from 'react'
import Map from './components/Map'
import NavigationPanel from './components/NavigationPanel'
import { RouteProvider } from './context/RouteContext'
import './index.css'

function App() {
  const [currentTime, setCurrentTime] = useState(new Date())

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
            fontSize: '0.8rem',
            textAlign: 'center'
          }}>
            <div>GPS: FIXED • Arizona</div>
            <div style={{ fontSize: '0.75rem', opacity: 0.8, marginTop: '4px' }}>
              {formatTime(currentTime)}
            </div>
          </div>
        </div>
      </div>
    </RouteProvider>
  )
}

export default App
