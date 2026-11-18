/**
 * Sentinel-X API Client
 * Resilient API client pointing to FastAPI at http://127.0.0.1:18000
 * Falls back to plausible simulation data when backend is offline.
 */

const BASE = 'http://127.0.0.1:18000'
const TIMEOUT_MS = 4000

// ─── Helpers ────────────────────────────────────────────────────────────────

function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id))
}

async function safeGet(path) {
  try {
    const res = await fetchWithTimeout(`${BASE}${path}`)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

// ─── Simulation Fallbacks ────────────────────────────────────────────────────

function simFleet() {
  const types = [
    'Centrifugal Pump', 'Rotary Screw Compressor',
    'CNC Milling Spindle', 'Hydraulic Actuator',
  ]
  const modes = [
    'bearing_wear', 'thermal_runaway',
    'pressure_seal_leakage', 'electrical_harmonic_fault',
  ]
  return Array.from({ length: 8 }, (_, i) => {
    const rul = 1250 + Math.round(Math.random() * 300)
    return {
      machine_id: `MCH-00${i + 1}`,
      machine_type: types[i % types.length],
      degradation_mode: modes[i % modes.length],
      current_cycle: 35 + i * 2,
      health_index: 95 + Math.random() * 5,
      vibration: 1.8 + Math.random() * 0.8,
      temperature: 60 + Math.random() * 5,
      rpm: 1750 + Math.round(Math.random() * 100),
      pressure: 5.2 + Math.random() * 0.4,
      voltage: 395 + Math.random() * 15,
      predicted_rul: rul,
      health_status: rul > 800 ? 'HEALTHY' : rul > 400 ? 'WARNING' : 'CRITICAL',
      urgency_level: 'LOW - Routine Inspection',
      anomaly_score: 0.10 + Math.random() * 0.08,
      is_anomaly: false,
    }
  })
}

function simTelemetry(machineId, inject) {
  const vib  = inject ? 5.8 + Math.random() * 1.5 : 1.8 + Math.random() * 0.8
  const temp = inject ? 85 + Math.random() * 10   : 60 + Math.random() * 5
  const rpm  = 1750 + Math.round(Math.random() * 100)
  const rul  = inject ? 300 + Math.round(Math.random() * 100) : 1300 + Math.round(Math.random() * 200)
  const anomScore = inject ? 0.72 + Math.random() * 0.2 : 0.08 + Math.random() * 0.08

  return {
    telemetry: {
      machine_id: machineId,
      cycle: 35,
      vibration: vib,
      temperature: temp,
      rpm,
      pressure: 5.2 + Math.random() * 0.4,
      voltage: 400 + Math.random() * 10,
      is_anomaly: inject,
    },
    inference: {
      anomaly_detection: { anomaly_score: anomScore, is_anomaly: inject || anomScore > 0.5 },
      rul_prediction: { predicted_rul: rul },
      explainability: [
        { feature: 'vibration_rolling_max_15', shap_value: -0.42, direction: 'decreases_rul' },
        { feature: 'temperature_mean_30',       shap_value: -0.28, direction: 'decreases_rul' },
        { feature: 'pressure_ptp_5',            shap_value: -0.16, direction: 'decreases_rul' },
        { feature: 'voltage_stability_ewma',    shap_value:  0.11, direction: 'increases_rul' },
        { feature: 'rpm_kinematic_ratio',       shap_value:  0.05, direction: 'increases_rul' },
      ],
    },
  }
}

function simHealth() {
  return {
    status: 'OPERATIONAL (simulated)',
    project: 'Sentinel-X',
    version: '1.0.0',
    uptime_seconds: 0,
    models_ready: false,
    available_detectors: ['Isolation Forest', 'PyTorch Autoencoder'],
    timestamp: new Date().toISOString(),
    simulated: true,
  }
}

function simMetrics() {
  return {
    anomaly_detection: {
      isolation_forest: { roc_auc: 0.9796, precision: 0.8990, recall: 0.7768, f1_score: 0.8335 },
      autoencoder:      { roc_auc: 0.8341, threshold: 0.6723 },
    },
    rul_prediction: { rmse: 64.79, mae: 50.62, r2_score: 0.9774, phm08_score: 1524.2 },
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchHealth()     { return (await safeGet('/health'))        ?? simHealth() }
export async function fetchMetrics()    { return (await safeGet('/model-metrics')) ?? simMetrics() }
export async function fetchFleet()      {
  const d = await safeGet('/fleet-status')
  return d?.fleet ?? simFleet()
}
export async function fetchTelemetry(machineId, inject) {
  const d = await safeGet(`/stream-telemetry?machine_id=${machineId}&inject_anomaly=${inject}`)
  return d ?? simTelemetry(machineId, inject)
}
export function isSimulated(data) { return !!data?.simulated }
