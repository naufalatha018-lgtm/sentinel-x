"""
Production Inference and Explainability Engine (XAI)
===================================================
Orchestrates:
- Multi-model inference: Isolation Forest & PyTorch Autoencoder (Reconstruction Error)
- Remaining Useful Life (RUL) regression predictions
- Explainable AI (XAI) via SHAP TreeExplainer & feature attribution vectors
- Low-latency single-point streaming inference with rolling buffer history

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import joblib
import numpy as np
import pandas as pd

try:
    from loguru import logger
except ImportError:
    import logging
    logger = logging.getLogger("Sentinel-X")

try:
    import shap
    HAS_SHAP = True
except ImportError:
    HAS_SHAP = False

try:
    import torch
    import torch.nn as nn
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False

from src.data.preprocessing import TelemetryPreprocessor
from src.features.build_features import FeatureEngineer


class SentinelPredictor:
    """
    Production-grade inference and diagnostic engine.
    Loads trained artifacts, evaluates unsupervised anomaly scores, predicts RUL,
    and calculates SHAP feature importance attributions for actionable root-cause analysis.
    """

    def __init__(
        self,
        config: Optional[Dict[str, Any]] = None,
        artifacts_dir: Optional[str] = None
    ):
        self.config = config or {}
        paths = self.config.get("paths", {})
        self.artifacts_dir = Path(artifacts_dir or paths.get("artifacts_dir", "models/artifacts"))

        self.if_model = None
        self.ae_model = None
        self.ae_threshold = 0.05
        self.rul_model = None
        self.preprocessor: Optional[TelemetryPreprocessor] = None
        self.feature_names: List[str] = []
        self.shap_explainer = None
        self.is_ready = False

        self._load_artifacts()

    def _load_artifacts(self) -> None:
        """Loads serialized models, scaler, feature metadata, and initializes SHAP explainer."""
        try:
            # 1. Feature names
            feat_path = self.artifacts_dir / "feature_names.json"
            if feat_path.exists():
                with open(feat_path, "r", encoding="utf-8") as f:
                    self.feature_names = json.load(f)
                logger.info(f"Loaded {len(self.feature_names)} feature column definitions.")

            # 2. Preprocessor / Scaler
            scaler_path = self.artifacts_dir / "scaler.joblib"
            if scaler_path.exists():
                self.preprocessor = TelemetryPreprocessor.load(str(scaler_path))
                logger.info("TelemetryPreprocessor & Scaler successfully loaded.")

            # 3. Isolation Forest
            if_path = self.artifacts_dir / "isolation_forest.joblib"
            if if_path.exists():
                self.if_model = joblib.load(if_path)
                logger.info("Isolation Forest model successfully loaded.")

            # 4. PyTorch Autoencoder
            ae_path = self.artifacts_dir / "autoencoder_anomaly.pt"
            if HAS_TORCH and ae_path.exists():
                from src.models.train import PyTorchAutoencoder
                checkpoint = torch.load(ae_path, map_location="cpu", weights_only=False)
                
                self.ae_threshold = checkpoint.get("threshold", 0.05)
                self.ae_model = PyTorchAutoencoder(
                    input_dim=checkpoint["input_dim"],
                    hidden_dims=checkpoint.get("hidden_dims", [64, 32, 16]),
                    latent_dim=checkpoint.get("latent_dim", 8),
                    dropout=checkpoint.get("dropout", 0.1)
                )
                self.ae_model.load_state_dict(checkpoint["model_state_dict"])
                self.ae_model.eval()
                logger.info(f"PyTorch Autoencoder loaded (reconstruction threshold: {self.ae_threshold:.6f}).")

            # 5. RUL Model
            rul_path = self.artifacts_dir / "rul_regressor.joblib"
            if rul_path.exists():
                payload = joblib.load(rul_path)
                if isinstance(payload, dict) and "model" in payload:
                    self.rul_model = payload["model"]
                else:
                    self.rul_model = payload
                logger.info("RUL Regressor successfully loaded.")

                # Initialize SHAP explainer if available
                if HAS_SHAP and self.rul_model is not None:
                    try:
                        self.shap_explainer = shap.TreeExplainer(self.rul_model)
                        logger.info("SHAP TreeExplainer initialized successfully.")
                    except Exception as e:
                        logger.warning(f"Could not initialize TreeExplainer, fallback to generic: {e}")
                        try:
                            self.shap_explainer = shap.Explainer(self.rul_model)
                        except Exception:
                            self.shap_explainer = None

            self.is_ready = (self.if_model is not None or self.rul_model is not None)
            if self.is_ready:
                logger.info("SentinelPredictor initialized and marked READY for inference.")
            else:
                logger.warning("SentinelPredictor artifacts not yet fully trained/found.")

        except Exception as e:
            logger.error(f"Error loading model artifacts: {e}")
            self.is_ready = False

    def predict_anomaly(self, X_scaled: np.ndarray) -> Dict[str, Any]:
        """
        Runs unsupervised anomaly detection using Isolation Forest and/or Autoencoder.
        Returns normalized anomaly risk score in [0.0, 1.0] and binary alert flag.
        """
        results: Dict[str, Any] = {
            "is_anomaly": False,
            "anomaly_score": 0.0,
            "detector_used": "none",
            "details": {}
        }

        # 1. Evaluate Isolation Forest
        if_score = 0.0
        if_pred = 0
        if self.if_model is not None:
            # decision_function gives negative score for outliers, positive for inliers
            raw_scores = self.if_model.decision_function(X_scaled)
            # Map score to [0, 1] anomaly probability: higher means more anomalous
            # Score typically in [-0.5, 0.5]
            if_scores = 1.0 / (1.0 + np.exp(raw_scores * 8.0))
            if_preds = self.if_model.predict(X_scaled)  # -1 for anomaly, 1 for normal
            
            if_score = float(np.mean(if_scores))
            if_pred = 1 if np.any(if_preds == -1) else 0
            results["details"]["isolation_forest"] = {
                "score": round(if_score, 4),
                "flag": bool(if_pred)
            }

        # 2. Evaluate Autoencoder Reconstruction Error
        ae_score = 0.0
        ae_pred = 0
        if HAS_TORCH and self.ae_model is not None:
            with torch.no_grad():
                tensor_x = torch.tensor(X_scaled, dtype=torch.float32)
                recon = self.ae_model(tensor_x).numpy()
                mse = np.mean((X_scaled - recon) ** 2, axis=1)
                
            recon_error = float(np.mean(mse))
            # Normalized score based on calibrated threshold
            ae_score = float(np.clip(recon_error / (self.ae_threshold * 1.5 + 1e-6), 0.0, 1.0))
            ae_pred = 1 if recon_error > self.ae_threshold else 0
            results["details"]["autoencoder"] = {
                "reconstruction_error": round(recon_error, 6),
                "threshold": round(self.ae_threshold, 6),
                "score": round(ae_score, 4),
                "flag": bool(ae_pred)
            }

        # Ensemble decision: union of detectors or highest score
        if self.ae_model is not None and self.if_model is not None:
            combined_score = 0.5 * if_score + 0.5 * ae_score
            is_anomaly = bool(if_pred == 1 or ae_pred == 1 or combined_score > 0.55)
            detector = "ensemble (IsolationForest + Autoencoder)"
        elif self.ae_model is not None:
            combined_score = ae_score
            is_anomaly = bool(ae_pred == 1)
            detector = "PyTorch Autoencoder"
        elif self.if_model is not None:
            combined_score = if_score
            is_anomaly = bool(if_pred == 1)
            detector = "Isolation Forest"
        else:
            combined_score = 0.0
            is_anomaly = False
            detector = "uninitialized"

        results["is_anomaly"] = is_anomaly
        results["anomaly_score"] = round(float(combined_score), 4)
        results["detector_used"] = detector
        return results

    def predict_rul(self, X: np.ndarray) -> Dict[str, Any]:
        """
        Predicts Remaining Useful Life (RUL) in cycles/steps and classifies urgency.
        """
        if self.rul_model is None:
            return {
                "predicted_rul": 1000.0,
                "health_status": "UNKNOWN",
                "urgency_level": "UNKNOWN"
            }

        preds = self.rul_model.predict(X)
        pred_rul = float(np.mean(np.maximum(0.0, preds)))

        # Categorize health condition and maintenance urgency
        if pred_rul > 800:
            status = "HEALTHY"
            urgency = "LOW - Routine Inspection"
        elif pred_rul > 400:
            status = "NOMINAL_DEGRADATION"
            urgency = "MEDIUM - Schedule Maintenance Soon"
        elif pred_rul > 150:
            status = "WARNING_CRITICAL_WEAR"
            urgency = "HIGH - Inspect Within Next Operational Shift"
        else:
            status = "IMMINENT_FAILURE"
            urgency = "CRITICAL - Immediate Emergency Shutdown Recommended"

        return {
            "predicted_rul": round(pred_rul, 1),
            "health_status": status,
            "urgency_level": urgency
        }

    def explain_prediction(
        self,
        X_df: pd.DataFrame,
        top_k: int = 6
    ) -> List[Dict[str, Any]]:
        """
        Computes SHAP feature importance attributions for the prediction,
        revealing exactly which sensor features drive degradation or low RUL.
        """
        if not self.feature_names:
            self.feature_names = list(X_df.columns)

        X_values = X_df.values
        explanations: List[Dict[str, Any]] = []

        # 1. Fast SHAP TreeExplainer calculation
        if HAS_SHAP and self.shap_explainer is not None:
            try:
                shap_values = self.shap_explainer(X_df)
                if hasattr(shap_values, "values"):
                    sv = shap_values.values[0]
                else:
                    sv = shap_values[0]

                # Get top indices by absolute SHAP impact
                top_indices = np.argsort(np.abs(sv))[::-1][:top_k]
                
                for idx in top_indices:
                    feat_name = self.feature_names[idx] if idx < len(self.feature_names) else f"feature_{idx}"
                    impact_val = float(sv[idx])
                    raw_val = float(X_values[0, idx]) if X_values.ndim > 1 else float(X_values[idx])
                    
                    impact_direction = "Reduces RUL (Accelerates Wear)" if impact_val < 0 else "Extends RUL (Normal Operating Zone)"
                    
                    explanations.append({
                        "feature": feat_name,
                        "value": round(raw_val, 4),
                        "shap_value": round(impact_val, 4),
                        "impact": impact_direction
                    })
                return explanations
            except Exception as e:
                logger.warning(f"SHAP calculation exception: {e}; falling back to model feature importances.")

        # 2. Resilient fallback: Model feature importances weighted by z-scores
        if hasattr(self.rul_model, "feature_importances_"):
            importances = self.rul_model.feature_importances_
            row = X_values[0] if X_values.ndim > 1 else X_values
            
            # Approximate attribution as (value - mean_approx) * importance
            top_indices = np.argsort(importances)[::-1][:top_k]
            for idx in top_indices:
                feat_name = self.feature_names[idx] if idx < len(self.feature_names) else f"feature_{idx}"
                imp = float(importances[idx])
                raw_val = float(row[idx])
                
                # Synthetic direction based on high vibration/temp vs baseline
                is_stress = any(s in feat_name for s in ["vibration", "temperature", "ptp", "std"])
                shap_approx = -imp * 50.0 if (is_stress and raw_val > 1.0) else imp * 25.0
                
                explanations.append({
                    "feature": feat_name,
                    "value": round(raw_val, 4),
                    "shap_value": round(shap_approx, 4),
                    "impact": "Reduces RUL (Accelerates Wear)" if shap_approx < 0 else "Extends RUL (Nominal Regime)"
                })
        else:
            # Baseline explanation
            for i, name in enumerate(self.feature_names[:top_k]):
                explanations.append({
                    "feature": name,
                    "value": round(float(X_values[0, i]), 4),
                    "shap_value": 0.0,
                    "impact": "Neutral baseline"
                })

        return explanations

    def predict_streaming_point(
        self,
        current_reading: Dict[str, Any],
        machine_history_df: pd.DataFrame
    ) -> Dict[str, Any]:
        """
        Full end-to-end inference on a single incoming streaming sensor telemetry point.
        Combines history to compute lag & rolling features, standardizes, scores anomalies,
        predicts RUL, and computes SHAP diagnostic explanations.
        """
        fe = FeatureEngineer()
        fe.feature_columns = self.feature_names

        # Compute engineered features for current point
        feature_row_df = fe.transform_streaming_window(machine_history_df, current_reading)
        
        # Ensure column alignment
        for col in self.feature_names:
            if col not in feature_row_df.columns:
                feature_row_df[col] = 0.0
        feature_row_df = feature_row_df[self.feature_names]

        # Scale features
        if self.preprocessor is not None and self.preprocessor.is_fitted:
            X_scaled = self.preprocessor.transform(feature_row_df, self.feature_names)
        else:
            X_scaled = feature_row_df.values

        # Anomaly scoring
        anomaly_res = self.predict_anomaly(X_scaled)

        # RUL estimation
        rul_res = self.predict_rul(feature_row_df.values)

        # SHAP Explainability
        shap_explanations = self.explain_prediction(feature_row_df, top_k=6)

        return {
            "timestamp": current_reading.get("timestamp"),
            "machine_id": current_reading.get("machine_id"),
            "machine_type": current_reading.get("machine_type", "Industrial Unit"),
            "cycle": current_reading.get("cycle", 0),
            "sensors": {
                "vibration": current_reading.get("vibration"),
                "temperature": current_reading.get("temperature"),
                "rpm": current_reading.get("rpm"),
                "pressure": current_reading.get("pressure"),
                "voltage": current_reading.get("voltage")
            },
            "anomaly_detection": anomaly_res,
            "rul_prediction": rul_res,
            "explainability": shap_explanations
        }
