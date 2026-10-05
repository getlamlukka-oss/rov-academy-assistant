"""สร้าง source archive และ Markdown โค้ดเต็มโดยไม่รวม secrets/runtime files"""

from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent.parent
EXCLUDED_PARTS = {
    "node_modules",
    ".next",
    "__pycache__",
    ".pytest_cache",
    ".venv",
    "artifacts",
    ".git",
}
EXCLUDED_NAMES = {
    ".env",
    ".env.local",
    "cleaned_questions.json",
    "academy_login.lock",
}


def sources():
    for path in sorted(ROOT.rglob("*")):
        relative = path.relative_to(ROOT)
        if not path.is_file() or any(part in EXCLUDED_PARTS for part in relative.parts):
            continue
        if (
            path.name in EXCLUDED_NAMES
            or path.suffix in {".db", ".pyc", ".tsbuildinfo"}
            or ".db-" in path.name
            or "academy_sessions" in relative.parts
        ):
            continue
        yield path, relative


if __name__ == "__main__":
    output = ROOT.parent
    archive = output / "rov-academy-web.zip"
    markdown = output / "RoV_Academy_Full_Source.md"
    files = list(sources())
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zipfile_out:
        for path, relative in files:
            zipfile_out.write(path, Path(ROOT.name) / relative)
    languages = {
        ".py": "python",
        ".tsx": "tsx",
        ".ts": "typescript",
        ".js": "javascript",
        ".json": "json",
        ".yml": "yaml",
        ".css": "css",
        ".md": "markdown",
    }
    sections = [
        "# RoV Academy — โค้ดเต็มทุกไฟล์\n\nแสดง path และโค้ดทั้งหมด ไฟล์ Excel เป็น binary และอยู่ใน ZIP\n"
    ]
    for path, relative in files:
        if path.suffix == ".xlsx":
            sections.append(
                f"## `{relative}`\n\nไฟล์เต็มรวมอยู่ใน ZIP (ขนาด {path.stat().st_size:,} bytes)\n"
            )
            continue
        content = path.read_text(encoding="utf-8")
        sections.append(
            f'## `{relative}`\n\n````{languages.get(path.suffix, "text")}\n{content}\n````\n'
        )
    markdown.write_text("\n".join(sections), encoding="utf-8")
    print(f"สร้าง {archive} ({len(files)} ไฟล์) และ {markdown}")
