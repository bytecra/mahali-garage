import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './i18n/index'
import './styles/globals.css'
import { initMockData, resetDemoData } from './lib/mockData'
import { installDemoElectronAPI } from './lib/demoElectronAPI'

// Initialize mock data (load from localStorage or defaults)
initMockData()

// Replace window.electronAPI with demo implementation before any component runs
installDemoElectronAPI()

function DemoBanner() {
  return (
    <div className="bg-amber-500 text-black text-center py-2 px-4 text-sm font-medium flex items-center justify-center gap-4 flex-wrap">
      <span>DEMO MODE — Data is stored in your browser.</span>
      <button
        type="button"
        onClick={() => {
          if (window.confirm('Reset all demo data to defaults?')) {
            resetDemoData()
          }
        }}
        className="underline hover:no-underline font-semibold"
      >
        Reset Demo
      </button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoBanner />
    <App />
  </React.StrictMode>
)
