"""
Model Evaluation and Diagnostic Reporting Module
================================================
Comprehensive evaluation for:
- Unsupervised / Supervised Anomaly Detection (ROC-AUC, PR-AUC, F1, Precision, Recall, Confusion Matrix)
- Remaining Useful Life (RUL) Regression (RMSE, MAE, R2, MAPE, NASA PHM08 Asymmetric Penalty Score)

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import json
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    average_precision_score,
    confusion_matrix,
    mean_squared_error,
    mean_absolute_error,
    r2_score
)

try:
    from loguru import logger
except ImportError:
    import logging
    logger = logging.getLogger("Sentinel-X")


class ModelEvaluator:
    """Evaluates anomaly detection and RUL regression models against holdout fleet data."""

    def __init__(self, output_path: Optional[str] = None):
        self.output_path = output_path or "models/artifacts/evaluation_metrics.json"

    @staticmethod
    def compute_phm08_score(y_true: np.ndarray, y_pred: np.ndarray) -> float:
        """
        Computes the standard NASA C-MAPSS PHM08 asymmetric penalty score for RUL prediction.
        Penalizes late predictions (y_pred > y_true, risking catastrophic breakdown)
        significantly more than early predictions (y_pred < y_true, conservative maintenance).
        
        d_i = y_pred - y_true
        s_i = exp(-d_i / 13) - 1   if d_i < 0
        s_i = exp(d_i / 10) - 1    if d_i >= 0
        """
        d = y_pred - y_true
        scores = np.where(d < 0, np.exp(-d / 13.0) - 1.0, np.exp(d / 10.0) - 1.0)
        return float(np.sum(scores))

    def evaluate_anomaly_detector(
        self,
        y_true: np.ndarray,
        anomaly_scores: np.ndarray,
        y_pred_binary: np.ndarray,
        model_name: str = "isolation_forest"
    ) -> Dict[str, Any]:
        """Evaluates anomaly detection performance."""
        logger.info(f"Evaluating Anomaly Detector: {model_name}...")
        
        # Check if ground truth has both classes
        has_two_classes = len(np.unique(y_true)) > 1
        
        try:
            roc_auc = float(roc_auc_score(y_true, anomaly_scores)) if has_two_classes else 1.0
            pr_auc = float(average_precision_score(y_true, anomaly_scores)) if has_two_classes else 1.0
        except Exception as e:
            logger.warning(f"AUC calculation warning: {e}")
            roc_auc, pr_auc = 0.0, 0.0

        prec = float(precision_score(y_true, y_pred_binary, zero_division=0))
        rec = float(recall_score(y_true, y_pred_binary, zero_division=0))
        f1 = float(f1_score(y_true, y_pred_binary, zero_division=0))
        acc = float(accuracy_score(y_true, y_pred_binary))
        
        tn, fp, fn, tp = confusion_matrix(y_true, y_pred_binary, labels=[0, 1]).ravel()

        metrics = {
            "model_name": model_name,
            "accuracy": round(acc, 4),
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1_score": round(f1, 4),
            "roc_auc": round(roc_auc, 4),
            "pr_auc": round(pr_auc, 4),
            "confusion_matrix": {
                "true_negative": int(tn),
                "false_positive": int(fp),
                "false_negative": int(fn),
                "true_positive": int(tp)
            },
            "total_samples": int(len(y_true)),
            "true_anomalies": int(np.sum(y_true)),
            "predicted_anomalies": int(np.sum(y_pred_binary))
        }

        logger.info(
            f"[{model_name}] F1: {metrics['f1_score']} | ROC-AUC: {metrics['roc_auc']} | "
            f"Recall: {metrics['recall']} | Precision: {metrics['precision']}"
        )
        return metrics

    def evaluate_rul_regressor(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray,
        model_name: str = "rul_regressor"
    ) -> Dict[str, Any]:
        """Evaluates RUL regression model."""
        logger.info(f"Evaluating RUL Regressor: {model_name}...")
        
        # Ensure predictions are non-negative
        y_pred_clipped = np.maximum(0.0, y_pred)
        
        mse = float(mean_squared_error(y_true, y_pred_clipped))
        rmse = float(np.sqrt(mse))
        mae = float(mean_absolute_error(y_true, y_pred_clipped))
        r2 = float(r2_score(y_true, y_pred_clipped))
        
        # Mean Absolute Percentage Error (avoid division by 0)
        epsilon = 1.0
        mape = float(np.mean(np.abs((y_true - y_pred_clipped) / np.maximum(y_true, epsilon))) * 100.0)
        
        phm08 = self.compute_phm08_score(y_true, y_pred_clipped)

        metrics = {
            "model_name": model_name,
            "rmse": round(rmse, 2),
            "mae": round(mae, 2),
            "r2_score": round(r2, 4),
            "mape_percent": round(mape, 2),
            "phm08_penalty_score": round(phm08, 2),
            "sample_count": int(len(y_true))
        }

        logger.info(
            f"[{model_name}] RMSE: {metrics['rmse']} cycles | MAE: {metrics['mae']} cycles | "
            f"R2: {metrics['r2_score']} | PHM08 Penalty: {metrics['phm08_penalty_score']}"
        )
        return metrics

    def save_metrics(self, payload: Dict[str, Any]) -> str:
        """Saves evaluation results to JSON."""
        Path(self.output_path).parent.mkdir(parents=True, exist_ok=True)
        with open(self.output_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2)
        logger.info(f"Saved evaluation report to {self.output_path}")
        return self.output_path
