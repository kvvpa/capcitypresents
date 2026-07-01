#!/usr/bin/env python3
"""
Event Sync: Resolution & Verification report (1 July 2026).

Companion to the Event Sync incident report: confirms the nightly-sync fix works
in production and documents the Facebook capture hardening. Run:
    python docs/incident-reports/build_verification_report.py
Output: docs/incident-reports/Event-Sync-Verification-Report.pdf
"""
import os
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle

import incident_report_template as T  # same directory

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Event-Sync-Verification-Report.pdf")
CW = T.CONTENT_W
CELL = ParagraphStyle("CELL", fontName="Helvetica", fontSize=8.4, leading=11.5, textColor=T.INK)
CELLB = ParagraphStyle("CELLB", parent=CELL, fontName="Helvetica-Bold")
MONO = ParagraphStyle("MONO", parent=CELL, fontName="Courier")


def kv(rows, col0=1.9 * inch):
    data = [[Paragraph(r[0], CELLB), Paragraph(r[1], CELL)] for r in rows]
    t = Table(data, colWidths=[col0, CW - col0])
    t.setStyle(TableStyle([
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, T.LINE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 4), ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]))
    return t


def build():
    header = T.HeaderBlock(
        eyebrow="Resolution and Verification",
        title="Event Sync: Verified and Hardened",
        subtitle="Automated nightly event-listing synchronization",
        meta="Prepared 1 July 2026   /   Follow-up to the Event Sync incident report",
        status_label="VERIFIED",
        status_color=T.SUCCESS,
    )

    S = []

    S.append(Paragraph("Summary", T.H1))
    S.append(Paragraph(
        "The nightly event sync is confirmed working again in production. After the fix was deployed on "
        "30 June 2026, the very next night the sync ran on its own for the first time since 20 June, "
        "updated the listings, and behaved exactly as designed. A scheduled follow-up check verified "
        "this the following morning. Separately, a targeted improvement was made so that events "
        "announced on Facebook are captured more reliably.", T.BODY))
    S.append(T.Callout(
        "Bottom line",
        "Automated event updates are healthy again, confirmed end to end. Facebook is syncing cleanly "
        "with no warnings, and the sync is now more resilient to sparse Facebook event posts.",
        accent=T.SUCCESS, bg=T.SUCCLT))

    S.append(Paragraph("Timeline", T.H1))
    S.append(T.Timeline([
        ("Jun 20", "Last automated sync under the old design", T.MUTED),
        ("Jun 30", "Fix deployed to master", T.PRIMARY),
        ("Jul 1 (overnight)", "First automatic sync ran on its own", T.SUCCESS),
        ("Jul 1 morning", "Scheduled check confirmed success", T.SUCCESS),
        ("Jul 1", "Facebook capture hardening deployed", T.PRIMARY),
    ]))

    S.append(Paragraph("1. Verification Results", T.H1))
    S.append(Paragraph(
        "The nightly workflow fired overnight and, for the first time in the new design, one trigger did "
        "the real work while a later trigger correctly no-opped. This is precisely the intended "
        "behaviour: a single real sync per day, with redundant triggers as cheap safety nets.", T.BODY))
    S.append(T.DurationChart([
        ("Jul 1  scheduled sync", 82, T.SUCCESS, "ran on its own"),
        ("Jul 1  later trigger", 9, T.PRIMARY, "already-synced no-op"),
        ("Jun 27  old design", 5, T.DANGER, "silently skipped"),
    ]))
    S.append(Spacer(1, 4))
    S.append(Paragraph("1.1 The most telling detail", T.H2))
    S.append(Paragraph(
        "GitHub delivered the run late again: it fired around <b>1:19 AM Pacific</b>, hours after the "
        "intended 9:00 PM. Under the old design, that late start is exactly what caused the silent skip. "
        "Under the new design it simply ran anyway. That is the fix doing its job.", T.BODY))

    S.append(Paragraph("1.2 Evidence from the sync's own log", T.H2))
    S.append(Paragraph("The sync records what it did in <font face='Courier'>event-sync/state.json</font>. "
                       "The overnight entry:", T.BODY))
    S.append(kv([
        ["Ran at", "2026-07-01 08:20 UTC (about 1:20 AM Pacific)"],
        ["Trigger", "<b>schedule</b> (ran automatically, not a manual push)"],
        ["Purplepass events", "23"],
        ["Facebook events", "2 (Facebook configured, syncing)"],
        ["Warnings", "none"],
        ["Event files updated", "21"],
    ]))
    S.append(Paragraph("The scheduled verification task also ran on time (09:00 AM Pacific) and then "
                       "auto-disabled itself, as designed.", T.SMALL))

    S.append(Paragraph("2. Facebook Capture Hardening", T.H1))
    S.append(Paragraph(
        "While reviewing the Facebook side, a gap was identified: an event announced only on Facebook, "
        "with little descriptive text and not also listed on the ticketing platform, could be missed. "
        "The sync reads Facebook <b>posts</b> and needs a title and a date to publish an event, and a "
        "sparse post (for example, an automatic \"we created an event\" share) often has no readable "
        "date, so it was dropped.", T.BODY))
    S.append(Paragraph("2.1 Why we cannot simply read the events list", T.H2))
    S.append(Paragraph(
        "Facebook deprecated the interface that lists a Page's events, so the site cannot just ask "
        "Facebook for them. What it can do is read the Page's posts and follow an event that a post "
        "shares.", T.BODY))
    S.append(Paragraph("2.2 What changed", T.H2))
    S.append(T.bullets([
        "When a post shares or creates an event, the sync now looks that specific event up and uses its "
        "<b>real start time, name, and venue</b> instead of guessing from the post text. That is what "
        "keeps an otherwise undated event from being dropped.",
        "The lookup is <b>best-effort and never fails the sync</b>: if Facebook declines the request, "
        "the sync quietly falls back to the previous behaviour, so there is no risk to what already "
        "works.",
        "The new logic is covered by unit tests (full suite 25 of 25 passing), and each field records "
        "whether it came from the event itself or from post text.",
    ]))
    S.append(T.Callout(
        "One habit that makes this work best",
        "When a new event is created on Facebook, share it to the Page feed (Facebook usually offers "
        "this on creation). That gives the sync a post to follow. An event with no feed post at all "
        "still cannot be seen automatically and would need a quick manual add in the admin editor.",
        accent=T.AMBER, bg=T.AMBERLT))
    S.append(Paragraph("2.3 What to expect next", T.H2))
    S.append(Paragraph(
        "The change is deployed and safe either way. The next nightly runs will show whether Facebook "
        "allows the per-event lookup for this Page: if it does, shared events will start appearing with "
        "accurate dates and venues; if it does not, behaviour is unchanged. No action is required to "
        "find out.", T.BODY))

    S.append(Spacer(1, 6))
    S.append(Paragraph("Reference", T.H2))
    S.append(Paragraph(
        "Fix deployed via pull request #5; Facebook capture hardening via pull request #9 "
        "(commit <font face='Courier'>814cb11</font>). Sync workflow: "
        "<font face='Courier'>.github/workflows/event-sync.yml</font>; sources: "
        "<font face='Courier'>scripts/events/sources.mjs</font>.", T.SMALL))

    T.build_report(OUT, header, S, title_meta="Event Sync Verification and Hardening Report")
    print("WROTE", OUT)


if __name__ == "__main__":
    build()
