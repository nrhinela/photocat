# syntax=docker/dockerfile:1.4
# Use official Python runtime
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies for image processing
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    libgomp1 \
    build-essential \
    cmake \
    && rm -rf /var/lib/apt/lists/*

# Copy only pyproject.toml first for dependency caching
COPY pyproject.toml ./

# Create minimal src structure for pip install (avoids copying all code)
RUN mkdir -p src/photocat && touch src/photocat/__init__.py

# Install Python dependencies (cached unless pyproject.toml changes)
RUN pip install --no-cache-dir . && \
    pip install --no-cache-dir sentencepiece

# Set HuggingFace cache location to a shared directory
ENV HF_HOME=/app/.cache/huggingface
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface/transformers

# Pre-download SigLIP model during build (cached in Docker layers)
# CLIP model removed - only SigLIP is used
RUN mkdir -p /app/.cache/huggingface && \
    python3 -c "from transformers import SiglipModel, SiglipProcessor; \
    print('Downloading SigLIP model...'); \
    SiglipModel.from_pretrained('google/siglip-so400m-patch14-384'); \
    SiglipProcessor.from_pretrained('google/siglip-so400m-patch14-384'); \
    print('Model cached successfully')"

# Copy actual source code (after dependencies are installed)
COPY src/ ./src/

# Copy remaining files (config/, alembic/, etc.)
COPY alembic/ ./alembic/
COPY config/ ./config/
COPY alembic.ini ./

# Reinstall package with actual source code (ensures photocat module is importable)
RUN pip install --no-cache-dir -e .

# Note: frontend dist is already in src/photocat/static/dist from npm build in cloudbuild

# Create non-root user and preserve cache ownership
RUN useradd -m -u 1000 photocat && chown -R photocat:photocat /app
USER photocat

# Expose port
EXPOSE 8080

# Run application
CMD uvicorn photocat.api:app --host 0.0.0.0 --port ${PORT:-8080}
