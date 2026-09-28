import json
import os
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
os.chdir(root)
sys.path.insert(0, str(root))
from app.main import create_app  # noqa: E402
from app.schemas import SourceContext  # noqa: E402

output = root.parent / "docs" / "evaluation"
(output / "openapi.json").write_text(json.dumps(create_app().openapi(), ensure_ascii=False, indent=2), encoding="utf-8")
(output / "upstream-source.schema.json").write_text(
    json.dumps(SourceContext.model_json_schema(), ensure_ascii=False, indent=2), encoding="utf-8"
)
print("Exported OpenAPI and upstream schema.")
