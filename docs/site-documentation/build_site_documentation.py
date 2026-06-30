#!/usr/bin/env python3
"""
CapCity Presents : full website technical documentation (PDF).

Reuses the shared CapCity report style (palette, fonts, callouts, code panels,
bullets) from docs/incident-reports/incident_report_template.py and adds
document-specific pieces: a cover page, a table of contents, and diagram
flowables (pipeline, grouped components, route tree).

Run:
    pip install reportlab
    python docs/site-documentation/build_site_documentation.py
Output: docs/site-documentation/CapCity-Website-Documentation.pdf

House rule: no em dashes.
"""
import os
import sys

from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle,
    Flowable, PageBreak,
)
from reportlab.platypus.tableofcontents import TableOfContents
from reportlab.lib.styles import ParagraphStyle

# import shared style module from the incident-reports folder
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.abspath(os.path.join(_HERE, "..", ".."))
sys.path.insert(0, os.path.join(_REPO_ROOT, "docs", "incident-reports"))
import incident_report_template as T  # noqa: E402

OUT = os.path.join(_HERE, "CapCity-Website-Documentation.pdf")
CONTENT_W = T.CONTENT_W
PAGE_W, PAGE_H = letter
MARGIN = T.MARGIN
LOGO_DARK = T.DEFAULT_LOGO_DARK
LOGO_LIGHT = T.DEFAULT_LOGO

# section-number paragraph styles (so the table of contents stays clean)
H1N = ParagraphStyle("H1", parent=T.H1)          # name must stay "H1" for TOC hook
H2N = ParagraphStyle("H2", parent=T.H2)

TOC_L0 = ParagraphStyle("TOC0", fontName="Helvetica-Bold", fontSize=10.5,
                        textColor=T.INK, leading=18, spaceBefore=6)
TOC_L1 = ParagraphStyle("TOC1", fontName="Helvetica", fontSize=9.5,
                        textColor=T.MUTED, leading=15, leftIndent=16)

# table-cell styles: cells must be Paragraphs so inline markup parses and text wraps
CELL = ParagraphStyle("CELL", fontName="Helvetica", fontSize=8, leading=10.8, textColor=T.INK)
CELL_B = ParagraphStyle("CELLB", parent=CELL, fontName="Helvetica-Bold")
CELL_MONO = ParagraphStyle("CELLM", parent=CELL, fontName="Courier")
CELL_MONO_B = ParagraphStyle("CELLMB", parent=CELL, fontName="Courier-Bold", textColor=T.PRIMARY)


# ---- cover page ----------------------------------------------------------
class CoverPage(Flowable):
    def __init__(self, title, subtitle, meta_lines):
        super().__init__()
        self.title, self.subtitle, self.meta_lines = title, subtitle, meta_lines
        self.width, self.height = CONTENT_W, 100

    def wrap(self, availW, availH):
        self.width, self.height = availW, availH - 2
        return (self.width, self.height)

    def draw(self):
        c = self.canv
        W, H = self.width, self.height
        # full panel
        c.setFillColor(T.PRIMARY); c.roundRect(0, 0, W, H, 12, fill=1, stroke=0)
        # transparent white-text badge placed directly on the panel (no card)
        lh = 156
        lw = lh * T.LOGO_ASPECT
        logo_top = H - 90
        ly = logo_top - lh
        c.drawImage(LOGO_DARK, (W - lw) / 2, ly, lw, lh, mask="auto", preserveAspectRatio=True)
        # title
        cy = ly - 46
        c.setFillColor(colors.white); c.setFont("Helvetica-Bold", 26)
        c.drawCentredString(W / 2, cy, self.title)
        c.setFillColor(T.PRIMTXT); c.setFont("Helvetica", 13)
        c.drawCentredString(W / 2, cy - 26, self.subtitle)
        # divider
        c.setStrokeColor(colors.HexColor("#6d63d6")); c.setLineWidth(1)
        c.line(W / 2 - 80, cy - 44, W / 2 + 80, cy - 44)
        # meta lines
        my = cy - 70
        c.setFont("Helvetica", 10); c.setFillColor(colors.white)
        for line in self.meta_lines:
            c.drawCentredString(W / 2, my, line); my -= 16
        # footer strip on cover
        c.setFillColor(T.PRIMTXT); c.setFont("Helvetica", 8.5)
        c.drawCentredString(W / 2, 26, "capcitypresents.com")


