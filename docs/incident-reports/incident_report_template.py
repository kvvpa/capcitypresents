#!/usr/bin/env python3
"""
CapCity Presents : reusable incident-report PDF template.

This module provides the house style (palette, fonts, branded header/footer)
plus a set of visual building blocks for incident & remediation reports:

    Callout(title, body, accent, bg)     coloured side-bar note box
    DurationChart(rows)                  horizontal bar chart
    Timeline(items)                      horizontal milestone strip
    FlowDiagram(title, steps, ...)       vertical box-and-arrow flow
    code_block(lines)                    dark monospaced code panel
    bullets(items)                       bulleted list
    hr()                                 horizontal rule
    H1, H2, BODY, SMALL, BULLET          paragraph styles

To author a new report, import this module, build a list of flowables using
the helpers above, then call build_report(...). See build_event_sync_report.py
for a complete worked example.

House rule: no em dashes anywhere in report text (use commas, colons,
parentheses, or "to" for ranges).
"""
import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Flowable, ListFlowable, ListItem,
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# --- brand palette --------------------------------------------------------
INK      = colors.HexColor("#1f2937")
MUTED    = colors.HexColor("#6b7280")
PRIMARY  = colors.HexColor("#4338ca")
PRIMLT   = colors.HexColor("#eef2ff")
PRIMTXT  = colors.HexColor("#c7d2fe")
DANGER   = colors.HexColor("#dc2626")
DANGLT   = colors.HexColor("#fef2f2")
SUCCESS  = colors.HexColor("#16a34a")
SUCCLT   = colors.HexColor("#f0fdf4")
AMBER    = colors.HexColor("#b45309")
AMBERLT  = colors.HexColor("#fffbeb")
LINE     = colors.HexColor("#e5e7eb")
CODEBG   = colors.HexColor("#0f172a")
CODEFG   = colors.HexColor("#e2e8f0")

PAGE_W, PAGE_H = letter
MARGIN = 0.85 * inch
CONTENT_W = PAGE_W - 2 * MARGIN

# Logos, resolved relative to repo root.
#   DEFAULT_LOGO      : transparent black-ink badge, for use on light/white areas
#                       (e.g. the page footer).
#   DEFAULT_LOGO_DARK : white-text badge built to read on dark backgrounds
#                       (e.g. the coloured header banner), so no backing box
#                       is needed. The truly transparent badges are black ink
#                       and would disappear on the dark header.
_REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_LOGO = os.path.join(_REPO_ROOT, "logo", "opt-640", "logo-txt-blk-alltrans.png")
DEFAULT_LOGO_DARK = os.path.join(_REPO_ROOT, "logo", "opt-640", "logo-blk-whttext.png")
LOGO_ASPECT = 1.322  # width / height

# --- paragraph styles -----------------------------------------------------
_ss = getSampleStyleSheet()
H1 = ParagraphStyle("H1", parent=_ss["Heading1"], fontName="Helvetica-Bold",
                    fontSize=15, textColor=PRIMARY, spaceBefore=18, spaceAfter=7, leading=18)
H2 = ParagraphStyle("H2", parent=_ss["Heading2"], fontName="Helvetica-Bold",
                    fontSize=11.5, textColor=INK, spaceBefore=12, spaceAfter=4, leading=14)
BODY = ParagraphStyle("BODY", parent=_ss["BodyText"], fontName="Helvetica",
                      fontSize=9.6, textColor=INK, leading=14.5, alignment=TA_LEFT, spaceAfter=6)
SMALL = ParagraphStyle("SMALL", parent=BODY, fontSize=8.3, textColor=MUTED, leading=11.5)
BULLET = ParagraphStyle("BULLET", parent=BODY, spaceAfter=3, leading=13.5)
CODE = ParagraphStyle("CODE", parent=_ss["Code"], fontName="Courier", fontSize=8.0,
                      textColor=CODEFG, leading=11, leftIndent=0)


# --- small helpers --------------------------------------------------------
def hr(width=CONTENT_W, color=LINE, thick=0.7, sa=8):
    class _HR(Flowable):
        def wrap(self, w, h): return (width, thick + sa)
        def draw(self):
            self.canv.setStrokeColor(color); self.canv.setLineWidth(thick)
            self.canv.line(0, sa, width, sa)
    return _HR()


