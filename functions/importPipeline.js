import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";

const SUPPORTED_EXTENSIONS = new Set(["pdf", "txt", "tex"]);
const OPTION_IDS = ["A", "B", "C", "D"];

function normalizeWhitespace(value = "") {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function escapeHtml(value = "") {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToHtml(value = "") {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "<p></p>";
  }

  return normalized
    .split(/\n\s*\n/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function inferExtension(fileName = "", storagePath = "") {
  const source = storagePath || fileName;
  const extension = source.split(".").pop()?.toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new HttpsError(
      "invalid-argument",
      "Unsupported file type. Use .pdf, .txt, or .tex."
    );
  }

  return extension;
}

async function readStorageFile(storagePath) {
  console.log("[import] reading storage file", { storagePath });
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();

  if (!exists) {
    throw new HttpsError("not-found", `Storage file not found: ${storagePath}`);
  }

  const [buffer] = await file.download();
  console.log("[import] storage file downloaded", {
    storagePath,
    sizeBytes: buffer.length,
  });
  return buffer;
}

async function extractTextFromPdf({ buffer, pageStart = 1, pageEnd = null }) {
  console.log("[import] starting pdf extraction", {
    pageStart,
    pageEnd,
    sizeBytes: buffer.length,
  });
  const { default: pdfParse } = await import("pdf-parse");
  let currentPage = 0;
  const parsed = await pdfParse(buffer, {
    pagerender: async (pageData) => {
      currentPage += 1;
      const textContent = await pageData.getTextContent();
      const pageText = textContent.items.map((item) => item.str || "").join(" ");
      return `\n[[PAGE:${currentPage}]]\n${pageText}\n`;
    },
  });

  const pages = [...parsed.text.matchAll(/\[\[PAGE:(\d+)\]\]([\s\S]*?)(?=\[\[PAGE:\d+\]\]|$)/g)]
    .map((match) => ({
      page: Number(match[1]),
      text: match[2] || "",
    }));

  if (pages.length === 0) {
    console.log("[import] pdf extraction returned unpaged text", {
      textLength: parsed.text?.length || 0,
    });
    return normalizeWhitespace(parsed.text);
  }

  const safePageStart = Math.max(1, Number(pageStart) || 1);
  const safePageEnd = pageEnd ? Math.max(safePageStart, Number(pageEnd)) : null;

  const filteredText = normalizeWhitespace(
    pages
      .filter((page) => page.page >= safePageStart && (safePageEnd ? page.page <= safePageEnd : true))
      .map((page) => page.text)
      .join("\n\n")
  );
  console.log("[import] pdf extraction complete", {
    detectedPages: pages.length,
    pageStart: safePageStart,
    pageEnd: safePageEnd,
    textLength: filteredText.length,
  });
  return filteredText;
}

async function extractTextFromFile({ buffer, extension, pageStart, pageEnd }) {
  console.log("[import] extractTextFromFile", {
    extension,
    pageStart,
    pageEnd,
  });
  if (extension === "pdf") {
    return extractTextFromPdf({ buffer, pageStart, pageEnd });
  }

  const text = normalizeWhitespace(buffer.toString("utf8"));
  console.log("[import] text extraction complete", {
    extension,
    textLength: text.length,
  });
  return text;
}

function splitQuestionBlocks(rawText) {
  const normalized = `\n${normalizeWhitespace(rawText)}`;
  const pieces = normalized
    .split(/\n(?=(?:Q(?:uestion)?\s*)?\d{1,3}[\).\:]|\n?\d{1,3}[\).\:])/i)
    .map((piece) => piece.trim())
    .filter(Boolean);

  if (pieces.length > 1) {
    return pieces;
  }

  return normalized
    .split(/\n(?=Q(?:uestion)?\s*\d{1,3}\b)/i)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

function extractOptions(block) {
  const optionRegex = /(?:^|\n)\s*(?:\(?([A-D])\)|([A-D])[.)])\s+([\s\S]*?)(?=(?:\n\s*(?:\(?[A-D]\)|[A-D][.)])\s+)|(?:\n\s*(?:Answer|Ans(?:wer)?|Correct Option|Solution|Explanation)\b)|$)/gi;
  const options = [];
  let match;

  while ((match = optionRegex.exec(block)) !== null) {
    const id = (match[1] || match[2] || "").toUpperCase();
    const text = normalizeWhitespace(match[3] || "");
    if (!id || !text) {
      continue;
    }

    options.push({
      id,
      text,
    });
  }

  return options;
}