# ---- pipeline diagram (horizontal stages with arrows) --------------------
class PipelineDiagram(Flowable):
    def __init__(self, stages, accent=T.PRIMARY, width=CONTENT_W):
        super().__init__()
        self.stages, self.accent, self.width = stages, accent, width
        self.boxh = 50

    def wrap(self, availW, availH):
        self.width = min(self.width, availW)
        return (self.width, self.boxh + 6)

    def draw(self):
        c = self.canv
        n = len(self.stages)
        gap = 20
        bw = (self.width - gap * (n - 1)) / n
        y = 3
        for i, (label, sub) in enumerate(self.stages):
            x = i * (bw + gap)
            c.setFillColor(T.PRIMLT); c.setStrokeColor(self.accent); c.setLineWidth(1)
            c.roundRect(x, y, bw, self.boxh, 5, fill=1, stroke=1)
            c.setFillColor(T.INK); c.setFont("Helvetica-Bold", 8.4)
            # label can wrap to 2 lines
            self._centered_lines(c, label, x + bw / 2, y + self.boxh - 17, bw - 10, 8.4, "Helvetica-Bold")
            c.setFillColor(T.MUTED); c.setFont("Helvetica", 6.8)
            self._centered_lines(c, sub, x + bw / 2, y + 13, bw - 10, 6.8, "Helvetica", maxlines=2)
            if i < n - 1:
                ax = x + bw + gap / 2
                c.setStrokeColor(self.accent); c.setLineWidth(1.4)
                c.line(x + bw + 3, y + self.boxh / 2, ax + 4, y + self.boxh / 2)
                c.setFillColor(self.accent)
                p = c.beginPath()
                p.moveTo(ax + 4, y + self.boxh / 2 - 3); p.lineTo(ax + 9, y + self.boxh / 2)
                p.lineTo(ax + 4, y + self.boxh / 2 + 3); p.close()
                c.drawPath(p, fill=1, stroke=0)

    @staticmethod
    def _centered_lines(c, text, cx, top_y, maxw, fs, font, maxlines=2):
        words = text.split()
        lines, cur = [], ""
        for w in words:
            t = (cur + " " + w).strip()
            if stringWidth(t, font, fs) > maxw and cur:
                lines.append(cur); cur = w
            else:
                cur = t
        if cur:
            lines.append(cur)
        lines = lines[:maxlines]
        for j, ln in enumerate(lines):
            c.drawCentredString(cx, top_y - j * (fs + 1.5), ln)


# ---- grouped components (architecture) -----------------------------------
class GroupedComponents(Flowable):
    """groups: list of dict(title, color, bg, items=[...])."""
    def __init__(self, groups, width=CONTENT_W):
        super().__init__()
        self.groups, self.width = groups, width
        self.chip_h = 20
        self.row_gap = 8
        self.pad = 10
        self.title_h = 16
        self.group_gap = 10

    def _layout(self):
        inner = self.width - 2 * self.pad
        self._rows_per = []
        total = 0
        for g in self.groups:
            x = 0
            rows = 1
            for it in g["items"]:
                cw = stringWidth(it, "Helvetica-Bold", 7.6) + 18
                if x + cw > inner and x > 0:
                    rows += 1; x = cw + 8
                else:
                    x += cw + 8
            self._rows_per.append(rows)
            total += self.title_h + 6 + rows * (self.chip_h + self.row_gap) + self.pad + self.group_gap
        return total

    def wrap(self, availW, availH):
        self.width = min(self.width, availW)
        self.h = self._layout()
        return (self.width, self.h)

    def draw(self):
        c = self.canv
        y = self.h
        inner = self.width - 2 * self.pad
        for g, rows in zip(self.groups, self._rows_per):
            gh = self.title_h + 6 + rows * (self.chip_h + self.row_gap) + self.pad
            y -= gh
            c.setFillColor(g["bg"]); c.setStrokeColor(g["color"]); c.setLineWidth(0.8)
            c.roundRect(0, y, self.width, gh, 6, fill=1, stroke=1)
            c.setFillColor(g["color"]); c.setFont("Helvetica-Bold", 9)
            c.drawString(self.pad, y + gh - self.title_h, g["title"])
            cx = self.pad
            cy = y + gh - self.title_h - 6 - self.chip_h
            for it in g["items"]:
                cw = stringWidth(it, "Helvetica-Bold", 7.6) + 18
                if cx - self.pad + cw > inner and cx > self.pad:
                    cx = self.pad; cy -= (self.chip_h + self.row_gap)
                c.setFillColor(colors.white); c.setStrokeColor(g["color"]); c.setLineWidth(0.7)
                c.roundRect(cx, cy, cw, self.chip_h, self.chip_h / 2, fill=1, stroke=1)
                c.setFillColor(T.INK); c.setFont("Helvetica-Bold", 7.6)
                c.drawCentredString(cx + cw / 2, cy + 6, it)
                cx += cw + 8
            y -= self.group_gap


