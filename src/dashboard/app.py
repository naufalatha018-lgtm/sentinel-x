"""
Sentinel-X: Interactive Industrial IoT Command Center & Diagnostic Cockpit
==========================================================================
Streamlit Real-Time Dashboard featuring:
- Real-time Multi-Sensor Telemetry Waveforms (Plotly)
- Anomaly Detection Alert Logs & Severity Badges
- Remaining Useful Life (RUL) Countdown Gauge & Degradation Curves
- SHAP Local Feature Attribution Visualizations
- Interactive Anomaly Injection & Fleet Simulation Controls

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from plotly.subplots import make_subplots
import requests
import streamlit as st
import yaml

# Local system imports for direct in-memory fallback
from src.data.generator import TelemetryGenerator
from src.models.predict import SentinelPredictor


# ============================================================================
# Page Configuration & Styling
# ============================================================================
st.set_page_config(
    page_title="Sentinel-X | Industrial IoT Command Center",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

CUSTOM_CSS = """
<style>
    /* Metric styling */
    [data-testid="stMetricValue"] {
        font-size: 1.8rem !important;
        font-weight: 700 !important;
    }
    .status-badge-healthy {
        background-color: #0e4429;
        color: #3fb950;
        padding: 4px 12px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 0.85rem;
        display: inline-block;
    }
    .status-badge-warning {
        background-color: #5a3e00;
        color: #d29922;
        padding: 4px 12px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 0.85rem;
        display: inline-block;
    }
    .status-badge-critical {
        background-color: #5c141a;
        color: #f85149;
        padding: 4px 12px;
        border-radius: 12px;
        font-weight: 600;
        font-size: 0.85rem;
        display: inline-block;
    }
