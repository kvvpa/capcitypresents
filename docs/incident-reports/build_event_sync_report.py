#!/usr/bin/env python3
"""
Event Sync incident & remediation report (30 June 2026).

Worked example of incident_report_template.py. Run:
    python docs/incident-reports/build_event_sync_report.py
Output: docs/incident-reports/Event-Sync-Incident-Report.pdf
"""
import os
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle, PageBreak

import incident_report_template as T  # noqa: E402  (same directory)

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Event-Sync-Incident-Report.pdf")
CONTENT_W = T.CONTENT_W


def build():
    header = T.HeaderBlock(
        eyebrow="Incident & Remediation Report",
        title="Event Sync Reliability",
        subtitle="Automated nightly event-listing synchronization",
        meta="Prepared 30 June 2026  /  GitHub Actions workflow \"Sync event listings\"",
        status_label="RESOLVED",
        status_color=T.SUCCESS,
    )

    S = []

    # executive summary
    S.append(Paragraph("Executive Summary", T.H1))
    S.append(Paragraph(
        "The website's nightly event-listing synchronization silently stopped doing useful work on "
        "<b>21 June 2026</b>. The automated job continued to run every night and continued to report "
        "<b>success</b>, but it was skipping the actual synchronization step every time. As a result, "
        "no event data was automatically refreshed for roughly ten consecutive nights. The listings on "
        "the site stayed current only because of occasional manual runs.", T.BODY))
    S.append(Paragraph(
        "The failure came from two things acting together. GitHub's scheduled jobs run on a best-effort "
        "basis and were firing several hours later than requested, and the job contained a guard that "
        "would only proceed if the local clock read <b>exactly</b> 9:00 PM Pacific at the moment it ran. "
        "Because the job kept arriving after midnight Pacific, the guard rejected every run. The root "
        "cause was identified and a redesigned, far more resilient workflow was built, reviewed, merged "
        "to <font face='Courier'>master</font>, and is now live.", T.BODY))
    S.append(T.Callout(
        "Impact at a glance",
        "Last automated sync: <b>20 June 2026</b> &nbsp;|&nbsp; Nights skipped: <b>~10</b> "
        "&nbsp;|&nbsp; Data loss: <b>none</b> (sources unchanged; full sync on resume) "
        "&nbsp;|&nbsp; Site outage: <b>none</b> &nbsp;|&nbsp; Status: <b>Fixed and deployed</b>",
        accent=T.SUCCESS, bg=T.SUCCLT))

    # timeline
    S.append(Paragraph("Timeline", T.H1))
    S.append(T.Timeline([
        ("Jun 20", "Last successful automated sync", T.SUCCESS),
        ("Jun 21", "Nightly runs begin silently skipping", T.DANGER),
        ("Jun 21-30", "10 nights report success but do nothing", T.DANGER),
        ("Jun 30", "Root cause found; fix merged to master", T.PRIMARY),
        ("Jul 1", "First corrected automated sync expected", T.SUCCESS),
    ]))

    # what it should do
    S.append(Paragraph("What the System Was Supposed to Do", T.H1))
    S.append(Paragraph(
        "A GitHub Actions workflow (<font face='Courier'>.github/workflows/event-sync.yml</font>) is "
        "scheduled to run once a night at about 9:00 PM Pacific. On each run it pulls the latest events "
        "from Purplepass and Facebook, regenerates the event content files, verifies the site still "
        "builds, and, if anything changed, commits the results back to the repository. A small "
        "bookkeeping file, <font face='Courier'>event-sync/state.json</font>, records the timestamp of "
        "the last run.", T.BODY))
    S.append(Paragraph(
        "Because GitHub's scheduler works in UTC and Pacific time shifts by an hour across daylight "
        "saving, the original design scheduled the job at two UTC times and then used a guard step to "
        "let only the 9:00 PM Pacific instance proceed.", T.BODY))

    # the defect
    S.append(Paragraph("The Defect", T.H1))
    S.append(Paragraph("The original guard, in plain terms, said: <i>\"only run the sync if the Pacific "
                       "hour is exactly 21.\"</i> In code:", T.BODY))
    S.append(T.code_block([
        'HOUR="$(TZ=America/Los_Angeles date +%H)"',
        'if [ "$HOUR" = "21" ]; then       # must be EXACTLY 9 PM Pacific',
        '  echo "run=true"  >> "$GITHUB_OUTPUT"',
        'else',
        '  echo "run=false" >> "$GITHUB_OUTPUT"   # otherwise skip everything',
        'fi',
    ]))
    S.append(Spacer(1, 6))
    S.append(Paragraph(
        "This guard assumes the job actually starts at the requested time. It does not. GitHub Actions "
        "explicitly documents that scheduled runs are best-effort and may be delayed during periods of "
        "high load. In practice the runs were arriving <b>3 to 5 hours late</b>. By the time the job "
        "executed, the Pacific clock read midnight to 2:00 AM, never 21, so the guard set "
        "<font face='Courier'>run=false</font> and skipped every subsequent step.", T.BODY))
    S.append(T.Callout(
        "Why nobody got an error",
        "The guard step itself completed successfully, and all the real work was marked as conditionally "
        "skipped. A run that does nothing therefore still finishes <b>green</b>. The only visible tell "
        "was runtime: a real sync takes about 1m48s, while the skipped runs finished in 5 to 10 seconds.",
        accent=T.AMBER, bg=T.AMBERLT))

    # evidence
    S.append(Paragraph("Evidence: Run Durations", T.H1))
    S.append(Paragraph(
        "The five most recent runs make the pattern obvious. The single long bar is a real (manually "
        "triggered) sync; every scheduled run collapsed to a few seconds because it bailed at the guard.",
        T.BODY))
    S.append(T.DurationChart([
        ("Jun 30  manual sync", 108, T.SUCCESS, "full sync"),
        ("Jun 30  scheduled", 7, T.DANGER, "skipped"),
        ("Jun 29  scheduled", 10, T.DANGER, "skipped"),
        ("Jun 28  scheduled", 6, T.DANGER, "skipped"),
        ("Jun 27  scheduled", 5, T.DANGER, "skipped"),
    ]))
    S.append(Spacer(1, 4))

    S.append(Paragraph("Selected scheduled runs: requested vs. actual fire time", T.H2))
    rows = [["Date", "Requested (UTC)", "Actual fire (UTC)", "Pacific clock", "Result"]]
    rows += [
        ["Jun 30", "04:00", "07:49", "12:49 AM", "skipped"],
        ["Jun 29", "04:00", "08:53", "01:53 AM", "skipped"],
        ["Jun 27", "04:00", "06:49", "11:49 PM", "skipped"],
        ["Jun 22", "04:00", "09:44", "02:44 AM", "skipped"],
        ["Jun 21", "04:00", "08:24", "01:24 AM", "skipped"],
    ]
    tbl = Table(rows, colWidths=[0.85 * inch, 1.25 * inch, 1.25 * inch, 1.2 * inch, 1.05 * inch])
    tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), T.PRIMARY),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8.2),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("TEXTCOLOR", (4, 1), (4, -1), T.DANGER),
        ("FONTNAME", (4, 1), (4, -1), "Helvetica-Bold"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("GRID", (0, 0), (-1, -1), 0.5, T.LINE),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    S.append(tbl)
    S.append(Paragraph("Requested 04:00 UTC corresponds to 9:00 PM Pacific. Every run arrived hours "
                       "later, after the guard's window had passed.", T.SMALL))

    # remedy
    S.append(Paragraph("The Remedy", T.H1))
    S.append(Paragraph(
        "Rather than patch the exact-time check, the workflow was redesigned around a more robust "
        "principle: <b>stop depending on precisely when the scheduler fires</b>. Two changes work "
        "together.", T.BODY))
    S.append(Paragraph("1. Redundant triggers", T.H2))
    S.append(Paragraph(
        "The job is now scheduled to fire once an hour across the whole late-evening window instead of "
        "at a single instant. If GitHub delays or drops the first trigger, a later one still lands the "
        "same night.", T.BODY))
    S.append(T.code_block(['schedule:', '  - cron: "7 4-9 * * *"   # hourly, 9 PM to 2 AM Pacific window']))
    S.append(Spacer(1, 6))
    S.append(Paragraph("2. Idempotent, self-deciding job", T.H2))
    S.append(Paragraph(
        "Each run now decides for itself whether a sync is actually due by reading the last-run "
        "timestamp from <font face='Courier'>state.json</font> and comparing its Pacific date to today. "
        "A real sync happens <b>at most once per Pacific day</b>; whichever trigger fires first does the "
        "work, and the remaining triggers that night become cheap no-ops. The decision no longer depends "
        "on the wall-clock time at the moment of execution.", T.BODY))
    S.append(T.code_block([
        'today="$(TZ=America/Los_Angeles date +%F)"',
        'last="$(jq -r \'.lastRun.at // empty\' event-sync/state.json)"',
        'last_day="$(TZ=America/Los_Angeles date -d "$last" +%F)"',
        'if [ "$last_day" = "$today" ]; then',
        '  run=false      # already synced today -> skip (intentional no-op)',
        'else',
        '  run=true       # not yet synced today -> run',
        'fi',
    ]))

    # before/after
    S.append(Paragraph("Before vs. After", T.H1))
    half = (CONTENT_W - 16) / 2
    before = T.FlowDiagram(
        "BEFORE  (brittle)",
        [("Cron at 04:00 / 05:00 UTC", False),
         ("GitHub fires LATE\n(~07:00-09:00 UTC)", True),
         ("Guard: is it EXACTLY\n21:00 Pacific?", True),
         ("No, it's ~midnight PT", False)],
        T.DANGER, T.DANGLT, "EVERYTHING SKIPPED  (still 'green')", T.DANGER, half)
    after = T.FlowDiagram(
        "AFTER  (resilient)",
        [("Cron hourly, 04:00-09:00 UTC", False),
         ("Any trigger fires\n(late is fine)", True),
         ("Guard: already synced\ntoday?", True),
         ("No, first run of the day", False)],
        T.SUCCESS, T.SUCCLT, "SYNC RUNS  /  later runs no-op", T.SUCCESS, half)
    ba = Table([[before, after]], colWidths=[half, half])
    ba.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"),
                            ("LEFTPADDING", (0, 0), (-1, -1), 0),
                            ("RIGHTPADDING", (0, 0), (0, 0), 16),
                            ("RIGHTPADDING", (1, 0), (1, 0), 0)]))
    S.append(ba)

    # why robust
    S.append(Paragraph("Why the New Design Is Robust", T.H1))
    S.append(T.bullets([
        "<b>Tolerant of late runs.</b> The job no longer cares what time it actually starts; a delayed "
        "trigger still performs the sync.",
        "<b>Tolerant of dropped runs.</b> Six triggers per night provide redundancy, so a missed "
        "schedule does not cost a day of updates.",
        "<b>No duplicate work.</b> The once-per-day check plus the existing concurrency lock guarantee "
        "exactly one real sync per day even if several triggers overlap.",
        "<b>Self-correcting.</b> If a whole night is missed, the next successful trigger simply catches "
        "up, because the decision is based on the last actual sync, not the calendar.",
        "<b>Truthful status.</b> A skipped run is now an intentional, logged 'already synced today' "
        "no-op rather than a silent failure dressed up as success.",
    ]))

    # verification
    S.append(Paragraph("Verification", T.H1))
    S.append(Paragraph(
        "The fix was committed on a dedicated branch, opened as pull request <b>#5</b>, and merged to "
        "<font face='Courier'>master</font> (commit <font face='Courier'>b3583b7</font>) so it governs "
        "the next scheduled run. Three loose, single-use diagnostic scripts left over from earlier image "
        "investigations were removed in the same cleanup. A follow-up check is scheduled for the morning "
        "of <b>1 July 2026</b> to confirm the overnight run behaved as intended:", T.BODY))
    S.append(T.bullets([
        "Exactly one scheduled run does real work (about one to two minutes) and commits any changes.",
        "Later scheduled triggers that night finish in seconds via the 'already synced today' path.",
        "<font face='Courier'>state.json</font>'s last-run timestamp shows a fresh date with trigger "
        "type <font face='Courier'>schedule</font>.",
    ]))
    S.append(Spacer(1, 4))
    S.append(T.Callout(
        "Bottom line",
        "The site never went down and no data was lost. The automated refresh was silently idle for "
        "about ten nights because a brittle timing check collided with GitHub's best-effort scheduler. "
        "It has been replaced with a design that succeeds regardless of exactly when, or how reliably, "
        "the scheduler fires.",
        accent=T.PRIMARY, bg=T.PRIMLT))

    # appendix
    S.append(PageBreak())
    S.append(Paragraph("Appendix: Deployed Workflow (key sections)", T.H1))
    S.append(Paragraph("Trigger and decision logic now in production on "
                       "<font face='Courier'>master</font>:", T.BODY))
    S.append(T.code_block([
        'on:',
        '  schedule:',
        '    - cron: "7 4-9 * * *"          # hourly across the evening window',
        '  workflow_dispatch:               # manual runs always sync',
        '',
        'jobs:',
        '  sync:',
        '    steps:',
        '      - uses: actions/checkout@v4',
        '',
        '      - name: Decide whether to sync',
        '        id: decide',
        '        run: |',
        '          if [ "$GITHUB_EVENT_NAME" = "workflow_dispatch" ]; then',
        '            echo "run=true" >> "$GITHUB_OUTPUT"; exit 0',
        '          fi',
        '          today="$(TZ=America/Los_Angeles date +%F)"',
        '          last="$(jq -r \'.lastRun.at // empty\' event-sync/state.json)"',
        '          last_day="$(TZ=America/Los_Angeles date -d "$last" +%F)"',
        '          if [ "$last_day" = "$today" ]; then',
        '            echo "run=false" >> "$GITHUB_OUTPUT"   # already synced today',
        '          else',
        '            echo "run=true"  >> "$GITHUB_OUTPUT"',
        '          fi',
        '',
        '      # subsequent steps gated on: steps.decide.outputs.run == \'true\'',
        '      #   - Set up Node / npm ci',
        '      #   - npm run events:sync   (Purplepass + Facebook)',
        '      #   - npm run build         (verify site)',
        '      #   - commit & push synced files + state.json',
    ]))
    S.append(Spacer(1, 8))
    S.append(Paragraph("Reference", T.H2))
    S.append(Paragraph(
        "File: <font face='Courier'>.github/workflows/event-sync.yml</font> &nbsp;/&nbsp; "
        "PR #5 &nbsp;/&nbsp; merge commit <font face='Courier'>b3583b7</font> &nbsp;/&nbsp; "
        "state file: <font face='Courier'>event-sync/state.json</font>", T.SMALL))

    T.build_report(OUT, header, S, title_meta="Event Sync Incident & Remediation Report")
    print("WROTE", OUT)


if __name__ == "__main__":
    build()
