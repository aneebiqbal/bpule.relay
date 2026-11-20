# Relay V5 — PDF / DOCX Visual QA

**Method:** `scripts/qa/resume-render-matrix.ts` renders real PDF pages and
re-extracts their text; `pdftoppm` renders pages to PNG for visual inspection.
Artifacts: `qa-artifacts/staging-v5/` and `qa-artifacts/staging-v5/matrix/`.

---

## 1. Render matrix (32 combinations)

4 document shapes × 4 templates × 2 paper sizes.

| Shape | Templates | Pages | Media box | Links | Text extracted | DOCX |
|---|---|---|---|---|---|---|
| short | all 4 | 1 | 612×792 / 595×842 | yes | 518 chars | PK |
| long (40+ bullets) | all 4 | 2 (1 for minimal-a4) | correct | yes | ~2,559 chars | PK |
| sparse | all 4 | 1 | correct | n/a | 48 chars | PK |
| unicode | all 4 | 1 | correct | n/a | 79 chars | PK |

No blank pages, no overflow, correct A4 / US Letter media boxes, working link
annotations on every resume that contains a URL.

## 2. Visual inspection

`qa-artifacts/staging-v5/page-1.png` — the Ultra ATS A4 render of a real
generated CV:

- Bold section headings (Experience / Projects / Links) with clear hierarchy.
- Bullets aligned and indented.
- Dated employment chronology intact.
- Portfolio link rendered as a clickable `/Annot /Subtype /Link`.
- No clipped text, no overlap, no orphaned heading, one page.

## 3. Extraction check

`extractPdfText` re-extracts every rendered PDF and confirms the candidate name
and content survive. The ATS panel reports the same coverage (100% in the
browser run).

## 4. Known limitation — non-Latin scripts in the PDF

The hand-rolled PDF renderer uses a base-14 Helvetica font with a Latin-1 text
layer. Accented Latin characters survive; **Urdu / Arabic / Devanagari
degrade to `?`** in the PDF. The DOCX path preserves full Unicode.

```
PDF : Ayesha Khan - ?????
DOCX: Ayesha Khan — ایجنس
```

`shortcut: base-14 PDF font is Latin-1 only, non-Latin names degrade to "?".
Upgrade by embedding a Unicode TTF (pdfkit / Noto) if a non-Latin name matters.`

Most Relay profiles use a Latin display name, so the practical impact is low,
but it is reported rather than hidden.

## 5. DOCX validity

Every DOCX opens as a real OOXML zip (`PK`), contains `[Content_Types].xml`,
`_rels/.rels` and `word/document.xml`, and carries the full Unicode text.
