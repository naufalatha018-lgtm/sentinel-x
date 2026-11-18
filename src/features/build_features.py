"""
Industrial IoT Feature Engineering Pipeline
===========================================
Extracts domain-informed time-series kinematic, thermal, and electrical features:
- Multi-scale rolling window statistics (mean, std, min, max, peak-to-peak)
- Time-lag offsets (t-1, t-3, t-5, t-10)
- Exponential Weighted Moving Averages (EWMA)
- First differences (rates of change)
- Cross-sensor physical interaction ratios (vibration/RPM, thermal-voltage stress)

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import json
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import pandas as pd


class FeatureEngineer:
    """
    Transforms raw sensor telemetry into high-dimensional time-series feature representations.
    Ensures group-wise boundary preservation (per machine) to eliminate cross-machine contamination.
    """

    def __init__(
        self,
        raw_sensor_columns: Optional[List[str]] = None,
        lag_windows: Optional[List[int]] = None,
        rolling_windows: Optional[List[int]] = None,
        ewma_spans: Optional[List[int]] = None
    ):
        self.raw_sensor_columns = raw_sensor_columns or [
            "vibration", "temperature", "rpm", "pressure", "voltage"
        ]
        self.lag_windows = lag_windows or [1, 3, 5, 10]
        self.rolling_windows = rolling_windows or [5, 15, 30]
        self.ewma_spans = ewma_spans or [5, 15]
        self.feature_columns: List[str] = []

    def engineer_machine_features(self, group_df: pd.DataFrame) -> pd.DataFrame:
        """
        Engineers time-series features for an individual machine's ordered telemetry.
        Must be sorted chronologically. Collects features into dictionary to prevent
        DataFrame fragmentation.
        """
        df = group_df.sort_values(by="timestamp").copy()
        new_cols: Dict[str, Any] = {}

        # 1. First-order differences (instantaneous rate of change)
        for sensor in self.raw_sensor_columns:
            new_cols[f"{sensor}_diff1"] = df[sensor].diff(1).fillna(0.0)

        # 2. Lag features (t-k)
        for lag in self.lag_windows:
            for sensor in self.raw_sensor_columns:
                new_cols[f"{sensor}_lag_{lag}"] = df[sensor].shift(lag).bfill()

        # 3. Rolling window statistics
        for w in self.rolling_windows:
            for sensor in self.raw_sensor_columns:
                roll = df[sensor].rolling(window=w, min_periods=1)
                r_min = roll.min()
                r_max = roll.max()
                new_cols[f"{sensor}_roll_mean_{w}"] = roll.mean()
                new_cols[f"{sensor}_roll_std_{w}"] = roll.std().fillna(0.0)
                new_cols[f"{sensor}_roll_min_{w}"] = r_min
                new_cols[f"{sensor}_roll_max_{w}"] = r_max
                # Peak-to-Peak (PTP): dynamic range / cavitation & bearing impulse indicator
                new_cols[f"{sensor}_roll_ptp_{w}"] = r_max - r_min

        # 4. Exponential Weighted Moving Averages (EWMA)
        for span in self.ewma_spans:
            for sensor in self.raw_sensor_columns:
                new_cols[f"{sensor}_ewma_{span}"] = df[sensor].ewm(span=span, adjust=False).mean()

        # 5. Domain-informed Cross-Sensor Interaction Ratios
        # Kinematic stress factor: Vibration normalized by rotational speed
        new_cols["kinematic_stress_ratio"] = df["vibration"] / (df["rpm"] / 1000.0 + 1e-4)
        # Thermal dissipation index: Temperature normalized by line voltage
        new_cols["thermal_voltage_index"] = df["temperature"] / (df["voltage"] / 100.0 + 1e-4)
        # Hydraulic efficiency factor: Pressure relative to RPM
        new_cols["hydraulic_efficiency_index"] = df["pressure"] / (df["rpm"] / 1000.0 + 1e-4)

        # Merge all new feature columns at once to prevent fragmentation
        new_features_df = pd.DataFrame(new_cols, index=df.index)
        combined_df = pd.concat([df, new_features_df], axis=1)

        # Fill any remaining NaNs using backward/forward fill
        return combined_df.bfill().ffill()

    def transform_fleet(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Applies feature engineering across all machines in the dataset,
        strictly grouping by `machine_id`.
        """
        if "machine_id" not in df.columns:
            transformed = self.engineer_machine_features(df)
        else:
            pieces = []
            for _, grp in df.groupby("machine_id"):
                pieces.append(self.engineer_machine_features(grp))
            transformed = pd.concat(pieces, ignore_index=True)

        # Sort back chronologically
        if "timestamp" in transformed.columns:
            transformed = transformed.sort_values(by=["timestamp", "machine_id"]).reset_index(drop=True)

        # Identify all engineered feature columns (excluding identifiers, targets, and metadata)
        non_feature_cols = {
            "timestamp", "machine_id", "machine_type", "degradation_mode",
            "cycle", "rul", "health_index", "is_anomaly", "anomaly_type"
        }
        self.feature_columns = [c for c in transformed.columns if c not in non_feature_cols]

        return transformed

    def transform_streaming_window(
        self,
        history_df: pd.DataFrame,
        current_reading: Dict[str, Any]
    ) -> pd.DataFrame:
        """
        Computes features for a single incoming reading using the recent historical window.
        Takes at least max(rolling_windows, lag_windows) recent points for the machine.
        Returns a single-row DataFrame containing the exact feature vector.
        """
        max_window = max(max(self.rolling_windows), max(self.lag_windows)) + 5
        recent_points = history_df.tail(max_window).copy()

        # Append current reading
        reading_df = pd.DataFrame([current_reading])
        combined = pd.concat([recent_points, reading_df], ignore_index=True)
        combined["timestamp"] = pd.to_datetime(combined["timestamp"], format="mixed")

        features_df = self.engineer_machine_features(combined)
        latest_feature_row = features_df.iloc[[-1]]
        
        return latest_feature_row[self.feature_columns]

    def save_feature_names(self, filepath: str) -> None:
        """Saves the ordered list of feature column names as JSON metadata."""
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(self.feature_columns, f, indent=2)

    @staticmethod
    def load_feature_names(filepath: str) -> List[str]:
        """Loads feature column names from JSON metadata."""
        with open(filepath, "r", encoding="utf-8") as f:
            return json.load(f)
