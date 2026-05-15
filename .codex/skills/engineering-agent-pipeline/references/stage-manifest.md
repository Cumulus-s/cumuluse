# Stage Manifest Reference

Use this structure for future pipeline outputs:

```json
{
  "stage_id": "source-inventory",
  "source_inputs": [
    {
      "path": "/absolute/path/to/source.pdf",
      "type": "pdf",
      "truth_label": "designed"
    }
  ],
  "source_hashes": {
    "/absolute/path/to/source.pdf": "sha256:..."
  },
  "confidence_labels": {
    "scale": "measured",
    "wall_thickness": "inferred"
  },
  "tools": [
    {
      "name": "pdfplumber",
      "version": "..."
    }
  ],
  "outputs": [
    {
      "path": "/absolute/path/to/output.json",
      "type": "scene-contract"
    }
  ],
  "blockers": [],
  "validation_status": "passed",
  "next_stage_contract": {
    "expects": ["rooms", "walls", "openings", "fixtures"],
    "reject_if_missing": ["source_hashes", "confidence_labels"]
  }
}
```

