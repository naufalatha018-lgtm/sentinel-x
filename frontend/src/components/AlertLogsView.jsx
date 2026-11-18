import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, XCircle, CheckCircle2, Trash2, Info, Download, ShieldAlert, Wrench, Thermometer, Activity } from 'lucide-react'

const fadeUp = {
  initial:  { opacity: 0, y: 12 },
  animate:  { opacity: 1, y: 0  },
  exit:     { opacity: 0, y: -8 },
  transition: { duration: 0.3  },
}

// ─── Root-cause guidance per severity ────────────────────────────────────────

const GUIDANCE = {
  CRITICAL: [
    'Schedule immediate maintenance inspection.',
    'Verify ISO 10816 vibration limits are not exceeded.',
    'Check bearing lubrication and alignment.',
    'Consider taking the machine offline until serviced.',
  ],
  WARNING: [
    'Monitor sensor readings at increased frequency.',
    'Review rolling temperature and vibration trends.',
    'Plan a maintenance window within 48 hours.',
  ],
  INFO: [
    'No immediate action required.',
    'Continue routine monitoring schedule.',
  ],
}

function guidanceFor(severity) {
  return GUIDANCE[severity] ?? GUIDANCE.INFO
}

function severityIcon(severity) {
  if (severity === 'CRITICAL') return <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0 mt-0.5" />
  if (severity === 'WARNING')  return <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
  return <Info className="w-5 h-5 text-cobalt-600 dark:text-cobalt-400 flex-shrink-0 mt-0.5" />
}

function severityRowClass(severity) {
  if (severity === 'CRITICAL')
    return 'bg-rose-50 border-rose-200 dark:bg-rose-900/20 dark:border-rose-800'
  if (severity === 'WARNING')
    return 'bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800'
  return 'bg-slate-50 border-slate-200 dark:bg-slate-800 dark:border-slate-700'
}

function severityPillClass(severity) {
  if (severity === 'CRITICAL')
    return 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
  if (severity === 'WARNING')
    return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
  return 'bg-cobalt-50 text-cobalt-700 dark:text-cobalt-400'
}

// ─── CSV export helper ────────────────────────────────────────────────────────

function exportCsv(alerts) {
  const header = 'id,machine_id,severity,message,timestamp'
  const rows   = alerts.map(a =>
    `${a.id},${a.machine_id},${a.severity},"${a.message}",${a.ts}`
  )
  const csv    = [header, ...rows].join('\n')
  const blob   = new Blob([csv], { type: 'text/csv' })
  const url    = URL.createObjectURL(blob)
  const a      = document.createElement('a')
  a.href       = url
  a.download   = `sentinel-x-alerts-${Date.now()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Summary strip ────────────────────────────────────────────────────────────

function SummaryStrip({ alerts }) {
  const critical = alerts.filter(a => a.severity === 'CRITICAL').length
  const warning  = alerts.filter(a => a.severity === 'WARNING').length

  return (
    <div className="grid grid-cols-3 gap-4">
      {[
        { label: 'Critical', count: critical, icon: XCircle,       color: 'text-rose-600',  bg: 'bg-rose-50 dark:bg-rose-900/20'   },
        { label: 'Warning',  count: warning,  icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-900/20' },
        { label: 'Total',    count: alerts.length, icon: ShieldAlert, color: 'text-cobalt-600', bg: 'bg-cobalt-50 dark:bg-cobalt-900/20' },
      ].map(s => (
        <div
          key={s.label}
          className={`${s.bg} rounded-2xl p-4 border border-slate-100 dark:border-slate-800 flex items-center gap-3`}
        >
          <s.icon className={`w-5 h-5 ${s.color} flex-shrink-0`} />
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{s.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.count}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Single alert row ────────────────────────────────────────────────────────

function AlertRow({ alert }) {
  const guidance = guidanceFor(alert.severity)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 12, height: 0 }}
      transition={{ duration: 0.2 }}
      className={`rounded-2xl border p-4 ${severityRowClass(alert.severity)}`}
    >
      <div className="flex items-start gap-3">
        {severityIcon(alert.severity)}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${severityPillClass(alert.severity)}`}>
              {alert.severity}
            </span>
            <span className="text-sm font-semibold text-slate-900 dark:text-white">
              {alert.machine_id}
            </span>
            <span className="text-xs text-slate-400 ml-auto tabular-nums">{alert.ts}</span>
          </div>

          {/* Message */}
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">{alert.message}</p>

          {/* Root-cause guidance */}
          <details className="group">
            <summary className="cursor-pointer text-xs font-medium text-cobalt-600 dark:text-cobalt-400 flex items-center gap-1 select-none list-none">
              <Wrench className="w-3 h-3" />
              Recommended Actions
              <span className="ml-1 text-slate-400 group-open:hidden">▾</span>
              <span className="ml-1 text-slate-400 hidden group-open:inline">▴</span>
            </summary>
            <ul className="mt-2 space-y-1 pl-4">
              {guidance.map((g, i) => (
                <li key={i} className="text-xs text-slate-600 dark:text-slate-400 list-disc list-inside">
                  {g}
                </li>
              ))}
            </ul>
          </details>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function AlertLogsView({ alerts, onClear }) {
  const reversed = useMemo(() => [...alerts].reverse(), [alerts])

  return (
    <motion.div {...fadeUp} className="space-y-6 py-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            Alert <span className="font-serif italic text-cobalt-600">Logs</span>
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {alerts.length} event{alerts.length !== 1 ? 's' : ''} recorded in this session.
          </p>
        </div>
        {alerts.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => exportCsv(alerts)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
            <button
              onClick={onClear}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors border border-rose-100 dark:border-rose-800"
            >
              <Trash2 className="w-3.5 h-3.5" /> Clear All
            </button>
          </div>
        )}
      </div>

      {/* Summary strip */}
      {alerts.length > 0 && <SummaryStrip alerts={alerts} />}

      {/* Empty state */}
      {alerts.length === 0 ? (
        <div className="bg-white dark:bg-surface-dark rounded-2xl p-10 shadow-card border border-slate-200/80 dark:border-slate-800 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
          <p className="text-slate-700 dark:text-slate-300 font-semibold">No Active Alerts</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
            Your fleet is operating normally. Enable Auto-Stream or step telemetry cycles to monitor for anomalies.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cobalt-500" />
              Switch to Overview or Live Diagnostics to start streaming.
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence initial={false}>
            {reversed.map(a => (
              <AlertRow key={a.id} alert={a} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* How-to tip */}
      <div className="bg-cobalt-50 dark:bg-cobalt-900/20 border border-cobalt-100 dark:border-cobalt-800/40 rounded-2xl p-4">
        <p className="text-xs text-cobalt-700 dark:text-cobalt-300">
          <span className="font-semibold">Tip:</span> Anomaly alerts are generated automatically when the Isolation
          Forest or Autoencoder model scores exceed the threshold during telemetry streaming.
          Use <span className="font-semibold">Inject Anomaly</span> in the Overview or Diagnostics view to simulate fault conditions.
        </p>
      </div>
    </motion.div>
  )
}
