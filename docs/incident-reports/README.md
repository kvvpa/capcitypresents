# Incident Reports

Branded PDF incident / remediation reports for CapCity Presents, with a
reusable house-style template.

## Files

- `incident_report_template.py` : the reusable framework (palette, fonts,
  branded header with logo, footer, and visual building blocks).
- `build_event_sync_report.py` : worked example, the Event Sync incident
  report from 30 June 2026.
- `Event-Sync-Incident-Report.pdf` : generated output of the example.

## Generating a report

```bash
pip install reportlab            # one-time
python docs/incident-reports/build_event_sync_report.py
```

## Authoring a new incident report

1. Copy `build_event_sync_report.py` to `build_<incident>_report.py`.
2. Edit the `HeaderBlock(...)` (eyebrow, title, subtitle, meta, status label
   and colour) and replace the body content.
3. Build the body as a list of flowables using the helpers exposed by the
   template:

   | Helper | Purpose |
   |---|---|
   | `H1`, `H2`, `BODY`, `SMALL`, `BULLET` | paragraph styles |
   | `Callout(title, body, accent, bg)` | coloured side-bar note |
   | `DurationChart(rows)` | horizontal bar chart |
   | `Timeline(items)` | milestone strip |
   | `FlowDiagram(...)` | box-and-arrow flow (good for before/after) |
   | `code_block(lines)` | dark code panel |
   | `bullets(items)` | bulleted list |

   Status colours available: `SUCCESS` (resolved), `DANGER` (active),
   `AMBER` (monitoring), `PRIMARY` (informational).

4. Call `build_report(out_path, header, story, ...)`.

## House rules

- **No em dashes** in report text. Use commas, colons, parentheses, or "to"
  for ranges.
- Two logos are used: the header (dark banner) uses the white-text badge
  `logo/opt-640/logo-blk-whttext.png` so it reads on the colour without a box;
  the footer (white page) uses the transparent black-ink badge
  `logo/opt-640/logo-txt-blk-alltrans.png`. Override either via the `logo_path`
  arguments if needed.
