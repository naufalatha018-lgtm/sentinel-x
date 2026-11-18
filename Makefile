# ==============================================================================
# Sentinel-X Makefile
# ==============================================================================

.PHONY: help install train test api dashboard docker-build docker-up docker-down clean

help:
	@echo "Sentinel-X: Industrial IoT Predictive Maintenance System"
	@echo "Commands:"
	@echo "  install      Install dependencies"
	@echo "  train        Run complete end-to-end ML pipeline (generate, train, eval)"
	@echo "  test         Run automated pytest test suite"
	@echo "  api          Launch FastAPI inference server"
	@echo "  dashboard    Launch Streamlit interactive command center"
	@echo "  docker-up    Start full ecosystem via docker-compose"
	@echo "  docker-down  Stop docker-compose containers"
	@echo "  clean        Clean temporary artifacts and cache"

install:
	pip install -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu

train:
	python run_pipeline.py

test:
	pytest tests/ -v

api:
	uvicorn src.api.main:app --host 0.0.0.0 --port 8080 --reload

dashboard:
	streamlit run src/dashboard/app.py --server.port 8501

docker-build:
	docker-compose build

docker-up:
	docker-compose up -d

docker-down:
	docker-compose down

clean:
	rm -rf __pycache__ .pytest_cache data/raw/* data/processed/* models/artifacts/*