def code_block(lines, width=CONTENT_W):
    """Dark monospaced code panel."""
    text = "<br/>".join(
        ln.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace(" ", "&nbsp;")
        for ln in lines)
    p = Paragraph(text, CODE)
    t = Table([[p]], colWidths=[width])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), CODEBG),
        ("LEFTPADDING", (0, 0), (-1, -1), 10), ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8), ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("ROUNDEDCORNERS", [4, 4, 4, 4]),
    ]))
    return t


def bullets(items, style=BULLET):
    return ListFlowable(
        [ListItem(Paragraph(t, style), leftIndent=10, value="•") for t in items],
        bulletType="bullet", start="•", leftIndent=12, bulletFontSize=8,
        bulletColor=PRIMARY, spaceBefore=0, spaceAfter=2,
    )


# --- callout box ----------------------------------------------------------
class Callout(Flowable):
    def __init__(self, title, body, accent=PRIMARY, bg=PRIMLT, width=CONTENT_W):
        super().__init__()
        self.accent, self.bg, self.width, self.pad = accent, bg, width, 9
        self._t = Paragraph(title, ParagraphStyle("ct", fontName="Helvetica-Bold",
                            fontSize=9.6, textColor=accent, leading=13))
        self._b = Paragraph(body, ParagraphStyle("cb", fontName="Helvetica",
                            fontSize=9.2, textColor=INK, leading=13.5))

    def wrap(self, availW, availH):
        self.width = min(self.width, availW)
        inner = self.width - 2 * self.pad - 6
        _, th = self._t.wrap(inner, 1000)
        _, bh = self._b.wrap(inner, 1000)
        self.h = th + bh + 2 * self.pad + 5
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg); c.roundRect(0, 0, self.width, self.h, 5, fill=1, stroke=0)
        c.setFillColor(self.accent); c.roundRect(0, 0, 4, self.h, 2, fill=1, stroke=0)
        inner = self.width - 2 * self.pad - 6
        _, bh = self._b.wrap(inner, 1000)
        self._b.drawOn(c, self.pad + 6, self.pad)
        self._t.drawOn(c, self.pad + 6, self.pad + bh + 4)


# --- duration bar chart ---------------------------------------------------
class DurationChart(Flowable):
    """rows: list of (label, value_seconds, color, note)."""
    def __init__(self, rows, width=CONTENT_W, unit="s"):
        super().__init__()
        self.rows, self.width, self.unit = rows, width, unit
        self.rowh, self.top, self.bottom = 26, 8, 22

    def wrap(self, availW, availH):
        self.width = min(self.width, availW)
        self.h = self.top + self.bottom + self.rowh * len(self.rows)
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        chart_x = 156
        chart_w = self.width - chart_x - 50
        maxv = max(r[1] for r in self.rows)
        base_y = self.bottom
        c.setStrokeColor(LINE); c.setLineWidth(0.6)
        c.line(chart_x, base_y - 4, chart_x, self.h - self.top)
        for frac in (0.25, 0.5, 0.75, 1.0):
            gx = chart_x + chart_w * frac
            c.setStrokeColor(colors.HexColor("#f1f5f9")); c.line(gx, base_y - 2, gx, self.h - self.top)
            c.setFillColor(MUTED); c.setFont("Helvetica", 6.5)
            c.drawCentredString(gx, base_y - 13, f"{int(maxv*frac)}{self.unit}")
        c.setFillColor(MUTED); c.setFont("Helvetica", 6.5)
        c.drawCentredString(chart_x, base_y - 13, f"0{self.unit}")
        for i, (label, val, col, note) in enumerate(self.rows):
            y = self.h - self.top - (i + 1) * self.rowh + 6
            c.setFillColor(INK); c.setFont("Helvetica", 7.6); c.drawString(0, y + 4, label)
            bw = max(2.0, chart_w * (val / maxv))
            c.setFillColor(col); c.roundRect(chart_x, y, bw, 11, 2, fill=1, stroke=0)
            c.setFont("Helvetica-Bold", 7.2)
            if bw < 60:
                c.setFillColor(col); c.drawString(chart_x + bw + 4, y + 2.5, f"{val}{self.unit}  {note}")
            else:
                c.setFillColor(colors.white); c.drawString(chart_x + 6, y + 2.5, f"{val}{self.unit}")
                c.setFillColor(MUTED); c.setFont("Helvetica", 6.8); c.drawString(chart_x + bw + 4, y + 2.5, note)


