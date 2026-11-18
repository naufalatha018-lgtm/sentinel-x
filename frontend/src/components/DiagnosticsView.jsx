import { motion } from 'framer-motion'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
  BarChart, Bar, Cell, LabelList
} from 'recharts'
import { Activity, Thermometer, Gauge, Zap, Play, Pause, AlertTriangle, CheckCircle2 } from 'lucide-react'

const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.3 }
}

const SENSOR_CONFIGS = [
  {
    key: 'vibration',
    label: 'Vibration',
    unit: 'mm/s',
    color: '#2563EB',
    icon: Activity,
    refLine: { y: 6.8, label: 'ISO limit' },
    fallback: [{ t: 0, vibration: 2.1 }],
  },
  {
    key: 'temperature',
    label: 'Temperature',
    unit: '°C',
    color: '#F59E0B',
    icon: Thermometer,
    refLine: { y: 92, label: 'ISO limit' },
    fallback: [{ t: 0, temperature: 65 }],
  },
  {
    key: 'pressure',
    label: 'Pressure',
    unit: 'bar',
    color: '#8B5CF6',
    icon: Gauge,
    refLine: null,
    fallback: [{ t: 0, pressure: 4.5 }],
  },
  {
    key: 'rpm',
    label: 'RPM',
    unit: 'RPM',
    color: '#10B981',
    icon: Zap,
    refLine: null,
    fallback: [{ t: 0, rpm: 1480 }],
  },
]