function extractAnswerLetter(block) {
  const answerMatch = block.match(
    /(?:Answer|Ans(?:wer)?|Correct Option)\s*[:\-]?\s*\(?([A-D])\)?/i
  );
  return answerMatch?.[1]?.toUpperCase() || "A";
}

function extractExplanation(block) {
  const explanationMatch = block.match(
    /(?:Solution|Explanation)\s*[:\-]?\s*([\s\S]*)$/i
  );
  return normalizeWhitespace(explanationMatch?.[1] || "");
}

function stripMetadata(block) {
  return normalizeWhitespace(
    block
      .replace(/^(?:Q(?:uestion)?\s*)?\d{1,3}[\).\:]\s*/i, "")
      .replace(
        /(?:^|\n)\s*(?:\(?[A-D]\)|[A-D][.)])\s+[\s\S]*$/i,
        ""
      )
      .replace(
        /(?:Answer|Ans(?:wer)?|Correct Option|Solution|Explanation)\s*[:\-]?[\s\S]*$/i,
        ""
      )
  );
}

function toCurrentQuestionSchema({
  rawQuestion,
  defaultSubject,
  defaultSectionId,
  defaultChapter,
  defaultDifficulty,
  defaultMarks,
  defaultNegativeMarks,
}) {
  const parsedOptions = extractOptions(rawQuestion);

  const options = OPTION_IDS.map((id) => {
    const matched = parsedOptions.find((option) => option.id === id);
    return {
      text: textToHtml(matched?.text || ""),
      imageUrl: "",
    };
  });

  const correctOption = OPTION_IDS.indexOf(extractAnswerLetter(rawQuestion));

  return {
    questionText: textToHtml(stripMetadata(rawQuestion)),
    subject: defaultSubject,
    sectionId: defaultSectionId,
    chapter: defaultChapter,
    difficulty: defaultDifficulty,
    marks: defaultMarks,
    negativeMarks: defaultNegativeMarks,
    options,
    correctOption: correctOption >= 0 ? correctOption : 0,
    explanationText: textToHtml(extractExplanation(rawQuestion)),
  };
}

function buildReviewQuestions(rawText, defaults) {
  const blocks = splitQuestionBlocks(rawText);
  console.log("[import] split question blocks", {
    blockCount: blocks.length,
  });

  return blocks
    .map((block, index) => ({
      importIndex: index,
      status: "needs_review",
      sourceText: block,
      parsedQuestion: toCurrentQuestionSchema({
        rawQuestion: block,
        ...defaults,
      }),
      warnings: [],
    }))
    .filter((item) => {
      const nonEmptyOptions = item.parsedQuestion.options.filter(
        (option) => normalizeWhitespace(option.text.replace(/<[^>]*>/g, "")) !== ""
      );
      return item.parsedQuestion.questionText !== "<p></p>" || nonEmptyOptions.length > 0;
    })
    .map((item) => {
      const warningList = [];

      const filledOptions = item.parsedQuestion.options.filter(
        (option) => normalizeWhitespace(option.text.replace(/<[^>]*>/g, "")) !== ""
      ).length;

      if (filledOptions !== 4) {
        warningList.push("Expected 4 options; admin review required.");
      }

      if (!item.parsedQuestion.explanationText || item.parsedQuestion.explanationText === "<p></p>") {
        warningList.push("Explanation not detected.");
      }

      return {
        ...item,
        warnings: warningList,
      };
    });
}

