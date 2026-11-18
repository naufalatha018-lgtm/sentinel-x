import { motion } from 'framer-motion'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Cpu, Activity, Zap, Server, CheckCircle2, AlertTriangle, TrendingUp } from 'lucide-react'

const fadeUp = {
  initial:  { opacity: 0, y: 12 },
  animate:  { opacity: 1, y: 0  },
  exit:     { opacity: 0, y: -8 },
  transition: { duration: 0.3  },
}

const TOOLTIP_STYLE = {
  background: '#1e293b',
  border: 'none',
  borderRadius: 8,
  color: '#f1f5f9',
  fontSize: 12,
}

// ─── Summary KPI card ─────────────────────────────────────────────────────────

function SummaryCard({ label, value, subtitle, icon: Icon, iconBg, iconColor }) {
  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800">
      <div className="flex items-start justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
          {label}
        </p>
        <div className={`p-2 rounded-xl ${iconBg}`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
      </div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
    </div>
  )
}

// ─── Circular scorecard ───────────────────────────────────────────────────────

function ScoreCard({ name, description, score, color, label, subMetrics }) {
  const isDark = document.documentElement.classList.contains('dark')
  const bgColor = isDark ? '#1e293b' : '#f1f5f9'
  const pct = (score * 100).toFixed(1)

  return (
    <div className="bg-white dark:bg-surface-dark rounded-2xl p-5 shadow-card dark:shadow-card-dark border border-slate-200/80 dark:border-slate-800">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-white">{name}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-4">{description}</p>

      <div className="relative w-full h-[180px] min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={[{ value: score }, { value: Math.max(0, 1 - score) }]}
              cx="50%" cy="50%"
              innerRadius={55}
              outerRadius={72}
              startAngle={90}
              endAngle={-270}
              paddingAngle={0}
              dataKey="value"
              stroke="none"
            >
              <Cell fill={color} />
              <Cell fill={bgColor} />
            </Pie>
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={v => [(v * 100).toFixed(1) + '%', label]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-bold tabular-nums" style={{ color }}>{pct}%</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
        </div>
      </div>

      {subMetrics && subMetrics.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-x-4 gap-y-2">
          {subMetrics.map(sm => (
            <div key={sm.label} className="text-center">
              <p className="text-xs text-slate-400 uppercase font-medium">{sm.label}</p>
              <p className="text-sm font-bold text-slate-800 dark:text-white tabular-nums mt-0.5">{sm.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function BenchmarksView({ metrics, health }) {
  // ── Derive metric values (fall back to static if no live data)
  const IF_AUC    = metrics?.anomaly_detection?.isolation_forest?.roc_auc  ?? 0.9796
  const IF_PRE    = metrics?.anomaly_detection?.isolation_forest?.precision ?? 0.8990
  const IF_REC    = metrics?.anomaly_detection?.isolation_forest?.recall    ?? 0.7768
  const IF_F1     = metrics?.anomaly_detection?.isolation_forest?.f1_score  ?? 0.8335

  const AE_AUC    = metrics?.anomaly_detection?.autoencoder?.roc_auc  ?? 0.8341
  const AE_THRESH = metrics?.anomaly_detection?.autoencoder?.threshold ?? 0.6723

  const XGB_R2    = metrics?.rul_prediction?.r2_score   ?? 0.9774
  const XGB_RMSE  = metrics?.rul_prediction?.rmse       ?? 64.79
  const XGB_MAE   = metrics?.rul_prediction?.mae        ?? 50.62
  const XGB_PHM   = metrics?.rul_prediction?.phm08_score ?? 1524.2

  const isOnline  = health?.status && !health.status.toLowerCase().includes('simulated')
  const sysScore  = isOnline ? 1.0 : 0.5

  return (
    <motion.div {...fadeUp} className="space-y-6 py-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
          AI Models <span className="font-serif italic text-cobalt-600">at a glance</span>
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Real-time AI model performance benchmarks and system health metrics.
        </p>
      </div>

      {/* 4 summary KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          label="IF ROC-AUC"
          value={IF_AUC.toFixed(4)}
          subtitle="Isolation Forest anomaly detector"
          icon={Cpu}
          iconBg="bg-cobalt-50 dark:bg-cobalt-900/30"
          iconColor="text-cobalt-600"
        />
        <SummaryCard
          label="AE ROC-AUC"
          value={AE_AUC.toFixed(4)}
          subtitle="PyTorch Autoencoder detector"
          icon={Activity}
          iconBg="bg-purple-50 dark:bg-purple-900/30"
          iconColor="text-purple-600"
        />
        <SummaryCard
          label="XGBoost R²"
          value={XGB_R2.toFixed(4)}
          subtitle={`RMSE: ${XGB_RMSE.toFixed(2)} cycles`}
          icon={TrendingUp}
          iconBg="bg-emerald-50 dark:bg-emerald-900/30"
          iconColor="text-emerald-600"
        />
        <SummaryCard
          label="Backend"
          value={isOnline ? 'Online' : 'Simulated'}
          subtitle={health?.version ? `v${health.version}` : 'FastAPI inference server'}
          icon={isOnline ? CheckCircle2 : AlertTriangle}
          iconBg={isOnline ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-amber-50 dark:bg-amber-900/30'}
          iconColor={isOnline ? 'text-emerald-600' : 'text-amber-500'}
        />
      </div>

      {/* Model scorecards 2×2 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <ScoreCard
          name="Isolation Forest"
          description="Unsupervised anomaly detection via isolation trees (Scikit-Learn)"
          score={IF_AUC}
          color="#2563EB"
          label="ROC-AUC"
          subMetrics={[
            { label: 'Precision', value: IF_PRE.toFixed(4) },
            { label: 'Recall',    value: IF_REC.toFixed(4) },
            { label: 'F1 Score',  value: IF_F1.toFixed(4)  },
            { label: 'Model',     value: 'IsolationForest' },
          ]}
        />

        <ScoreCard
          name="PyTorch Autoencoder"
          description="Reconstruction-error based anomaly detection (deep learning)"
          score={AE_AUC}
          color="#8B5CF6"
          label="ROC-AUC"
          subMetrics={[
            { label: 'Threshold', value: AE_THRESH.toFixed(4) },
            { label: 'Arch',      value: 'AE (5-layer)'       },
          ]}
        />

        <ScoreCard
          name="XGBoost RUL Regressor"
          description="Gradient-boosted RUL prediction with lag & rolling window features"
          score={XGB_R2}
          color="#10B981"
          label="R² Score"
          subMetrics={[
            { label: 'RMSE',      value: XGB_RMSE.toFixed(2) + ' cyc' },
            { label: 'MAE',       value: XGB_MAE.toFixed(2)  + ' cyc' },
            { label: 'PHM Score', value: XGB_PHM.toFixed(1)            },
            { label: 'Library',   value: 'XGBoost'                     },
          ]}
        />

        <ScoreCard
          name="System Health"
          description="FastAPI inference server operational status and uptime"
          score={sysScore}
          color="#F59E0B"
          label="Uptime"
          subMetrics={[
            { label: 'Status',  value: health?.status  ?? 'Unknown' },
            { label: 'Project', value: health?.project ?? 'Sentinel-X' },
            { label: 'Models',  value: health?.models_ready ? 'Loaded' : 'Sim' },
            { label: 'Version', value: health?.version ?? '1.0.0' },
          ]}
        />
      </div>

      {/* Footer note */}
      <div className="bg-cobalt-50 dark:bg-cobalt-900/20 border border-cobalt-100 dark:border-cobalt-800/40 rounded-2xl p-4">
        <p className="text-xs text-cobalt-700 dark:text-cobalt-300 font-medium">
          <span className="font-semibold">Note:</span> Metrics shown are from the latest model evaluation run.
          SHAP explainability is applied per-inference in Live Diagnostics.
          Connect the FastAPI backend on <code className="bg-cobalt-100 dark:bg-cobalt-800/40 px-1 rounded">http://127.0.0.1:18000</code> to see live values.
        </p>
      </div>
    </motion.div>
  )
}