def route_table(rows):
    data = [["Route", "Source", "Purpose"]]
    for r in rows:
        data.append([Paragraph(r[0], CELL_MONO_B), Paragraph(r[1], CELL_MONO), Paragraph(r[2], CELL)])
    t = Table(data, colWidths=[1.5 * inch, 1.85 * inch, CONTENT_W - 3.35 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), T.PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.0),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, T.LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def kv_table(rows, col0=1.7 * inch, head=("Item", "Detail")):
    data = [list(head)]
    for r in rows:
        data.append([Paragraph(r[0], CELL_B), Paragraph(r[1], CELL)])
    t = Table(data, colWidths=[col0, CONTENT_W - col0])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), T.INK),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 8.2),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, T.LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def P(text, style=None):
    return Paragraph(text, style or T.BODY)


# ---- doc template with TOC hook + footer ---------------------------------
class DocTemplate(BaseDocTemplate):
    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph):
            name = flowable.style.name
            txt = flowable.getPlainText()
            if name == "H1":
                self.notify("TOCEntry", (0, txt, self.page))
            elif name == "H2":
                self.notify("TOCEntry", (1, txt, self.page))


def _on_page(c, doc):
    if doc.page == 1:
        return  # no footer on cover
    c.saveState()
    c.setStrokeColor(T.LINE); c.setLineWidth(0.6)
    c.line(MARGIN, 0.62 * inch, PAGE_W - MARGIN, 0.62 * inch)
    x = MARGIN
    fh = 13; fw = fh * T.LOGO_ASPECT
    c.drawImage(LOGO_LIGHT, x, 0.40 * inch, fw, fh, mask="auto", preserveAspectRatio=True)
    c.setFont("Helvetica", 7.6); c.setFillColor(T.MUTED)
    c.drawString(x + fw + 6, 0.45 * inch, "CapCity Presents : Website Technical Documentation")
    c.drawRightString(PAGE_W - MARGIN, 0.45 * inch, f"Page {doc.page}")
    c.restoreState()


