"""Initial additive evaluation storage. Run only against the new independent database."""

from alembic import op

from app.models import Base

revision = "0001_evaluation"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(op.get_bind(), checkfirst=True)


def downgrade() -> None:
    raise RuntimeError("Destructive downgrade is disabled: preserve historical evaluation evidence")
