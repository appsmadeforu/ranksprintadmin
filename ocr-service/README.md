# Free OCR Service

This is a free OCR fallback for scanned PDFs using:

- `PyMuPDF` to render PDF pages
- `Tesseract OCR` to read text from page images
- `Cloud Run` as the execution environment

## Deploy

```bash
gcloud run deploy ranksprint-free-ocr \
  --source . \
  --region us-central1 \
  --allow-unauthenticated
```

If you want a shared secret between Firebase Functions and this service:

```bash
gcloud run services update ranksprint-free-ocr \
  --region us-central1 \
  --set-env-vars OCR_SERVICE_TOKEN=your-shared-secret
```

## Function env vars

Set these for the Firebase Functions runtime:

- `OCR_SERVICE_URL`
- optional `OCR_SERVICE_TOKEN`

Example values:

- `OCR_SERVICE_URL=https://ranksprint-free-ocr-xxxxx-uc.a.run.app`
- `OCR_SERVICE_TOKEN=your-shared-secret`

## Notes

- This is free/open-source OCR, not paid OCR.
- Accuracy on math-heavy papers is limited.
- Admin review remains required.
