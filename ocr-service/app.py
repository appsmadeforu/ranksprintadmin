import os
import tempfile

from flask import Flask, jsonify, request
from google.cloud import storage
import fitz
import pytesseract
from PIL import Image

app = Flask(__name__)


def _authorized(req):
    expected = os.environ.get("OCR_SERVICE_TOKEN")
    if not expected:
        return True

    auth_header = req.headers.get("Authorization", "")
    return auth_header == f"Bearer {expected}"


def _download_blob(bucket_name, storage_path, target_path):
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(storage_path)
    blob.download_to_filename(target_path)


def _ocr_pdf(pdf_path, page_start=1, page_end=None):
    doc = fitz.open(pdf_path)
    total_pages = len(doc)
    start = max(1, int(page_start or 1))
    end = min(total_pages, int(page_end)) if page_end else total_pages

    extracted_pages = []

    for page_index in range(start - 1, end):
        page = doc.load_page(page_index)
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
        image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
        text = pytesseract.image_to_string(image)
        extracted_pages.append(text)

    return {
        "text": "\n\n".join(extracted_pages).strip(),
        "pageCount": max(0, end - start + 1),
        "totalPages": total_pages,
    }


@app.post("/ocr")
def run_ocr():
    if not _authorized(request):
        return jsonify({"error": "Unauthorized"}), 401

    payload = request.get_json(silent=True) or {}
    bucket_name = payload.get("bucketName")
    storage_path = payload.get("storagePath")
    page_start = payload.get("pageStart", 1)
    page_end = payload.get("pageEnd")

    if not bucket_name or not storage_path:
        return jsonify({"error": "bucketName and storagePath are required"}), 400

    with tempfile.TemporaryDirectory() as temp_dir:
        local_pdf = os.path.join(temp_dir, "input.pdf")
        _download_blob(bucket_name, storage_path, local_pdf)
        result = _ocr_pdf(local_pdf, page_start=page_start, page_end=page_end)

    return jsonify({
        "engine": "tesseract",
        "text": result["text"],
        "pageCount": result["pageCount"],
        "totalPages": result["totalPages"],
    })


@app.get("/health")
def health():
    return jsonify({"ok": True})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port)
