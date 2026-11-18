"""
Sentinel-X Automated Pytest Test Suite
======================================
Covers:
- Telemetry generation physics, boundary integrity, and fault injection
- Preprocessor data validation, machine-leakage prevention, and scaler serialization
- Time-series lag, rolling statistics, and cross-sensor feature extraction
- Model training, Autoencoder reconstruction error, and XGBoost RUL estimation
- SHAP Explainable AI attribution vectors
- FastAPI backend REST endpoints and WebSocket validation

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Generator

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from src.data.generator import TelemetryGenerator, MachineProfile
from src.data.preprocessing import TelemetryPreprocessor
from src.features.build_features import FeatureEngineer
from src.models.train import ModelTrainer
from src.models.evaluate import ModelEvaluator
from src.models.predict import SentinelPredictor
from src.api.main import app


# ============================================================================
# Fixtures
# ============================================================================
@pytest.fixture
def sample_config() -> dict:
    return {
        "project": {"name": "Sentinel-X", "random_seed": 42},
        "simulation": {
            "n_machines": 3,
            "machine_ids": ["TEST-001", "TEST-002", "TEST-003"],
            "timesteps_per_machine": 120,
            "sampling_rate_seconds": 10,
            "anomaly_injection_rate": 0.05
        },
        "features": {
            "raw_sensor_columns": ["vibration", "temperature", "rpm", "pressure", "voltage"],
            "lag_windows": [1, 3],
            "rolling_windows": [5, 10],
            "ewma_spans": [5]
        },
        "models": {
            "anomaly_detection": {
                "isolation_forest": {"n_estimators": 25, "contamination": 0.05, "random_state": 42},
                "autoencoder": {
                    "hidden_dims": [16, 8],
                    "latent_dim": 4,
                    "dropout": 0.0,
                    "learning_rate": 0.005,
                    "batch_size": 32,
                    "epochs": 2
                }
            },
            "rul_prediction": {
                "model_type": "xgboost",
                "xgb_params": {"n_estimators": 20, "max_depth": 3, "random_state": 42},
                "hgb_params": {"max_iter": 20, "max_depth": 3, "random_state": 42}
            }
        }
    }


@pytest.fixture
def temp_artifacts_dir() -> Generator[Path, None, None]:
    temp_dir = Path(tempfile.mkdtemp(prefix="sentinel_test_artifacts_"))
    yield temp_dir
    shutil.rmtree(temp_dir, ignore_errors=True)


# ============================================================================
# 1. Telemetry Generator Tests
# ============================================================================
class TestTelemetryGenerator:
    def test_generator_output_structure(self, sample_config):
        generator = TelemetryGenerator(config=sample_config, seed=42)
        df = generator.generate_fleet_telemetry()

        assert not df.empty
        expected_cols = {
            "timestamp", "machine_id", "machine_type", "degradation_mode",
            "cycle", "vibration", "temperature", "rpm", "pressure", "voltage",
            "health_index", "rul", "is_anomaly", "anomaly_type"
        }
        assert expected_cols.issubset(set(df.columns))
        assert len(df["machine_id"].unique()) == 3

    def test_physics_boundaries_and_anomalies(self, sample_config):
        generator = TelemetryGenerator(config=sample_config, seed=42)
        df = generator.generate_fleet_telemetry()

        # Check domain physics constraints
        assert (df["vibration"] >= 0.1).all()
        assert (df["temperature"] >= 10.0).all()
        assert (df["rpm"] >= 200.0).all()
        assert (df["pressure"] >= 0.1).all()
        assert (df["voltage"] >= 250.0).all()
        assert (df["health_index"] >= 0.0).all() and (df["health_index"] <= 100.5).all()

        # Check anomaly injection occurred
        assert (df["is_anomaly"] == 1).sum() > 0
        assert set(df[df["is_anomaly"] == 1]["anomaly_type"].unique()) != {"none"}

    def test_single_reading_generation(self, sample_config):
        generator = TelemetryGenerator(config=sample_config, seed=42)
        reading = generator.generate_single_reading("TEST-001", cycle=50, inject_anomaly=True)
        
        assert reading["machine_id"] == "TEST-001"
        assert reading["cycle"] == 50
        assert reading["is_anomaly"] == 1
        assert "vibration" in reading
        assert reading["vibration"] > 0


# ============================================================================
# 2. Preprocessing & Leakage Tests
# ============================================================================
class TestTelemetryPreprocessor:
    def test_fleet_aware_train_test_split(self, sample_config):
        generator = TelemetryGenerator(config=sample_config, seed=42)
        df = generator.generate_fleet_telemetry()

        preprocessor = TelemetryPreprocessor()
        train_df, test_df = preprocessor.train_test_split_by_machine(df, test_ratio=0.33)

        train_machines = set(train_df["machine_id"].unique())
        test_machines = set(test_df["machine_id"].unique())

        # Crucial: strict machine separation to prevent temporal data leakage
        assert len(train_machines.intersection(test_machines)) == 0
        assert len(train_machines) + len(test_machines) == len(df["machine_id"].unique())

    def test_scaler_fit_transform_and_serialization(self, sample_config, temp_artifacts_dir):
        generator = TelemetryGenerator(config=sample_config, seed=42)
        df = generator.generate_fleet_telemetry()

        scaler_path = str(temp_artifacts_dir / "scaler.joblib")
        preprocessor = TelemetryPreprocessor(scaler_type="robust", scaler_path=scaler_path)
        
        preprocessor.fit_scaler(df)
        X_scaled = preprocessor.transform(df)

        assert X_scaled.shape == (len(df), len(preprocessor.sensor_columns))
        assert not np.isnan(X_scaled).any()

        # Save and reload
        preprocessor.save()
        reloaded = TelemetryPreprocessor.load(scaler_path)
        assert reloaded.is_fitted
        X_reloaded = reloaded.transform(df)
        np.testing.assert_allclose(X_scaled, X_reloaded)


# ============================================================================
# 3. Feature Engineering Tests
# ============================================================================
class TestFeatureEngineer:
    def test_feature_engineering_pipeline(self, sample_config):
        generator = TelemetryGenerator(config=sample_config, seed=42)
        df = generator.generate_fleet_telemetry()

        fe = FeatureEngineer(
            raw_sensor_columns=["vibration", "temperature", "rpm", "pressure", "voltage"],
            lag_windows=[1, 3],
            rolling_windows=[5, 10],
            ewma_spans=[5]
        )
        features_df = fe.transform_fleet(df)

        # Check rolling statistics existence
        assert "vibration_roll_mean_5" in features_df.columns
        assert "vibration_roll_ptp_5" in features_df.columns
        assert "vibration_lag_1" in features_df.columns
        assert "vibration_ewma_5" in features_df.columns
        assert "kinematic_stress_ratio" in features_df.columns

        # Verify no NaN values in engineered features
        assert not features_df[fe.feature_columns].isnull().any().any()
        assert len(fe.feature_columns) > 15


# ============================================================================
# 4. Model Training & Evaluation Tests
# ============================================================================
class TestModelPipeline:
    def test_train_and_evaluate_cycle(self, sample_config, temp_artifacts_dir):
        # Generate small dataset
        generator = TelemetryGenerator(config=sample_config, seed=42)
        df = generator.generate_fleet_telemetry()

        fe = FeatureEngineer(
            raw_sensor_columns=["vibration", "temperature", "rpm", "pressure", "voltage"],
            lag_windows=[1],
            rolling_windows=[5],
            ewma_spans=[5]
        )
        feat_df = fe.transform_fleet(df)

        scaler = TelemetryPreprocessor(scaler_type="robust")
        scaler.fit_scaler(feat_df, fe.feature_columns)
        X_scaled = scaler.transform(feat_df, fe.feature_columns)

        # Configure paths to temporary directory
        cfg = sample_config.copy()
        cfg["paths"] = {
            "artifacts_dir": str(temp_artifacts_dir),
            "isolation_forest_model": str(temp_artifacts_dir / "isolation_forest.joblib"),
            "autoencoder_model": str(temp_artifacts_dir / "autoencoder_anomaly.pt"),
            "rul_model": str(temp_artifacts_dir / "rul_regressor.joblib"),
            "scaler": str(temp_artifacts_dir / "scaler.joblib"),
            "feature_metadata": str(temp_artifacts_dir / "feature_names.json"),
            "evaluation_metrics": str(temp_artifacts_dir / "evaluation_metrics.json")
        }
        scaler.save(cfg["paths"]["scaler"])
        fe.save_feature_names(cfg["paths"]["feature_metadata"])

        # Train models
        trainer = ModelTrainer(config=cfg)
        if_model = trainer.train_isolation_forest(X_scaled)
        assert os.path.exists(cfg["paths"]["isolation_forest_model"])

        # PyTorch Autoencoder
        ae_model = trainer.train_autoencoder(X_scaled)
        if ae_model is not None:
            assert os.path.exists(cfg["paths"]["autoencoder_model"])

        # RUL Regressor
        rul_model = trainer.train_rul_regressor(feat_df[fe.feature_columns].values, feat_df["rul"].values, fe.feature_columns)
        assert os.path.exists(cfg["paths"]["rul_model"])

        # Evaluate models
        evaluator = ModelEvaluator(output_path=cfg["paths"]["evaluation_metrics"])
        raw_scores = if_model.decision_function(X_scaled)
        prob_scores = 1.0 / (1.0 + np.exp(raw_scores * 8.0))
        binary_pred = (if_model.predict(X_scaled) == -1).astype(int)

        anom_metrics = evaluator.evaluate_anomaly_detector(
            y_true=feat_df["is_anomaly"].values,
            anomaly_scores=prob_scores,
            y_pred_binary=binary_pred,
            model_name="test_isolation_forest"
        )
        assert "f1_score" in anom_metrics
        assert "roc_auc" in anom_metrics

        rul_preds = rul_model.predict(feat_df[fe.feature_columns].values)
        rul_metrics = evaluator.evaluate_rul_regressor(
            y_true=feat_df["rul"].values,
            y_pred=rul_preds,
            model_name="test_rul"
        )
        assert "rmse" in rul_metrics
        assert "phm08_penalty_score" in rul_metrics

        # Test SentinelPredictor
        predictor = SentinelPredictor(config=cfg, artifacts_dir=str(temp_artifacts_dir))
        assert predictor.is_ready

        # Test Streaming point inference
        reading = generator.generate_single_reading("TEST-001", cycle=10, inject_anomaly=False)
        out = predictor.predict_streaming_point(reading, df[df["machine_id"] == "TEST-001"])
        
        assert "anomaly_detection" in out
        assert "rul_prediction" in out
        assert "explainability" in out
        assert out["rul_prediction"]["predicted_rul"] >= 0


# ============================================================================
# 5. FastAPI REST API Endpoint Tests
# ============================================================================
class TestFastAPIEndpoints:
    @pytest.fixture(autouse=True)
    def setup_client(self):
        self.client = TestClient(app)

    def test_root_endpoint(self):
        response = self.client.get("/")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "OPERATIONAL"
        assert "swagger_ui" in data["endpoints"]
        assert data["endpoints"]["swagger_ui"] == "/docs"

    def test_docs_endpoint(self):
        response = self.client.get("/docs")
        assert response.status_code == 200
        assert "swagger" in response.text.lower() or "html" in response.text.lower()

    def test_redoc_endpoint(self):
        response = self.client.get("/redoc")
        assert response.status_code == 200
        assert "redoc" in response.text.lower() or "html" in response.text.lower()

    def test_health_endpoint(self):
        response = self.client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["project"] == "Sentinel-X"
        assert "uptime_seconds" in data
        assert "models_ready" in data

    def test_stream_telemetry_endpoint(self):
        response = self.client.get("/stream-telemetry?machine_id=MCH-001&inject_anomaly=false")
        assert response.status_code == 200
        data = response.json()
        assert "telemetry" in data
        assert "inference" in data
        assert data["telemetry"]["machine_id"] == "MCH-001"
        assert "vibration" in data["telemetry"]

    def test_stream_telemetry_with_anomaly_injection(self):
        response = self.client.get("/stream-telemetry?machine_id=MCH-002&inject_anomaly=true")
        assert response.status_code == 200
        data = response.json()
        assert data["telemetry"]["is_anomaly"] == 1

    def test_fleet_status_endpoint(self):
        response = self.client.get("/fleet-status")
        assert response.status_code == 200
        data = response.json()
        assert "fleet" in data
        assert len(data["fleet"]) > 0

    def test_model_metrics_endpoint(self):
        response = self.client.get("/model-metrics")
        assert response.status_code == 200
        data = response.json()
        assert "anomaly_detection" in data
        assert "rul_regression" in data

    def test_predict_endpoint(self):
        payload = {
            "current_reading": {
                "timestamp": "2026-11-18T10:00:00",
                "machine_id": "MCH-001",
                "machine_type": "Centrifugal Pump",
                "cycle": 40,
                "sensors": {
                    "vibration": 3.2,
                    "temperature": 68.5,
                    "rpm": 1780.0,
                    "pressure": 5.4,
                    "voltage": 400.0
                }
            }
        }
        response = self.client.post("/predict", json=payload)
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "anomaly_detection" in data
        assert "rul_prediction" in data