# --- timeline -------------------------------------------------------------
class Timeline(Flowable):
    """items: list of (label, text, color)."""
    def __init__(self, items, width=CONTENT_W):
        super().__init__()
        self.items, self.width = items, width

    def wrap(self, availW, availH):
        self.width = min(self.width, availW); self.h = 86
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        n = len(self.items); pad = 14
        usable = self.width - 2 * pad; y = self.h - 40
        c.setStrokeColor(LINE); c.setLineWidth(2); c.line(pad, y, pad + usable, y)
        step = usable / (n - 1)
        for i, (date, text, col) in enumerate(self.items):
            x = pad + step * i
            c.setFillColor(col); c.setStrokeColor(colors.white); c.setLineWidth(2)
            c.circle(x, y, 5.5, fill=1, stroke=1)
            c.setFillColor(col); c.setFont("Helvetica-Bold", 7.8); c.drawCentredString(x, y + 12, date)
            c.setFillColor(INK); c.setFont("Helvetica", 6.9)
            words = text.split(); lines, cur = [], ""
            for w in words:
                if len(cur + " " + w) > 18:
                    lines.append(cur); cur = w
                else:
                    cur = (cur + " " + w).strip()
            if cur:
                lines.append(cur)
            for j, ln in enumerate(lines[:3]):
                c.drawCentredString(x, y - 14 - j * 8.5, ln)


# --- before/after flow diagram -------------------------------------------
class FlowDiagram(Flowable):
    """steps: list of (text, is_strong). outcome pill at the bottom."""
    def __init__(self, title, steps, accent, bg, outcome, outcome_col, width):
        super().__init__()
        self.title, self.steps = title, steps
        self.accent, self.bg = accent, bg
        self.outcome, self.outcome_col = outcome, outcome_col
        self.width, self.boxh, self.gap = width, 30, 13

    def wrap(self, availW, availH):
        self.width = min(self.width, availW)
        self.h = 26 + len(self.steps) * (self.boxh + self.gap) + 34
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        c.setFillColor(self.bg); c.roundRect(0, 0, self.width, self.h, 6, fill=1, stroke=0)
        c.setFillColor(self.accent); c.setFont("Helvetica-Bold", 9.5)
        c.drawCentredString(self.width / 2, self.h - 17, self.title)
        bx, bw = 12, self.width - 24
        y = self.h - 26
        for txt, strong in self.steps:
            y -= self.boxh
            c.setFillColor(colors.white)
            c.setStrokeColor(self.accent if strong else LINE); c.setLineWidth(1.1 if strong else 0.7)
            c.roundRect(bx, y, bw, self.boxh, 4, fill=1, stroke=1)
            c.setFillColor(INK); c.setFont("Helvetica-Bold" if strong else "Helvetica", 8.0)
            lines = txt.split("\n"); ly = y + self.boxh / 2 + (len(lines) - 1) * 4.5 - 3
            for ln in lines:
                c.drawCentredString(self.width / 2, ly, ln); ly -= 9
            c.setStrokeColor(self.accent); c.setLineWidth(1.2)
            c.line(self.width / 2, y, self.width / 2, y - self.gap + 5)
            c.setFillColor(self.accent)
            p = c.beginPath()
            p.moveTo(self.width / 2 - 3, y - self.gap + 6); p.lineTo(self.width / 2 + 3, y - self.gap + 6)
            p.lineTo(self.width / 2, y - self.gap + 1); p.close()
            c.drawPath(p, fill=1, stroke=0)
            y -= self.gap
        c.setFillColor(self.outcome_col); c.roundRect(bx, y - 4, bw, 22, 11, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 8.2)
        c.drawCentredString(self.width / 2, y + 3, self.outcome)


