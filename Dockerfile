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

# Copy requirements and source code (needed for pip install)
COPY pyproject.toml ./
COPY src/ ./src/

# Install Python dependencies
RUN pip install --no-cache-dir .

# Install sentencepiece explicitly (required for SigLIP)
RUN pip install --no-cache-dir sentencepiece

# Set HuggingFace cache location to a shared directory
ENV HF_HOME=/app/.cache/huggingface
ENV TRANSFORMERS_CACHE=/app/.cache/huggingface/transformers

# Pre-download models during build (cached in Docker layers)
RUN mkdir -p /app/.cache/huggingface && \
    python3 -c "from transformers import SiglipModel, SiglipProcessor, CLIPModel, CLIPProcessor; \
    print('Downloading SigLIP model...'); \
    SiglipModel.from_pretrained('google/siglip-so400m-patch14-384'); \
    SiglipProcessor.from_pretrained('google/siglip-so400m-patch14-384'); \
    print('Downloading CLIP model...'); \
    CLIPModel.from_pretrained('openai/clip-vit-base-patch32'); \
    CLIPProcessor.from_pretrained('openai/clip-vit-base-patch32'); \
    print('Models cached successfully')"

# Copy remaining files (config/, alembic/, etc.) - won't invalidate model cache
COPY alembic/ ./alembic/
COPY config/ ./config/
COPY src/photocat/static/dist /app/src/photocat/static/dist
COPY alembic.ini ./

# Create non-root user and preserve cache ownership
RUN useradd -m -u 1000 photocat && chown -R photocat:photocat /app
USER photocat

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8080/health')"

# Run application
CMD uvicorn photocat.api:app --host 0.0.0.0 --port ${PORT:-8080}
