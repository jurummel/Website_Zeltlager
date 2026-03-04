# Zeltlager Verein Website

Modern, publishable full-stack website for a voluntary annual kids camp association.

## Features

- Public landing page with:
  - News
  - Team section
  - Important camp information
  - Timings/schedule
  - Dynamic gallery from backend folder images
- Registration survey for parents with:
  - Child and parent details
  - Medical and allergy fields
  - Emergency contacts
  - Parent/guardian signature pad (required)
- Hard-coded tent logo design:
  - Full-color logo shown near the top of the page
  - Light watermark logo used as a hero background brand mark
- Organizer view:
  - Password-protected admin section for attendee table
- Persistent storage of registrations in a local JSON database

## Run locally

- Set an admin password before running:

```bash
export ADMIN_PASSWORD="your-strong-password"
```

(On Windows PowerShell: `$env:ADMIN_PASSWORD="your-strong-password"`)

```bash
npm start
```

Then open <http://localhost:3000>.

## Data storage and media management

- Registrations are stored in `registrations.json`.
- Camp gallery images must be placed on the backend in `uploads/gallery/` (PNG/JPG/JPEG/WEBP/SVG).
- Static logo assets are in `public/assets/`.

## Deploy

This app can be deployed to most Node.js hosts by running:

```bash
npm start
```

Ensure the host allows writing to `registrations.json` and reading files from `uploads/gallery/`.
