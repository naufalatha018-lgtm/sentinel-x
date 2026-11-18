"""
Sentinel-X FastAPI Inference Server & Real-Time Telemetry Gateway
================================================================
Endpoints:
- POST /predict: Production inference with SHAP explainability
- GET /stream-telemetry: Emits real-time synthetic multi-sensor telemetry with predictions
- GET /model-metrics: Evaluated offline model performance benchmarks
- GET /health: Service operational health, model readiness, and version
- GET /fleet-status: Current health summary of all machines in the industrial fleet
- WebSocket /ws/telemetry: Live streaming push feed for connected dashboards & clients

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import asyncio
import json
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

import numpy as np
import pandas as pd
import yaml
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

try:
    from loguru import logger
except ImportError:
    import logging
    logger = logging.getLogger("Sentinel-X-API")

from src.data.generator import TelemetryGenerator
from src.models.predict import SentinelPredictor


# ============================================================================
# Pydantic Schemas
# ============================================================================
class SensorReading(BaseModel):
    vibration: float = Field(..., ge=0.0, le=50.0, description="Vibration velocity in mm/s")
    temperature: float = Field(..., ge=-20.0, le=250.0, description="Bearing temperature in °C")
    rpm: float = Field(..., ge=0.0, le=8000.0, description="Shaft rotational speed in RPM")
    pressure: float = Field(..., ge=0.0, le=50.0, description="Line hydraulic/pneumatic pressure in bar")
    voltage: float = Field(..., ge=0.0, le=1000.0, description="3-phase supply voltage in V")


class TelemetryPoint(BaseModel):
    timestamp: Optional[str] = Field(default_factory=lambda: datetime.now().isoformat())
    machine_id: str = Field(..., json_schema_extra={"example": "MCH-001"})
    machine_type: Optional[str] = Field("Centrifugal Pump", json_schema_extra={"example": "Centrifugal Pump"})
    cycle: Optional[int] = Field(1, ge=0)
    sensors: SensorReading


class PredictRequest(BaseModel):
    current_reading: TelemetryPoint
    historical_buffer: Optional[List[TelemetryPoint]] = Field(
        default=None,
        description="Optional list of recent telemetry points for rolling feature computation."
    )


class AnomalyResult(BaseModel):
    is_anomaly: bool
    anomaly_score: float = Field(..., ge=0.0, le=1.0)
    detector_used: str
    details: Dict[str, Any] = {}


class RulResult(BaseModel):
    predicted_rul: float
    health_status: str
    urgency_level: str


class FeatureExplanation(BaseModel):
    feature: str
    value: float
    shap_value: float
    impact: str


class PredictResponse(BaseModel):
    success: bool
    timestamp: str
    machine_id: str
    sensors: Dict[str, float]
    anomaly_detection: AnomalyResult
    rul_prediction: RulResult
    explainability: List[FeatureExplanation]


class HealthResponse(BaseModel):
    status: str
    project: str
    version: str
    uptime_seconds: float
    models_ready: bool
    available_detectors: List[str]
    timestamp: str


# ============================================================================
# Global State & Lazy Initializer
# ============================================================================
class ServiceState:
    config: Dict[str, Any] = {}
    predictor: Optional[SentinelPredictor] = None
    generator: Optional[TelemetryGenerator] = None
    start_time: float = time.time()
    # In-memory rolling history buffer for each machine (keeps last 60 readings)
    history_buffers: Dict[str, Deque[Dict[str, Any]]] = defaultdict(lambda: deque(maxlen=60))
    machine_cycles: Dict[str, int] = defaultdict(int)


state = ServiceState()


def ensure_initialized():
    """Guarantees state is loaded even if accessed outside async lifespan (e.g. tests)."""
    if state.generator is None or state.predictor is None:
        cfg_path = Path("configs/config.yaml")
        if cfg_path.exists():
            with open(cfg_path, "r", encoding="utf-8") as f:
                state.config = yaml.safe_load(f)
        state.generator = TelemetryGenerator(config=state.config)
        state.predictor = SentinelPredictor(config=state.config)

        for m in state.generator.machines:
            mid = m.machine_id
            if len(state.history_buffers[mid]) == 0:
                for c in range(35):
                    reading = state.generator.generate_single_reading(mid, cycle=c, inject_anomaly=False)
                    state.history_buffers[mid].append(reading)
                state.machine_cycles[mid] = 35


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes models and synthetic generator on server boot."""
    logger.info("Initializing Sentinel-X Industrial AI Gateway...")
    ensure_initialized()
    logger.info("Sentinel-X Backend Lifespan initialization complete.")
    yield
    logger.info("Shutting down Sentinel-X Backend Gateway...")


