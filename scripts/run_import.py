"""นำเข้าแบบ idempotent; --overwrite ใช้เมื่อประสงค์ทับคำตอบที่แก้ในเว็บ"""

import argparse
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
from backend.database import SessionLocal, init_db
from backend.importer import clean_workbook, import_records

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--file", default=str(root / "data/RoV_Academy_Answers_แก้ชีส.xlsx")
    )
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()
    try:
        records = clean_workbook(args.file)
        init_db()
        with SessionLocal() as db:
            print(import_records(db, records, overwrite=args.overwrite))
    except Exception as error:
        sys.exit(f"นำเข้าไม่สำเร็จ: {error}")
