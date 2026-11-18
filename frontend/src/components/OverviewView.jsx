import { motion } from 'framer-motion'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
  LineChart, Line,
} from 'recharts'
import {
  Activity, Cpu, AlertTriangle, CheckCircle2,
  Clock, ArrowUpRight, Download, Wifi, WifiOff, Factory,
} from 'lucide-react'

const fadeUp = {
  initial:  { opacity: 0, y: 12 },
  animate:  { opacity: 1, y: 0  },
  exit:     { opacity: 0, y: -8 },
  transition: { duration: 0.3  },
}

const TT = {
  background: '#1e293b', border: 'none',
  borderRadius: 8, color: '#f1f5f9', fontSize: 12,
}

const TT_DARK = {
  background: '#0f172a', border: '1px solid #334155',
  borderRadius: 6, color: '#f1f5f9', fontSize: 11,
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, suffix, badge, badgeColor, icon: Icon, iconBg }) {
  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
            {label}
          </p>
          <p className="mt-1.5 text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
            {value}
            {suffix && <span className="text-base font-normal text-slate-400">{suffix}</span>}
          </p>
          <span className={`inline-flex items-center gap-1 mt-2 text-xs font-medium px-2 py-0.5 rounded-full ${badgeColor}`}>
            {badge}
          </span>
        </div>
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${iconBg}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

// ─── Dark Monitor Card ────────────────────────────────────────────────────────

function MonitorCard({
  currentReading, telemetryHistory,
  isAutoStreaming, isInjectMode, isStepLoading,
  onStep, onToggleStream, onToggleInject,
}) {
  const data = telemetryHistory.length
    ? telemetryHistory
    : [{ t: 0, vibration: 2.1, temperature: 65 }]

  const vib  = currentReading?.vibration   != null ? currentReading.vibration.toFixed(2)   : (data[data.length-1]?.vibration   ?? 2.18).toFixed(2)
  const temp = currentReading?.temperature != null ? currentReading.temperature.toFixed(2) : (data[data.length-1]?.temperature ?? 62.4 ).toFixed(1)
  const rpm  = currentReading?.rpm         != null ? Math.round(currentReading.rpm).toLocaleString() : (data[data.length-1]?.rpm ?? 1750).toLocaleString()

  return (
    <div className="bg-[#0F172A] rounded-2xl p-5 text-white shadow-monitor border border-slate-700/50">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Live Monitor</p>
          <p className="text-sm font-bold text-white mt-0.5">MCH-001 · Vibration &amp; Temp</p>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-semibold">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
          LIVE
        </span>
      </div>

      {/* Mini waveform */}
      <div className="w-full h-[140px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 4, left: -34, bottom: 0 }}>
            <Line type="monotone" dataKey="vibration"   stroke="#38BDF8" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="temperature" stroke="#FB923C" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            <Tooltip contentStyle={TT_DARK} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex gap-3 mt-1 mb-3">
        <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="w-3 h-0.5 bg-sky-400 rounded-full inline-block" />Vibration</span>
        <span className="flex items-center gap-1 text-[10px] text-slate-400"><span className="w-3 h-0.5 bg-orange-400 rounded-full inline-block" />Temperature</span>
      </div>

      {/* 3-col numeric readouts */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Vibration', value: vib,  unit: 'mm/s', color: '#38BDF8' },
          { label: 'Temp',      value: temp, unit: '°C',   color: '#FB923C' },
          { label: 'RPM',       value: rpm,  unit: 'RPM',  color: '#A78BFA' },
        ].map(r => (
          <div key={r.label} className="bg-slate-800/60 rounded-xl p-2.5 text-center">
            <p className="text-[10px] text-slate-400 font-semibold uppercase">{r.label}</p>
            <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: r.color }}>{r.value}</p>
            <p className="text-[10px] text-slate-500">{r.unit}</p>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onToggleInject}
          className={`py-2 rounded-xl text-xs font-semibold transition-all ${
            isInjectMode
              ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
              : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
          }`}
        >
          {isInjectMode ? '⚠ Anomaly ON' : 'Inject Anomaly'}
        </button>
        <button
          onClick={onStep}
          disabled={isStepLoading}
          className="py-2 rounded-xl text-xs font-semibold bg-slate-700 text-slate-200 hover:bg-slate-600 disabled:opacity-50 transition-all"
        >
          {isStepLoading ? '…' : 'Step Cycle'}
        </button>
      </div>
      <button
        onClick={onToggleStream}
        className={`mt-2 w-full py-2 rounded-xl text-xs font-semibold transition-all ${
          isAutoStreaming
            ? 'bg-cobalt-600 text-white shadow-cobalt'
            : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
        }`}
      >
        {isAutoStreaming ? '⏸ Pause Auto-Stream' : '▶ Start Auto-Stream'}
      </button>
    </div>
  )
}

