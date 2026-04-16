const LETTER_TO_INDEX = {
  A: 0,
  B: 1,
  C: 2,
  D: 3,
};

const INDEX_TO_LETTER = ["A", "B", "C", "D"];

export function normalizeImportedQuestionForFirestore(question) {
  const options = Array.isArray(question?.options) ? question.options : [];
  const normalizedOptions = INDEX_TO_LETTER.map((letter, index) => {
    const option = options[index] || options.find((item) => item?.id === letter) || {};
    return {
      text: option.text || "<p></p>",
      imageUrl: option.imageUrl || "",
    };
  });

  let correctOption = question?.correctOption;
  if (typeof correctOption === "string") {
    correctOption = LETTER_TO_INDEX[correctOption.toUpperCase()] ?? 0;
  }
  if (typeof correctOption !== "number" || Number.isNaN(correctOption)) {
    correctOption = 0;
  }

  return {
    questionText: question?.questionText || "<p></p>",
    subject: question?.subject || "",
    sectionId: question?.sectionId || "",
    chapter: question?.chapter || "Imported",
    difficulty: question?.difficulty || "medium",
    marks: Number(question?.marks ?? 4),
    negativeMarks: Number(question?.negativeMarks ?? 1),
    options: normalizedOptions,
    correctOption,
    explanationText: question?.explanationText || "<p></p>",
  };
}

export function toAdminReviewShape(question) {
  const normalized = normalizeImportedQuestionForFirestore(question);

  return {
    ...normalized,
    options: normalized.options.map((option, index) => ({
      id: INDEX_TO_LETTER[index],
      text: option.text,
      imageUrl: option.imageUrl || "",
    })),
    correctOption: INDEX_TO_LETTER[normalized.correctOption] || "A",
  };
}
