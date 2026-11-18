"""
Model Training Pipeline: Anomaly Detection & Remaining Useful Life (RUL)
========================================================================
Implements:
1. Unsupervised Anomaly Detection:
   - Scikit-Learn Isolation Forest
   - Deep Learning PyTorch Symmetric Autoencoder with Reconstruction Error Thresholding
2. Remaining Useful Life (RUL) Regression:
   - XGBoost Regressor (with fallback to Scikit-Learn HistGradientBoostingRegressor)

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
from sklearn.ensemble import IsolationForest, HistGradientBoostingRegressor

try:
    from loguru import logger
except ImportError:
    import logging
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    logger = logging.getLogger("Sentinel-X")

try:
    import xgboost as xgb
    HAS_XGBOOST = True
except ImportError:
    HAS_XGBOOST = False

try:
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, TensorDataset
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


# ============================================================================
# PyTorch Autoencoder Architecture
# ============================================================================
if HAS_TORCH:
    class PyTorchAutoencoder(nn.Module):
        """
        Deep fully connected symmetric Autoencoder for unsupervised reconstruction-based
        anomaly scoring on continuous industrial IoT sensor features.
        """
        def __init__(
            self,
            input_dim: int,
            hidden_dims: Optional[List[int]] = None,
            latent_dim: int = 8,
            dropout: float = 0.1
        ):
            super().__init__()
            hidden_dims = hidden_dims or [64, 32, 16]

            # Encoder
            encoder_layers: List[nn.Module] = []
            curr_dim = input_dim
            for h_dim in hidden_dims:
                encoder_layers.append(nn.Linear(curr_dim, h_dim))
                encoder_layers.append(nn.BatchNorm1d(h_dim))
                encoder_layers.append(nn.LeakyReLU(0.2))
                if dropout > 0.0:
                    encoder_layers.append(nn.Dropout(dropout))
                curr_dim = h_dim
            encoder_layers.append(nn.Linear(curr_dim, latent_dim))
            self.encoder = nn.Sequential(*encoder_layers)

            # Decoder
            decoder_layers: List[nn.Module] = []
            curr_dim = latent_dim
            for h_dim in reversed(hidden_dims):
                decoder_layers.append(nn.Linear(curr_dim, h_dim))
                decoder_layers.append(nn.BatchNorm1d(h_dim))
                decoder_layers.append(nn.LeakyReLU(0.2))
                if dropout > 0.0:
                    decoder_layers.append(nn.Dropout(dropout))
                curr_dim = h_dim
            decoder_layers.append(nn.Linear(curr_dim, input_dim))
            self.decoder = nn.Sequential(*decoder_layers)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            latent = self.encoder(x)
            reconstruction = self.decoder(latent)
            return reconstruction
else:
    class PyTorchAutoencoder:  # type: ignore
        pass


# ============================================================================
# Trainer Class
# ============================================================================
class ModelTrainer:
    """
    Orchestrates the training of unsupervised anomaly detectors and supervised
    RUL regression models with complete serialization of artifacts and metadata.
    """

    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.paths = config.get("paths", {})
        self.models_cfg = config.get("models", {})
        
        self.artifacts_dir = Path(self.paths.get("artifacts_dir", "models/artifacts"))
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)

    def train_isolation_forest(
        self,
        X_train_scaled: np.ndarray
    ) -> IsolationForest:
        """Trains Scikit-Learn Isolation Forest on nominal training features."""
        logger.info("Initiating Isolation Forest training...")
        if_cfg = self.models_cfg.get("anomaly_detection", {}).get("isolation_forest", {})
        
        model = IsolationForest(
            n_estimators=if_cfg.get("n_estimators", 150),
            max_samples=if_cfg.get("max_samples", "auto"),
            contamination=if_cfg.get("contamination", 0.05),
            random_state=if_cfg.get("random_state", 42),
            n_jobs=-1
        )
        model.fit(X_train_scaled)
        
        save_path = self.paths.get("isolation_forest_model", str(self.artifacts_dir / "isolation_forest.joblib"))
        joblib.dump(model, save_path)
        logger.info(f"Isolation Forest model serialized successfully to {save_path}")
        return model

    def train_autoencoder(
        self,
        X_train_scaled: np.ndarray,
        X_val_scaled: Optional[np.ndarray] = None
    ) -> Optional[Any]:
        """Trains PyTorch Autoencoder on normal telemetry features."""
        if not HAS_TORCH:
            logger.warning("PyTorch is not available; skipping Autoencoder training.")
            return None

        logger.info("Initiating PyTorch Deep Autoencoder training...")
        ae_cfg = self.models_cfg.get("anomaly_detection", {}).get("autoencoder", {})
        
        input_dim = X_train_scaled.shape[1]
        hidden_dims = ae_cfg.get("hidden_dims", [64, 32, 16])
        latent_dim = ae_cfg.get("latent_dim", 8)
        dropout = ae_cfg.get("dropout", 0.1)
        lr = ae_cfg.get("learning_rate", 0.001)
        weight_decay = ae_cfg.get("weight_decay", 1e-5)
        batch_size = ae_cfg.get("batch_size", 64)
        epochs = ae_cfg.get("epochs", 25)

        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        model = PyTorchAutoencoder(
            input_dim=input_dim,
            hidden_dims=hidden_dims,
            latent_dim=latent_dim,
            dropout=dropout
        ).to(device)

        # Prepare DataLoader
        train_tensor = torch.tensor(X_train_scaled, dtype=torch.float32)
        train_loader = DataLoader(
            TensorDataset(train_tensor, train_tensor),
            batch_size=batch_size,
            shuffle=True
        )

        criterion = nn.MSELoss()
        optimizer = torch.optim.Adam(model.parameters(), lr=lr, weight_decay=weight_decay)

        model.train()
        for epoch in range(1, epochs + 1):
            epoch_loss = 0.0
            for batch_x, batch_y in train_loader:
                batch_x = batch_x.to(device)
                batch_y = batch_y.to(device)
                
                optimizer.zero_grad()
                reconstructed = model(batch_x)
                loss = criterion(reconstructed, batch_y)
                loss.backward()
                optimizer.step()
                epoch_loss += loss.item() * len(batch_x)

            epoch_loss /= len(X_train_scaled)
            if epoch % 5 == 0 or epoch == epochs:
                logger.info(f"Autoencoder Epoch [{epoch}/{epochs}] - Loss: {epoch_loss:.6f}")

        # Compute reconstruction error threshold on training set
        model.eval()
        with torch.no_grad():
            preds = model(train_tensor.to(device)).cpu().numpy()
            recon_errors = np.mean((X_train_scaled - preds) ** 2, axis=1)
            
        percentile = ae_cfg.get("contamination_percentile", 95.0)
        threshold = float(np.percentile(recon_errors, percentile))
        logger.info(f"Autoencoder baseline reconstruction threshold ({percentile}th percentile): {threshold:.6f}")

        # Save model checkpoint and threshold metadata
        save_path = self.paths.get("autoencoder_model", str(self.artifacts_dir / "autoencoder_anomaly.pt"))
        checkpoint = {
            "model_state_dict": model.state_dict(),
            "input_dim": input_dim,
            "hidden_dims": hidden_dims,
            "latent_dim": latent_dim,
            "dropout": dropout,
            "threshold": threshold,
            "percentile": percentile
        }
        torch.save(checkpoint, save_path)
        logger.info(f"PyTorch Autoencoder model checkpoint serialized to {save_path}")
        return model

    def train_rul_regressor(
        self,
        X_train: np.ndarray,
        y_train: np.ndarray,
        feature_names: Optional[List[str]] = None
    ) -> Any:
        """Trains XGBoost Regressor (or HistGradientBoostingRegressor fallback) for RUL estimation."""
        logger.info("Initiating Remaining Useful Life (RUL) Regressor training...")
        rul_cfg = self.models_cfg.get("rul_prediction", {})
        preferred_type = rul_cfg.get("model_type", "xgboost").lower()

        if preferred_type == "xgboost" and HAS_XGBOOST:
            xgb_params = rul_cfg.get("xgb_params", {
                "n_estimators": 250,
                "learning_rate": 0.04,
                "max_depth": 6,
                "subsample": 0.85,
                "colsample_bytree": 0.85,
                "random_state": 42,
                "n_jobs": -1
            })
            model = xgb.XGBRegressor(**xgb_params)
            logger.info("Using XGBoost Regressor for RUL prediction.")
        else:
            hgb_params = rul_cfg.get("hgb_params", {
                "max_iter": 250,
                "learning_rate": 0.04,
                "max_depth": 8,
                "random_state": 42
            })
            model = HistGradientBoostingRegressor(**hgb_params)
            logger.info("Using Scikit-Learn HistGradientBoostingRegressor for RUL prediction.")

        model.fit(X_train, y_train)
        
        save_path = self.paths.get("rul_model", str(self.artifacts_dir / "rul_regressor.joblib"))
        payload = {
            "model": model,
            "model_type": preferred_type if HAS_XGBOOST else "hist_gb",
            "feature_names": feature_names or []
        }
        joblib.dump(payload, save_path)
        logger.info(f"RUL Regressor serialized successfully to {save_path}")
        return model