# ============================================================================
# FastAPI Application Declaration
# ============================================================================
app = FastAPI(
    title="Sentinel-X: Industrial IoT Predictive Maintenance API",
    description="Real-time predictive maintenance, unsupervised anomaly scoring, and SHAP root-cause diagnostic service.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# REST Endpoints
# ============================================================================
@app.get("/", tags=["General"])
async def root():
    """Root endpoint delivering welcome status and service links."""
    return {
        "message": "Welcome to Sentinel-X Real-Time Industrial IoT Predictive Maintenance API",
        "service": "Sentinel-X",
        "status": "OPERATIONAL",
        "version": "1.0.0",
        "endpoints": {
            "swagger_ui": "/docs",
            "redoc": "/redoc",
            "openapi_schema": "/openapi.json",
            "health": "/health",
            "predict": "/predict",
            "stream_telemetry": "/stream-telemetry",
            "fleet_status": "/fleet-status",
            "model_metrics": "/model-metrics",
            "websocket_telemetry": "/ws/telemetry"
        },
        "timestamp": datetime.now().isoformat()
    }


@app.get("/docs/", include_in_schema=False)
async def redirect_docs_trailing_slash():
    """Redirects /docs/ to /docs to prevent any 404 Not Found drops."""
    return RedirectResponse(url="/docs", status_code=307)


@app.get("/redoc/", include_in_schema=False)
async def redirect_redoc_trailing_slash():
    """Redirects /redoc/ to /redoc to prevent any 404 Not Found drops."""
    return RedirectResponse(url="/redoc", status_code=307)


@app.get("/health", response_model=HealthResponse, tags=["Diagnostics"])
async def get_health():
    """Returns system health, uptime, and loaded machine learning model status."""
    ensure_initialized()
    detectors = []
    if state.predictor and state.predictor.if_model is not None:
        detectors.append("Isolation Forest")
    if state.predictor and state.predictor.ae_model is not None:
        detectors.append("PyTorch Autoencoder")

    is_ready = bool(state.predictor and state.predictor.is_ready)
    return HealthResponse(
        status="OPERATIONAL" if is_ready else "DEGRADED (Models Unloaded)",
        project="Sentinel-X",
        version="1.0.0",
        uptime_seconds=round(time.time() - state.start_time, 2),
        models_ready=is_ready,
        available_detectors=detectors,
        timestamp=datetime.now().isoformat()
    )


@app.get("/model-metrics", tags=["Diagnostics"])
async def get_model_metrics():
    """Fetches benchmarked evaluation metrics (F1, ROC-AUC, RMSE, MAE, R2, PHM08 penalty)."""
    metrics_path = Path("models/artifacts/evaluation_metrics.json")
    if not metrics_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Model metrics not found. Run training pipeline first: python run_pipeline.py"
        )
    with open(metrics_path, "r", encoding="utf-8") as f:
        metrics = json.load(f)
    return metrics