def build():
    doc = DocTemplate(OUT, pagesize=letter, leftMargin=MARGIN, rightMargin=MARGIN,
                      topMargin=0.7 * inch, bottomMargin=0.85 * inch,
                      title="CapCity Presents Website Technical Documentation",
                      author="CapCity Presents")
    frame = Frame(MARGIN, 0.85 * inch, CONTENT_W, PAGE_H - 0.7 * inch - 0.85 * inch, id="main")
    doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=_on_page)])

    S = []

    # cover
    S.append(CoverPage(
        "Website Technical Documentation",
        "Architecture, features, design reasoning, and continuity plan",
        ["Version 1.0", "Prepared 30 June 2026", "capcitypresents.com"]))
    S.append(PageBreak())

    # table of contents
    S.append(P("Contents", ParagraphStyle("toch", parent=T.H1, spaceBefore=0)))
    toc = TableOfContents()
    toc.levelStyles = [TOC_L0, TOC_L1]
    S.append(toc)
    S.append(PageBreak())

    # 1. Overview
    S.append(P("1. Overview and Purpose", H1N))
    S.append(P(
        "CapCity Presents is an independent live-music booking and promotion project based in "
        "Olympia, Washington, running since 2015 and rooted in the city's all-ages hardcore, punk, "
        "metal, and DIY scene. This website, <font face='Courier'>capcitypresents.com</font>, is its "
        "public home: it lists upcoming and past shows, explains the project, handles booking "
        "inquiries, and gives the team a private admin area for keeping the calendar current.", T.BODY))
    S.append(P(
        "Day to day, <b>Andy \"Remex\" Moreno</b> leads booking and promotion, while <b>Joey Cristina</b> "
        "(the founder) maintains the website. The technical goal of the site is to make show listings "
        "as close to self-updating as possible: most events are pulled automatically from the "
        "ticketing and social platforms the team already uses, so the public calendar stays current "
        "with very little manual effort.", T.BODY))
    S.append(T.Callout(
        "Who this document is for",
        "Anyone who may need to understand, maintain, or take over the website: a future collaborator, "
        "a hired developer, or the team itself after time away. The final section (Continuity Plan) is "
        "the most important for keeping the site alive independent of any one person.",
        accent=T.PRIMARY, bg=T.PRIMLT))

    # 2. Stack
    S.append(P("2. Technology Stack", H1N))
    S.append(P("The site is a statically generated website with a small serverless backend for admin "
               "tasks. Everything is built from a single GitHub repository and hosted on Netlify.", T.BODY))
    S.append(kv_table([
        ["Astro 5 (SSG)", "Static-site framework. Builds plain HTML/CSS so the public site is fast, "
            "cheap to host, and has almost no attack surface. Content lives in typed collections."],
        ["Netlify", "Hosting and deploys (publishes the built <font face='Courier'>dist</font> folder), "
            "plus Functions, Identity (admin login), Blobs (admin state), and Forms (contact)."],
        ["GitHub", "Source of truth (<font face='Courier'>kvvpa/capcitypresents</font>, branch "
            "<font face='Courier'>master</font>) and automation host via GitHub Actions."],
        ["Decap CMS", "Git-based content editor at <font face='Courier'>/admin</font> for editing event "
            "pages without touching code; commits straight back to the repo."],
        ["Cloudflare Worker", "Proxy that fetches Purplepass on the sync's behalf (Purplepass blocks "
            "datacenter IP ranges, which would otherwise block GitHub and Netlify)."],
        ["Purplepass + Facebook", "Upstream data sources: the Purplepass organizer feed (ticketed "
            "shows) and the Facebook Page feed (events and flyers)."],
        ["sharp / turndown / pdf-lib", "Image optimization to WebP; HTML-to-Markdown conversion of "
            "descriptions; in-admin PDF generation for the weekly review."],
    ], col0=1.55 * inch, head=("Technology", "Role and design reasoning")))

    # 3. Architecture
    S.append(P("3. Architecture", H1N))
    S.append(P("3.1 Components by host", H2N))
    S.append(P("The moving parts group into three homes: GitHub (code and automation), Netlify "
               "(hosting and the admin backend), and external services the automation talks to.", T.BODY))
    S.append(GroupedComponents([
        dict(title="GitHub  (source + automation)", color=T.PRIMARY, bg=T.PRIMLT,
             items=["Repository (master)", "Content collection", "event-sync.yml Action", "state.json"]),
        dict(title="Netlify  (hosting + backend)", color=T.SUCCESS, bg=T.SUCCLT,
             items=["Static CDN (dist)", "event-admin Function", "Identity (login)",
                    "Blobs (review state)", "Forms (contact)", "git-gateway"]),
        dict(title="External services", color=T.AMBER, bg=T.AMBERLT,
             items=["Cloudflare Worker proxy", "Purplepass API", "Facebook Graph API", "Domain / DNS"]),
    ]))
    S.append(Spacer(1, 6))
    S.append(P("3.2 Build and deploy pipeline", H2N))
    S.append(P("Publishing is fully automatic: any commit to <font face='Courier'>master</font> "
               "triggers a Netlify build and deploy.", T.BODY))
    S.append(PipelineDiagram([
        ("Commit to master", "code, content, or sync bot"),
        ("Netlify build", "npm run build"),
        ("Astro builds dist", "sync-assets + astro build"),
        ("Deploy to CDN", "live in ~1-2 min"),
    ], accent=T.SUCCESS))
    S.append(Spacer(1, 4))
    S.append(P("3.3 Event sync data flow", H2N))
    S.append(P("The nightly automation (and the admin's on-demand button) follows this path:", T.BODY))
    S.append(PipelineDiagram([
        ("Sources", "Purplepass + Facebook"),
        ("Fetch + parse", "via Cloudflare proxy"),
        ("Merge", "respect manual locks"),
        ("Write content", "markdown + WebP posters"),
        ("Commit", "push to master"),
    ], accent=T.PRIMARY))

    # 4. Site map
    S.append(P("4. Site Map", H1N))
    S.append(P("Public pages are statically generated; the admin area and the API are gated behind "
               "Netlify Identity. A sitemap.xml is generated automatically at build time.", T.BODY))
    S.append(P("4.1 Public pages", H2N))
    S.append(route_table([
        ["/", "pages/index.astro", "Home: hero, next show, upcoming grid, roots, booking"],
        ["/events/", "pages/events/index.astro", "All shows, split into upcoming and past"],
        ["/events/<slug>/", "pages/events/[slug].astro", "Event detail: poster, times, tickets, info"],
        ["/about/", "pages/about.astro", "Story, values, and people"],
        ["/contact/", "pages/contact.astro", "Booking / contact form (Netlify Forms)"],
        ["/thanks/", "pages/thanks.astro", "Contact form confirmation"],
        ["/privacy/  /terms/", "pages/privacy|terms.astro", "Legal pages"],
        ["/logo-assets/", "pages/logo-assets.astro", "Brand / logo reference"],
        ["/404", "pages/404.astro", "Not-found page"],
    ]))
    S.append(P("4.2 Admin and system routes", H2N))
    S.append(route_table([
        ["/admin/", "public/admin/ + Decap", "Content editor and event-tools console (login required)"],
        ["/api/event-admin/:action", "netlify/functions/event-admin", "Admin API: sync, review, flags, export"],
        ["/booking  ->  /contact/", "netlify.toml redirect", "Legacy URL redirect"],
        ["/sitemap-index.xml", "@astrojs/sitemap", "Auto-generated sitemap"],
    ]))

    # 5. Core features
    S.append(P("5. Core Features", H1N))

    S.append(P("5.1 Event content model", H2N))
    S.append(P("Each show is a Markdown file in <font face='Courier'>src/content/events</font> with a "
               "typed front-matter schema (validated by Astro at build time). Beyond the obvious fields "
               "(title, date, venue, times, price, ticket URL), the schema carries automation metadata: "
               "<font face='Courier'>posterSource</font>, <font face='Courier'>alternateImages</font>, "
               "<font face='Courier'>imageLocked</font>, <font face='Courier'>lockedFields</font>, "
               "<font face='Courier'>syncId</font>, <font face='Courier'>status</font>, and "
               "<font face='Courier'>featured</font>. The lock fields are what let a human override the "
               "robot: anything locked is never overwritten by the nightly sync.", T.BODY))

    S.append(P("5.2 Public listings", H2N))
    S.append(T.bullets([
        "<b>Home</b> shows a hero, an auto-selected \"next show\" card, the next three upcoming shows, "
        "a roots/press section, and a booking prompt. A small client script re-checks dates in the "
        "browser so the \"next show\" stays correct even between deploys.",
        "<b>Events index</b> lists all upcoming shows, then past shows, sorted by date.",
        "<b>Event detail</b> pages render the poster, ticket and Facebook links, show details, and the "
        "full description.",
        "Upcoming vs. past is decided in <font face='Courier'>src/lib/events.ts</font> from the date "
        "and <font face='Courier'>status</font> field (announced, sold-out, cancelled, past).",
    ]))

    S.append(P("5.3 Automated event sync", H2N))
    S.append(P("This is the heart of the site. A Node script "
               "(<font face='Courier'>scripts/events/sync-events.mjs</font>) pulls events from the "
               "Purplepass organizer feed and the Facebook Page feed, matches records that describe the "
               "same show (by title similarity and cross-links), and merges them into the Markdown "
               "content files. It tracks the <b>source of every field</b> so it knows what it may "
               "safely update, downloads and optimizes posters to WebP under "
               "<font face='Courier'>public/uploads/synced</font>, and records everything it did in "
               "<font face='Courier'>event-sync/state.json</font>. Manual edits and locked images win "
               "over the automation.", T.BODY))
    S.append(T.Callout(
        "Why the Cloudflare proxy exists",
        "Purplepass blocks requests from datacenter IP ranges, which includes both GitHub Actions and "
        "Netlify. The sync therefore routes Purplepass requests through a small Cloudflare Worker whose "
        "egress the Purplepass firewall allows. The proxy address and token are stored as secrets.",
        accent=T.AMBER, bg=T.AMBERLT))

    S.append(P("5.4 Admin console and weekly review", H2N))
    S.append(P("The <font face='Courier'>/admin</font> area combines Decap CMS (direct content editing) "
               "with a custom event-tools console backed by the "
               "<font face='Courier'>event-admin</font> Netlify Function. Signed-in admins can trigger "
               "a sync on demand, see the status of the last sync run, and run a structured weekly "
               "review. The review tracks data-quality \"flags\" raised by the sync through a lifecycle "
               "(new, standing, completed, won't-fix) stored in Netlify Blobs, and exports a dated PDF "
               "summary of what changed and what still needs attention. Admin actions authenticate "
               "through Netlify Identity; a GitHub automation token lets the function trigger the sync "
               "workflow and read repository state.", T.BODY))

    S.append(P("5.5 Contact, SEO, and brand", H2N))
    S.append(T.bullets([
        "<b>Contact form</b> uses Netlify Forms with a honeypot field; submissions appear in the "
        "Netlify dashboard and redirect to <font face='Courier'>/thanks/</font>.",
        "<b>SEO/social</b>: every page sets title, description, canonical URL, Open Graph and Twitter "
        "card tags, favicons, and a web manifest; a sitemap is generated automatically.",
        "<b>Brand assets</b> (logos) live in <font face='Courier'>logo/</font> and are copied into the "
        "build by <font face='Courier'>sync-assets</font>.",
    ]))

    # 6. Build/deploy details
    S.append(P("6. Build, Deploy, and Automation", H1N))
    S.append(P("Netlify builds with Node 24, runs <font face='Courier'>npm run build</font> (which "
               "first copies brand assets into <font face='Courier'>public/</font>, then runs the Astro "
               "build), and publishes <font face='Courier'>dist</font>. Two automations keep events "
               "fresh:", T.BODY))
    S.append(T.bullets([
        "<b>Nightly sync</b> (<font face='Courier'>.github/workflows/event-sync.yml</font>): runs once "
        "per evening Pacific and commits any changes. (Hardened June 2026 to tolerate GitHub's "
        "best-effort scheduler; see the Event Sync incident report.)",
        "<b>On-demand sync</b>: the admin console dispatches the same workflow through the GitHub API.",
    ]))
    S.append(P("Local development: <font face='Courier'>npm run dev</font>; a dry-run of the sync is "
               "available via <font face='Courier'>npm run events:sync:dry</font>, and the sync logic "
               "has unit tests (<font face='Courier'>npm run events:test</font>).", T.BODY))

    # 7. Secrets
    S.append(P("7. Configuration and Secrets", H1N))
    S.append(P("These values make the automation work. They are <b>not</b> in the repository; they live "
               "in GitHub Actions secrets and Netlify environment variables. This table is a map of "
               "what exists and where, it deliberately contains no actual secret values.", T.BODY))
    S.append(kv_table([
        ["GITHUB_AUTOMATION_TOKEN", "Netlify env. Lets the admin function trigger the sync workflow and "
            "read repo state."],
        ["GITHUB_REPO_OWNER / _NAME / _BRANCH", "Netlify env. Identify the repo (defaults: kvvpa / "
            "capcitypresents / master)."],
        ["PURPLEPASS_PROXY_BASE / _TOKEN", "GitHub Actions secrets. Address and auth for the Cloudflare "
            "proxy that reaches Purplepass."],
        ["PURPLEPASS_ORGANIZER_ID", "Workflow config (42425). Which Purplepass organizer to pull."],
        ["FACEBOOK_PAGE_ID / _PAGE_ACCESS_TOKEN", "GitHub Actions secrets. Identify and authorize "
            "reading the Facebook Page feed. The token must be refreshed periodically."],
        ["Netlify Identity + git-gateway", "Netlify service config. Admin login and Decap CMS commit "
            "access."],
    ], col0=2.25 * inch, head=("Secret / setting", "Where it lives and what it does")))
    S.append(T.Callout(
        "Facebook token is the one that expires",
        "Most settings are set-and-forget. The Facebook Page access token is the exception. If event "
        "flyers or details stop appearing from Facebook, an expired or invalidated token is the first "
        "thing to check. The renewal procedure is below.",
        accent=T.AMBER, bg=T.AMBERLT))
    S.append(P("7.1 Renewing the Facebook Page access token", H2N))
    S.append(P("The sync reads the Facebook Page feed with a Page access token "
               "(<font face='Courier'>FACEBOOK_PAGE_ACCESS_TOKEN</font>). A Page token derived from a "
               "long-lived user token is itself long-lived, but it must be re-minted if it is "
               "invalidated (password change, app change, or Meta revocation). Steps:", T.BODY))
    S.append(T.bullets([
        "In the Meta app dashboard, note the <b>App ID</b> and <b>App Secret</b> (Settings &gt; Basic). "
        "The Facebook app and the CapCity Page must both be administered by the team.",
        "In the Graph API Explorer, select the app and grant the scopes "
        "<font face='Courier'>pages_show_list</font>, <font face='Courier'>pages_read_engagement</font>, "
        "and <font face='Courier'>pages_read_user_content</font>, then Generate Access Token. This "
        "short-lived user token lasts about an hour, so continue promptly.",
        "Exchange the short-lived user token for a <b>long-lived</b> user token (via the app ID and "
        "secret), then read the Page token from the <font face='Courier'>/me/accounts</font> endpoint "
        "for the CapCity Page. (A small Node helper has been used for these last two steps; keep a copy "
        "and instructions in the shared vault.)",
        "Update <font face='Courier'>FACEBOOK_PAGE_ACCESS_TOKEN</font> in the GitHub Actions secrets, "
        "then run a sync (admin console or manual workflow dispatch) and confirm Facebook events return "
        "without a token warning.",
    ]))

    # 8. Continuity
    S.append(PageBreak())
    S.append(P("8. Continuity Plan (Keeping the Site Alive)", H1N))
    S.append(P(
        "Today the website's survival depends on one person. Joey is the sole holder of access to the "
        "GitHub repository, the Netlify account, the domain registrar, the Cloudflare account, the "
        "Facebook app/token, and the Purplepass organizer login, as well as the only person who knows "
        "how the pieces fit together. If that access were lost (lost laptop, lost password, lost "
        "person), the site would keep serving its last build for a while, but no one could deploy "
        "changes, fix the sync, renew the Facebook token, or move the domain. Over time it would "
        "quietly break and could not be recovered without painful account-recovery battles.", T.BODY))
    S.append(P("The fix is not technical, it is about <b>shared access and written-down knowledge</b>. "
               "The goal: at least two trusted people can fully operate every account, and the "
               "essential procedures are recorded somewhere both can reach.", T.BODY))

    S.append(P("8.1 The accounts and assets that must outlive any one person", H2N))
    S.append(kv_table([
        ["Domain: Njal.la", "Registrar for <font face='Courier'>capcitypresents.com</font>. Njal.la is "
            "privacy-first and prepaid, with no conventional account recovery, so if the login is lost "
            "the domain is very hard to get back. Co-access and keeping it funded matter most here."],
        ["DNS: Netlify DNS", "The domain's nameservers point to Netlify, so all DNS records are managed "
            "inside the Netlify account. Whoever controls Netlify controls where the domain resolves."],
        ["GitHub repo", "All code, content, and automation. Currently under a personal account "
            "(<font face='Courier'>kvvpa</font>)."],
        ["Netlify account", "Hosting, deploys, Functions, Identity, Blobs, Forms, DNS, and all the "
            "environment secrets."],
        ["Cloudflare account", "Hosts the Purplepass proxy Worker."],
        ["Facebook app + Page", "Page admin rights and the app used to mint the Page access token."],
        ["Purplepass organizer", "The ticketing account whose feed drives most listings."],
        ["Email", "<font face='Courier'>booking@capcitypresents.com</font> and the account behind it; "
            "also the recovery address for the services above."],
        ["The secrets themselves", "The token values stored in GitHub/Netlify, needed to rebuild the "
            "automation elsewhere if required."],
    ], col0=1.7 * inch, head=("Asset", "Why it matters")))

    S.append(P("8.2 Recommended actions, in priority order", H2N))
    S.append(P("<b>Priority 1: do these soon.</b>", T.BODY))
    S.append(T.bullets([
        "<b>Adopt a shared password manager</b> (a shared vault in 1Password, Bitwarden, etc.). Put "
        "every login above in it and share it with at least one trusted co-owner. This single step "
        "removes most of the risk.",
        "<b>Secure the Njal.la domain</b>: because Njal.la has no friendly account recovery, store its "
        "login (and the email/PGP tied to it) in the shared vault, keep the account funded so the "
        "prepaid domain never lapses, and confirm a co-owner can actually sign in. Since DNS lives in "
        "Netlify, securing Netlify (below) protects where the domain points.",
        "<b>Add a second owner/admin to GitHub, Netlify, Cloudflare, the Facebook Page, and "
        "Purplepass</b> so no account is reachable by only one human.",
    ]))
    S.append(P("<b>Priority 2: structural resilience.</b>", T.BODY))
    S.append(T.bullets([
        "<b>Move the repo to a GitHub Organization</b> (e.g. a \"CapCity Presents\" org) instead of a "
        "personal account, with at least two owners. Personal-account repos die with the account.",
        "<b>Move Netlify into a team</b> with multiple members rather than a single personal login.",
        "<b>Write down the secret values</b> (Facebook token, Purplepass proxy token, GitHub "
        "automation token) in the shared vault, so the automation can be rebuilt if an account is lost.",
        "<b>Document the Facebook token renewal steps</b> as a short checklist, since that token "
        "expires and is the most likely thing to silently break.",
    ]))
    S.append(P("<b>Priority 3: safety nets.</b>", T.BODY))
    S.append(T.bullets([
        "<b>Keep an off-platform backup of the repo</b> (a periodic clone/zip stored in the team's "
        "cloud drive). The content and posters are the irreplaceable part.",
        "<b>Save two-factor backup codes</b> for every account in the shared vault.",
        "<b>Write a one-page \"break glass\" runbook</b>: where each account is, who the co-owners are, "
        "and the three or four procedures that matter (deploy, run a sync, renew the Facebook token, "
        "renew the domain). Keep it with this document.",
    ]))
    S.append(T.Callout(
        "The single most valuable step",
        "If only one thing gets done: put every login and secret into a shared password vault that at "
        "least one other trusted person can open. Everything else in this plan is easier once access is "
        "no longer trapped with one individual.",
        accent=T.SUCCESS, bg=T.SUCCLT))

    S.append(P("8.3 Continuity checklist", H2N))
    S.append(_checklist_table())

    S.append(Spacer(1, 8))
    S.append(P("Document reference", T.H2))
    S.append(P("Generated from <font face='Courier'>docs/site-documentation/build_site_documentation.py</font>, "
               "which reuses the shared report style in "
               "<font face='Courier'>docs/incident-reports/</font>. Update the script and regenerate to "
               "keep this document current.", T.SMALL))

    doc.multiBuild(S)
    print("WROTE", OUT)


