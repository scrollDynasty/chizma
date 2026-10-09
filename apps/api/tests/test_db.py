from pathlib import Path

from sqlalchemy import text

from chizma_api.db import create_db_engine


def test_sqlite_engine_creates_parent_directory(tmp_path: Path) -> None:
    db_file = tmp_path / "nested" / "chizma.db"

    engine = create_db_engine(f"sqlite:///{db_file.as_posix()}")
    with engine.connect() as conn:
        assert conn.execute(text("select 1")).scalar() == 1

    assert db_file.parent.is_dir()