@app.post("/predict", response_model=PredictResponse, tags=["Inference"])
async def predict_telemetry(payload: PredictRequest):
    """
    Submits an individual machine reading, extracts time-series features using
    historical context, and yields anomaly status, RUL countdown, and SHAP drivers.
    """
    ensure_initialized()
    if not state.predictor or not state.predictor.is_ready:
        raise HTTPException(status_code=503, detail="Predictive models are not yet loaded.")

    reading_dict = {
        "timestamp": payload.current_reading.timestamp,
        "machine_id": payload.current_reading.machine_id,
        "machine_type": payload.current_reading.machine_type,
        "cycle": payload.current_reading.cycle or 1,
        "vibration": payload.current_reading.sensors.vibration,
        "temperature": payload.current_reading.sensors.temperature,
        "rpm": payload.current_reading.sensors.rpm,
        "pressure": payload.current_reading.sensors.pressure,
        "voltage": payload.current_reading.sensors.voltage
    }

    # Build historical DataFrame
    mid = payload.current_reading.machine_id
    if payload.historical_buffer:
        hist_records = []
        for p in payload.historical_buffer:
            hist_records.append({
                "timestamp": p.timestamp,
                "machine_id": p.machine_id,
                "machine_type": p.machine_type,
                "cycle": p.cycle or 1,
                "vibration": p.sensors.vibration,
                "temperature": p.sensors.temperature,
                "rpm": p.sensors.rpm,
                "pressure": p.sensors.pressure,
                "voltage": p.sensors.voltage
            })
        history_df = pd.DataFrame(hist_records)
    else:
        # Fallback to server's rolling buffer
        buf = list(state.history_buffers[mid])
        if buf:
            history_df = pd.DataFrame(buf)
        else:
            history_df = pd.DataFrame([reading_dict])

    result = state.predictor.predict_streaming_point(reading_dict, history_df)
    
    # Store reading in rolling buffer
    state.history_buffers[mid].append(reading_dict)

    return PredictResponse(
        success=True,
        timestamp=result["timestamp"],
        machine_id=result["machine_id"],
        sensors=result["sensors"],
        anomaly_detection=AnomalyResult(**result["anomaly_detection"]),
        rul_prediction=RulResult(**result["rul_prediction"]),
        explainability=[FeatureExplanation(**exp) for exp in result["explainability"]]
    )


@app.get("/stream-telemetry", tags=["Simulation"])
async def stream_telemetry_point(
    machine_id: str = Query("MCH-001", description="ID of machine to simulate"),
    inject_anomaly: bool = Query(False, description="Whether to inject transient anomaly spike"),
    advance_cycle: bool = Query(True, description="Advance machine degradation cycle counter")
):
    """
    Generates the next synthetic multi-sensor telemetry step for a machine,
    executes real-time inference, and returns both raw telemetry and ML diagnosis.
    """
    ensure_initialized()
    if not state.generator:
        raise HTTPException(status_code=500, detail="Telemetry generator uninitialized.")

    if advance_cycle:
        state.machine_cycles[machine_id] += 1
    cycle = state.machine_cycles[machine_id]

    reading = state.generator.generate_single_reading(
        machine_id=machine_id,
        cycle=cycle,
        inject_anomaly=inject_anomaly
    )

    buf = list(state.history_buffers[machine_id])
    history_df = pd.DataFrame(buf) if buf else pd.DataFrame([reading])

    # Run inference if predictor is ready
    if state.predictor and state.predictor.is_ready:
        inference = state.predictor.predict_streaming_point(reading, history_df)
    else:
        inference = {
            "anomaly_detection": {"is_anomaly": False, "anomaly_score": 0.05, "detector_used": "mock"},
            "rul_prediction": {"predicted_rul": 950.0, "health_status": "HEALTHY", "urgency_level": "LOW"},
            "explainability": []
        }

    # Append to rolling history
    state.history_buffers[machine_id].append(reading)

    return {
        "telemetry": reading,
        "inference": inference
    }


