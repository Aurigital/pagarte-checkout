#!/usr/bin/env python3
"""
Builds the integration manual as a single printable HTML, then a PDF.

No external deps: a small Markdown subset is enough for these documents
(headings, tables, fenced code, lists, blockquotes, inline code/bold/links).
"""
import html
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / 'docs'

PARTS = [
    DOCS / '_pdf-cover.md',
    DOCS / 'PAGARTE_INTEGRATION_MANUAL.md',
    DOCS / 'PROBAR_EN_SANDBOX.md',
    DOCS / 'PASAR_A_LIVE.md',
    DOCS / 'PERSISTENCIA.md',
    DOCS / '_pdf-appendix.md',
]


def inline(text: str) -> str:
    """Escape, then apply inline Markdown. Code spans are protected first."""
    spans: list[str] = []

    def stash(m):
        spans.append(m.group(1))
        return f'\x00{len(spans) - 1}\x00'

    text = re.sub(r'`([^`]+)`', stash, text)
    text = html.escape(text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'(?<![\w*])\*([^*\n]+)\*(?![\w*])', r'<em>\1</em>', text)
    text = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', text)
    return re.sub(
        r'\x00(\d+)\x00',
        lambda m: f'<code>{html.escape(spans[int(m.group(1))])}</code>',
        text,
    )


def render(md: str) -> str:
    out: list[str] = []
    lines = md.split('\n')
    i = 0

    while i < len(lines):
        line = lines[i]

        # Fenced code
        if line.startswith('```'):
            lang = line[3:].strip()
            i += 1
            buf = []
            while i < len(lines) and not lines[i].startswith('```'):
                buf.append(lines[i])
                i += 1
            i += 1
            code = html.escape('\n'.join(buf))
            out.append(f'<pre class="code" data-lang="{html.escape(lang)}"><code>{code}</code></pre>')
            continue

        # Table
        if line.strip().startswith('|') and i + 1 < len(lines) and re.match(
            r'^\s*\|[\s:|-]+\|\s*$', lines[i + 1]
        ):
            def cells(row):
                return [c.strip() for c in row.strip().strip('|').split('|')]

            head = cells(line)
            i += 2
            body = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                body.append(cells(lines[i]))
                i += 1
            th = ''.join(f'<th>{inline(c)}</th>' for c in head)
            rows = ''.join(
                '<tr>' + ''.join(f'<td>{inline(c)}</td>' for c in r) + '</tr>' for r in body
            )
            out.append(f'<table><thead><tr>{th}</tr></thead><tbody>{rows}</tbody></table>')
            continue

        # Headings
        m = re.match(r'^(#{1,4})\s+(.*)$', line)
        if m:
            lvl = len(m.group(1))
            out.append(f'<h{lvl}>{inline(m.group(2))}</h{lvl}>')
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^---+$', line.strip()):
            out.append('<hr>')
            i += 1
            continue

        # Blockquote
        if line.startswith('>'):
            buf = []
            while i < len(lines) and lines[i].startswith('>'):
                buf.append(lines[i].lstrip('>').strip())
                i += 1
            out.append(f'<blockquote>{render(chr(10).join(buf))}</blockquote>')
            continue

        # Lists
        if re.match(r'^\s*([-*]|\d+\.)\s+', line):
            m0 = re.match(r'^\s*(\d+)\.\s', line)
            ordered = bool(m0)
            start = int(m0.group(1)) if m0 else 1
            items = []
            while i < len(lines):
                if re.match(r'^\s*([-*]|\d+\.)\s+', lines[i]):
                    item = re.sub(r'^\s*([-*]|\d+\.)\s+', '', lines[i])
                    item = re.sub(
                        r'^\[([ xX])\]\s*',
                        lambda m: '☑ ' if m.group(1) in 'xX' else '☐ ',
                        item,
                    )
                    items.append([item])
                    i += 1
                # An indented line continues the previous item rather than
                # ending the list, which would restart the numbering.
                elif items and lines[i].startswith(('   ', '\t')) and lines[i].strip():
                    items[-1].append(lines[i].strip())
                    i += 1
                else:
                    break
            lis = ''.join(f'<li>{inline(" ".join(parts))}</li>' for parts in items)
            if ordered:
                attr = f' start="{start}"' if start != 1 else ''
                out.append(f'<ol{attr}>{lis}</ol>')
            else:
                out.append(f'<ul>{lis}</ul>')
            continue

        if not line.strip():
            i += 1
            continue

        # Paragraph
        buf = []
        while i < len(lines) and lines[i].strip() and not re.match(
            r'^(#{1,4}\s|```|>|\s*([-*]|\d+\.)\s|\||---+$)', lines[i]
        ):
            buf.append(lines[i])
            i += 1
        out.append(f'<p>{inline(" ".join(buf))}</p>')

    return '\n'.join(out)


CSS = """
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body {
  font: 10.5pt/1.55 -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1f2430; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1 { font-size: 21pt; margin: 0 0 .4em; color: #4c1d95; line-height: 1.2; }
h2 {
  font-size: 14pt; margin: 1.9em 0 .6em; padding-bottom: .25em;
  border-bottom: 2px solid #ede9fe; color: #5b21b6; page-break-after: avoid;
}
h3 { font-size: 11.5pt; margin: 1.4em 0 .4em; color: #1f2430; page-break-after: avoid; }
h4 { font-size: 10.5pt; margin: 1.1em 0 .3em; color: #4b5563; page-break-after: avoid; }
p { margin: .55em 0; orphans: 3; widows: 3; }
a { color: #6d28d9; text-decoration: none; word-break: break-word; }
code {
  font: 9pt/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  background: #f4f2fb; padding: .1em .35em; border-radius: 3px; color: #5b21b6;
}
pre.code {
  background: #1e1b31; color: #e6e4f0; padding: 11px 13px; border-radius: 6px;
  overflow-x: auto; page-break-inside: avoid; margin: .7em 0;
}
pre.code code { background: none; color: inherit; padding: 0; font-size: 8.4pt; line-height: 1.5; }
table {
  border-collapse: collapse; width: 100%; margin: .8em 0;
  font-size: 9.3pt; page-break-inside: avoid;
}
th, td { border: 1px solid #e3e0ee; padding: 6px 9px; text-align: left; vertical-align: top; }
th { background: #f6f4fd; font-weight: 600; color: #4c1d95; }
tr:nth-child(even) td { background: #fbfafe; }
blockquote {
  margin: .8em 0; padding: .6em .9em; background: #fdf8ec;
  border-left: 3px solid #e0a82e; page-break-inside: avoid;
}
blockquote p { margin: .3em 0; }
ul, ol { margin: .5em 0; padding-left: 1.5em; }
li { margin: .25em 0; }
hr { border: 0; border-top: 1px solid #e3e0ee; margin: 1.6em 0; }
.page-break { page-break-before: always; }
"""


def main() -> int:
    chunks = []
    for n, part in enumerate(PARTS):
        if not part.exists():
            print(f'  ! falta {part.name}', file=sys.stderr)
            continue
        body = render(part.read_text(encoding='utf-8'))
        cls = ' class="page-break"' if n else ''
        chunks.append(f'<section{cls}>{body}</section>')
        print(f'  + {part.name}')

    doc = (
        '<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<title>Integración PagArte — Guía técnica</title>'
        f'<style>{CSS}</style></head><body>{"".join(chunks)}</body></html>'
    )
    out = ROOT / 'docs' / 'Guia-Integracion-PagArte.html'
    out.write_text(doc, encoding='utf-8')
    print(f'\nHTML: {out}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
