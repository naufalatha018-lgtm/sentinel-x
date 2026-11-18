import { useState } from 'react'
import { motion } from 'framer-motion'
import { Cpu, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'

const fadeUp = {
  initial:  { opacity: 0, y: 12 },
  animate:  { opacity: 1, y: 0  },
  exit:     { opacity: 0, y: -8 },
  transition: { duration: 0.3  },
}

const DEFAULT_FLEET = [
  { machine_id: 'MCH-001', status: 'HEALTHY',  health_index: 0.94, vibration_rms: 1.82, temperature: 62.4, predicted_rul: 2100, cycle_count: 4210 },
  { machine_id: 'MCH-002', status: 'HEALTHY',  health_index: 0.89, vibration_rms: 2.11, temperature: 67.1, predicted_rul: 1920, cycle_count: 3980 },
  { machine_id: 'MCH-003', status: 'HEALTHY',  health_index: 0.92, vibration_rms: 1.65, temperature: 59.8, predicted_rul: 2340, cycle_count: 3650 },
  { machine_id: 'MCH-004', status: 'CRITICAL', health_index: 0.31, vibration_rms: 5.84, temperature: 88.2, predicted_rul:  890, cycle_count: 5820 },
  { machine_id: 'MCH-005', status: 'HEALTHY',  health_index: 0.86, vibration_rms: 2.33, temperature: 70.5, predicted_rul: 1750, cycle_count: 4480 },
  { machine_id: 'MCH-006', status: 'WARNING',  health_index: 0.57, vibration_rms: 3.91, temperature: 79.6, predicted_rul: 1300, cycle_count: 5140 },
  { machine_id: 'MCH-007', status: 'HEALTHY',  health_index: 0.91, vibration_rms: 1.74, temperature: 63.2, predicted_rul: 2050, cycle_count: 3870 },
  { machine_id: 'MCH-008', status: 'WARNING',  health_index: 0.52, vibration_rms: 4.12, temperature: 82.1, predicted_rul: 1600, cycle_count: 5290 },
]

const ROLES = {
  'MCH-001': 'Rotary Compressor',
  'MCH-002': 'Centrifugal Pump',
  'MCH-003': 'Industrial Turbine',
  'MCH-004': 'Hydraulic Press',
  'MCH-005': 'Conveyor Drive',
  'MCH-006': 'Heat Exchanger',
  'MCH-007': 'Motor Generator',
  'MCH-008': 'Pneumatic Actuator',
}

function getStatus(m) {
  if (m.status)       return m.status
  if (m.health_status) return m.health_status
  if (m.health_index > 0.7) return 'HEALTHY'
  if (m.health_index > 0.4) return 'WARNING'
  return 'CRITICAL'
}

function StatusPill({ status }) {
  if (status === 'HEALTHY') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 flex-shrink-0">
        <CheckCircle2 className="w-3 h-3" /> Healthy
      </span>
    )
  }
  if (status === 'WARNING') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 flex-shrink-0">
        <AlertTriangle className="w-3 h-3" /> Warning
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 flex-shrink-0">
      <XCircle className="w-3 h-3" /> Critical
    </span>
  )
}

function MachineCard({ m, onInspect }) {
  const status = getStatus(m)
  const vib    = (m.vibration_rms ?? m.vibration ?? 2.0).toFixed(2)
  const temp   = (m.temperature ?? 65).toFixed(1)
  const rul    = (m.predicted_rul ?? 1500).toLocaleString()

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800 hover:shadow-md transition-shadow flex flex-col"
    >
      {/* Top: avatar + id + status */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-cobalt-50 dark:bg-cobalt-900/30 flex items-center justify-center flex-shrink-0">
          <Cpu className="w-5 h-5 text-cobalt-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{m.machine_id}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {ROLES[m.machine_id] || 'Industrial Unit'}
          </p>
        </div>
        <StatusPill status={status} />
      </div>

      {/* 3-col metric strip */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[
          { label: 'Vib',  value: vib,  unit: 'mm/s' },
          { label: 'Temp', value: temp, unit: '°C'   },
          { label: 'RUL',  value: rul,  unit: 'cyc'  },
        ].map(r => (
          <div key={r.label} className="text-center p-2 bg-slate-50 dark:bg-slate-800/60 rounded-xl">
            <p className="text-[10px] text-slate-400 uppercase font-medium">{r.label}</p>
            <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums mt-0.5">{r.value}</p>
            <p className="text-[10px] text-slate-400">{r.unit}</p>
          </div>
        ))}
      </div>

      {/* Health index bar */}
      {m.health_index != null && (
        <div className="mb-4">
          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Health Index</span>
            <span className="tabular-nums">{Math.round(m.health_index * 100)}%</span>
          </div>
          <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                status === 'HEALTHY' ? 'bg-emerald-500' :
                status === 'WARNING' ? 'bg-amber-400'   : 'bg-rose-500'
              }`}
              style={{ width: `${Math.round(m.health_index * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Run Diagnostics */}
      <button
        onClick={() => onInspect(m.machine_id)}
        className="mt-auto w-full py-2 rounded-xl text-xs font-semibold bg-cobalt-600 text-white hover:bg-cobalt-700 transition-colors"
      >
        Run Diagnostics →
      </button>
    </motion.div>
  )
}

const FILTERS = ['all', 'HEALTHY', 'WARNING', 'CRITICAL']
const FILTER_LABELS = { all: 'All Machines', HEALTHY: 'Healthy', WARNING: 'Warning', CRITICAL: 'Critical' }

export default function FleetManageView({ fleet, onInspect }) {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  const machines = fleet.length ? fleet : DEFAULT_FLEET

  const filtered = machines.filter(m => {
    const matchesFilter = filter === 'all' || getStatus(m) === filter
    const matchesSearch = m.machine_id.toLowerCase().includes(search.toLowerCase()) ||
      (ROLES[m.machine_id] || '').toLowerCase().includes(search.toLowerCase())
    return matchesFilter && matchesSearch
  })

  return (
    <motion.div {...fadeUp} className="space-y-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Fleet <span className="font-serif italic text-cobalt-600">directory</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {machines.length} machines registered across your industrial network.
          </p>
        </div>
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search machine or role…"
          className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark text-slate-700 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-cobalt-500 w-full sm:w-56"
        />
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-cobalt-600 text-white'
                : 'bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {FILTER_LABELS[f]}
            {f !== 'all' && (
              <span className="ml-1.5 opacity-70">
                ({machines.filter(m => getStatus(m) === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-surface-dark rounded-2xl p-10 shadow-card border border-slate-200/80 dark:border-slate-800 text-center">
          <p className="text-slate-500 dark:text-slate-400">No machines match the current filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map(m => (
            <MachineCard key={m.machine_id} m={m} onInspect={onInspect} />
          ))}
        </div>
      )}
    </motion.div>
  )
}