@app.get("/fleet-status", tags=["Fleet Overview"])
async def get_fleet_status():
    """Returns high-level status for all active machines in the industrial fleet."""
    ensure_initialized()
    if not state.generator:
        raise HTTPException(status_code=500, detail="Telemetry generator uninitialized.")

    fleet_summary = []
    for m in state.generator.machines:
        mid = m.machine_id
        cycle = state.machine_cycles[mid]
        reading = state.generator.generate_single_reading(mid, cycle=cycle, inject_anomaly=False)
        
        buf = list(state.history_buffers[mid])
        history_df = pd.DataFrame(buf) if buf else pd.DataFrame([reading])
        
        if state.predictor and state.predictor.is_ready:
            inf = state.predictor.predict_streaming_point(reading, history_df)
            rul = inf["rul_prediction"]["predicted_rul"]
            health_status = inf["rul_prediction"]["health_status"]
            urgency = inf["rul_prediction"]["urgency_level"]
            anomaly_score = inf["anomaly_detection"]["anomaly_score"]
            is_anomaly = inf["anomaly_detection"]["is_anomaly"]
        else:
            rul = 1000 - cycle
            health_status = "HEALTHY"
            urgency = "LOW"
            anomaly_score = 0.02
            is_anomaly = False

        fleet_summary.append({
            "machine_id": mid,
            "machine_type": m.machine_type,
            "degradation_mode": m.degradation_mode,
            "current_cycle": cycle,
            "health_index": reading["health_index"],
            "vibration": reading["vibration"],
            "temperature": reading["temperature"],
            "rpm": reading["rpm"],
            "pressure": reading["pressure"],
            "voltage": reading["voltage"],
            "predicted_rul": rul,
            "health_status": health_status,
            "urgency_level": urgency,
            "anomaly_score": anomaly_score,
            "is_anomaly": is_anomaly
        })

    return {"fleet": fleet_summary, "timestamp": datetime.now().isoformat()}


# ============================================================================
# WebSocket Live Streaming
# ============================================================================
@app.websocket("/ws/telemetry")
async def websocket_telemetry_feed(websocket: WebSocket):
    """
    Continuous real-time telemetry WebSocket stream for dashboard monitoring.
    Pushes sensor readings + ML inferences every second.
    """
    ensure_initialized()
    await websocket.accept()
    logger.info("WebSocket telemetry client connected.")
    active_machine = "MCH-001"
    inject_next = False

    try:
        while True:
            # Check for non-blocking client messages
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=0.1)
                cmd = json.loads(data)
                if cmd.get("action") == "select_machine":
                    active_machine = cmd.get("machine_id", active_machine)
                    logger.info(f"WebSocket client switched focus to machine: {active_machine}")
                elif cmd.get("action") == "inject_anomaly":
                    inject_next = True
                    logger.info(f"Anomaly injected via WebSocket for: {active_machine}")
            except asyncio.TimeoutError:
                pass  # Normal heartbeat cadence

            state.machine_cycles[active_machine] += 1
            cycle = state.machine_cycles[active_machine]

            reading = state.generator.generate_single_reading(
                machine_id=active_machine,
                cycle=cycle,
                inject_anomaly=inject_next
            )
            inject_next = False  # Reset one-shot injection

            buf = list(state.history_buffers[active_machine])
            history_df = pd.DataFrame(buf) if buf else pd.DataFrame([reading])

            if state.predictor and state.predictor.is_ready:
                inference = state.predictor.predict_streaming_point(reading, history_df)
            else:
                inference = {
                    "anomaly_detection": {"is_anomaly": False, "anomaly_score": 0.04, "detector_used": "mock"},
                    "rul_prediction": {"predicted_rul": 900.0, "health_status": "HEALTHY", "urgency_level": "LOW"},
                    "explainability": []
                }

            state.history_buffers[active_machine].append(reading)

            packet = {
                "timestamp": reading["timestamp"],
                "machine_id": active_machine,
                "cycle": cycle,
                "sensors": {
                    "vibration": reading["vibration"],
                    "temperature": reading["temperature"],
                    "rpm": reading["rpm"],
                    "pressure": reading["pressure"],
                    "voltage": reading["voltage"],
                    "health_index": reading["health_index"]
                },
                "ground_truth_anomaly": reading["is_anomaly"],
                "anomaly_type": reading["anomaly_type"],
                "inference": inference
            }

            await websocket.send_text(json.dumps(packet))
            await asyncio.sleep(1.0)

    except WebSocketDisconnect:
        logger.info("WebSocket telemetry client disconnected.")
    except Exception as e:
        logger.error(f"WebSocket telemetry error: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.api.main:app", host="127.0.0.1", port=18000, reload=True)
