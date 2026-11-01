FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /srv
RUN apt-get update && apt-get install -y --no-install-recommends libglib2.0-0 && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app ./app
COPY labels.json download_models.py ./
COPY models ./models
# Fetch model files that are not in the build context (published by .github/workflows/ai-models.yml).
ARG MODEL_BASE_URL=https://github.com/Alaa2134/roadshield-ai/releases/download/ai-models
RUN MODEL_BASE_URL=$MODEL_BASE_URL python download_models.py
RUN useradd --system --uid 10001 roadshield && chown -R roadshield /srv
USER roadshield
ENV PORT=8080 WEB_CONCURRENCY=1
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD python -c "import os,urllib.request,sys; sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{os.environ.get(\"PORT\",\"8080\")}/health').status==200 else 1)"
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers ${WEB_CONCURRENCY} --proxy-headers --forwarded-allow-ips='*'"]
