import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { FlaskConical, Zap, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

const fadeUp = {
  initial:  { opacity: 0, y: 12 },
  animate:  { opacity: 1, y: 0  },
  exit:     { opacity: 0, y: -8 },
  transition: { duration: 0.3  },
}

// ─── Physics-based client-side model (instant fallback) ───────────────────────

function computePhysics({ vibration, temperature, rpm, pressure }) {
  // Empirical degradation weights derived from XGBoost feature importances
  const vibScore = Math.min(1, (vibration - 0.5) / 11.5)
  const tmpScore = Math.min(1, (temperature - 40) / 75)
  const rpmScore = Math.min(1, Math.abs(rpm - 1750) / 1450)
  const preScore = Math.min(1, Math.abs(pressure - 150) / 70)

  const degradation = vibScore * 0.42 + tmpScore * 0.28 + rpmScore * 0.16 + preScore * 0.14
  const anomalyProb = Math.round(Math.min(99, degradation * 110))
  const predictedRul = Math.round(Math.max(50, 2800 - degradation * 2750))

  let status, action
  if (anomalyProb >= 70) {
    status = 'CRITICAL'
    action = 'Immediate shutdown recommended. Schedule emergency bearing replacement and thermal inspection.'
  } else if (anomalyProb >= 40) {
    status = 'WARNING'
    action = 'Schedule maintenance within 72 hours. Increase vibration monitoring frequency to 1-hour intervals.'
  } else {
    status = 'HEALTHY'
    action = 'Continue normal operation. Routine inspection at next scheduled cycle.'
  }

  return { anomalyProb, predictedRul, status, action, degradation: Math.round(degradation * 100) }
}

// ─── Fault presets ────────────────────────────────────────────────────────────

const PRESETS = [
  {
    id: 'normal',
    label: 'Normal Baseline',
    icon: CheckCircle2,
    color: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400',
    values: { vibration: 1.9, temperature: 63, rpm: 1750, pressure: 150 },
    description: 'All sensors within ISO 10816 operational limits.',
  },
  {
    id: 'bearing',
    label: 'Inner-Race Bearing Wear',
    icon: AlertTriangle,
    color: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400',
    values: { vibration: 5.4, temperature: 79, rpm: 1680, pressure: 148 },
    description: 'High vibration RMS indicating bearing degradation.',
  },
  {
    id: 'cavitation',
    label: 'Pump Cavitation',
    icon: AlertTriangle,
    color: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-400',
    values: { vibration: 7.2, temperature: 71, rpm: 2100, pressure: 88 },
    description: 'Low pressure + high RPM indicates pump cavitation.',
  },
  {
    id: 'thermal',
    label: 'Thermal Runaway',
    icon: Zap,
    color: 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-400',
    values: { vibration: 3.8, temperature: 102, rpm: 1820, pressure: 162 },
    description: 'Critical overtemperature — coolant system failure.',
  },
]

// ─── Slider ───────────────────────────────────────────────────────────────────

function Slider({ label, unit, min, max, step = 0.1, value, onChange, warningThreshold, criticalThreshold }) {
  const pct = ((value - min) / (max - min)) * 100
  const isCritical = criticalThreshold != null && value >= criticalThreshold
  const isWarning  = !isCritical && warningThreshold != null && value >= warningThreshold

  const trackColor = isCritical ? '#EF4444' : isWarning ? '#F59E0B' : '#2563EB'

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</label>
        <span className={`text-sm font-bold tabular-nums ${
          isCritical ? 'text-rose-600 dark:text-rose-400' :
          isWarning  ? 'text-amber-600 dark:text-amber-400' : 'text-cobalt-600 dark:text-cobalt-400'
        }`}>{value.toFixed(step < 1 ? 1 : 0)} {unit}</span>
      </div>
      <div className="relative h-6 flex items-center">
        <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-150"
            style={{ width: `${pct}%`, background: trackColor }}
          />
        </div>
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-400 mt-1">
        <span>{min} {unit}</span>
        {warningThreshold && (
          <span className="text-amber-400">⚠ {warningThreshold}</span>
        )}
        {criticalThreshold && (
          <span className="text-rose-400">🔴 {criticalThreshold}</span>
        )}
        <span>{max} {unit}</span>
      </div>
    </div>
  )
}