def _checklist_table():
    rows = [["", "Action", "Priority"]]
    items = [
        ("Shared password vault with a co-owner", "1"),
        ("Domain: registrar known, auto-renew on, 2FA + co-access", "1"),
        ("Second owner/admin on GitHub, Netlify, Cloudflare, FB, Purplepass", "1"),
        ("Repo moved to a GitHub Organization (2+ owners)", "2"),
        ("Netlify moved to a multi-member team", "2"),
        ("Secret values recorded in the shared vault", "2"),
        ("Facebook token renewal documented", "2"),
        ("Off-platform backup of the repo", "3"),
        ("2FA backup codes saved for every account", "3"),
        ("One-page break-glass runbook written", "3"),
    ]
    for label, pr in items:
        rows.append(["[  ]", label, pr])
    t = Table(rows, colWidths=[0.5 * inch, CONTENT_W - 1.4 * inch, 0.9 * inch])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), T.PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.4),
        ("FONTNAME", (0, 1), (0, -1), "Courier"),
        ("FONTNAME", (1, 1), (1, -1), "Helvetica"),
        ("FONTNAME", (2, 1), (2, -1), "Helvetica-Bold"),
        ("ALIGN", (0, 0), (0, -1), "CENTER"), ("ALIGN", (2, 0), (2, -1), "CENTER"),
        ("TEXTCOLOR", (2, 1), (2, -1), T.PRIMARY),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, T.LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


if __name__ == "__main__":
    build()
