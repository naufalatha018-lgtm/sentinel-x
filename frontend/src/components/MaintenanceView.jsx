import { useState } from 'react'
import { motion } from 'framer-motion'
import { Wrench, AlertTriangle, CheckCircle2, Clock, DollarSign, Package, CalendarClock, ChevronRight } from 'lucide-react'

const fadeUp = {
  initial:  { opacity: 0, y: 12 },
  animate:  { opacity: 1, y: 0  },
  exit:     { opacity: 0, y: -8 },
  transition: { duration: 0.3  },
}

// ─── Static maintenance schedule (prioritised by RUL) ────────────────────────

const BASE_SCHEDULE = [
  {
    machine_id: 'MCH-004',
    role:        'Hydraulic Press',
    zone:        'Zone B — Line 3',
    predicted_rul: 890,
    status:      'CRITICAL',
    issue:       'Severe bearing wear — vibration RMS 5.84 mm/s (Class D)',
    parts:       ['Deep-groove bearing 6205-2RS', 'Shaft seal kit', 'Lubricant pack'],
    parts_ready: true,
    est_hours:   4,
    downtime_cost_saved: 12800,
    work_order_status: 'Pending',
  },
  {
    machine_id: 'MCH-008',
    role:        'Pneumatic Actuator',
    zone:        'Zone A — Line 1',
    predicted_rul: 1300,
    status:      'WARNING',
    issue:       'Elevated temperature (82.1°C) — thermal management degradation',
    parts:       ['Cooling fan assembly', 'Thermal paste', 'Temperature sensor'],
    parts_ready: false,
    est_hours:   2,
    downtime_cost_saved: 8400,
    work_order_status: 'Pending',
  },
  {
    machine_id: 'MCH-006',
    role:        'Heat Exchanger',
    zone:        'Zone C — Line 5',
    predicted_rul: 1600,
    status:      'WARNING',
    issue:       'Vibration RMS 3.91 mm/s (Class B→C boundary) — impeller imbalance',
    parts:       ['Impeller balance weights', 'Vibration dampers'],
    parts_ready: true,
    est_hours:   3,
    downtime_cost_saved: 9200,
    work_order_status: 'Pending',
  },
  {
    machine_id: 'MCH-005',
    role:        'Conveyor Drive',
    zone:        'Zone B — Line 4',
    predicted_rul: 1750,
    status:      'HEALTHY',
    issue:       'Routine lubrication cycle due — no fault detected',
    parts:       ['Lubricant refill'],
    parts_ready: true,
    est_hours:   1,
    downtime_cost_saved: 4600,
    work_order_status: 'Scheduled',
  },
  {
    machine_id: 'MCH-002',
    role:        'Centrifugal Pump',
    zone:        'Zone A — Line 2',
    predicted_rul: 1920,
    status:      'HEALTHY',
    issue:       'Planned seal inspection at 2000-cycle threshold',
    parts:       ['Mechanical seal set', 'O-ring kit'],
    parts_ready: true,
    est_hours:   2,
    downtime_cost_saved: 5200,
    work_order_status: 'Scheduled',
  },
  {
    machine_id: 'MCH-007',
    role:        'Motor Generator',
    zone:        'Zone D — Line 6',
    predicted_rul: 2050,
    status:      'HEALTHY',
    issue:       'Carbon brush replacement due in ~100 cycles',
    parts:       ['Carbon brush set (×4)', 'Brush spring kit'],
    parts_ready: false,
    est_hours:   1.5,
    downtime_cost_saved: 2600,
    work_order_status: 'Pending',
  },
  {
    machine_id: 'MCH-003',
    role:        'Industrial Turbine',
    zone:        'Zone C — Line 5',
    predicted_rul: 2340,
    status:      'HEALTHY',
    issue:       'Annual blade inspection — compliance requirement',
    parts:       ['Blade inspection kit', 'Vibration analysis report'],
    parts_ready: true,
    est_hours:   8,
    downtime_cost_saved: 0,
    work_order_status: 'Dispatched',
  },
  {
    machine_id: 'MCH-001',
    role:        'Rotary Compressor',
    zone:        'Zone A — Line 1',
    predicted_rul: 2100,
    status:      'HEALTHY',
    issue:       'Filter replacement at 2200-cycle service interval',
    parts:       ['Air filter element', 'Oil filter'],
    parts_ready: true,
    est_hours:   1,
    downtime_cost_saved: 0,
    work_order_status: 'Scheduled',
  },
]

