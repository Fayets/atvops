FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1

# Claude Code CLI (análisis de activación) — instalador nativo, sin Node.js
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
    && curl -fsSL https://claude.ai/install.sh | bash \
    && apt-get purge -y --auto-remove curl \
    && rm -rf /var/lib/apt/lists/*
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# SQLite + fotos de integrantes viven en /app/data (volumen persistente).
RUN mkdir -p /app/data/fotos

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