function SensorChart({ config, currentReading, telemetryHistory }) {
  const { key, label, unit, color, icon: Icon, refLine, fallback } = config
  const data = telemetryHistory.length ? telemetryHistory : fallback
  const currentVal = currentReading?.[key]

  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl p-4 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800 min-w-0 overflow-hidden">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="w-4 h-4 text-cobalt-600" />
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</span>
        <span className="ml-auto text-xs text-slate-400 tabular-nums">
          {currentVal != null ? `${currentVal.toFixed(2)} ${unit}` : `— ${unit}`}
        </span>
      </div>
      <div className="w-full h-[280px] min-w-0 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
            <XAxis dataKey="t" hide />
            <YAxis
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              domain={['auto', 'auto']}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: 'none',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 11,
              }}
            />
            {refLine && (
              <ReferenceLine
                y={refLine.y}
                stroke="#EF4444"
                strokeDasharray="4 2"
                label={{
                  value: refLine.label,
                  fill: '#EF4444',
                  fontSize: 9,
                  position: 'insideTopRight',
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey={key}
              stroke={color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function RulGauge({ currentInference }) {
  const rul = currentInference?.predicted_rul || 1842
  const maxRul = 3000
  const pct = Math.min(rul / maxRul, 1)

  let statusClass, statusLabel
  if (rul > 2000) {
    statusClass = 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    statusLabel = 'Healthy'
  } else if (rul >= 1000) {
    statusClass = 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
    statusLabel = 'Warning'
  } else {
    statusClass = 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
    statusLabel = 'Critical'
  }

  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl p-4 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800 flex flex-col items-center justify-center gap-4">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 self-start">
        Remaining Useful Life
      </h3>
      <svg viewBox="0 0 200 120" className="w-full max-w-[220px] mx-auto">
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="currentColor"
          className="text-slate-200 dark:text-slate-700"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="#2563EB"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${pct * 251.33} 251.33`}
          strokeDashoffset="0"
        />
        <text
          x="100"
          y="88"
          textAnchor="middle"
          className="fill-slate-900 dark:fill-white"
          fontSize="22"
          fontWeight="bold"
          fontFamily="Plus Jakarta Sans"
        >
          {rul.toLocaleString()}
        </text>
        <text x="100" y="106" textAnchor="middle" fill="#94a3b8" fontSize="10">
          cycles remaining
        </text>
      </svg>
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
        {statusLabel}
      </span>
    </div>
  )
}

function ShapChart({ currentInference }) {
  const shapData = currentInference?.shap_values
    ? Object.entries(currentInference.shap_values)
        .map(([k, v]) => ({ name: k.replace(/_/g, ' '), value: Math.abs(v), raw: v }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 7)
    : [
        { name: 'vibration rms',   value: 0.38, raw:  0.38 },
        { name: 'rolling temp std', value: 0.27, raw:  0.27 },
        { name: 'rpm lag 5',       value: 0.19, raw: -0.19 },
        { name: 'pressure mean',   value: 0.11, raw:  0.11 },
        { name: 'temp lag 3',      value: 0.08, raw: -0.08 },
        { name: 'voltage rms',     value: 0.05, raw:  0.05 },
        { name: 'cycle count',     value: 0.03, raw: -0.03 },
      ]

  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl p-4 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800 min-w-0 overflow-hidden">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
        Root-Cause Analysis <span className="font-serif italic text-slate-400">( SHAP )</span>
      </h3>
      <div className="w-full h-[260px] min-w-0 overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={shapData} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
            <XAxis
              type="number"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 10, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={100}
            />
            <Tooltip
              contentStyle={{
                background: '#1e293b',
                border: 'none',
                borderRadius: 8,
                color: '#f1f5f9',
                fontSize: 11,
              }}
              formatter={v => [v.toFixed(3), 'SHAP']}
            />
            <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18}>
              {shapData.map((e, i) => (
                <Cell key={i} fill={e.raw >= 0 ? '#2563EB' : '#10B981'} />
              ))}
              <LabelList
                dataKey="value"
                position="right"
                style={{ fill: '#94a3b8', fontSize: 9 }}
                formatter={v => v.toFixed(3)}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function DiagnosticsView({
  fleet,
  selectedMachine,
  onSelectMachine,
  currentReading,
  currentInference,
  telemetryHistory,
  isAutoStreaming,
  isInjectMode,
  isStepLoading,
  onStep,
  onToggleStream,
  onToggleInject,
}) {
  const machineList = fleet.length
    ? fleet
    : [
        { machine_id: 'MCH-001' },
        { machine_id: 'MCH-002' },
        { machine_id: 'MCH-003' },
        { machine_id: 'MCH-004' },
        { machine_id: 'MCH-005' },
        { machine_id: 'MCH-006' },
        { machine_id: 'MCH-007' },
        { machine_id: 'MCH-008' },
      ]

  return (
    <motion.div {...fadeUp} className="space-y-6 py-6">
      {/* A. Top control bar */}
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mr-2">
          Live <span className="font-serif italic text-cobalt-600">Diagnostics</span>
        </h2>

        {/* Machine selector */}
        <select
          value={selectedMachine}
          onChange={e => onSelectMachine(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark text-slate-700 dark:text-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cobalt-500"
        >
          {machineList.map(m => (
            <option key={m.machine_id} value={m.machine_id}>{m.machine_id}</option>
          ))}
        </select>

        {/* Auto-stream toggle */}
        <button
          onClick={onToggleStream}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            isAutoStreaming
              ? 'bg-cobalt-600 text-white'
              : 'bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
          }`}
        >
          {isAutoStreaming
            ? <><Pause className="w-3.5 h-3.5" />Pause</>
            : <><Play className="w-3.5 h-3.5" />Auto-Stream</>
          }
        </button>

        {/* Step button */}
        <button
          onClick={onStep}
          disabled={isStepLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors"
        >
          {isStepLoading ? 'Loading…' : 'Step →'}
        </button>

        {/* Inject anomaly toggle */}
        <button
          onClick={onToggleInject}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
            isInjectMode
              ? 'bg-rose-500 text-white'
              : 'bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          {isInjectMode ? 'Anomaly ON' : 'Inject Anomaly'}
        </button>

        {/* Status pill */}
        {currentInference && (
          <span
            className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${
              currentInference.anomaly_detected
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            }`}
          >
            {currentInference.anomaly_detected
              ? <AlertTriangle className="w-3 h-3" />
              : <CheckCircle2 className="w-3 h-3" />
            }
            {currentInference.anomaly_detected ? 'Anomaly Detected' : 'Normal Operation'}
          </span>
        )}
      </div>

      {/* B. 4 Sensor Waveform charts — 2×2 grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {SENSOR_CONFIGS.map(config => (
          <SensorChart
            key={config.key}
            config={config}
            currentReading={currentReading}
            telemetryHistory={telemetryHistory}
          />
        ))}
      </div>

      {/* C. Bottom row: RUL Gauge + SHAP chart */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <RulGauge currentInference={currentInference} />
        <ShapChart currentInference={currentInference} />
      </div>
    </motion.div>
  )
}