const STATUS_CYCLE = { Pending: 'Scheduled', Scheduled: 'Dispatched', Dispatched: 'Completed' }
const WO_STYLES = {
  Pending:   'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Scheduled: 'bg-cobalt-50 text-cobalt-700 dark:bg-cobalt-900/30 dark:text-cobalt-400',
  Dispatched:'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  Completed: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
}

function priorityBadge(rul, status) {
  if (status === 'CRITICAL' || rul < 1000) return { label: 'P1 · Critical', color: 'bg-rose-500 text-white' }
  if (status === 'WARNING'  || rul < 1500) return { label: 'P2 · High',     color: 'bg-amber-400 text-white' }
  if (rul < 2000)                          return { label: 'P3 · Medium',    color: 'bg-cobalt-500 text-white' }
  return { label: 'P4 · Low', color: 'bg-slate-400 text-white' }
}

function WorkOrderRow({ item, onAdvance, fleetItem }) {
  const rul  = fleetItem?.predicted_rul ?? item.predicted_rul
  const { label: priLabel, color: priColor } = priorityBadge(rul, item.status)

  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800">
      <div className="flex flex-wrap items-start gap-3 mb-3">
        {/* Priority badge */}
        <span className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full ${priColor} flex-shrink-0`}>
          {priLabel}
        </span>

        {/* Machine info */}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-900 dark:text-white">{item.machine_id}</span>
            <span className="text-xs text-slate-500">·</span>
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{item.role}</span>
            <span className="text-xs text-slate-400 dark:text-slate-500">{item.zone}</span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{item.issue}</p>
        </div>

        {/* Work order status button */}
        <button
          onClick={() => onAdvance(item.machine_id)}
          disabled={item.work_order_status === 'Completed'}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            WO_STYLES[item.work_order_status]
          } ${item.work_order_status !== 'Completed' ? 'hover:opacity-80 cursor-pointer' : 'cursor-default'}`}
        >
          <CalendarClock className="w-3.5 h-3.5" />
          {item.work_order_status}
          {item.work_order_status !== 'Completed' && <ChevronRight className="w-3 h-3 ml-0.5" />}
        </button>
      </div>

      {/* Metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-slate-400 uppercase font-medium">RUL</p>
          <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums mt-0.5">{rul.toLocaleString()}</p>
          <p className="text-[10px] text-slate-400">cycles</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-slate-400 uppercase font-medium">Est. Time</p>
          <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums mt-0.5">{item.est_hours}h</p>
          <p className="text-[10px] text-slate-400">downtime</p>
        </div>
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-2.5 text-center">
          <p className="text-[10px] text-slate-400 uppercase font-medium">Cost Saved</p>
          <p className="text-sm font-bold text-emerald-600 tabular-nums mt-0.5">
            {item.downtime_cost_saved > 0 ? `$${item.downtime_cost_saved.toLocaleString()}` : '—'}
          </p>
          <p className="text-[10px] text-slate-400">/yr est.</p>
        </div>
        <div className={`rounded-xl p-2.5 text-center ${
          item.parts_ready ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-amber-50 dark:bg-amber-900/20'
        }`}>
          <p className="text-[10px] text-slate-400 uppercase font-medium">Parts</p>
          <p className={`text-sm font-bold mt-0.5 ${item.parts_ready ? 'text-emerald-600' : 'text-amber-600'}`}>
            {item.parts_ready ? 'Ready' : 'On order'}
          </p>
          {item.parts_ready
            ? <CheckCircle2 className="w-3 h-3 text-emerald-500 mx-auto mt-0.5" />
            : <Clock className="w-3 h-3 text-amber-500 mx-auto mt-0.5" />
          }
        </div>
      </div>

      {/* Parts list */}
      <details>
        <summary className="cursor-pointer text-xs font-semibold text-cobalt-600 dark:text-cobalt-400 flex items-center gap-1 select-none list-none">
          <Package className="w-3.5 h-3.5" />
          Required parts ({item.parts.length})
          <span className="ml-1 text-slate-400 opacity-0 group-open:opacity-100">▴</span>
        </summary>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.parts.map(p => (
            <span key={p} className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {p}
            </span>
          ))}
        </div>
      </details>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MaintenanceView({ fleet }) {
  const [schedule, setSchedule] = useState(BASE_SCHEDULE)
  const [filterStatus, setFilterStatus] = useState('all')

  const advance = (machineId) => {
    setSchedule(prev => prev.map(item => {
      if (item.machine_id !== machineId) return item
      const next = STATUS_CYCLE[item.work_order_status]
      return next ? { ...item, work_order_status: next } : item
    }))
  }

  const totalSaved  = schedule.reduce((s, i) => s + i.downtime_cost_saved, 0)
  const critical    = schedule.filter(i => i.status === 'CRITICAL').length
  const warnings    = schedule.filter(i => i.status === 'WARNING').length
  const dispatched  = schedule.filter(i => i.work_order_status === 'Dispatched' || i.work_order_status === 'Completed').length

  const filtered = filterStatus === 'all'
    ? schedule
    : schedule.filter(i => i.work_order_status === filterStatus)

  return (
    <motion.div {...fadeUp} className="space-y-6 py-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="w-5 h-5 text-cobalt-600" />
          <span className="text-xs font-semibold text-cobalt-600 uppercase tracking-widest">Predictive</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          Maintenance <span className="font-serif italic text-cobalt-600">Planner</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          AI-prioritised work orders sorted by failure risk and estimated downtime cost savings.
        </p>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'P1 Critical',    value: critical,  icon: AlertTriangle, color: 'text-rose-600', bg: 'bg-rose-50 dark:bg-rose-900/20'   },
          { label: 'P2 Warnings',    value: warnings,  icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
          { label: 'Work Orders Active', value: dispatched, icon: CalendarClock, color: 'text-cobalt-600', bg: 'bg-cobalt-50 dark:bg-cobalt-900/20' },
          { label: 'Est. Savings / yr', value: `$${(totalSaved / 1000).toFixed(1)}k`, icon: DollarSign, color: 'text-emerald-600', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-2xl p-4 border border-slate-100 dark:border-slate-800 flex items-center gap-3`}>
            <s.icon className={`w-5 h-5 ${s.color} flex-shrink-0`} />
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
              <p className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {['all', 'Pending', 'Scheduled', 'Dispatched', 'Completed'].map(f => (
          <button
            key={f}
            onClick={() => setFilterStatus(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors capitalize ${
              filterStatus === f
                ? 'bg-cobalt-600 text-white'
                : 'bg-white dark:bg-surface-dark border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {f === 'all' ? 'All Work Orders' : f}
            {f !== 'all' && (
              <span className="ml-1.5 opacity-70">
                ({schedule.filter(i => i.work_order_status === f).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Work order list */}
      <div className="space-y-4">
        {filtered.map(item => (
          <WorkOrderRow
            key={item.machine_id}
            item={item}
            onAdvance={advance}
            fleetItem={fleet.find(m => m.machine_id === item.machine_id)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="bg-white dark:bg-surface-dark rounded-2xl p-10 text-center shadow-card border border-slate-200/80 dark:border-slate-800">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <p className="text-slate-700 dark:text-slate-300 font-semibold">No work orders in this category</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
