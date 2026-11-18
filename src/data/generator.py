"""
Synthetic Multi-Sensor Industrial IoT Telemetry Generator
==========================================================
Simulates realistic industrial equipment degradation, diurnal cyclical noise,
process dynamics, and intermittent fault injections across a fleet of machines.

Sensors:
- Vibration (mm/s): High-frequency kinematics, bearing degradation indicator
- Temperature (°C): Thermal friction and cooling system dynamics
- RPM (rev/min): Motor shaft rotational speed and load response
- Pressure (bar): Hydraulic / pneumatic fluid line pressure
- Voltage (V): 3-phase line supply voltage and motor power draw

Author: Paul Gallagher / Principal ML Architect
"""

from __future__ import annotations
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any

import numpy as np
import pandas as pd


@dataclass
class MachineProfile:
    """Configurable operational profile for an individual industrial machine."""
    machine_id: str
    machine_type: str = "Centrifugal Pump"
    initial_health: float = 100.0  # Percentage [0, 100]
    lifespan_cycles: int = 1500
    degradation_mode: str = "bearing_wear"  # bearing_wear, thermal_runaway, pressure_seal_leakage, electrical_harmonic_fault
    degradation_acceleration: float = 1.0
    random_seed: int = 42


class TelemetryGenerator:
    """
    Simulates high-fidelity multi-sensor telemetry for industrial machinery with
    degradation curves (exponential/Weibull wear), diurnal seasonal noise,
    and synthetic anomaly injections (point, contextual, collective faults).
    """

    def __init__(self, config: Optional[Dict[str, Any]] = None, seed: int = 42):
        self.seed = seed
        self.rng = np.random.default_rng(seed)
        self.config = config or {}
        
        sim_cfg = self.config.get("simulation", {})
        self.sensors_cfg = sim_cfg.get("sensors", {
            "vibration": {"baseline": 2.2, "noise_std": 0.18, "critical_threshold": 6.8, "unit": "mm/s"},
            "temperature": {"baseline": 62.0, "noise_std": 1.5, "critical_threshold": 92.0, "unit": "°C"},
            "rpm": {"baseline": 1780.0, "noise_std": 15.0, "critical_threshold_low": 1450.0, "critical_threshold_high": 2150.0, "unit": "RPM"},
            "pressure": {"baseline": 5.4, "noise_std": 0.22, "critical_threshold_low": 3.2, "critical_threshold_high": 8.5, "unit": "bar"},
            "voltage": {"baseline": 400.0, "noise_std": 4.5, "critical_threshold_low": 365.0, "critical_threshold_high": 435.0, "unit": "V"}
        })
        self.sampling_rate_seconds = sim_cfg.get("sampling_rate_seconds", 10)
        self.anomaly_injection_rate = sim_cfg.get("anomaly_injection_rate", 0.04)
        self.timesteps_per_machine = sim_cfg.get("timesteps_per_machine", 1500)
        
        # Machine fleet profiles
        default_machine_ids = sim_cfg.get("machine_ids", [
            "MCH-001", "MCH-002", "MCH-003", "MCH-004",
            "MCH-005", "MCH-006", "MCH-007", "MCH-008"
        ])
        degradation_modes = [
            "bearing_wear",
            "thermal_runaway",
            "pressure_seal_leakage",
            "electrical_harmonic_fault"
        ]
        machine_types = [
            "Centrifugal Pump",
            "Rotary Screw Compressor",
            "CNC Milling Spindle",
            "Hydraulic Actuator"
        ]

        self.machines: List[MachineProfile] = []
        for i, mid in enumerate(default_machine_ids):
            m_type = machine_types[i % len(machine_types)]
            deg_mode = degradation_modes[i % len(degradation_modes)]
            # Introduce slight lifespan variability between machines
            lifespan = self.timesteps_per_machine - int(self.rng.integers(-100, 150))
            lifespan = max(600, lifespan)
            accel = float(self.rng.uniform(0.85, 1.25))
            
            self.machines.append(
                MachineProfile(
                    machine_id=mid,
                    machine_type=m_type,
                    lifespan_cycles=lifespan,
                    degradation_mode=deg_mode,
                    degradation_acceleration=accel,
                    random_seed=self.seed + i * 17
                )
            )

    def _compute_weibull_degradation(self, t: np.ndarray, lifespan: int, shape_k: float = 3.0) -> np.ndarray:
        """
        Computes non-linear physical wear progression normalized to [0, 1].
        Follows a standard Weibull cumulative hazard / bathtub degradation curve.
        """
        tau = np.clip(t / lifespan, 0.0, 1.0)
        wear = 1.0 - np.exp(- (tau * 1.5) ** shape_k)
        # Normalize to reach ~1.0 at lifespan
        max_val = 1.0 - np.exp(- (1.5) ** shape_k)
        return wear / max_val

    def generate_machine_telemetry(
        self,
        profile: MachineProfile,
        start_time: Optional[datetime] = None
    ) -> pd.DataFrame:
        """Generates continuous time-series sensor telemetry for a single machine."""
        local_rng = np.random.default_rng(profile.random_seed)
        start_time = start_time or datetime.now() - timedelta(seconds=profile.lifespan_cycles * self.sampling_rate_seconds)
        
        n_steps = profile.lifespan_cycles
        t_steps = np.arange(n_steps)
        timestamps = [start_time + timedelta(seconds=int(step * self.sampling_rate_seconds)) for step in t_steps]

        # 1. Degradation progression factor: 0.0 (pristine) -> 1.0 (end-of-life)
        wear = self._compute_weibull_degradation(t_steps, profile.lifespan_cycles, shape_k=3.2 * profile.degradation_acceleration)
        
        # Health Index begins near 100% and decays to ~0% at failure
        health_index = np.clip(100.0 * (1.0 - wear) + local_rng.normal(0, 0.5, n_steps), 0.0, 100.0)
        
        # Remaining Useful Life (RUL) in timesteps/cycles
        rul = np.maximum(0, profile.lifespan_cycles - t_steps)

        # 2. Base sensor profiles
        v_base = self.sensors_cfg["vibration"]["baseline"]
        t_base = self.sensors_cfg["temperature"]["baseline"]
        rpm_base = self.sensors_cfg["rpm"]["baseline"]
        p_base = self.sensors_cfg["pressure"]["baseline"]
        volt_base = self.sensors_cfg["voltage"]["baseline"]

        # Diurnal thermal day/night cycle (24-hour cycle)
        seconds_in_day = 86400
        cycle_phase = np.array([ts.hour * 3600 + ts.minute * 60 + ts.second for ts in timestamps]) / seconds_in_day
        diurnal_temp = 3.5 * np.sin(2 * np.pi * cycle_phase - np.pi / 2)  # Peaks at 2 PM
        diurnal_voltage = 2.0 * np.cos(2 * np.pi * cycle_phase)  # Grid load swing

        # High-frequency rotational harmonic vibration component
        harmonics = 0.15 * np.sin(2 * np.pi * t_steps / 12) + 0.08 * np.sin(2 * np.pi * t_steps / 4)

        # 3. Physics Degradation Models
        if profile.degradation_mode == "bearing_wear":
            # Vibration increases exponentially as spalling and outer-race pitting develop
            vibration_trend = v_base + 4.5 * (wear ** 2.2) + harmonics
            temperature_trend = t_base + 18.0 * (wear ** 2.0) + diurnal_temp
            rpm_trend = rpm_base - 80.0 * (wear ** 2.5)  # Friction slows motor slightly
            pressure_trend = p_base - 0.4 * wear
            voltage_trend = volt_base + 8.0 * (wear ** 2.0) + diurnal_voltage  # Motor draws more power

        elif profile.degradation_mode == "thermal_runaway":
            # Heat exchanger failure or lubrication failure
            temperature_trend = t_base + 35.0 * (wear ** 1.8) + diurnal_temp
            vibration_trend = v_base + 2.8 * (wear ** 2.0) + harmonics
            rpm_trend = rpm_base - 120.0 * (wear ** 2.0)
            pressure_trend = p_base + 1.8 * (wear ** 1.5)  # Thermal expansion
            voltage_trend = volt_base - 12.0 * (wear ** 2.0) + diurnal_voltage

        elif profile.degradation_mode == "pressure_seal_leakage":
            # Hydraulic seal deteriorates
            pressure_trend = p_base - 2.8 * (wear ** 1.5)
            # Controller tries to compensate by speeding up pump
            rpm_trend = rpm_base + 160.0 * (wear ** 1.6)
            vibration_trend = v_base + 2.0 * (wear ** 1.8) + harmonics
            temperature_trend = t_base + 12.0 * (wear ** 1.7) + diurnal_temp
            voltage_trend = volt_base + 10.0 * (wear ** 1.8) + diurnal_voltage

        else:  # electrical_harmonic_fault
            # Voltage supply irregularities and winding resistance
            voltage_trend = volt_base + 25.0 * np.sin(2 * np.pi * t_steps / 25) * wear + diurnal_voltage
            rpm_trend = rpm_base + 70.0 * np.cos(2 * np.pi * t_steps / 30) * wear
            vibration_trend = v_base + 2.5 * (wear ** 1.7) + 0.3 * np.sin(2 * np.pi * t_steps / 6)
            temperature_trend = t_base + 22.0 * (wear ** 1.9) + diurnal_temp
            pressure_trend = p_base - 0.3 * wear

        # Add stochastic Gaussian noise
        vibration = vibration_trend + local_rng.normal(0, self.sensors_cfg["vibration"]["noise_std"], n_steps)
        temperature = temperature_trend + local_rng.normal(0, self.sensors_cfg["temperature"]["noise_std"], n_steps)
        rpm = rpm_trend + local_rng.normal(0, self.sensors_cfg["rpm"]["noise_std"], n_steps)
        pressure = pressure_trend + local_rng.normal(0, self.sensors_cfg["pressure"]["noise_std"], n_steps)
        voltage = voltage_trend + local_rng.normal(0, self.sensors_cfg["voltage"]["noise_std"], n_steps)

        # 4. Inject Anomaly Spikes & Fault Events
        is_anomaly = np.zeros(n_steps, dtype=int)
        anomaly_types = ["none"] * n_steps

        # Number of anomalous burst intervals
        n_fault_events = max(2, int(n_steps * self.anomaly_injection_rate / 6))
        for _ in range(n_fault_events):
            # Select random burst start (prefer later steps or random intervals)
            start_idx = int(local_rng.integers(50, n_steps - 30))
            duration = int(local_rng.integers(4, 16))
            end_idx = min(n_steps, start_idx + duration)
            
            fault_kind = local_rng.choice(["transient_surge", "cavitation", "cooling_trip", "seal_rupture"])
            
            for idx in range(start_idx, end_idx):
                is_anomaly[idx] = 1
                anomaly_types[idx] = fault_kind
                
                if fault_kind == "transient_surge":
                    voltage[idx] += local_rng.uniform(28.0, 48.0) * local_rng.choice([-1, 1])
                    vibration[idx] += local_rng.uniform(1.2, 2.5)
                elif fault_kind == "cavitation":
                    vibration[idx] += local_rng.uniform(3.5, 6.0)
                    pressure[idx] -= local_rng.uniform(1.2, 2.0)
                    rpm[idx] += local_rng.uniform(40.0, 100.0)
                elif fault_kind == "cooling_trip":
                    temperature[idx] += local_rng.uniform(15.0, 28.0)
                    vibration[idx] += local_rng.uniform(0.8, 1.8)
                elif fault_kind == "seal_rupture":
                    pressure[idx] -= local_rng.uniform(2.0, 3.2)
                    rpm[idx] += local_rng.uniform(80.0, 150.0)

        # Mark final degraded zone (wear > 0.92) as anomalous failure condition
        for idx in range(n_steps):
            if wear[idx] >= 0.92:
                is_anomaly[idx] = 1
                if anomaly_types[idx] == "none":
                    anomaly_types[idx] = f"terminal_{profile.degradation_mode}"

        # Construct DataFrame
        df = pd.DataFrame({
            "timestamp": timestamps,
            "machine_id": profile.machine_id,
            "machine_type": profile.machine_type,
            "degradation_mode": profile.degradation_mode,
            "cycle": t_steps,
            "vibration": np.round(np.clip(vibration, 0.1, 20.0), 4),
            "temperature": np.round(np.clip(temperature, 10.0, 150.0), 3),
            "rpm": np.round(np.clip(rpm, 200.0, 3500.0), 2),
            "pressure": np.round(np.clip(pressure, 0.2, 18.0), 3),
            "voltage": np.round(np.clip(voltage, 280.0, 520.0), 2),
            "health_index": np.round(health_index, 2),
            "rul": rul,
            "is_anomaly": is_anomaly,
            "anomaly_type": anomaly_types
        })

        return df

    def generate_fleet_telemetry(self, start_time: Optional[datetime] = None) -> pd.DataFrame:
        """Generates continuous telemetry for all machines in the configured fleet."""
        dfs = []
        for profile in self.machines:
            df_m = self.generate_machine_telemetry(profile, start_time=start_time)
            dfs.append(df_m)
        fleet_df = pd.concat(dfs, ignore_index=True)
        # Sort by timestamp and machine_id
        fleet_df = fleet_df.sort_values(by=["timestamp", "machine_id"]).reset_index(drop=True)
        return fleet_df

    def generate_single_reading(
        self,
        machine_id: str,
        cycle: int,
        base_reading: Optional[Dict[str, float]] = None,
        inject_anomaly: bool = False
    ) -> Dict[str, Any]:
        """
        Generates an instantaneous single sensor reading suitable for real-time
        streaming APIs or WebSocket live feeds.
        """
        # Find machine profile or fallback
        profile = next((m for m in self.machines if m.machine_id == machine_id), self.machines[0])
        now = datetime.now()
        
        # Calculate wear fraction
        wear = self._compute_weibull_degradation(
            np.array([cycle]),
            profile.lifespan_cycles,
            shape_k=3.2 * profile.degradation_acceleration
        )[0]
        
        rul = max(0, profile.lifespan_cycles - cycle)
        health_index = float(np.clip(100.0 * (1.0 - wear), 0.0, 100.0))

        v_base = self.sensors_cfg["vibration"]["baseline"]
        t_base = self.sensors_cfg["temperature"]["baseline"]
        rpm_base = self.sensors_cfg["rpm"]["baseline"]
        p_base = self.sensors_cfg["pressure"]["baseline"]
        volt_base = self.sensors_cfg["voltage"]["baseline"]

        vibration = v_base + 3.8 * (wear ** 2.0) + self.rng.normal(0, self.sensors_cfg["vibration"]["noise_std"])
        temperature = t_base + 24.0 * (wear ** 1.8) + self.rng.normal(0, self.sensors_cfg["temperature"]["noise_std"])
        rpm = rpm_base - 60.0 * (wear ** 2.0) + self.rng.normal(0, self.sensors_cfg["rpm"]["noise_std"])
        pressure = p_base - 0.5 * wear + self.rng.normal(0, self.sensors_cfg["pressure"]["noise_std"])
        voltage = volt_base + 6.0 * (wear ** 1.8) + self.rng.normal(0, self.sensors_cfg["voltage"]["noise_std"])

        is_anomaly = 0
        anomaly_type = "none"

        if inject_anomaly or (wear > 0.92):
            is_anomaly = 1
            anomaly_type = "high_vibration_spike" if inject_anomaly else f"terminal_{profile.degradation_mode}"
            vibration += self.rng.uniform(3.0, 5.5)
            temperature += self.rng.uniform(10.0, 20.0)

        return {
            "timestamp": now.isoformat(),
            "machine_id": machine_id,
            "machine_type": profile.machine_type,
            "cycle": cycle,
            "vibration": round(float(np.clip(vibration, 0.1, 25.0)), 4),
            "temperature": round(float(np.clip(temperature, 10.0, 150.0)), 2),
            "rpm": round(float(np.clip(rpm, 200.0, 3500.0)), 1),
            "pressure": round(float(np.clip(pressure, 0.1, 15.0)), 3),
            "voltage": round(float(np.clip(voltage, 280.0, 520.0)), 2),
            "health_index": round(health_index, 1),
            "rul": int(rul),
            "is_anomaly": is_anomaly,
            "anomaly_type": anomaly_type
        }
