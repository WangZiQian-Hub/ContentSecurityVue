from typing import Any

from sqlalchemy import JSON, Integer, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .core import now


class Base(DeclarativeBase):
    pass


class DocumentMixin:
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    public_id: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    owner: Mapped[str] = mapped_column(String(100), index=True, default="platform")
    parent_id: Mapped[str | None] = mapped_column(String(100), index=True, nullable=True)
    status: Mapped[str] = mapped_column(String(40), index=True, default="draft")
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40), default=now)
    updated_at: Mapped[str] = mapped_column(String(40), default=now, onupdate=now)


class Metric(DocumentMixin, Base):
    __tablename__ = "metrics"


class MetricRevision(DocumentMixin, Base):
    __tablename__ = "metric_revisions"


class Plan(DocumentMixin, Base):
    __tablename__ = "evaluation_plans"


class Task(DocumentMixin, Base):
    __tablename__ = "tasks"


class Run(DocumentMixin, Base):
    __tablename__ = "evaluation_runs"


class MetricResult(DocumentMixin, Base):
    __tablename__ = "evaluation_metric_results"
    metric_code: Mapped[str] = mapped_column(String(64))
    revision_id: Mapped[str] = mapped_column(String(100))
    __table_args__ = (UniqueConstraint("parent_id", "metric_code", "revision_id"),)


class Evidence(DocumentMixin, Base):
    __tablename__ = "evaluation_evidence"


class Event(DocumentMixin, Base):
    __tablename__ = "task_logs"


class RecordLink(DocumentMixin, Base):
    __tablename__ = "evaluation_record_links"
    namespace: Mapped[str] = mapped_column(String(100))
    record_id: Mapped[str] = mapped_column(String(100), index=True)
    __table_args__ = (UniqueConstraint("namespace", "record_id", "parent_id"),)


class Export(DocumentMixin, Base):
    __tablename__ = "evaluation_exports"


class Ticket(DocumentMixin, Base):
    __tablename__ = "evaluation_download_tickets"


class Preflight(DocumentMixin, Base):
    __tablename__ = "evaluation_preflights"


class Idempotency(DocumentMixin, Base):
    __tablename__ = "idempotency_requests"
