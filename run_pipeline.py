"""
Sentinel-X: End-to-End ML Pipeline Orchestrator
==============================================
Autonomous execution of the complete ML lifecycle:
1. Multi-sensor synthetic fleet data generation with degradation physics & anomaly bursts
2. Telemetry validation and leak-free machine fleet train/test split
3. Domain-informed time-series feature engineering (lags, rolling stats, EWMA, stress ratios)
4. Unsupervised anomaly model training (Isolation Forest & PyTorch Autoencoder)
5. Supervised Remaining Useful Life (RUL) regression training (XGBoost)
6. Model evaluation, NASA PHM08 asymmetric loss scoring, and metrics reporting
7. SHAP explainability verification & artifact serialization

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict

import joblib
import numpy as np
import pandas as pd
import yaml

try:
    from loguru import logger
except ImportError:
    import logging
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger = logging.getLogger("Sentinel-X-Pipeline")

# Local system imports
from src.data.generator import TelemetryGenerator
from src.data.preprocessing import TelemetryPreprocessor
from src.features.build_features import FeatureEngineer
from src.models.train import ModelTrainer
from src.models.evaluate import ModelEvaluator
from src.models.predict import SentinelPredictor


def load_config(config_path: str = "configs/config.yaml") -> Dict[str, Any]:
    """Loads configuration YAML file."""
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"Configuration file not found: {config_path}")
    with open(path, "r", encoding="utf-8") as f:
        cfg = yaml.safe_load(f)
    return cfg


def run_complete_pipeline(config_path: str = "configs/config.yaml") -> Dict[str, Any]:
    """Executes the complete machine learning lifecycle from raw telemetry to deployment artifacts."""
    start_total_time = time.time()
    logger.info("=" * 80)
    logger.info("SENTINEL-X: STARTING COMPLETE ML TRAINING & EVALUATION PIPELINE")
    logger.info("Author: Paul Gallagher | Architecture: Principal ML Engineer")
    logger.info("=" * 80)

    # 0. Load Configuration
    cfg = load_config(config_path)
    paths = cfg.get("paths", {})
    raw_dir = Path(paths.get("raw_data_dir", "data/raw"))
    proc_dir = Path(paths.get("processed_data_dir", "data/processed"))
    art_dir = Path(paths.get("artifacts_dir", "models/artifacts"))
    
    raw_dir.mkdir(parents=True, exist_ok=True)
    proc_dir.mkdir(parents=True, exist_ok=True)
    art_dir.mkdir(parents=True, exist_ok=True)

    # 1. Telemetry Generation & Simulation
    logger.info("\n[STAGE 1/6] Generating Fleet Sensor Telemetry...")
    generator = TelemetryGenerator(config=cfg, seed=cfg.get("project", {}).get("random_seed", 42))
    fleet_df = generator.generate_fleet_telemetry()
    
    raw_telemetry_path = paths.get("raw_telemetry_file", "data/raw/telemetry_raw.csv")
    fleet_df.to_csv(raw_telemetry_path, index=False)
    logger.info(
        f"Generated {len(fleet_df):,} telemetry readings across {len(generator.machines)} machines. "
        f"Saved to: {raw_telemetry_path}"
    )

    # 2. Validation & Machine-Aware Train/Test Split
    logger.info("\n[STAGE 2/6] Validating Data & Splitting Fleet without Leakage...")
    preprocessor = TelemetryPreprocessor(
        sensor_columns=cfg.get("features", {}).get("raw_sensor_columns"),
        scaler_type="robust",
        scaler_path=paths.get("scaler", "models/artifacts/scaler.joblib")
    )
    validated_df = preprocessor.validate_dataframe(fleet_df)

    train_df, test_df = preprocessor.train_test_split_by_machine(
        validated_df,
        test_ratio=0.25,
        random_seed=42
    )
    logger.info(
        f"Train fleet size: {len(train_df):,} samples ({train_df['machine_id'].nunique()} machines) | "
        f"Test fleet size: {len(test_df):,} samples ({test_df['machine_id'].nunique()} machines)"
    )

    # 3. Domain-Informed Time-Series Feature Engineering
    logger.info("\n[STAGE 3/6] Engineering Time-Series Features (Lags, Rolling Stats, EWMA, Ratios)...")
    fe = FeatureEngineer(
        raw_sensor_columns=cfg.get("features", {}).get("raw_sensor_columns"),
        lag_windows=cfg.get("features", {}).get("lag_windows"),
        rolling_windows=cfg.get("features", {}).get("rolling_windows"),
        ewma_spans=cfg.get("features", {}).get("ewma_spans")
    )
    
    train_features_df = fe.transform_fleet(train_df)
    test_features_df = fe.transform_fleet(test_df)
    
    # Save feature metadata
    feat_names_path = paths.get("feature_metadata", "models/artifacts/feature_names.json")
    fe.save_feature_names(feat_names_path)
    logger.info(f"Engineered {len(fe.feature_columns)} features. Column names saved to: {feat_names_path}")

    # Fit Scaler on training features (normal operating data preferred)
    preprocessor.fit_scaler(train_features_df, fe.feature_columns)
    preprocessor.save()
    logger.info(f"RobustScaler fitted and saved to: {preprocessor.scaler_path}")

    # Scale feature matrices
    X_train_scaled = preprocessor.transform(train_features_df, fe.feature_columns)
    X_test_scaled = preprocessor.transform(test_features_df, fe.feature_columns)

    X_train_raw = train_features_df[fe.feature_columns].values
    X_test_raw = test_features_df[fe.feature_columns].values

    y_train_rul = train_features_df["rul"].values
    y_test_rul = test_features_df["rul"].values

    y_train_anom = train_features_df["is_anomaly"].values
    y_test_anom = test_features_df["is_anomaly"].values

    # Save processed features table for diagnostics
    proc_csv = paths.get("processed_features_csv", "data/processed/features.csv")
    pd.concat([train_features_df, test_features_df], ignore_index=True).to_csv(proc_csv, index=False)
    logger.info(f"Processed dataset saved to: {proc_csv}")

    # 4. Model Training
    logger.info("\n[STAGE 4/6] Training Anomaly Detectors & RUL Regressors...")
    trainer = ModelTrainer(config=cfg)

    # 4a. Train Isolation Forest (strictly on normal training samples)
    normal_train_mask = (y_train_anom == 0)
    X_train_normal_scaled = X_train_scaled[normal_train_mask] if normal_train_mask.sum() > 50 else X_train_scaled
    
    if_model = trainer.train_isolation_forest(X_train_normal_scaled)

    # 4b. Train PyTorch Autoencoder
    ae_model = trainer.train_autoencoder(X_train_normal_scaled)

    # 4c. Train RUL Regressor (XGBoost / HistGradientBoosting)
    rul_model = trainer.train_rul_regressor(X_train_raw, y_train_rul, feature_names=fe.feature_columns)

    # 5. Comprehensive Model Evaluation & Diagnostic Benchmarks
    logger.info("\n[STAGE 5/6] Benchmarking Models on Unseen Test Fleet Machines...")
    evaluator = ModelEvaluator(output_path=paths.get("evaluation_metrics", "models/artifacts/evaluation_metrics.json"))
    
    # 5a. Evaluate Isolation Forest
    if_raw_scores = if_model.decision_function(X_test_scaled)
    if_anom_prob = 1.0 / (1.0 + np.exp(if_raw_scores * 8.0))
    if_binary_pred = (if_model.predict(X_test_scaled) == -1).astype(int)
    
    if_metrics = evaluator.evaluate_anomaly_detector(
        y_true=y_test_anom,
        anomaly_scores=if_anom_prob,
        y_pred_binary=if_binary_pred,
        model_name="isolation_forest"
    )

    # 5b. Evaluate PyTorch Autoencoder (if trained)
    ae_metrics = None
    if ae_model is not None:
        try:
            import torch
            with torch.no_grad():
                test_tensor = torch.tensor(X_test_scaled, dtype=torch.float32)
                recon = ae_model(test_tensor).cpu().numpy()
                recon_errors = np.mean((X_test_scaled - recon) ** 2, axis=1)
            
            checkpoint = torch.load(paths.get("autoencoder_model"), map_location="cpu", weights_only=False)
            ae_threshold = checkpoint.get("threshold", float(np.percentile(recon_errors, 95.0)))
            ae_binary_pred = (recon_errors > ae_threshold).astype(int)
            norm_recon_scores = np.clip(recon_errors / (ae_threshold * 1.5 + 1e-6), 0.0, 1.0)
            
            ae_metrics = evaluator.evaluate_anomaly_detector(
                y_true=y_test_anom,
                anomaly_scores=norm_recon_scores,
                y_pred_binary=ae_binary_pred,
                model_name="pytorch_autoencoder"
            )
        except Exception as e:
            logger.warning(f"Error evaluating Autoencoder: {e}")

    # 5c. Evaluate RUL Regressor
    rul_preds = rul_model.predict(X_test_raw)
    rul_metrics = evaluator.evaluate_rul_regressor(
        y_true=y_test_rul,
        y_pred=rul_preds,
        model_name="rul_xgboost_regressor"
    )

    # Consolidate evaluation JSON
    benchmark_payload = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "pipeline_version": "1.0.0",
        "anomaly_detection": {
            "isolation_forest": if_metrics,
            "pytorch_autoencoder": ae_metrics or {"status": "trained_not_benchmarked"}
        },
        "rul_regression": rul_metrics,
        "dataset_summary": {
            "total_samples": len(fleet_df),
            "feature_count": len(fe.feature_columns),
            "train_machines": list(train_df["machine_id"].unique()),
            "test_machines": list(test_df["machine_id"].unique())
        }
    }
    evaluator.save_metrics(benchmark_payload)

    # 6. End-to-End Inference & SHAP Verification
    logger.info("\n[STAGE 6/6] Verifying Live Inference & SHAP Explainability Engine...")
    predictor = SentinelPredictor(config=cfg)
    
    # Test streaming point inference
    test_reading = generator.generate_single_reading("MCH-001", cycle=120, inject_anomaly=True)
    history_window = fleet_df[fleet_df["machine_id"] == "MCH-001"].tail(35)
    
    verification_output = predictor.predict_streaming_point(test_reading, history_window)
    logger.info(f"Verification Prediction on Injected Fault:")
    logger.info(f"  Anomaly Detected: {verification_output['anomaly_detection']['is_anomaly']} (Score: {verification_output['anomaly_detection']['anomaly_score']})")
    logger.info(f"  Predicted RUL: {verification_output['rul_prediction']['predicted_rul']} cycles ({verification_output['rul_prediction']['urgency_level']})")
    logger.info(f"  Top SHAP Feature Attributions:")
    for exp in verification_output["explainability"][:3]:
        logger.info(f"    • {exp['feature']} = {exp['value']} -> Impact: {exp['shap_value']} ({exp['impact']})")

    elapsed = time.time() - start_total_time
    logger.info("\n" + "=" * 80)
    logger.info(f"SENTINEL-X PIPELINE COMPLETED SUCCESSFULLY IN {elapsed:.2f}s")
    logger.info("Ready for FastAPI deployment and Streamlit Command Center visualization.")
    logger.info("=" * 80)
    
    return benchmark_payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Sentinel-X ML Pipeline Orchestrator")
    parser.add_argument("--config", default="configs/config.yaml", help="Path to config YAML file")
    args = parser.parse_args()
    
    run_complete_pipeline(config_path=args.config)
