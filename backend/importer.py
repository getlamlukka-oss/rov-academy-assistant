"""รวมสองชีตตามรหัสบท/เลขข้อ; หยุดเมื่อข้อมูลขาดหรือเฉลยไม่ตรงตัวเลือก"""

import json
from pathlib import Path
from openpyxl import load_workbook
from sqlalchemy import select
from backend.models import Question


def sheet_records(sheet, required):
    header = None
    for row in sheet.values:
        values = [str(x).strip() if x is not None else "" for x in row]
        if header is None:
            if required.issubset(set(values)):
                header = values
            continue
        if row[0] is not None and isinstance(row[0], (int, float)):
            yield dict(zip(header, row))
    if header is None:
        raise ValueError(f"ไม่พบหัวตารางที่ต้องการใน {sheet.title}")


def clean_workbook(path):
    workbook = load_workbook(path, data_only=True)
    try:
        original = {}
        for r in sheet_records(workbook["โจทย์ต้นฉบับ"], {"รหัสบท", "ข้อ", "ตัวเลือก 1"}):
            key = (int(r["รหัสบท"]), int(r["ข้อ"]))
            if key in original:
                raise ValueError(f"โจทย์ต้นฉบับซ้ำ: {key}")
            original[key] = r
        result, keys = [], set()
        for r in sheet_records(workbook["คำตอบ"], {"รหัสบท", "ข้อ", "คำตอบที่เสนอ"}):
            key = (int(r["รหัสบท"]), int(r["ข้อ"]))
            if key in keys:
                raise ValueError(f"คำตอบซ้ำ: {key}")
            keys.add(key)
            if key not in original:
                raise ValueError(f"ไม่มีโจทย์ต้นฉบับ: {key}")
            source = original[key]
            options = [
                str(source.get(f"ตัวเลือก {i}") or "").strip() for i in range(1, 5)
            ]
            idx = int(r["ตัวเลือก"]) - 1
            answer = str(r["คำตอบที่เสนอ"]).strip()
            if (
                any(not option for option in options)
                or not 0 <= idx <= 3
                or options[idx] != answer
            ):
                raise ValueError(f"ตัวเลือก/เฉลยไม่สอดคล้อง: บท {key[0]} ข้อ {key[1]}")
            if str(r["คำถาม"]).strip() != str(source["คำถาม"]).strip():
                raise ValueError(f"ข้อความโจทย์สองชีตไม่ตรงกัน: {key}")
            result.append(
                dict(
                    chapter_id=key[0],
                    chapter_name=str(r["บท"]).strip(),
                    no=key[1],
                    question=str(r["คำถาม"]).strip(),
                    options=options,
                    answer_text=answer,
                    answer_idx=idx,
                    source_type=str(r["หลักฐาน"] or "อ้างอิงบทเรียน"),
                    note=str(r["หมายเหตุ"] or ""),
                    source_url=str(source.get("แหล่งบทเรียน") or ""),
                    verified=r["หลักฐาน"] == "ผ่านระบบแล้ว",
                )
            )
        if len(result) != 184 or len({r["chapter_id"] for r in result}) != 40:
            raise ValueError(f"ไฟล์นี้คาดหวัง 184 ข้อ / 40 บท แต่พบ {len(result)} ข้อ")
        return result
    finally:
        workbook.close()


def import_records(db, records, overwrite=False):
    added, skipped, updated = 0, 0, 0
    for record in records:
        existing = db.scalar(
            select(Question).where(
                Question.chapter_id == record["chapter_id"], Question.no == record["no"]
            )
        )
        if existing:
            if overwrite:
                for key, value in record.items():
                    setattr(existing, key, value)
                updated += 1
            else:
                skipped += 1  # ไม่ทับเฉลยที่ admin แก้แล้ว
        else:
            db.add(Question(**record))
            added += 1
    db.commit()
    return {
        "added": added,
        "skipped": skipped,
        "updated": updated,
        "total_in_file": len(records),
    }
