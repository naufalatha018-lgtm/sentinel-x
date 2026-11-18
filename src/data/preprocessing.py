"""
Telemetry Preprocessing and Data Validation Pipeline
===================================================
Handles telemetry cleaning, data validation, scaling, and fleet-aware train/test splits.

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import joblib
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler, RobustScaler


class TelemetryPreprocessor:
    """
    Standardizes, validates, and prepares raw multi-sensor telemetry for feature
    engineering and model training/inference.
    """

    def __init__(
        self,
        sensor_columns: Optional[List[str]] = None,
        scaler_type: str = "robust",
        scaler_path: Optional[str] = None
    ):
        self.sensor_columns = sensor_columns or ["vibration", "temperature", "rpm", "pressure", "voltage"]
        self.scaler_type = scaler_type.lower()
        self.scaler_path = scaler_path
        
        if self.scaler_type == "robust":
            self.scaler = RobustScaler()
        else:
            self.scaler = StandardScaler()
            
        self.is_fitted: bool = False
        self.feature_columns: List[str] = []

    def validate_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """Validates schema, checks for missing values, and enforces correct data types."""
        df_clean = df.copy()

        # Check required columns
        for col in self.sensor_columns:
            if col not in df_clean.columns:
                raise ValueError(f"Required sensor column '{col}' missing from DataFrame.")

        # Ensure timestamp is datetime
        if "timestamp" in df_clean.columns:
            df_clean["timestamp"] = pd.to_datetime(df_clean["timestamp"], format="mixed")

        # Forward fill and backward fill small gaps in sensor telemetry
        df_clean[self.sensor_columns] = df_clean[self.sensor_columns].ffill().bfill()

        # Handle any remaining NaNs or Infs
        for col in self.sensor_columns:
            df_clean[col] = pd.to_numeric(df_clean[col], errors="coerce").fillna(0.0)
            # Clip extreme physically impossible values
            df_clean[col] = np.clip(df_clean[col], -1e5, 1e5)

        return df_clean

    def fit_scaler(self, df: pd.DataFrame, feature_cols: Optional[List[str]] = None) -> TelemetryPreprocessor:
        """Fits the scaler strictly on nominal/normal operating data to avoid anomaly bias."""
        self.feature_columns = feature_cols or self.sensor_columns
        
        # Prefer normal data for fitting scaler (if is_anomaly flag exists)
        if "is_anomaly" in df.columns:
            normal_mask = df["is_anomaly"] == 0
            if normal_mask.sum() > 50:
                fit_data = df.loc[normal_mask, self.feature_columns]
            else:
                fit_data = df[self.feature_columns]
        else:
            fit_data = df[self.feature_columns]

        self.scaler.fit(fit_data)
        self.is_fitted = True
        return self

    def transform(self, df: pd.DataFrame, feature_cols: Optional[List[str]] = None) -> np.ndarray:
        """Transforms feature columns into scaled numpy array."""
        if not self.is_fitted:
            raise RuntimeError("TelemetryPreprocessor must be fitted before calling transform().")
        cols = feature_cols or self.feature_columns
        return self.scaler.transform(df[cols])

    def fit_transform(self, df: pd.DataFrame, feature_cols: Optional[List[str]] = None) -> np.ndarray:
        """Fits and transforms feature columns."""
        self.fit_scaler(df, feature_cols)
        return self.transform(df, feature_cols)

    def save(self, filepath: Optional[str] = None) -> str:
        """Serializes the fitted preprocessor and scaler."""
        save_path = filepath or self.scaler_path
        if not save_path:
            raise ValueError("No filepath specified to save preprocessor scaler.")
        
        Path(save_path).parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "scaler": self.scaler,
            "scaler_type": self.scaler_type,
            "sensor_columns": self.sensor_columns,
            "feature_columns": self.feature_columns,
            "is_fitted": self.is_fitted
        }
        joblib.dump(payload, save_path)
        return save_path

    @classmethod
    def load(cls, filepath: str) -> TelemetryPreprocessor:
        """Loads a serialized preprocessor and scaler."""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Preprocessor file not found at: {filepath}")
        payload = joblib.load(filepath)
        instance = cls(
            sensor_columns=payload.get("sensor_columns"),
            scaler_type=payload.get("scaler_type", "robust"),
            scaler_path=filepath
        )
        instance.scaler = payload["scaler"]
        instance.feature_columns = payload.get("feature_columns", [])
        instance.is_fitted = payload.get("is_fitted", True)
        return instance

    @staticmethod
    def train_test_split_by_machine(
        df: pd.DataFrame,
        test_ratio: float = 0.25,
        random_seed: int = 42
    ) -> Tuple[pd.DataFrame, pd.DataFrame]:
        """
        Splits data across machines rather than random rows to strictly prevent
        data leakage in time-series predictive maintenance modeling.
        """
        unique_machines = df["machine_id"].unique()
        rng = np.random.default_rng(random_seed)
        shuffled_machines = rng.permutation(unique_machines)
        
        n_test = max(1, int(len(unique_machines) * test_ratio))
        test_machines = shuffled_machines[:n_test]
        train_machines = shuffled_machines[n_test:]

        train_df = df[df["machine_id"].isin(train_machines)].copy().reset_index(drop=True)
        test_df = df[df["machine_id"].isin(test_machines)].copy().reset_index(drop=True)
        
        return train_df, test_df
