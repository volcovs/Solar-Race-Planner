"""Database connection and session management.

Reads SRP_DATABASE_URL from the environment (never hardcoded secrets).
Works both hosted (Northflank Postgres) and locally (Docker PostGIS container).
"""

import os
from collections.abc import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, declarative_base, sessionmaker

DEFAULT_DB_URL = "postgresql+psycopg://srp:srp@localhost:5432/srp"


def get_database_url() -> str:
    """Return the database URL from environment variable SRP_DATABASE_URL."""
    url = os.environ.get("SRP_DATABASE_URL", DEFAULT_DB_URL)
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    return url


def create_db_engine(db_url: str | None = None):
    url = db_url or get_database_url()
    return create_engine(url, pool_pre_ping=True)


engine = create_db_engine()
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency for getting database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_postgis_extension(target_engine=None) -> bool:
    """Check and ensure PostGIS is installed on the database."""
    eng = target_engine or engine
    try:
        with eng.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis;"))
            conn.commit()
            result = conn.execute(text("SELECT PostGIS_Version();")).scalar()
            return bool(result)
    except Exception:
        return False
