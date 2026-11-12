FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY pyproject.toml README.md ./
COPY src ./src
COPY configs ./configs
RUN pip install --no-cache-dir --no-deps .

EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn solar_race_planner.serve.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
