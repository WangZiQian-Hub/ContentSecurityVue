from collections.abc import Callable, Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import Any, TypeVar

from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session

from .core import BusinessError, digest
from .models import Base, DocumentMixin, Idempotency

M = TypeVar("M", bound=DocumentMixin)


class Repository:
    def __init__(self, url: str):
        if url.startswith("sqlite:///"):
            Path(url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(url, connect_args={"check_same_thread": False, "timeout": 30})

        @event.listens_for(self.engine, "connect")
        def configure(connection: Any, _: Any) -> None:
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA journal_mode=WAL")

    @contextmanager
    def transaction(self) -> Iterator[Session]:
        with Session(self.engine, expire_on_commit=False) as session:
            # SQLite serializes writers across processes, not just a Python lock.
            session.connection().exec_driver_sql("BEGIN IMMEDIATE")
            try:
                yield session
                session.commit()
            except BaseException:
                session.rollback()
                raise

    def initialize(self) -> None:
        Base.metadata.create_all(self.engine)

    @staticmethod
    def get(session: Session, model: type[M], public_id: str) -> M:
        row = session.scalar(select(model).where(model.public_id == public_id))
        if row is None:
            raise BusinessError("指定记录不存在", 404, 10002, "not_found")
        return row

    @staticmethod
    def list(session: Session, model: type[M], parent_id: str | None = None) -> list[M]:
        query = select(model).order_by(model.id.desc())
        if parent_id is not None:
            query = query.where(model.parent_id == parent_id)
        return list(session.scalars(query))

    def idempotent(self, owner: str, operation: str, key: str, body: Any, action: Callable[[Session], dict]) -> dict:
        identity = digest([owner, operation, key])
        fingerprint = digest(body)
        with self.transaction() as session:
            existing = session.scalar(select(Idempotency).where(Idempotency.public_id == identity))
            if existing:
                if existing.payload["hash"] != fingerprint:
                    raise BusinessError("同一请求编号不能用于不同输入", 409, 10003, "idempotency_conflict")
                return existing.payload["response"]
            result = action(session)
            session.add(
                Idempotency(
                    public_id=identity,
                    owner=owner,
                    status="succeeded",
                    payload={"hash": fingerprint, "response": result},
                )
            )
            session.flush()
            return result
