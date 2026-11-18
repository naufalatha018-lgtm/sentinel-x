# Sentinel-X: Real-Time Industrial IoT Predictive Maintenance & Anomaly Detection System

[![Python Version](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.103%2B-009688.svg?logo=fastapi)](https://fastapi.tiangolo.com)
[![PyTorch](https://img.shields.io/badge/PyTorch-2.1%2B-EE4C2C.svg?logo=pytorch)](https://pytorch.org)
[![XGBoost](https://img.shields.io/badge/XGBoost-2.0%2B-185a9d.svg)](https://xgboost.ai)
[![Streamlit](https://img.shields.io/badge/Streamlit-1.28%2B-FF4B4B.svg?logo=streamlit)](https://streamlit.io)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

**Developer & Architect**: Paul Gallagher  
**Role**: Principal Machine Learning Engineer & Full-Stack AI Architect  
**System Title**: Sentinel-X Industrial AI Ecosystem

---

## 1. Executive Summary & Overview

**Sentinel-X** is an end-to-end, production-grade Machine Learning and Industrial IoT telemetry diagnostic system. It monitors high-consequence rotating machinery (centrifugal pumps, rotary screw compressors, CNC milling spindles, and hydraulic actuators) to identify developing mechanical, thermal, and electrical faults before catastrophic downtime occurs.

### Core Capabilities:
- **Synthetic Multi-Sensor Telemetry Engine**: Physics-informed degradation models using Weibull cumulative hazard wear trajectories, diurnal thermal-grid harmonics, and intermittent fault injections (cavitation, bearing spalling, cooling trips, seal ruptures).
- **Dual Unsupervised Anomaly Detection**:
  - **Isolation Forest**: High-dimensional tree partitioning for stochastic outlier detection.
  - **Deep Symmetric Autoencoder (PyTorch)**: Fully-connected neural bottleneck architecture scoring anomalies via reconstruction Mean Squared Error (MSE) against a calibrated nominal baseline threshold.
- **Remaining Useful Life (RUL) Prognostics**: Supervised gradient-boosted time-series regression with lag features, multi-scale rolling statistics, EWMA, and the NASA C-MAPSS PHM08 asymmetric loss metric.
- **Explainable AI (XAI)**: Native **SHAP (SHapley Additive exPlanations)** integration providing local marginal feature attributions for root-cause diagnostic transparency.
- **FastAPI Real-Time Gateway**: Async REST endpoints with strict Pydantic v2 validation, model performance telemetry, and full WebSocket bi-directional streaming support.
- **Streamlit Industrial Command Center**: Real-time diagnostic cockpit with interactive Plotly multi-sensor waveform monitors, anomaly alert journals, RUL countdown gauges, and interactive fault injection controls.

---

## 2. System Architecture

```text
                               +------------------------------------------+
                               |     Multi-Sensor Industrial Fleet        |
                               |  (Vibration, Temp, RPM, Pressure, Volt)  |
                               +--------------------+---------------------+
                                                    |
                                                    v
                               +--------------------+---------------------+
                               |   Telemetry Generator & Simulation       |
                               |  (Weibull Degradation + Fault Injections)|
                               +--------------------+---------------------+
                                                    |
                                                    v
                               +--------------------+---------------------+
                               |   Validation & Feature Engineering       |
                               |  (Lags, Rolling Stats, EWMA, Ratios)     |
                               +--------------------+---------------------+
                                                    |
                     +------------------------------+------------------------------+
                     |                                                             |
                     v                                                             v
+--------------------+---------------------+                 +---------------------+---------------------+
|   Unsupervised Anomaly Detection         |                 |    Supervised RUL Regression              |
|   - Scikit-Learn Isolation Forest        |                 |    - XGBoost / Gradient Boosted Trees     |
|   - PyTorch Deep Symmetric Autoencoder   |                 |    - NASA PHM08 Asymmetric Penalty Metric |
+--------------------+---------------------+                 +---------------------+---------------------+
                     |                                                             |
                     +------------------------------+------------------------------+
                                                    |
                                                    v
                               +--------------------+---------------------+
                               |   Explainable AI Engine (SHAP)           |
                               |   - TreeExplainer Root-Cause Attribution |
                               +--------------------+---------------------+
                                                    |
                                                    v
                               +--------------------+---------------------+
                               |   FastAPI High-Throughput Gateway        |
                               |   - Async REST (/predict, /stream, etc.) |
                               |   - WebSockets (/ws/telemetry)           |
                               +--------------------+---------------------+
                                                    |
                                                    v
                               +--------------------+---------------------+
                               |   Streamlit Command Center & Cockpit     |
                               |   - Live Plotly Telemetry Waveforms      |
                               |   - RUL Countdown Gauge & Alerts         |
                               +------------------------------------------+
```

---

## 3. Directory Layout

```text
sentinel-x/
├── configs/
│   └── config.yaml                 # Centralized system & model configuration
├── data/
│   ├── raw/                        # Raw simulated fleet telemetry
│   └── processed/                  # Engineered time-series feature datasets
├── models/
│   └── artifacts/                  # Serialized weights, scalers, and metric JSONs
├── src/
│   ├── __init__.py
│   ├── data/
│   │   ├── __init__.py
│   │   ├── generator.py            # Physics-based degradation & fault generator
│   │   └── preprocessing.py        # RobustScaler, schema validation, leak-free splits
│   ├── features/
│   │   ├── __init__.py
│   │   └── build_features.py       # Time-series lags, rolling PTP, EWMA, kinematic ratios
│   ├── models/
│   │   ├── __init__.py
│   │   ├── train.py                # Isolation Forest, PyTorch Autoencoder, XGBoost RUL
│   │   ├── evaluate.py             # ROC-AUC, PR-AUC, F1, RMSE, MAE, NASA PHM08 score
│   │   └── predict.py              # SentinelPredictor with SHAP explainability
│   ├── api/
│   │   ├── __init__.py
│   │   └── main.py                 # FastAPI service with REST & WebSockets
│   └── dashboard/
│       ├── __init__.py
│       └── app.py                  # Streamlit real-time diagnostic dashboard
├── frontend/                       # Modern Executive React UI (Vite, Tailwind, Recharts, Lucide)
│   ├── src/
│   │   ├── App.jsx                 # Dynamic Fleet Overview, Live Diagnostics, SHAP & AI Metrics
│   │   ├── main.jsx                # React root mount
│   │   └── index.css               # Glassmorphic dark theme and custom animations
│   ├── package.json                # Dependencies: React 18, Vite 6, Lucide, Recharts
│   └── vite.config.js              # Local dev server and API proxy
├── tests/
│   ├── __init__.py
│   └── test_pipeline.py            # Automated Pytest suite across all subsystems
├── Dockerfile                      # Containerization definition
├── docker-compose.yml              # Multi-container orchestration (API + Dashboard)
├── requirements.txt                # Pinned production dependencies
├── Makefile                        # CLI shortcut commands
├── run_pipeline.py                 # Master ML pipeline orchestrator
└── README.md                       # System documentation
```

---

## 4. Mathematical & Domain Foundations

### 4.1 Weibull Equipment Degradation
Physical wear follows a non-linear cumulative hazard progression:
$$W(t) = \frac{1 - \exp\left(-\left(\frac{t}{L}\cdot 1.5\right)^k\right)}{1 - \exp\left(-(1.5)^k\right)}$$
where $L$ is the nominal lifespan, $k$ is the shape parameter ($k > 1$ represents progressive aging wearout), and $W(t) \in [0, 1]$ modulates sensor baseline drift.

### 4.2 Autoencoder Anomaly Scoring
The neural autoencoder maps continuous sensor features $x \in \mathbb{R}^D$ into a low-dimensional bottleneck $z \in \mathbb{R}^d$ ($d \ll D$) and reconstructs $\hat{x} \in \mathbb{R}^D$.
The anomaly score is the normalized Mean Squared Reconstruction Error:
$$\mathcal{L}_{recon}(x) = \frac{1}{D} \sum_{j=1}^D (x_j - \hat{x}_j)^2$$
Points where $\mathcal{L}_{recon}(x) > \tau_{95}$ (95th percentile of validation normal samples) trigger an anomaly alert.

### 4.3 NASA C-MAPSS PHM08 Asymmetric Penalty Score
In industrial maintenance, underestimating RUL ($\hat{y} < y$) triggers early inspection, whereas overestimating RUL ($\hat{y} > y$) risks catastrophic in-service breakdown. The asymmetric scoring function enforces this discipline:
$$d_i = \hat{y}_i - y_i$$
$$S = \sum_{i=1}^N s_i, \quad s_i = \begin{cases} \exp\left(-\frac{d_i}{13}\right) - 1 & \text{if } d_i < 0 \text{ (conservative)} \\ \exp\left(\frac{d_i}{10}\right) - 1 & \text{if } d_i \ge 0 \text{ (late / catastrophic risk)} \end{cases}$$

### 4.4 Local SHAP Explanations
For any prediction $\hat{y} = f(x)$, SHAP attributes additive credit $\phi_j$ to each feature $j$:
$$f(x) = \phi_0 + \sum_{j=1}^M \phi_j$$
Negative $\phi_j$ indicates features accelerating equipment wear (reducing RUL), while positive $\phi_j$ indicates safe nominal conditions.

---

## 5. Quickstart Guide

### 5.1 Environment Setup
```bash
# Clone and enter workspace
git clone <repository_url> sentinel-x
cd sentinel-x

# Create and activate virtual environment
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

### 5.2 Execute ML Training Pipeline
Run the autonomous end-to-end pipeline to generate synthetic data, train the models, benchmark metrics, and serialize all artifacts:
```bash
python run_pipeline.py
```

### 5.3 Quickstart Launcher (Windows 1-Click)
Double-click `start_app.bat` or run in terminal:
```cmd
start_app.bat
```
This automatically verifies artifacts, starts the FastAPI gateway on port 18000, launches the modern React frontend on port 5175, and opens `http://localhost:5175` in your default browser.

### 5.4 Launch React Frontend Manually
```bash
cd frontend
npm install
npm run dev -- --port 5175
```
Modern executive UI is available at: `http://localhost:5175`

### 5.5 Launch FastAPI Backend Manually
```bash
python -m uvicorn src.api.main:app --host 127.0.0.1 --port 18000 --reload
```
- Interactive Swagger documentation: `http://127.0.0.1:18000/docs`  
- ReDoc documentation: `http://127.0.0.1:18000/redoc`  
- Root health gateway: `http://127.0.0.1:18000/`

### 5.6 Launch Streamlit Command Center Manually (Alternative UI)
```bash
streamlit run src/dashboard/app.py --server.port 8501
```
Access the Streamlit cockpit at: `http://localhost:8501`

### 5.7 Run Automated Test Suite
```bash
pytest tests/ -v
```

---

## 6. Docker & Container Deployment

To launch the full microservice ecosystem (FastAPI backend + Streamlit dashboard) with Docker Compose:
```bash
docker-compose up --build -d
```
- **FastAPI Gateway**: `http://localhost:8000`
- **Streamlit Command Center**: `http://localhost:8501`
- Stop containers: `docker-compose down`

---

## 7. REST & WebSocket API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | System health check, uptime, and loaded model diagnostics |
| `GET` | `/model-metrics` | Offline benchmark scores (ROC-AUC, F1, RMSE, PHM08 penalty) |
| `POST` | `/predict` | Real-time prediction endpoint with Pydantic validation & SHAP values |
| `GET` | `/stream-telemetry` | Generates next telemetry step with ML diagnosis & fault injection |
| `GET` | `/fleet-status` | Overview of all industrial machines across the fleet |
| `WS` | `/ws/telemetry` | Real-time bi-directional streaming WebSocket push feed |

---

## 8. Verification & Quality Assurance

All core components are strictly validated:
1. **Zero Data Leakage**: Fleet train/test split separates distinct machine IDs rather than random row shuffling.
2. **Robust Degradation**: Machine physics curves smoothly transition from nominal operation to terminal wear states.
3. **Resilient Fallbacks**: If PyTorch or XGBoost are in non-GPU or lightweight containers, the architecture automatically falls back to Scikit-Learn without crashing.
4. **Structured Logging**: Loguru provides granular traceability across every training and inference step.

---
*Developed for Paul Gallagher | Principal Machine Learning Engineer*
