# VIKRAM Accumulation API

Hosted backend for the browser scanner. It reads PostgreSQL during scans; market-data ingestion is a separate scheduled job.

## Required environment
- `DATABASE_URL`
- `PORT` (optional)

## Safety rules
- Never invent missing market values.
- F&O confirmation must use the exact CM trading date.
- Do not backstep to an older futures date.
- Keep raw/normalized ingestion records auditable.
- Confirm NSE data-use/licensing terms before production redistribution or commercial use.