</style>
"""
st.markdown(CUSTOM_CSS, unsafe_allow_html=True)


# ============================================================================
# Session State Initialization
# ============================================================================
@st.cache_resource
def load_system_components():
    """Initializes and caches models and generator."""
    cfg_path = Path("configs/config.yaml")
    cfg = {}
    if cfg_path.exists():
        with open(cfg_path, "r", encoding="utf-8") as f:
            cfg = yaml.safe_load(f)
    
    generator = TelemetryGenerator(config=cfg)
    predictor = SentinelPredictor(config=cfg)
    return cfg, generator, predictor


cfg, generator, predictor = load_system_components()

if "history" not in st.session_state:
    st.session_state.history = {}
    for m in generator.machines:
        # Pre-seed 30 points
        pts = []
        for c in range(30):
            p = generator.generate_single_reading(m.machine_id, cycle=c, inject_anomaly=False)
            pts.append(p)
        st.session_state.history[m.machine_id] = pts

if "cycle_counters" not in st.session_state:
    st.session_state.cycle_counters = {m.machine_id: 30 for m in generator.machines}

if "alert_log" not in st.session_state:
    st.session_state.alert_log = []

if "auto_stream" not in st.session_state:
    st.session_state.auto_stream = False


# ============================================================================
# API / Local Execution Helper
# ============================================================================
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:18000")


def fetch_or_compute_stream(machine_id: str, inject_anomaly: bool = False) -> Dict[str, Any]:
    """Attempts to fetch from live FastAPI server, falling back to local predictor."""
    try:
        url = f"{API_BASE_URL}/stream-telemetry?machine_id={machine_id}&inject_anomaly={str(inject_anomaly).lower()}"
        resp = requests.get(url, timeout=0.8)
        if resp.status_code == 200:
            return resp.json()
    except Exception:
        pass  # API offline; use in-memory engine seamlessly

    # Fallback to local execution
    st.session_state.cycle_counters[machine_id] += 1
    cycle = st.session_state.cycle_counters[machine_id]
    reading = generator.generate_single_reading(machine_id, cycle=cycle, inject_anomaly=inject_anomaly)
    
    history_list = st.session_state.history[machine_id]
    hist_df = pd.DataFrame(history_list)
    
    if predictor.is_ready:
        inference = predictor.predict_streaming_point(reading, hist_df)
    else:
        inference = {
            "anomaly_detection": {"is_anomaly": reading["is_anomaly"] == 1, "anomaly_score": 0.05, "detector_used": "Baseline"},
            "rul_prediction": {"predicted_rul": float(reading["rul"]), "health_status": "HEALTHY", "urgency_level": "LOW"},
            "explainability": []
        }

    st.session_state.history[machine_id].append(reading)
    if len(st.session_state.history[machine_id]) > 80:
        st.session_state.history[machine_id].pop(0)

    return {"telemetry": reading, "inference": inference}


# ============================================================================
# Sidebar Controls
# ============================================================================
with st.sidebar:
    st.image("https://img.shields.io/badge/Sentinel--X-Industrial_IoT_AI-blue?style=for-the-badge&logo=shield", use_column_width=True)
    st.title("Command Settings")

    machine_options = [m.machine_id for m in generator.machines]
    selected_machine = st.selectbox("Select Target Machine", machine_options, index=0)
    
    profile = next(m for m in generator.machines if m.machine_id == selected_machine)
    st.info(f"**Unit Type:** {profile.machine_type}\n\n**Degradation:** {profile.degradation_mode.replace('_', ' ').title()}")

    st.markdown("---")
    st.subheader("Interactive Simulation")
    
    col_sim1, col_sim2 = st.columns(2)
    step_btn = col_sim1.button("▶ Step Telemetry", use_container_width=True)
    inject_btn = col_sim2.button("⚠️ Inject Fault", use_container_width=True)

    auto_toggle = st.toggle("Enable Live Auto-Stream", value=st.session_state.auto_stream)
    st.session_state.auto_stream = auto_toggle

    stream_cadence = st.slider("Stream Refresh Interval (s)", min_value=1.0, max_value=5.0, value=2.0, step=0.5)

    st.markdown("---")
    st.subheader("Model Status")
    if predictor.is_ready:
        st.success("🟢 ML Models Loaded & Armed")
        if predictor.if_model:
            st.caption("• Isolation Forest (Active)")
        if predictor.ae_model:
            st.caption("• PyTorch Autoencoder (Active)")
        if predictor.rul_model:
            st.caption("• RUL XGBoost Regressor (Active)")
        if predictor.shap_explainer:
            st.caption("• SHAP TreeExplainer (Armed)")
    else:
        st.warning("🟡 Models Not Found. Run: python run_pipeline.py")

    st.markdown("---")
    st.caption("Sentinel-X v1.0.0 | Developer: Paul Gallagher")


# ============================================================================
# Execution Trigger
# ============================================================================
latest_payload = None
if step_btn or inject_btn or st.session_state.auto_stream:
    latest_payload = fetch_or_compute_stream(selected_machine, inject_anomaly=inject_btn)
    
    # Check for anomaly event to log
    inf = latest_payload["inference"]
    tel = latest_payload["telemetry"]
    if inf["anomaly_detection"]["is_anomaly"]:
        st.session_state.alert_log.insert(0, {
            "Timestamp": tel.get("timestamp", datetime.now().strftime("%H:%M:%S")),
            "Machine ID": selected_machine,
            "Anomaly Score": inf["anomaly_detection"]["anomaly_score"],
            "RUL (Cycles)": inf["rul_prediction"]["predicted_rul"],
            "Fault Mode": tel.get("anomaly_type", "anomaly_burst"),
            "Vibration (mm/s)": tel["vibration"],
            "Temperature (°C)": tel["temperature"]
        })
else:
    # Use most recent reading
    hist = st.session_state.history[selected_machine]
    last_reading = hist[-1]
    hist_df = pd.DataFrame(hist)
    if predictor.is_ready:
        inf = predictor.predict_streaming_point(last_reading, hist_df)
    else:
        inf = {
            "anomaly_detection": {"is_anomaly": False, "anomaly_score": 0.05, "detector_used": "Baseline"},
            "rul_prediction": {"predicted_rul": float(last_reading["rul"]), "health_status": "HEALTHY", "urgency_level": "LOW"},
            "explainability": []
        }
    latest_payload = {"telemetry": last_reading, "inference": inf}


# ============================================================================
# Dashboard Main Layout
# ============================================================================
telemetry = latest_payload["telemetry"]
inference = latest_payload["inference"]
rul_info = inference["rul_prediction"]
anomaly_info = inference["anomaly_detection"]
explanations = inference.get("explainability", [])

st.title(f"🛡️ Sentinel-X: Machine Telemetry Command Center [{selected_machine}]")

# Top KPI Metric Row
kpi1, kpi2, kpi3, kpi4, kpi5 = st.columns(5)

# RUL Card
pred_rul = rul_info["predicted_rul"]
health_status = rul_info["health_status"]
if pred_rul > 500:
    badge = f"<span class='status-badge-healthy'>HEALTHY</span>"
elif pred_rul > 200:
    badge = f"<span class='status-badge-warning'>DEGRADING</span>"
else:
    badge = f"<span class='status-badge-critical'>CRITICAL WEAR</span>"

kpi1.markdown(f"**Remaining Useful Life**<br>{badge}", unsafe_allow_html=True)
kpi1.metric(label="RUL", value=f"{int(pred_rul)} cycles", delta=f"{int(pred_rul - 1000)} from nominal")

# Anomaly Risk Score
anom_score = anomaly_info["anomaly_score"]
is_anom = anomaly_info["is_anomaly"]
anom_badge = "<span class='status-badge-critical'>FAULT ALERT</span>" if is_anom else "<span class='status-badge-healthy'>NOMINAL</span>"

kpi2.markdown(f"**Anomaly Risk**<br>{anom_badge}", unsafe_allow_html=True)
kpi2.metric(label="Risk Score", value=f"{anom_score * 100:.1f}%", delta="ANOMALOUS" if is_anom else "NORMAL", delta_color="inverse" if is_anom else "normal")

# Machine Health Index
kpi3.metric(label="Equipment Health Index", value=f"{telemetry.get('health_index', 90.0):.1f}%", delta=f"Cycle {telemetry.get('cycle', 1)}")

# Vibration (Velo RMS)
vib = telemetry["vibration"]
kpi4.metric(label="Vibration RMS", value=f"{vib:.2f} mm/s", delta="Critical > 6.8" if vib > 6.8 else "Safe", delta_color="inverse" if vib > 6.8 else "normal")

# Temperature
temp = telemetry["temperature"]
kpi5.metric(label="Core Temp", value=f"{temp:.1f} °C", delta="Overheat > 90°C" if temp > 90 else "Safe", delta_color="inverse" if temp > 90 else "normal")

st.markdown("---")

# ============================================================================
# Tabs: Real-Time Charts, Explainable AI (SHAP), Alert Logs, Diagnostics
# ============================================================================
tab_telemetry, tab_xai, tab_alerts, tab_metrics = st.tabs([
    "📈 Live Telemetry Waveforms",
    "🧠 Explainable AI (SHAP)",
    "🚨 Anomaly Alert Logs",
    "📊 Model Benchmarks & Metrics"
])

# ----------------------------------------------------------------------------
# TAB 1: Live Telemetry Charts
# ----------------------------------------------------------------------------
with tab_telemetry:
    hist_df = pd.DataFrame(st.session_state.history[selected_machine])
    hist_df["cycle_idx"] = np.arange(len(hist_df))

    fig = make_subplots(
        rows=2, cols=3,
        subplot_titles=[
            "Vibration Velocity (mm/s)", "Bearing Temperature (°C)", "Rotational Speed (RPM)",
            "Hydraulic Pressure (bar)", "Supply Voltage (V)", "Health Index Degradation (%)"
        ],
        vertical_spacing=0.15,
        horizontal_spacing=0.08
    )

    # Vibration
    fig.add_trace(go.Scatter(x=hist_df["cycle_idx"], y=hist_df["vibration"], mode="lines+markers", name="Vibration", line=dict(color="#00f2fe", width=2)), row=1, col=1)
    fig.add_hline(y=6.8, line_dash="dash", line_color="red", annotation_text="Critical (6.8)", row=1, col=1)

    # Temperature
    fig.add_trace(go.Scatter(x=hist_df["cycle_idx"], y=hist_df["temperature"], mode="lines+markers", name="Temperature", line=dict(color="#ff6b6b", width=2)), row=1, col=2)
    fig.add_hline(y=92.0, line_dash="dash", line_color="red", annotation_text="Threshold (92°C)", row=1, col=2)

    # RPM
    fig.add_trace(go.Scatter(x=hist_df["cycle_idx"], y=hist_df["rpm"], mode="lines", name="RPM", line=dict(color="#feca57", width=2)), row=1, col=3)

    # Pressure
    fig.add_trace(go.Scatter(x=hist_df["cycle_idx"], y=hist_df["pressure"], mode="lines", name="Pressure", line=dict(color="#48dbfb", width=2)), row=2, col=1)

    # Voltage
    fig.add_trace(go.Scatter(x=hist_df["cycle_idx"], y=hist_df["voltage"], mode="lines", name="Voltage", line=dict(color="#ff9ff3", width=2)), row=2, col=2)

    # Health Index
    fig.add_trace(go.Scatter(x=hist_df["cycle_idx"], y=hist_df["health_index"], mode="lines", name="Health Index", fill="tozeroy", line=dict(color="#1dd1a1", width=2)), row=2, col=3)

    fig.update_layout(height=520, template="plotly_dark", margin=dict(l=20, r=20, t=40, b=20), showlegend=False)
    st.plotly_chart(fig, use_container_width=True)

# ----------------------------------------------------------------------------
# TAB 2: Explainable AI (SHAP)
# ----------------------------------------------------------------------------
with tab_xai:
    st.subheader("💡 Why is the machine predicted to fail? (SHAP Root-Cause Analysis)")
    st.markdown(
        "Local feature attributions generated via **SHAP (SHapley Additive exPlanations)**. "
        "Bars extending to the **left** (negative) accelerate degradation and reduce Remaining Useful Life, "
        "while bars extending to the **right** (positive) indicate operating variables within safe nominal boundaries."
    )

    if explanations:
        exp_df = pd.DataFrame(explanations)
        exp_df["direction"] = exp_df["shap_value"].apply(lambda v: "Decreases RUL (Accelerates Wear)" if v < 0 else "Extends RUL (Nominal)")
        
        # Plotly horizontal bar chart
        fig_shap = px.bar(
            exp_df,
            x="shap_value",
            y="feature",
            orientation="h",
            color="direction",
            color_discrete_map={
                "Decreases RUL (Accelerates Wear)": "#f85149",
                "Extends RUL (Nominal)": "#3fb950"
            },
            hover_data=["value", "impact"],
            title=f"SHAP Local Feature Importance Impact on RUL [{selected_machine}]"
        )
        fig_shap.update_layout(
            template="plotly_dark",
            yaxis=dict(autorange="reversed"),
            height=380,
            xaxis_title="SHAP Marginal Contribution to RUL (Cycles)"
        )
        st.plotly_chart(fig_shap, use_container_width=True)

        st.dataframe(
            exp_df.rename(columns={"feature": "Sensor Feature", "value": "Observed Value", "shap_value": "SHAP Impact (Δ Cycles)", "impact": "Clinical Interpretation"}),
            use_container_width=True
        )
    else:
        st.info("SHAP explanations are calculated when predictive models are loaded and armed.")

# ----------------------------------------------------------------------------
# TAB 3: Anomaly Alert Logs
# ----------------------------------------------------------------------------
with tab_alerts:
    st.subheader("🚨 Fleet Anomaly Event Journal")
    if st.session_state.alert_log:
        alerts_df = pd.DataFrame(st.session_state.alert_log)
        st.dataframe(alerts_df, use_container_width=True)
    else:
        st.success("No critical anomaly events detected yet. Fleet operating within nominal tolerances.")

# ----------------------------------------------------------------------------
# TAB 4: Model Benchmarks & Metrics
# ----------------------------------------------------------------------------
with tab_metrics:
    st.subheader("📊 Offline Validation & Benchmark Diagnostics")
    metrics_path = Path("models/artifacts/evaluation_metrics.json")
    if metrics_path.exists():
        with open(metrics_path, "r", encoding="utf-8") as f:
            benchmarks = json.load(f)
        
        c_anom, c_rul = st.columns(2)
        with c_anom:
            st.markdown("### 🎯 Anomaly Detection Performance")
            if "anomaly_detection" in benchmarks:
                for k, v in benchmarks["anomaly_detection"].items():
                    st.json({k: v})
        with c_rul:
            st.markdown("### ⏱️ RUL Regression Performance")
            if "rul_regression" in benchmarks:
                st.json(benchmarks["rul_regression"])
    else:
        st.warning("Benchmark metrics file not generated yet. Run: `python run_pipeline.py`")

# Auto-stream sleep & rerun
if st.session_state.auto_stream:
    time.sleep(stream_cadence)
    st.rerun()