# --- branded header -------------------------------------------------------
class HeaderBlock(Flowable):
    """
    Branded title banner: logo chip (left), eyebrow + title + subtitle + meta
    (center), status pill (top-right). Title auto-fits so it never collides
    with the pill.
    """
    def __init__(self, eyebrow, title, subtitle, meta,
                 status_label, status_color, logo_path=DEFAULT_LOGO_DARK, width=CONTENT_W):
        super().__init__()
        self.eyebrow, self.title, self.subtitle, self.meta = eyebrow, title, subtitle, meta
        self.status_label, self.status_color = status_label, status_color
        self.logo_path = logo_path if (logo_path and os.path.exists(logo_path)) else None
        self.width, self.h = width, 116

    def wrap(self, availW, availH):
        self.width = min(self.width, availW)
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        W, H = self.width, self.h
        c.setFillColor(PRIMARY); c.roundRect(0, 0, W, H, 8, fill=1, stroke=0)

        # logo placed directly on the banner (white-text badge, no backing box)
        logo_x, logo_zone_w = 16, 104
        if self.logo_path:
            lh = 84
            lw = lh * LOGO_ASPECT
            if lw > logo_zone_w:
                lw, lh = logo_zone_w, logo_zone_w / LOGO_ASPECT
            lx = logo_x + (logo_zone_w - lw) / 2
            ly = (H - lh) / 2
            c.drawImage(self.logo_path, lx, ly, lw, lh, mask="auto", preserveAspectRatio=True)

        # status pill (top-right)
        pill_h = 22
        pad_x = 13
        pw = stringWidth(self.status_label, "Helvetica-Bold", 9) + 2 * pad_x
        pill_x = W - 14 - pw
        pill_y = H - 14 - pill_h
        c.setFillColor(self.status_color); c.roundRect(pill_x, pill_y, pw, pill_h, pill_h / 2, fill=1, stroke=0)
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(pill_x + pw / 2, pill_y + 6.5, self.status_label)

        # text column
        tx = logo_x + logo_zone_w + 16
        avail = (pill_x - 12) - tx
        if self.eyebrow:
            c.setFillColor(PRIMTXT); c.setFont("Helvetica-Bold", 8)
            c.drawString(tx, 86, self.eyebrow.upper())
        # auto-fit title
        size = 18
        while size > 11 and stringWidth(self.title, "Helvetica-Bold", size) > avail:
            size -= 0.5
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", size)
        c.drawString(tx, 58, self.title)
        if self.subtitle:
            c.setFillColor(PRIMTXT); c.setFont("Helvetica", 9.5)
            c.drawString(tx, 40, self.subtitle)
        if self.meta:
            c.setFillColor(PRIMTXT); c.setFont("Helvetica", 8)
            c.drawString(tx, 22, self.meta)


def _footer_factory(logo_path, left_text, center_text):
    logo = logo_path if (logo_path and os.path.exists(logo_path)) else None

    def on_page(c, doc):
        c.saveState()
        c.setStrokeColor(LINE); c.setLineWidth(0.6)
        c.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
        x = MARGIN
        if logo:
            fh = 13; fw = fh * LOGO_ASPECT
            c.drawImage(logo, x, 0.40 * inch, fw, fh, mask="auto", preserveAspectRatio=True)
            x += fw + 6
        c.setFont("Helvetica", 7.6); c.setFillColor(MUTED)
        c.drawString(x, 0.45 * inch, left_text)
        c.drawCentredString(PAGE_W / 2, 0.45 * inch, center_text)
        c.drawRightString(PAGE_W - MARGIN, 0.45 * inch, f"Page {doc.page}")
        c.restoreState()
    return on_page


def build_report(out_path, header, story, footer_left="CapCity Presents",
                 footer_center="Confidential : Operations", logo_path=DEFAULT_LOGO,
                 title_meta="Incident Report", author="CapCity Presents Operations"):
    """
    header : HeaderBlock instance (the branded banner)
    story  : list of flowables for the body (built with the helpers above)
    """
    doc = BaseDocTemplate(out_path, pagesize=letter,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=0.8 * inch, bottomMargin=0.85 * inch,
                          title=title_meta, author=author)
    frame = Frame(MARGIN, 0.85 * inch, CONTENT_W, PAGE_H - 0.8 * inch - 0.85 * inch, id="main")
    on_page = _footer_factory(logo_path, footer_left, footer_center)
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=on_page)])
    flow = [header, Spacer(1, 14)] + story
    doc.build(flow)
    return out_path
