import { useState, useEffect, useCallback, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'

import { fetchHealth, fetchMetrics, fetchFleet, fetchTelemetry } from './api/client'
import Header from './components/Header'
import FloatingRail from './components/FloatingRail'
import OverviewView from './components/OverviewView'
import DiagnosticsView from './components/DiagnosticsView'
import SimulatorView from './components/SimulatorView'
import FleetManageView from './components/FleetManageView'
import MaintenanceView from './components/MaintenanceView'
import BenchmarksView from './components/BenchmarksView'
import AlertLogsView from './components/AlertLogsView'

// ─── Seed baseline telemetry so the waveform is visible immediately ───────────
function seedHistory() {
  const now = Date.now()
  return Array.from({ length: 14 }, (_, i) => ({
    t:           now - (13 - i) * 1500,
    vibration:   1.9 + Math.sin(i * 0.6) * 0.3 + Math.random() * 0.15,
    temperature: 63  + Math.sin(i * 0.4) * 2   + Math.random() * 0.8,
    rpm:         1748 + Math.round(Math.sin(i * 0.5) * 20 + Math.random() * 10),
    pressure:    5.2 + Math.sin(i * 0.7) * 0.1 + Math.random() * 0.05,
  }))
}

export default function App() {
  // ── Theme ──────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(
    () => localStorage.getItem('sentinel_theme') || 'light'
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('sentinel_theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => setTheme(t => t === 'dark' ? 'light' : 'dark'), [])

  // ── Navigation ─────────────────────────────────────────────────────────────
  const [activeTab,      setActiveTab]      = useState('overview')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // ── Server / data ──────────────────────────────────────────────────────────
  const [serverOnline,    setServerOnline]    = useState(false)
  const [fleet,           setFleet]           = useState([])
  const [metrics,         setMetrics]         = useState(null)
  const [health,          setHealth]          = useState(null)

  // ── Telemetry state ────────────────────────────────────────────────────────
  const [selectedMachine,  setSelectedMachine]  = useState('MCH-001')
  const [currentReading,   setCurrentReading]   = useState(null)
  const [currentInference, setCurrentInference] = useState(null)
  const [telemetryHistory, setTelemetryHistory] = useState(() => seedHistory())
  const [isAutoStreaming,  setIsAutoStreaming]   = useState(false)
  const [isInjectMode,     setIsInjectMode]      = useState(false)
  const [isStepLoading,    setIsStepLoading]     = useState(false)

  // ── Alerts ─────────────────────────────────────────────────────────────────
  const [alerts, setAlerts] = useState([])

  // ── Initial data load ──────────────────────────────────────────────────────
  useEffect(() => {
    async function loadInitialData() {
      try {
        const h = await fetchHealth()
        setHealth(h)
        setServerOnline(!!h && !h.simulated)
      } catch { setServerOnline(false) }

      try { const m = await fetchMetrics(); setMetrics(m) } catch { /* non-fatal */ }
      try { const f = await fetchFleet();   setFleet(f)   } catch { /* non-fatal */ }
    }
    loadInitialData()
  }, [])

  // ── Core telemetry step ────────────────────────────────────────────────────
  const stepTelemetry = useCallback(async (machineId, inject) => {
    setIsStepLoading(true)
    try {
      const result = await fetchTelemetry(machineId, inject)
      setCurrentReading(result)
      setCurrentInference(result)

      const { vibration, temperature, rpm, pressure } = result
      setTelemetryHistory(prev => [
        ...prev.slice(-24),
        { t: Date.now(), vibration, temperature, rpm, pressure },
      ])

      if (result.anomaly_detected === true || result.is_anomaly === true) {
        setAlerts(prev => [
          ...prev,
          {
            id:         Date.now(),
            machine_id: machineId,
            severity:   (result.anomaly_score ?? 0) > 0.7 ? 'CRITICAL' : 'WARNING',
            message:    `Anomaly detected on ${machineId}`,
            ts:         new Date().toLocaleTimeString(),
            score:      result.anomaly_score ?? 0,
          },
        ])
      }
    } catch { /* silently ignore */ }
    finally  { setIsStepLoading(false) }
  }, [])

  // ── Auto-stream interval ───────────────────────────────────────────────────
  useEffect(() => {
    if (!isAutoStreaming) return
    const id = setInterval(() => stepTelemetry(selectedMachine, isInjectMode), 1500)
    return () => clearInterval(id)
  }, [isAutoStreaming, selectedMachine, isInjectMode, stepTelemetry])

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleInspectMachine = useCallback((machineId) => {
    setSelectedMachine(machineId)
    setActiveTab('diagnostics')
  }, [])

  const handleTabChange = useCallback((tab) => {
    setActiveTab(tab)
    setMobileMenuOpen(false)
  }, [])

  const alertCount = useMemo(
    () => alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'WARNING').length,
    [alerts]
  )

  // ── Shared props bundles ───────────────────────────────────────────────────
  const streamProps = {
    currentReading, currentInference, telemetryHistory,
    isAutoStreaming, isInjectMode, isStepLoading,
    onStep:         () => stepTelemetry(selectedMachine, isInjectMode),
    onToggleStream: () => setIsAutoStreaming(s => !s),
    onToggleInject: () => setIsInjectMode(m => !m),
  }

  return (
    <div className="min-h-screen bg-canvas-light dark:bg-canvas-dark font-sans overflow-x-hidden">
      <Header
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        theme={theme}
        toggleTheme={toggleTheme}
        alertCount={alertCount}
        serverOnline={serverOnline}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <FloatingRail
        activeTab={activeTab}
        setActiveTab={handleTabChange}
        alertCount={alertCount}
      />

      <main className="pt-20 md:pl-24 pb-24 md:pb-10 max-w-8xl mx-auto px-4 sm:px-6">
        <AnimatePresence mode="wait">

          {activeTab === 'overview' && (
            <OverviewView
              key="overview"
              fleet={fleet}
              serverOnline={serverOnline}
              alerts={alerts}
              onInspectMachine={handleInspectMachine}
              {...streamProps}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsView
              key="diagnostics"
              fleet={fleet}
              selectedMachine={selectedMachine}
              onSelectMachine={setSelectedMachine}
              {...streamProps}
            />
          )}

          {activeTab === 'simulator' && (
            <SimulatorView key="simulator" />
          )}

          {activeTab === 'fleet' && (
            <FleetManageView
              key="fleet"
              fleet={fleet}
              onInspect={handleInspectMachine}
            />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceView
              key="maintenance"
              fleet={fleet}
            />
          )}

          {activeTab === 'benchmarks' && (
            <BenchmarksView
              key="benchmarks"
              metrics={metrics}
              health={health}
            />
          )}

          {activeTab === 'alerts' && (
            <AlertLogsView
              key="alerts"
              alerts={alerts}
              onClear={() => setAlerts([])}
            />
          )}

        </AnimatePresence>
      </main>
    </div>
  )
}
