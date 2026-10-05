"""จับคู่ข้อความแบบอนุรักษ์นิยม ไม่เดาคำตอบด้วย fuzzy matching"""

import re
import unicodedata


def normalize(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value)).strip().casefold()


def match_question(text, rows):
    matches = [q for q in rows if normalize(q.question) == normalize(text)]
    if len(matches) != 1:
        raise ValueError("ไม่พบโจทย์ที่ตรงกันแบบเอกลักษณ์ หยุดเพื่อป้องกันตอบผิด")
    return matches[0]


def option_index(q, live_options):
    stored = [normalize(x) for x in q.options]
    live = [normalize(x) for x in live_options]
    if len(live) != 4:
        raise ValueError("หน้าเว็บมีตัวเลือกไม่ครบ 4 ข้อ")
    if sorted(stored) != sorted(live):
        raise ValueError("ตัวเลือกเว็บจริงไม่ตรง Excel กรุณาตรวจและแก้ข้อมูลก่อน")
    if stored == live:
        return q.answer_idx
    target = normalize(q.answer_text)
    found = [i for i, x in enumerate(live) if x == target]
    if len(found) != 1:
        raise ValueError("มีตัวเลือกคำตอบซ้ำและลำดับเปลี่ยน ไม่สามารถตัดสินใจได้")
    return found[0]