// ─── Result gauge strip ────────────────────────────────────────────────────────

function ResultGauge({ label, value, max, unit, color, reverse = false }) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-bold tabular-nums" style={{ color }}>{value.toLocaleString()}</p>
      <p className="text-[10px] text-slate-400 mb-2">{unit}</p>
      <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const DEFAULTS = { vibration: 1.9, temperature: 63, rpm: 1750, pressure: 150 }

export default function SimulatorView() {
  const [params,  setParams]  = useState(DEFAULTS)
  const [loading, setLoading] = useState(false)
  const [result,  setResult]  = useState(() => computePhysics(DEFAULTS))
  const [activePreset, setActivePreset] = useState('normal')

  const updateParam = useCallback((key, val) => {
    const next = { ...params, [key]: val }
    setParams(next)
    setResult(computePhysics(next))
    setActivePreset(null)
  }, [params])

  const applyPreset = useCallback(async (preset) => {
    setActivePreset(preset.id)
    setParams(preset.values)
    setLoading(true)

    // Try live backend first, fall back to physics model
    try {
      const ctrl = new AbortController()
      const id = setTimeout(() => ctrl.abort(), 3000)
      const res = await fetch('http://127.0.0.1:18000/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          machine_id: 'MCH-SIM',
          ...preset.values,
          vibration_rms:   preset.values.vibration,
          temperature_avg: preset.values.temperature,
        }),
        signal: ctrl.signal,
      })
      clearTimeout(id)
      if (res.ok) {
        const data = await res.json()
        setResult({
          anomalyProb:  Math.round((data.anomaly_score ?? 0) * 100),
          predictedRul: data.predicted_rul ?? computePhysics(preset.values).predictedRul,
          status:       data.anomaly_detected ? (data.anomaly_score > 0.7 ? 'CRITICAL' : 'WARNING') : 'HEALTHY',
          action:       computePhysics(preset.values).action,
          degradation:  Math.round((data.anomaly_score ?? 0) * 100),
        })
      } else { setResult(computePhysics(preset.values)) }
    } catch {
      setResult(computePhysics(preset.values))
    }
    setLoading(false)
  }, [])

  const reset = () => { setParams(DEFAULTS); setResult(computePhysics(DEFAULTS)); setActivePreset('normal') }

  const statusColors = {
    HEALTHY:  { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800' },
    WARNING:  { text: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800'   },
    CRITICAL: { text: 'text-rose-600 dark:text-rose-400',     bg: 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800'     },
  }
  const sc = statusColors[result.status] ?? statusColors.HEALTHY

  return (
    <motion.div {...fadeUp} className="space-y-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical className="w-5 h-5 text-cobalt-600" />
            <span className="text-xs font-semibold text-cobalt-600 uppercase tracking-widest">Digital Twin</span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            What-If <span className="font-serif italic text-cobalt-600">Simulator</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Drag sliders or select a fault preset to compute live RUL impact and anomaly probability.
          </p>
        </div>
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Reset to Baseline
        </button>
      </div>

      {/* Fault presets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {PRESETS.map(p => {
          const Icon = p.icon
          return (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              className={`flex flex-col items-start gap-2 p-4 rounded-2xl border-2 text-left transition-all ${
                activePreset === p.id
                  ? p.color + ' shadow-sm'
                  : 'bg-white dark:bg-surface-dark border-slate-200 dark:border-slate-700 hover:border-cobalt-300 dark:hover:border-cobalt-700'
              }`}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight">{p.label}</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">{p.description}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Main content */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* Sliders panel */}
        <div className="xl:col-span-5 min-w-0 bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800 space-y-6">
          <h3 className="text-sm font-bold text-slate-800 dark:text-white">Stress Parameters</h3>

          <Slider
            label="Vibration RMS" unit="mm/s"
            min={0.5} max={12.0} step={0.1}
            value={params.vibration}
            onChange={v => updateParam('vibration', v)}
            warningThreshold={4.5}
            criticalThreshold={6.8}
          />
          <Slider
            label="Bearing Temperature" unit="°C"
            min={40} max={115} step={0.5}
            value={params.temperature}
            onChange={v => updateParam('temperature', v)}
            warningThreshold={80}
            criticalThreshold={92}
          />
          <Slider
            label="Spindle RPM" unit="RPM"
            min={800} max={3200} step={10}
            value={params.rpm}
            onChange={v => updateParam('rpm', v)}
            warningThreshold={2800}
          />
          <Slider
            label="Hydraulic Pressure" unit="bar"
            min={80} max={220} step={1}
            value={params.pressure}
            onChange={v => updateParam('pressure', v)}
            warningThreshold={200}
          />

          {/* Current values summary */}
          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Current Input</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { label: 'Vibration',    value: `${params.vibration.toFixed(1)} mm/s` },
                { label: 'Temperature', value: `${params.temperature.toFixed(1)} °C`  },
                { label: 'RPM',         value: `${params.rpm.toFixed(0)} RPM`         },
                { label: 'Pressure',    value: `${params.pressure.toFixed(0)} bar`    },
              ].map(x => (
                <div key={x.label} className="flex justify-between bg-slate-50 dark:bg-slate-800/60 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-500 dark:text-slate-400">{x.label}</span>
                  <span className="font-semibold text-slate-800 dark:text-white tabular-nums">{x.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Results panel */}
        <div className="xl:col-span-7 min-w-0 space-y-5">

          {/* Status banner */}
          <div className={`flex items-center gap-4 p-5 rounded-2xl border-2 ${sc.bg}`}>
            <div className={`text-3xl font-black tabular-nums ${sc.text}`}>
              {loading ? '…' : result.status}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">AI Assessment</p>
              <p className={`text-sm font-semibold ${sc.text} leading-snug`}>{result.action}</p>
            </div>
          </div>

          {/* Gauges */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ResultGauge
              label="Anomaly Probability"
              value={result.anomalyProb} max={100} unit="%"
              color={result.anomalyProb >= 70 ? '#EF4444' : result.anomalyProb >= 40 ? '#F59E0B' : '#10B981'}
            />
            <ResultGauge
              label="Predicted RUL"
              value={result.predictedRul} max={3000} unit="cycles"
              color="#2563EB"
            />
            <ResultGauge
              label="Degradation Index"
              value={result.degradation} max={100} unit="%"
              color={result.degradation >= 70 ? '#EF4444' : result.degradation >= 40 ? '#F59E0B' : '#10B981'}
            />
          </div>

          {/* ISO 10816 reference card */}
          <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-3">
              ISO 10816 Vibration <span className="font-serif italic text-cobalt-600">Reference Limits</span>
            </h3>
            <div className="space-y-2">
              {[
                { label: 'Class A — Good',      range: '< 2.3 mm/s',  color: '#10B981', active: params.vibration < 2.3 },
                { label: 'Class B — Acceptable', range: '2.3–4.5',    color: '#F59E0B', active: params.vibration >= 2.3 && params.vibration < 4.5 },
                { label: 'Class C — Warning',   range: '4.5–6.8',     color: '#F97316', active: params.vibration >= 4.5 && params.vibration < 6.8 },
                { label: 'Class D — Danger',    range: '≥ 6.8 mm/s',  color: '#EF4444', active: params.vibration >= 6.8 },
              ].map(c => (
                <div key={c.label} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${c.active ? 'bg-slate-50 dark:bg-slate-800/80 ring-1' : ''}`} style={c.active ? { ringColor: c.color } : {}}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: c.color }} />
                  <span className={`text-xs font-semibold ${c.active ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{c.label}</span>
                  <span className="text-xs text-slate-400 ml-auto tabular-nums">{c.range}</span>
                  {c.active && <span className="text-[10px] font-bold uppercase" style={{ color: c.color }}>CURRENT</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
