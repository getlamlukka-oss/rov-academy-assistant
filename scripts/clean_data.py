"""ตรวจและรวมสองชีตเป็น JSON โดยไม่แก้ Excel ต้นฉบับ"""

import sys
import json
from pathlib import Path

root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root))
from backend.importer import clean_workbook

if __name__ == "__main__":
    try:
        source = (
            Path(sys.argv[1])
            if len(sys.argv) > 1
            else root / "data/RoV_Academy_Answers_แก้ชีส.xlsx"
        )
        records = clean_workbook(source)
        output = root / "data/cleaned_questions.json"
        output.write_text(json.dumps(records, ensure_ascii=False, indent=2))
        print(
            f'ตรวจข้อมูลสำเร็จ: {len(records)} ข้อ / {len(set(r["chapter_id"] for r in records))} บท → {output}'
        )
    except Exception as error:
        sys.exit(f"ตรวจข้อมูลไม่สำเร็จ: {error}")
