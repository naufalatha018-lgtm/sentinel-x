# ==============================================================================
# Sentinel-X: Production Dockerfile
# Multi-Service Industrial IoT Predictive Maintenance System
# Author: Paul Gallagher / Principal ML Architect
# ==============================================================================

FROM python:3.11-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=18000

# Install Linux system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip && \
    pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

# Copy project files
COPY configs/ ./configs/
COPY src/ ./src/
COPY run_pipeline.py .
COPY README.md .

# Create artifacts and data directories
RUN mkdir -p data/raw data/processed models/artifacts

# Expose ports for FastAPI (18000) and Streamlit (8501)
EXPOSE 18000 8501

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:18000/health || exit 1

# Default command: launch FastAPI server
CMD ["uvicorn", "src.api.main:app", "--host", "0.0.0.0", "--port", "18000"]
