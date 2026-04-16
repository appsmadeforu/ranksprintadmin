# Question Import Pipeline

This repo already stores test questions under:

- `exams/{examId}/tests/{testId}/questions/{questionId}`

The current editor in `src/components/QuestionsManager.jsx` expects this Firestore shape at save time:

```json
{
  "questionText": "<p>Question text here...</p>",
  "subject": "Mathematics",
  "sectionId": "maths",
  "chapter": "Imported",
  "difficulty": "medium",
  "marks": 4,
  "negativeMarks": 1,
  "options": [
    { "text": "<p>Option A</p>", "imageUrl": "" },
    { "text": "<p>Option B</p>", "imageUrl": "" },
    { "text": "<p>Option C</p>", "imageUrl": "" },
    { "text": "<p>Option D</p>", "imageUrl": "" }
  ],
  "correctOption": 1,
  "explanationText": "<p>Solution here...</p>"
}
```

## Important compatibility note

Your prompt uses `options[].id = A/B/C/D` and `correctOption = "B"`.

Your current codebase does **not** store that format today. It currently:

- stores `options` as objects with `text` and optional `imageUrl`
- stores `correctOption` as a numeric index (`0` to `3`)

To avoid breaking existing screens, the safest import flow is:

1. Accept `A/B/C/D` during parsing and admin review.
2. Normalize to the current Firestore format just before final save.

`src/utils/importQuestionUtils.js` provides that adapter.

## Recommended architecture

Use a staged import pipeline:

1. Admin uploads `.pdf`, `.txt`, or `.tex` to Firebase Storage.
2. Frontend calls `createQuestionImportReview`.
3. Cloud Function downloads the file from Storage.
4. Function extracts raw text.
5. Function parses raw text into question candidates.
6. Function stores a review document in `questionImports/{importId}`.
7. Admin previews and edits parsed questions.
8. Frontend calls `finalizeQuestionImport`.
9. Function normalizes questions to the current Firestore schema and writes them into the test's `questions` subcollection.

This gives you a production-safe admin checkpoint before data is committed.

## Where AI should be used

Use AI only for the fragile part:

- converting messy extracted text into structured question candidates
- especially PDF text with broken line wraps, inline equations, and answer/explanation detection

Keep these steps deterministic:

- file upload
- text extraction
- schema normalization
- validation of four options
- final Firestore write

Best practice:

- first run the rule-based parser
- only call AI if the parser returns warnings, missing options, or low confidence
- save both `sourceText` and parsed output in `questionImports` for auditability

## File-format strategy

- `.tex`: best source quality; parse directly and preserve LaTeX
- `.txt`: good if exported cleanly
- `.pdf`: acceptable, but least reliable for mathematical layout and multi-column papers

For PDFs:

- prefer text-based PDFs over scans
- if scans are common, move OCR to Cloud Run rather than Functions
- still require admin review before save

## Math preservation

Store equations inline inside HTML using LaTeX delimiters:

- inline math: `\\( \\frac{dy}{dx} \\)`
- display math: `\\[ \\int_0^1 x^2 dx \\]`

The existing app currently renders HTML with `dangerouslySetInnerHTML`, which will not typeset LaTeX by itself.

Use `src/utils/renderMathInHtml.js` before rendering HTML to convert those delimiters with KaTeX.

Example:

```js
import { renderMathInHtml } from "../utils/renderMathInHtml";

const html = renderMathInHtml(question.questionText);
```

Then render the returned HTML string.

## Firebase callable starter API

Added in `functions/importPipeline.js`:

- `createQuestionImportReview`
- `finalizeQuestionImport`

Wire them from `functions/index.js` and call them from the admin panel.

Example client flow:

```js
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes } from "firebase/storage";
import { functions, storage } from "../firebase";

export async function uploadAndCreateImport({
  file,
  examId,
  testId,
  subject,
  sectionId,
}) {
  const storagePath = `imports/${examId}/${testId}/${Date.now()}-${file.name}`;
  await uploadBytes(ref(storage, storagePath), file);

  const createImport = httpsCallable(functions, "createQuestionImportReview");
  const result = await createImport({
    examId,
    testId,
    storagePath,
    fileName: file.name,
    subject,
    sectionId,
    chapter: "Imported",
    difficulty: "medium",
    marks: 4,
    negativeMarks: 1,
  });

  return result.data;
}
```

## Reliability and cost guidance

- Use Firebase Storage for source files and keep the path in the import review doc.
- Keep the first parser rule-based to avoid paying for easy imports.
- Trigger AI only for low-confidence cases.
- Set a hard max file size for callable processing.
- Move OCR-heavy scanned PDF handling to Cloud Run if needed.
- Never write directly into final question docs without review.

## Next integration steps

1. Export the new callable functions from `functions/index.js`.
2. Add an `Import Questions` action in `QuestionsManager`.
3. Create a review modal/page backed by `questionImports/{importId}`.
4. Swap HTML previews that contain LaTeX to use `renderMathInHtml`.