// ─── Priority Watchlist ───────────────────────────────────────────────────────

const FALLBACK_WATCH = [
  { machine_id: 'MCH-004', predicted_rul: 890,  status: 'CRITICAL' },
  { machine_id: 'MCH-008', predicted_rul: 1300, status: 'WARNING'  },
  { machine_id: 'MCH-006', predicted_rul: 1600, status: 'WARNING'  },
]

function PriorityWatchlist({ fleet, onInspectMachine }) {
  const top3 = fleet.length
    ? [...fleet].sort((a, b) => (a.predicted_rul ?? 9999) - (b.predicted_rul ?? 9999)).slice(0, 3)
    : FALLBACK_WATCH

  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
        Priority <span className="font-serif italic text-cobalt-600">Watchlist</span>
      </h3>
      {top3.map(m => {
        const rul = m.predicted_rul ?? 0
        const st  = m.status ?? (rul < 1000 ? 'CRITICAL' : rul < 1500 ? 'WARNING' : 'HEALTHY')
        return (
          <div key={m.machine_id} className="flex items-center justify-between py-2.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
            <div className="flex items-center gap-2.5">
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                st === 'CRITICAL' ? 'bg-rose-500' : st === 'WARNING' ? 'bg-amber-400' : 'bg-emerald-400'
              }`} />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{m.machine_id}</p>
                <p className="text-xs text-slate-500 tabular-nums">{rul.toLocaleString()} cycles</p>
              </div>
            </div>
            <button
              onClick={() => onInspectMachine(m.machine_id)}
              className="px-2.5 py-1 text-xs font-semibold text-cobalt-600 dark:text-cobalt-400 bg-cobalt-50 dark:bg-cobalt-900/30 rounded-lg hover:bg-cobalt-100 dark:hover:bg-cobalt-800/40 transition-colors"
            >
              Inspect →
            </button>
          </div>
        )
      })}
    </div>
  )
}

// ─── Default chart data ───────────────────────────────────────────────────────

const DEFAULT_BAR = [
  { id: 'M-001', rul: 2100 }, { id: 'M-002', rul: 1750 },
  { id: 'M-003', rul: 1920 }, { id: 'M-004', rul: 890  },
  { id: 'M-005', rul: 2340 }, { id: 'M-006', rul: 1300 },
  { id: 'M-007', rul: 2050 }, { id: 'M-008', rul: 1600 },
]

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OverviewView({
  fleet, currentReading, telemetryHistory,
  isAutoStreaming, isInjectMode, isStepLoading,
  serverOnline, alerts,
  onStep, onToggleStream, onToggleInject, onInspectMachine,
}) {
  const activeFleet = fleet.length || 8
  const avgRul = fleet.length
    ? Math.round(fleet.reduce((s, m) => s + (m.predicted_rul ?? 0), 0) / fleet.length)
    : 1842
  const alertCount = alerts.filter(a => a.severity === 'CRITICAL' || a.severity === 'WARNING').length

  const barData = fleet.length
    ? fleet.map(m => ({ id: m.machine_id.replace('MCH-', 'M-'), rul: m.predicted_rul ?? 0 }))
    : DEFAULT_BAR

  const getStatus = m => m.status ?? m.health_status ?? (
    (m.health_index ?? 1) > 0.7 ? 'HEALTHY' : (m.health_index ?? 1) > 0.4 ? 'WARNING' : 'CRITICAL'
  )
  const src     = fleet.length ? fleet : []
  const healthy  = src.filter(m => getStatus(m) === 'HEALTHY').length  || 6
  const warning  = src.filter(m => getStatus(m) === 'WARNING').length  || 1
  const critical = src.filter(m => getStatus(m) === 'CRITICAL').length || 1
  const total    = healthy + warning + critical
  const healthPct = Math.round(((healthy + warning * 0.5) / total) * 100)

  const pieData = [
    { name: 'Healthy',  value: healthy,  color: '#10B981' },
    { name: 'Warning',  value: warning,  color: '#F59E0B' },
    { name: 'Critical', value: critical, color: '#EF4444' },
  ]

  return (
    <motion.div {...fadeUp} className="space-y-6 py-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">

        {/* ══ LEFT ══ */}
        <div className="xl:col-span-8 min-w-0 space-y-6">

          {/* Hero header */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Factory className="w-5 h-5 text-cobalt-600" />
                <span className="text-xs font-semibold text-cobalt-600 uppercase tracking-widest">Industrial Fleet</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white leading-tight">
                Industrial Fleet{' '}
                <span className="font-serif italic text-cobalt-600">Command</span>
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Real-time predictive maintenance · Digital Twin monitoring · AI-driven anomaly detection
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
                serverOnline
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border border-amber-100 dark:border-amber-800'
              }`}>
                {serverOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                {serverOnline ? 'PLANT-01 · DIGITAL TWIN LIVE' : 'Simulation Mode'}
              </span>
              <button
                onClick={() => {
                  const csv = 'machine_id,predicted_rul,status\n' + (fleet.length ? fleet : []).map(m => `${m.machine_id},${m.predicted_rul ?? ''},${m.status ?? ''}`).join('\n')
                  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], {type:'text/csv'})); a.download='fleet-export.csv'; a.click()
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Download className="w-3.5 h-3.5" /> Export CSV
              </button>
            </div>
          </div>

          {/* 3-KPI strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label="Active Fleet Units"
              value={activeFleet} suffix="/8"
              badge={<><ArrowUpRight className="w-3 h-3" />All online</>}
              badgeColor="text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400"
              icon={Cpu}
              iconBg="bg-cobalt-50 dark:bg-cobalt-900/30 text-cobalt-600"
            />
            <KpiCard
              label="Avg Fleet RUL"
              value={avgRul.toLocaleString()}
              badge={<><Clock className="w-3 h-3" />cycles remaining</>}
              badgeColor="text-cobalt-600 bg-cobalt-50 dark:bg-cobalt-900/30"
              icon={Activity}
              iconBg="bg-amber-50 dark:bg-amber-900/30 text-amber-500"
            />
            <KpiCard
              label="Active Alerts"
              value={alertCount}
              badge={
                alertCount > 0
                  ? <><AlertTriangle className="w-3 h-3" />Requires attention</>
                  : <><CheckCircle2 className="w-3 h-3" />All clear</>
              }
              badgeColor={alertCount > 0
                ? 'text-rose-600 bg-rose-50 dark:bg-rose-900/30 dark:text-rose-400'
                : 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400'}
              icon={AlertTriangle}
              iconBg="bg-rose-50 dark:bg-rose-900/30 text-rose-500"
            />
          </div>

          {/* 2-col analytics */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Bar chart */}
            <div className="lg:col-span-7 min-w-0 overflow-hidden bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-0.5">
                Operational Insights{' '}
                <span className="font-serif italic text-cobalt-600 text-xs font-normal">RUL forecast</span>
              </h3>
              <p className="text-xs text-slate-400 mb-3">Predicted remaining cycles per machine unit</p>
              <div className="w-full h-[250px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                    <XAxis dataKey="id" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TT} cursor={{ fill: 'rgba(37,99,235,0.07)' }} />
                    <Bar dataKey="rul" fill="#2563EB" radius={[6, 6, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Pie ring */}
            <div className="lg:col-span-5 min-w-0 overflow-hidden bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white mb-0.5">
                Fleet Health Index{' '}
                <span className="font-serif italic text-cobalt-600 text-xs font-normal">status</span>
              </h3>
              <p className="text-xs text-slate-400 mb-3">Aggregate operational health distribution</p>
              <div className="relative w-full h-[200px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData} cx="50%" cy="50%"
                      innerRadius={60} outerRadius={80}
                      paddingAngle={3} dataKey="value" stroke="none"
                      startAngle={90} endAngle={-270}
                    >
                      {pieData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={TT} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{healthPct}%</span>
                  <span className="text-xs text-slate-500">Fleet Health</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3 mt-2">
                {pieData.map(e => (
                  <span key={e.name} className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: e.color }} />
                    {e.name}: {e.value}
                  </span>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* ══ RIGHT ══ */}
        <div className="xl:col-span-4 min-w-0 space-y-6">
          <MonitorCard
            currentReading={currentReading}
            telemetryHistory={telemetryHistory}
            isAutoStreaming={isAutoStreaming}
            isInjectMode={isInjectMode}
            isStepLoading={isStepLoading}
            onStep={onStep}
            onToggleStream={onToggleStream}
            onToggleInject={onToggleInject}
          />
          <PriorityWatchlist fleet={fleet} onInspectMachine={onInspectMachine} />
        </div>

      </div>
    </motion.div>
  )
}
