import React, { useState, useEffect, useRef } from 'react'
import {
  Shield,
  Activity,
  LayoutDashboard,
  Cpu,
  AlertTriangle,
  Play,
  RotateCcw,
  Zap,
  Gauge,
  Thermometer,
  Radio,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertOctagon,
  HelpCircle,
  Menu,
  X,
  Server,
  RefreshCw,
  TrendingDown,
  Layers
} from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  BarChart,
  Bar,
  Cell
} from 'recharts'

const API_BASE = 'http://127.0.0.1:18000'

export default function App() {
  const [activeTab, setActiveTab] = useState('fleet') // 'fleet' | 'diagnostics' | 'benchmarks'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [serverOnline, setServerOnline] = useState(false)
  
  // Fleet State
  const [fleet, setFleet] = useState([])
  const [selectedMachine, setSelectedMachine] = useState('MCH-001')
  const [fleetLoading, setFleetLoading] = useState(true)

  // Diagnostics & Simulation State
  const [telemetryHistory, setTelemetryHistory] = useState([])
  const [currentReading, setCurrentReading] = useState(null)
  const [currentInference, setCurrentInference] = useState(null)
  const [isAutoStreaming, setIsAutoStreaming] = useState(false)
  const [isInjectMode, setIsInjectMode] = useState(false)
  const [isStepLoading, setIsStepLoading] = useState(false)
  const [alerts, setAlerts] = useState([])

  // Benchmarks & Health State
  const [metrics, setMetrics] = useState(null)
  const [health, setHealth] = useState(null)

  const autoStreamRef = useRef(null)

  // 1. Fetch System Health & Model Metrics on boot
  const fetchHealthAndMetrics = async () => {
    try {
      const [hRes, mRes] = await Promise.all([
        fetch(`${API_BASE}/health`),
        fetch(`${API_BASE}/model-metrics`)
      ])
      if (hRes.ok) {
        const hData = await hRes.json()
        setHealth(hData)
        setServerOnline(true)
      } else {
        setServerOnline(false)
      }
      if (mRes.ok) {
        const mData = await mRes.json()
        setMetrics(mData)
      }
    } catch (err) {
      console.warn('Backend connection failed:', err)
      setServerOnline(false)
    }
  }

  // 2. Fetch Fleet Overview Data
  const fetchFleetStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/fleet-status`)
      if (res.ok) {
        const data = await res.json()
        setFleet(data.fleet || [])
        setServerOnline(true)
      }
    } catch (err) {
      console.error('Error fetching fleet status:', err)
    } finally {
      setFleetLoading(false)
    }
  }

  // 3. Step Telemetry Simulation for selected machine
  const stepTelemetry = async (inject = false) => {
    setIsStepLoading(true)
    try {
      const res = await fetch(
        `${API_BASE}/stream-telemetry?machine_id=${selectedMachine}&inject_anomaly=${inject}&advance_cycle=true`
      )
      if (res.ok) {
        const data = await res.json()
        const tel = data.telemetry
        const inf = data.inference

        setCurrentReading(tel)
        setCurrentInference(inf)
        setServerOnline(true)

        // Append to rolling history (max 30 points)
        setTelemetryHistory((prev) => {
          const point = {
            cycle: tel.cycle,
            time: new Date(tel.timestamp).toLocaleTimeString([], { hour12: false, minute: '2-digit', second: '2-digit' }),
            vibration: tel.vibration,
            temperature: tel.temperature,
            rpm: tel.rpm,
            pressure: tel.pressure,
            voltage: tel.voltage,
            health_index: tel.health_index,
            is_anomaly: inf.anomaly_detection?.is_anomaly ? 1 : 0
          }
          const next = [...prev, point]
          return next.length > 30 ? next.slice(-30) : next
        })

        // Log alerts if anomalous
        if (inf.anomaly_detection?.is_anomaly) {
          setAlerts((prev) => [
            {
              id: Date.now(),
              machine_id: tel.machine_id,
              cycle: tel.cycle,
              score: inf.anomaly_detection.anomaly_score,
              type: tel.anomaly_type || 'Anomaly Burst',
              time: new Date().toLocaleTimeString(),
              vibration: tel.vibration,
              temp: tel.temperature
            },
            ...prev.slice(0, 24)
          ])
        }
      }
    } catch (err) {
      console.error('Error stepping telemetry:', err)
    } finally {
      setIsStepLoading(false)
    }
  }

  // Initial Data Load
  useEffect(() => {
    fetchHealthAndMetrics()
    fetchFleetStatus()
    // Pre-populate with first point
    stepTelemetry(false)
  }, [])

  // Auto-stream interval management
  useEffect(() => {
    if (isAutoStreaming) {
      autoStreamRef.current = setInterval(() => {
        stepTelemetry(isInjectMode)
      }, 1500)
    } else {
      if (autoStreamRef.current) clearInterval(autoStreamRef.current)
    }
    return () => {
      if (autoStreamRef.current) clearInterval(autoStreamRef.current)
    }
  }, [isAutoStreaming, isInjectMode, selectedMachine])

  // Machine Selection Handler
  const handleSelectMachine = (mId) => {
    setSelectedMachine(mId)
    setTelemetryHistory([]) // Reset local history for clean waveform transition
    setTimeout(() => {
      stepTelemetry(false)
    }, 50)
  }

  // Health Status Badge Helper
  const getStatusBadge = (status, rul) => {
    const s = (status || '').toUpperCase()
    if (s.includes('HEALTH') || rul > 600) {
      return (
        <span className="badge-healthy px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
          <CheckCircle2 className="w-3.5 h-3.5" /> HEALTHY
        </span>
      )
    } else if (s.includes('CRITICAL') || s.includes('IMMINENT') || rul < 180) {
      return (
        <span className="badge-critical px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
          <AlertOctagon className="w-3.5 h-3.5" /> CRITICAL WEAR
        </span>
      )
    } else {
      return (
        <span className="badge-warning px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5" /> DEGRADING
        </span>
      )
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-industrial-950 text-slate-100">
      {/* ==================================================================== */}
      {/* TOP NAVIGATION BAR                                                   */}
      {/* ==================================================================== */}
      <header className="sticky top-0 z-40 bg-industrial-900/90 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-500 flex items-center justify-center shadow-lg shadow-cyan-500/20 border border-cyan-400/30">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                  SENTINEL-X
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  v1.0.0
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium hidden sm:block">
                Industrial IoT Predictive Maintenance & Anomaly Detection
              </p>
            </div>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex items-center gap-1.5 bg-industrial-850/80 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('fleet')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'fleet'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Fleet Overview
            </button>
            <button
              onClick={() => setActiveTab('diagnostics')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'diagnostics'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Activity className="w-4 h-4" />
              Live Diagnostics & Simulator
            </button>
            <button
              onClick={() => setActiveTab('benchmarks')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === 'benchmarks'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <Cpu className="w-4 h-4" />
              AI Benchmarks & Health
            </button>
          </nav>

          {/* System Status Pill & Mobile Menu Toggle */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
              <span
                className={`w-2 h-2 rounded-full ${
                  serverOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                }`}
              />
              <span className="font-mono text-slate-300 hidden sm:inline">
                {serverOnline ? 'PORT 18000 : ONLINE' : 'GATEWAY : OFFLINE'}
              </span>
            </div>

            {/* Mobile hamburger button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg bg-industrial-850 border border-slate-800 text-slate-300 hover:text-white"
              aria-label="Toggle Navigation"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="md:hidden pt-4 pb-2 border-t border-slate-800 mt-3 flex flex-col gap-2">
            <button
              onClick={() => {
                setActiveTab('fleet')
                setMobileMenuOpen(false)
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                activeTab === 'fleet' ? 'bg-cyan-950 text-cyan-400' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              Fleet Overview
            </button>
            <button
              onClick={() => {
                setActiveTab('diagnostics')
                setMobileMenuOpen(false)
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                activeTab === 'diagnostics' ? 'bg-cyan-950 text-cyan-400' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Activity className="w-4 h-4" />
              Live Diagnostics & Simulator
            </button>
            <button
              onClick={() => {
                setActiveTab('benchmarks')
                setMobileMenuOpen(false)
              }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                activeTab === 'benchmarks' ? 'bg-cyan-950 text-cyan-400' : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Cpu className="w-4 h-4" />
              AI Benchmarks & Health
            </button>
          </div>
        )}
      </header>

      {/* ==================================================================== */}
      {/* MAIN VIEW CONTENT AREA                                               */}
      {/* ==================================================================== */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {/* ------------------------------------------------------------------ */}
        {/* VIEW 1: FLEET OVERVIEW                                             */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'fleet' && (
          <div className="space-y-6">
            {/* Fleet KPI Banner */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-panel p-4 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Active Fleet Units</span>
                  <Radio className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white">
                  {fleet.length || 8}
                  <span className="text-xs font-normal text-slate-400 ml-2">Machines</span>
                </div>
                <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  100% Telemetry Monitored
                </div>
              </div>

              <div className="glass-panel p-4 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Nominal Healthy</span>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">
                  {fleet.filter((m) => m.predicted_rul > 400).length}
                  <span className="text-xs font-normal text-slate-400 ml-2">Units</span>
                </div>
                <div className="mt-2 text-xs text-slate-400">Normal Operating Tolerances</div>
              </div>

              <div className="glass-panel p-4 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Degrading / Alert</span>
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-amber-400">
                  {fleet.filter((m) => m.predicted_rul <= 400 && m.predicted_rul > 180).length}
                  <span className="text-xs font-normal text-slate-400 ml-2">Units</span>
                </div>
                <div className="mt-2 text-xs text-amber-400/80">Scheduled Maintenance Required</div>
              </div>

              <div className="glass-panel p-4 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-2">
                  <span className="text-xs font-semibold uppercase tracking-wider">Critical Wear</span>
                  <AlertOctagon className="w-4 h-4 text-rose-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-rose-400">
                  {fleet.filter((m) => m.predicted_rul <= 180).length}
                  <span className="text-xs font-normal text-slate-400 ml-2">Units</span>
                </div>
                <div className="mt-2 text-xs text-rose-400/80">Imminent Breakdown Threat</div>
              </div>
            </div>

            {/* Fleet Grid Cards */}
            <div className="flex items-center justify-between mt-8 mb-4">
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Fleet Operational Units</h2>
                <p className="text-xs text-slate-400">Real-time health index, vibration RMS, and predictive RUL forecasts</p>
              </div>
              <button
                onClick={fetchFleetStatus}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-industrial-850 hover:bg-slate-800 text-xs font-semibold text-slate-300 border border-slate-700/80 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {fleet.map((m) => {
                const isCrit = m.predicted_rul <= 180
                const isWarn = m.predicted_rul <= 400 && !isCrit

                return (
                  <div
                    key={m.machine_id}
                    className="glass-panel-interactive p-5 rounded-2xl flex flex-col justify-between"
                  >
                    <div>
                      {/* Machine Title & Status */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <span className="text-xs font-mono font-bold text-cyan-400">{m.machine_id}</span>
                          <h3 className="text-sm font-bold text-white mt-0.5">{m.machine_type}</h3>
                        </div>
                        {getStatusBadge(m.health_status, m.predicted_rul)}
                      </div>

                      {/* Degradation Mode Subtitle */}
                      <div className="text-[11px] text-slate-400 mb-4 capitalize">
                        Mode: <span className="text-slate-300 font-medium">{m.degradation_mode?.replace(/_/g, ' ')}</span>
                      </div>

                      {/* Health Progress Bar */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex justify-between text-xs">
                          <span className="text-slate-400">Equipment Health</span>
                          <span className="font-bold text-white">{m.health_index?.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isCrit ? 'bg-rose-500' : isWarn ? 'bg-amber-400' : 'bg-emerald-400'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(5, m.health_index || 80))}%` }}
                          />
                        </div>
                      </div>

                      {/* Sensor Snapshot Badges */}
                      <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-industrial-900/60 p-2.5 rounded-xl border border-slate-800 mb-4">
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">Vibration</div>
                          <div className={`font-semibold ${m.vibration > 6.8 ? 'text-rose-400' : 'text-slate-200'}`}>
                            {m.vibration?.toFixed(2)} mm/s
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 uppercase">Temp</div>
                          <div className={`font-semibold ${m.temperature > 90 ? 'text-rose-400' : 'text-slate-200'}`}>
                            {m.temperature?.toFixed(1)} °C
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action & RUL Countdown */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] uppercase font-semibold text-slate-400">Predicted RUL</div>
                        <div className="text-lg font-extrabold text-white">
                          {Math.round(m.predicted_rul)}
                          <span className="text-xs font-normal text-slate-400 ml-1">cycles</span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          handleSelectMachine(m.machine_id)
                          setActiveTab('diagnostics')
                        }}
                        className="px-3 py-1.5 rounded-lg bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                      >
                        Inspect
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 2: LIVE DIAGNOSTICS & FAULT SIMULATOR                         */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-6">
            {/* Control Deck */}
            <div className="glass-panel p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Machine Dropdown */}
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Target Machine
                  </label>
                  <select
                    value={selectedMachine}
                    onChange={(e) => handleSelectMachine(e.target.value)}
                    className="bg-industrial-850 border border-slate-700/80 text-white rounded-xl px-3.5 py-2 text-sm font-semibold focus:outline-none focus:border-cyan-500"
                  >
                    {['MCH-001', 'MCH-002', 'MCH-003', 'MCH-004', 'MCH-005', 'MCH-006', 'MCH-007', 'MCH-008'].map(
                      (id) => (
                        <option key={id} value={id}>
                          {id}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* Step Telemetry Button */}
                <div className="self-end">
                  <button
                    onClick={() => stepTelemetry(isInjectMode)}
                    disabled={isStepLoading}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-sm font-bold shadow-lg shadow-cyan-500/20 disabled:opacity-50 transition-all"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    Step Telemetry
                  </button>
                </div>

                {/* Inject Anomaly Burst Button */}
                <div className="self-end">
                  <button
                    onClick={() => stepTelemetry(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 text-sm font-bold transition-all shadow-lg shadow-rose-900/10"
                  >
                    <Zap className="w-4 h-4 text-rose-400" />
                    Inject Fault Burst
                  </button>
                </div>
              </div>

              {/* Streaming Toggles */}
              <div className="flex items-center gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-800">
                {/* Auto Stream Toggle */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    onClick={() => setIsAutoStreaming(!isAutoStreaming)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 cursor-pointer ${
                      isAutoStreaming ? 'bg-cyan-500' : 'bg-slate-800'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ${
                        isAutoStreaming ? 'translate-x-5' : ''
                      }`}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-300">
                    Live Polling {isAutoStreaming && <span className="text-cyan-400">(Active 1.5s)</span>}
                  </span>
                </label>

                {/* Persistent Fault Toggle */}
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <div
                    onClick={() => setIsInjectMode(!isInjectMode)}
                    className={`w-11 h-6 flex items-center rounded-full p-1 duration-300 cursor-pointer ${
                      isInjectMode ? 'bg-rose-600' : 'bg-slate-800'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ${
                        isInjectMode ? 'translate-x-5' : ''
                      }`}
                    />
                  </div>
                  <span className="text-xs font-semibold text-slate-300">Continuous Fault Mode</span>
                </label>
              </div>
            </div>

            {/* KPI Status Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {/* RUL Card */}
              <div className="glass-panel p-4 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider">Remaining Useful Life</span>
                  <Clock className="w-4 h-4 text-cyan-400" />
                </div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white mt-1">
                  {currentInference?.rul_prediction?.predicted_rul?.toFixed(0) || '---'}
                  <span className="text-xs font-normal text-slate-400 ml-1.5">cycles</span>
                </div>
                <div className="mt-2">
                  {getStatusBadge(
                    currentInference?.rul_prediction?.health_status,
                    currentInference?.rul_prediction?.predicted_rul
                  )}
                </div>
              </div>

              {/* Anomaly Risk Card */}
              <div className="glass-panel p-4 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider">Anomaly Risk</span>
                  <Gauge className="w-4 h-4 text-cyan-400" />
                </div>
                <div
                  className={`text-2xl sm:text-3xl font-extrabold mt-1 ${
                    currentInference?.anomaly_detection?.is_anomaly ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {((currentInference?.anomaly_detection?.anomaly_score || 0) * 100).toFixed(1)}%
                </div>
                <div className="mt-2 text-xs font-mono text-slate-400">
                  {currentInference?.anomaly_detection?.is_anomaly ? (
                    <span className="text-rose-400 font-bold">⚠️ CRITICAL ANOMALY ALERT</span>
                  ) : (
                    <span className="text-emerald-400">✓ Nominal Operating Signal</span>
                  )}
                </div>
              </div>

              {/* Kinematic Vibration Card */}
              <div className="glass-panel p-4 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider">Vibration Velocity</span>
                  <Activity className="w-4 h-4 text-cyan-400" />
                </div>
                <div
                  className={`text-2xl sm:text-3xl font-extrabold mt-1 ${
                    (currentReading?.vibration || 0) > 6.8 ? 'text-rose-400' : 'text-white'
                  }`}
                >
                  {currentReading?.vibration?.toFixed(2) || '0.00'}
                  <span className="text-xs font-normal text-slate-400 ml-1.5">mm/s</span>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  Critical Threshold: <span className="font-mono text-slate-300">6.80 mm/s</span>
                </div>
              </div>

              {/* Core Temp Card */}
              <div className="glass-panel p-4 rounded-2xl">
                <div className="flex items-center justify-between text-slate-400 mb-1">
                  <span className="text-xs font-semibold uppercase tracking-wider">Core Temperature</span>
                  <Thermometer className="w-4 h-4 text-cyan-400" />
                </div>
                <div
                  className={`text-2xl sm:text-3xl font-extrabold mt-1 ${
                    (currentReading?.temperature || 0) > 90 ? 'text-rose-400' : 'text-white'
                  }`}
                >
                  {currentReading?.temperature?.toFixed(1) || '0.0'}
                  <span className="text-xs font-normal text-slate-400 ml-1.5">°C</span>
                </div>
                <div className="mt-2 text-xs text-slate-400">
                  Thermal Trip: <span className="font-mono text-slate-300">92.0 °C</span>
                </div>
              </div>
            </div>

            {/* Telemetry Waveforms */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Vibration Chart */}
              <div className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Vibration Kinematics (mm/s)</h3>
                    <p className="text-xs text-slate-400">High-frequency bearing spalling & cavitation monitor</p>
                  </div>
                  <span className="text-xs font-mono text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/60">
                    Live Waveform
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={telemetryHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} domain={[0, 'auto']} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                      />
                      <ReferenceLine y={6.8} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: 'Critical (6.8)', fill: '#f43f5e', fontSize: 10 }} />
                      <Line type="monotone" dataKey="vibration" stroke="#00f2fe" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Temperature Chart */}
              <div className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Bearing Core Temperature (°C)</h3>
                    <p className="text-xs text-slate-400">Thermal friction & cooling system dynamics</p>
                  </div>
                  <span className="text-xs font-mono text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800/60">
                    Thermal Band
                  </span>
                </div>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={telemetryHistory}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="time" stroke="#64748b" fontSize={11} tickLine={false} />
                      <YAxis stroke="#64748b" fontSize={11} domain={[40, 'auto']} tickLine={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                      />
                      <ReferenceLine y={92.0} stroke="#f43f5e" strokeDasharray="4 4" label={{ value: 'Trip (92°C)', fill: '#f43f5e', fontSize: 10 }} />
                      <Line type="monotone" dataKey="temperature" stroke="#ff7675" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Explainable AI (SHAP Local Drivers) */}
            <div className="glass-panel p-5 rounded-2xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Explainable AI: SHAP Root-Cause Feature Impact</h3>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800">
                      SHAP TreeExplainer
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Features pushing <strong className="text-rose-400">left</strong> reduce RUL and accelerate wear; features extending <strong className="text-emerald-400">right</strong> reflect safe operational regimes.
                  </p>
                </div>
              </div>

              {currentInference?.explainability && currentInference.explainability.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-center">
                  {/* SHAP Bar Chart */}
                  <div className="h-60 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        layout="vertical"
                        data={currentInference.explainability.map((f) => ({
                          feature: f.feature.replace(/_roll_|_mean_|_min_/g, ' '),
                          shap_value: f.shap_value,
                          raw_val: f.value
                        }))}
                        margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis type="number" stroke="#64748b" fontSize={11} />
                        <YAxis type="category" dataKey="feature" stroke="#94a3b8" fontSize={10} width={130} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                          formatter={(val) => [`${val.toFixed(2)} cycles`, 'SHAP Impact']}
                        />
                        <ReferenceLine x={0} stroke="#64748b" />
                        <Bar dataKey="shap_value" radius={[4, 4, 4, 4]}>
                          {currentInference.explainability.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={entry.shap_value < 0 ? '#f43f5e' : '#10b981'}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* SHAP Details Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs font-mono">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="pb-2">Feature Sensor</th>
                          <th className="pb-2">Observed</th>
                          <th className="pb-2">SHAP Impact</th>
                          <th className="pb-2">Diagnosis</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {currentInference.explainability.map((exp, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/30">
                            <td className="py-2 text-slate-300 font-semibold">{exp.feature}</td>
                            <td className="py-2 text-slate-200">{exp.value?.toFixed(2)}</td>
                            <td className={`py-2 font-bold ${exp.shap_value < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                              {exp.shap_value > 0 ? `+${exp.shap_value.toFixed(1)}` : exp.shap_value.toFixed(1)}
                            </td>
                            <td className="py-2 text-[11px] text-slate-400 font-sans">{exp.impact}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Click <strong>Step Telemetry</strong> to calculate live SHAP attributions.
                </div>
              )}
            </div>

            {/* Diagnostic Alert Journal */}
            <div className="glass-panel p-5 rounded-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  Fleet Diagnostic Alert Journal
                </h3>
                <span className="text-xs text-slate-400 font-mono">{alerts.length} Incident Events Logged</span>
              </div>
              {alerts.length > 0 ? (
                <div className="overflow-x-auto max-h-56">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="sticky top-0 bg-industrial-900 border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-2">Time</th>
                        <th className="py-2">Unit</th>
                        <th className="py-2">Fault Type</th>
                        <th className="py-2">Vib RMS</th>
                        <th className="py-2">Temp</th>
                        <th className="py-2">Risk Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {alerts.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-800/30">
                          <td className="py-2 text-slate-400">{a.time}</td>
                          <td className="py-2 font-bold text-cyan-300">{a.machine_id}</td>
                          <td className="py-2 text-rose-300 font-semibold">{a.type}</td>
                          <td className="py-2 text-slate-200">{a.vibration?.toFixed(2)} mm/s</td>
                          <td className="py-2 text-slate-200">{a.temp?.toFixed(1)} °C</td>
                          <td className="py-2 text-rose-400 font-bold">{(a.score * 100).toFixed(1)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No critical anomaly bursts triggered yet. Press <strong>Inject Fault Burst</strong> to test system response.
                </div>
              )}
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* VIEW 3: AI BENCHMARKS & SYSTEM HEALTH                              */}
        {/* ------------------------------------------------------------------ */}
        {activeTab === 'benchmarks' && (
          <div className="space-y-6">
            {/* System Health Card */}
            <div className="glass-panel p-5 rounded-2xl">
              <h2 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                Service Health & Architecture Metadata
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div className="bg-industrial-900/60 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 uppercase text-[10px] font-semibold">Service Status</div>
                  <div className="text-sm font-bold text-emerald-400 mt-1">{health?.status || 'OPERATIONAL'}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Uptime: {health?.uptime_seconds?.toFixed(1) || '0'}s</div>
                </div>
                <div className="bg-industrial-900/60 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 uppercase text-[10px] font-semibold">Gateway Port</div>
                  <div className="text-sm font-bold text-cyan-300 mt-1">127.0.0.1:18000</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Swagger: /docs</div>
                </div>
                <div className="bg-industrial-900/60 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 uppercase text-[10px] font-semibold">ML Engine Artifacts</div>
                  <div className="text-sm font-bold text-white mt-1">
                    {health?.models_ready ? 'Armed & Serialized' : 'Loaded'}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Dual Anomaly + XGBoost</div>
                </div>
                <div className="bg-industrial-900/60 p-3.5 rounded-xl border border-slate-800">
                  <div className="text-slate-400 uppercase text-[10px] font-semibold">Lead Architect</div>
                  <div className="text-sm font-bold text-white mt-1">Paul Gallagher</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Principal ML Engineer</div>
                </div>
              </div>
            </div>

            {/* Offline AI Evaluation Benchmarks */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Anomaly Detection Benchmark */}
              <div className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">Unsupervised Anomaly Scoring</h3>
                    <p className="text-xs text-slate-400">Scikit-Learn Isolation Forest & Deep PyTorch Autoencoder</p>
                  </div>
                  <span className="badge-healthy px-2.5 py-1 rounded-full text-xs font-bold">Validated</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 bg-industrial-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">ROC-AUC Score</span>
                    <span className="text-lg font-bold text-cyan-300">
                      {metrics?.anomaly_detection?.isolation_forest?.roc_auc || 0.9796}
                    </span>
                  </div>
                  <div className="p-3 bg-industrial-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">F1-Score</span>
                    <span className="text-lg font-bold text-emerald-400">
                      {metrics?.anomaly_detection?.isolation_forest?.f1_score || 0.8335}
                    </span>
                  </div>
                  <div className="p-3 bg-industrial-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">Precision</span>
                    <span className="text-lg font-bold text-white">
                      {metrics?.anomaly_detection?.isolation_forest?.precision || 0.899}
                    </span>
                  </div>
                  <div className="p-3 bg-industrial-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">Recall</span>
                    <span className="text-lg font-bold text-white">
                      {metrics?.anomaly_detection?.isolation_forest?.recall || 0.7768}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
                  <div className="flex justify-between py-1">
                    <span>Autoencoder Threshold ($\tau_{95}$):</span>
                    <span className="font-mono text-slate-200">1.9078</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Autoencoder ROC-AUC:</span>
                    <span className="font-mono text-slate-200">0.8341</span>
                  </div>
                </div>
              </div>

              {/* RUL Prognostics Benchmark */}
              <div className="glass-panel p-5 rounded-2xl">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-sm font-bold text-white">RUL Prognostics Regressor</h3>
                    <p className="text-xs text-slate-400">XGBoost with 118 Engineered Time-Series Features</p>
                  </div>
                  <span className="badge-healthy px-2.5 py-1 rounded-full text-xs font-bold">R² = 0.92</span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 bg-industrial-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">R² Determination</span>
                    <span className="text-lg font-bold text-emerald-400">
                      {metrics?.rul_regression?.r2_score || 0.9191}
                    </span>
                  </div>
                  <div className="p-3 bg-industrial-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">RMSE</span>
                    <span className="text-lg font-bold text-cyan-300">
                      {metrics?.rul_regression?.rmse || 116.71}{' '}
                      <span className="text-xs font-normal text-slate-400">cycles</span>
                    </span>
                  </div>
                  <div className="p-3 bg-industrial-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">Mean Absolute Error</span>
                    <span className="text-lg font-bold text-white">
                      {metrics?.rul_regression?.mae || 85.43}{' '}
                      <span className="text-xs font-normal text-slate-400">cycles</span>
                    </span>
                  </div>
                  <div className="p-3 bg-industrial-900/60 rounded-xl border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase">Engineered Features</span>
                    <span className="text-lg font-bold text-white">
                      {metrics?.dataset_summary?.feature_count || 118}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-800 text-xs text-slate-400">
                  <div className="flex justify-between py-1">
                    <span>NASA PHM08 Asymmetric Penalty:</span>
                    <span className="font-mono text-slate-200">Evaluated & Penalized Late Predictions</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span>Data Leakage Mitigation:</span>
                    <span className="font-mono text-emerald-400">Strict Machine ID Separation</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ==================================================================== */}
      {/* FOOTER                                                               */}
      {/* ==================================================================== */}
      <footer className="border-t border-slate-800/80 bg-industrial-900/60 py-4 px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Sentinel-X Industrial IoT AI Ecosystem &copy; 2026</span>
          <span className="font-mono">Architect & Lead Engineer: Paul Gallagher</span>
        </div>
      </footer>
    </div>
  )
}
