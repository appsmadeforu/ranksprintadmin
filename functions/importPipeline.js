import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getStorage } from "firebase-admin/storage";
import { FieldValue } from "firebase-admin/firestore";
import pdfParse from "pdf-parse";

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
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  const [exists] = await file.exists();

  if (!exists) {
    throw new HttpsError("not-found", `Storage file not found: ${storagePath}`);
  }

  const [buffer] = await file.download();
  return buffer;
}

async function extractTextFromFile({ buffer, extension }) {
  if (extension === "pdf") {
    const parsed = await pdfParse(buffer);
    return normalizeWhitespace(parsed.text);
  }

  return normalizeWhitespace(buffer.toString("utf8"));
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
  return splitQuestionBlocks(rawText)
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
      parser = "rule-based",
    } = request.data || {};

    if (!examId || !testId || !storagePath) {
      throw new HttpsError(
        "invalid-argument",
        "examId, testId, and storagePath are required."
      );
    }

    const extension = inferExtension(fileName, storagePath);
    const buffer = await readStorageFile(storagePath);
    const extractedText = await extractTextFromFile({ buffer, extension });

    if (!extractedText) {
      throw new HttpsError("data-loss", "No text could be extracted from file.");
    }

    const reviewQuestions = buildReviewQuestions(extractedText, {
      defaultSubject: subject,
      defaultSectionId: sectionId,
      defaultChapter: chapter,
      defaultDifficulty: difficulty,
      defaultMarks: Number(marks) || 4,
      defaultNegativeMarks: Number(negativeMarks) || 1,
    });

    const reviewRef = db.collection("questionImports").doc();
    await reviewRef.set({
      examId,
      testId,
      storagePath,
      fileName: fileName || storagePath.split("/").pop(),
      parser,
      status: "needs_review",
      questionCount: reviewQuestions.length,
      extractedText,
      reviewQuestions,
      createdBy: request.auth.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      importId: reviewRef.id,
      questionCount: reviewQuestions.length,
      status: "needs_review",
    };
  });

  const finalizeQuestionImport = onCall(async (request) => {
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

    batch.update(importRef, {
      status: "completed",
      approvedQuestionCount: reviewQuestions.length,
      updatedAt: FieldValue.serverTimestamp(),
      finalizedAt: FieldValue.serverTimestamp(),
    });

    await batch.commit();

    return {
      success: true,
      savedCount: reviewQuestions.length,
    };
  });

  return {
    createQuestionImportReview,
    finalizeQuestionImport,
  };
}