async function runFreeOcrForImport({
  bucketName,
  storagePath,
  fileName,
  pageStart,
  pageEnd,
}) {
  const serviceUrl = process.env.OCR_SERVICE_URL;
  if (!serviceUrl) {
    throw new HttpsError(
      "failed-precondition",
      "OCR service is not configured. Set OCR_SERVICE_URL for this function."
    );
  }

  const headers = {
    "Content-Type": "application/json",
  };

  if (process.env.OCR_SERVICE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.OCR_SERVICE_TOKEN}`;
  }

  console.log("[import] calling OCR service", {
    serviceUrl,
    bucketName,
    storagePath,
    pageStart,
    pageEnd,
  });

  const response = await fetch(`${serviceUrl.replace(/\/$/, "")}/ocr`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      bucketName,
      storagePath,
      fileName,
      pageStart,
      pageEnd,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[import] OCR service failed", {
      status: response.status,
      errorText,
    });
    throw new HttpsError(
      "internal",
      `OCR service failed with status ${response.status}.`
    );
  }

  const payload = await response.json();
  console.log("[import] OCR service completed", {
    pageCount: payload.pageCount || 0,
    textLength: payload.text?.length || 0,
  });
  return payload;
}

export function createQuestionImportHandlers({ db }) {
  async function requireAdmin(request) {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const adminDoc = await db.collection("admins").doc(request.auth.uid).get();
    if (!adminDoc.exists) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    return adminDoc.data();
  }

  const createQuestionImportReview = onCall(async (request) => {
    console.log("[import] createQuestionImportReview called", {
      uid: request.auth?.uid || null,
      examId: request.data?.examId || null,
      testId: request.data?.testId || null,
      fileName: request.data?.fileName || null,
    });
    await requireAdmin(request);

    const {
      examId,
      testId,
      storagePath,
      fileName,
      subject = "",
      sectionId = "",
      chapter = "Imported",
      difficulty = "medium",
      marks = 4,
      negativeMarks = 1,
      pageStart = 1,
      pageEnd = null,
      parser = "rule-based",
    } = request.data || {};

    if (!examId || !testId || !storagePath) {
      throw new HttpsError(
        "invalid-argument",
        "examId, testId, and storagePath are required."
      );
    }

    const extension = inferExtension(fileName, storagePath);
    console.log("[import] file metadata accepted", {
      storagePath,
      extension,
      pageStart,
      pageEnd,
    });
    const buffer = await readStorageFile(storagePath);
    const extractedText = await extractTextFromFile({
      buffer,
      extension,
      pageStart,
      pageEnd,
    });
    const importStatus = extractedText ? "needs_review" : "ocr_required";
    const reviewQuestions = extractedText
      ? buildReviewQuestions(extractedText, {
        defaultSubject: subject,
        defaultSectionId: sectionId,
        defaultChapter: chapter,
        defaultDifficulty: difficulty,
        defaultMarks: Number(marks) || 4,
        defaultNegativeMarks: Number(negativeMarks) || 1,
      })
      : [];

    if (!extractedText) {
      console.log("[import] no text extracted, marking import as ocr_required", {
        storagePath,
        extension,
        pageStart,
        pageEnd,
      });
    }

    const reviewRef = db.collection("questionImports").doc();
    console.log("[import] writing review document", {
      importId: reviewRef.id,
      questionCount: reviewQuestions.length,
      extractedTextLength: extractedText.length,
      status: importStatus,
    });
    await reviewRef.set({
      examId,
      testId,
      storagePath,
      fileName: fileName || storagePath.split("/").pop(),
      defaultSubject: subject,
      defaultSectionId: sectionId,
      defaultChapter: chapter,
      defaultDifficulty: difficulty,
      defaultMarks: Number(marks) || 4,
      defaultNegativeMarks: Number(negativeMarks) || 1,
      parser,
      pageStart: Number(pageStart) || 1,
      pageEnd: pageEnd ? Number(pageEnd) : null,
      status: importStatus,
      statusMessage: extractedText
        ? ""
        : "No selectable text was found in this file. OCR is required before parsing questions.",
      questionCount: reviewQuestions.length,
      extractedText,
      reviewQuestions,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    console.log("[import] review document created", {
      importId: reviewRef.id,
      questionCount: reviewQuestions.length,
      status: importStatus,
    });
    return {
      importId: reviewRef.id,
      questionCount: reviewQuestions.length,
      status: importStatus,
      statusMessage: extractedText
        ? ""
        : "No selectable text was found in this file. OCR is required before parsing questions.",
    };
  });

  const finalizeQuestionImport = onCall(async (request) => {
    console.log("[import] finalizeQuestionImport called", {
      uid: request.auth?.uid || null,
      importId: request.data?.importId || null,
      reviewQuestionCount: Array.isArray(request.data?.reviewQuestions)
        ? request.data.reviewQuestions.length
        : null,
    });
    await requireAdmin(request);

    const { importId, reviewQuestions } = request.data || {};
    if (!importId || !Array.isArray(reviewQuestions)) {
      throw new HttpsError(
        "invalid-argument",
        "importId and reviewQuestions are required."
      );
    }

    const importRef = db.collection("questionImports").doc(importId);
    const importSnap = await importRef.get();
    if (!importSnap.exists) {
      throw new HttpsError("not-found", "Import review not found.");
    }

    const importData = importSnap.data();
    console.log("[import] loaded review document for finalize", {
      importId,
      examId: importData.examId,
      testId: importData.testId,
    });
    const questionsRef = db.collection(
      "exams",
      importData.examId,
      "tests",
      importData.testId,
      "questions"
    );

    const batch = db.batch();
    reviewQuestions.forEach((reviewItem) => {
      const targetRef = questionsRef.doc();
      batch.set(targetRef, {
        ...reviewItem,
        createdAt: FieldValue.serverTimestamp(),
        importedFrom: importId,
      });
    });

    console.log("[import] committing finalized questions", {
      importId,
      saveCount: reviewQuestions.length,
    });
    batch.update(importRef, {
      status: "completed",
      approvedQuestionCount: reviewQuestions.length,
      updatedAt: FieldValue.serverTimestamp(),
      finalizedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    console.log("[import] finalize complete", {
      importId,
      saveCount: reviewQuestions.length,
    });
    return {
      success: true,
      savedCount: reviewQuestions.length,
    };
  });

  const runQuestionImportOcr = onCall(async (request) => {
    console.log("[import] runQuestionImportOcr called", {
      uid: request.auth?.uid || null,
      importId: request.data?.importId || null,
    });
    await requireAdmin(request);

    const { importId } = request.data || {};
    if (!importId) {
      throw new HttpsError("invalid-argument", "importId is required.");
    }

    const importRef = db.collection("questionImports").doc(importId);
    const importSnap = await importRef.get();
    if (!importSnap.exists) {
      throw new HttpsError("not-found", "Import review not found.");
    }

    const importData = importSnap.data();
    await importRef.update({
      status: "ocr_processing",
      updatedAt: FieldValue.serverTimestamp(),
      statusMessage: "Running free OCR on the uploaded PDF.",
    });

    try {
      const ocrResult = await runFreeOcrForImport({
        bucketName: getStorage().bucket().name,
        storagePath: importData.storagePath,
        fileName: importData.fileName,
        pageStart: importData.pageStart || 1,
        pageEnd: importData.pageEnd || null,
      });

      const extractedText = normalizeWhitespace(ocrResult.text || "");
      const reviewQuestions = extractedText
        ? buildReviewQuestions(extractedText, {
          defaultSubject: importData.defaultSubject || "",
          defaultSectionId: importData.defaultSectionId || "",
          defaultChapter: importData.defaultChapter || "Imported",
          defaultDifficulty: importData.defaultDifficulty || "medium",
          defaultMarks: Number(importData.defaultMarks) || 4,
          defaultNegativeMarks: Number(importData.defaultNegativeMarks) || 1,
        })
        : [];

      await importRef.update({
        status: extractedText ? "needs_review" : "ocr_failed",
        statusMessage: extractedText
          ? "OCR completed. Review the parsed questions before saving."
          : "OCR ran but did not produce usable text.",
        extractedText,
        questionCount: reviewQuestions.length,
        reviewQuestions,
        ocrMeta: {
          engine: ocrResult.engine || "tesseract",
          pageCount: ocrResult.pageCount || 0,
        },
        updatedAt: FieldValue.serverTimestamp(),
      });

      return {
        success: true,
        status: extractedText ? "needs_review" : "ocr_failed",
        questionCount: reviewQuestions.length,
      };
    } catch (error) {
      console.error("[import] OCR processing failed", error);
      await importRef.update({
        status: "ocr_failed",
        statusMessage: error.message || "OCR processing failed.",
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw error;
    }
  });

  return {
    createQuestionImportReview,
    finalizeQuestionImport,
    runQuestionImportOcr,
  };
}
