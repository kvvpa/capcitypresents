# Site Documentation

Full technical documentation for the CapCity Presents website: architecture,
technology stack, site map, core features, design reasoning, configuration, and
a continuity ("keep it alive regardless of any one person") plan.

## Files

- `build_site_documentation.py` : generates the PDF. Reuses the shared report
  style from `docs/incident-reports/incident_report_template.py` and adds a
  cover page, table of contents, and diagram flowables (pipeline, grouped
  components, route tables).
- `CapCity-Website-Documentation.pdf` : generated output.

## Regenerating

```bash
pip install reportlab
python docs/site-documentation/build_site_documentation.py
```

Keep this current by editing the script and regenerating whenever the
architecture, stack, or operational reality changes. Bump the version string in
the `CoverPage(...)` call when you do.

House rule: no em dashes in the document text.
