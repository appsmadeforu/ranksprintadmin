import { useEffect, useState, useMemo } from "react";
import { db, storage } from "../firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Swal from "sweetalert2";
import QuillEditor from "./QuillEditor";
import * as XLSX from "xlsx/xlsx.mjs";

const ITEMS_PER_PAGE = 20;

export default function QuestionsManager({
  examId,
  testId,
  sections = [],
}) {
  const [questions, setQuestions] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkJson, setBulkJson] = useState("");

  const [optionImages, setOptionImages] = useState([null, null, null, null]);

  /* PAGINATION & FILTER STATES */
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterChapter, setFilterChapter] = useState("");

  const emptyQuestion = {
    questionText: "",
    subject: "",
    sectionId: "",
    chapter: "",
    difficulty: "easy",
    options: [
      { text: "", imageUrl: "" },
      { text: "", imageUrl: "" },
      { text: "", imageUrl: "" },
      { text: "", imageUrl: "" },
    ],
    correctOption: 0,
    explanationText: "",
    explanationVideoUrl: "",
  };

  const [formData, setFormData] = useState(emptyQuestion);
  const [questionImage, setQuestionImage] = useState(null);
  const [explanationImage, setExplanationImage] = useState(null);

  /* ---------------- FETCH QUESTIONS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "exams", examId, "tests", testId, "questions"),
      (snapshot) => {
        setQuestions(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      }
    );
    return () => unsubscribe();
  }, [examId, testId]);

  /* ---------------- FETCH SUBJECTS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "subjects"), (snapshot) => {
      setSubjects(
        snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
      );
    });

    return () => unsubscribe();
  }, []);

  /* ---------------- GET UNIQUE CHAPTERS FOR SELECTED SUBJECT ---------------- */
  const chaptersForSubject = useMemo(() => {
    if (!filterSubject) return [];
    const subject = subjects.find(s => s.name === filterSubject);
    return subject?.chapters || [];
  }, [filterSubject, subjects]);

  /* ---------------- FILTER & SEARCH QUESTIONS ---------------- */
  const filteredQuestions = useMemo(() => {
    let filtered = [...questions];

    // Filter by section
    if (filterSection) {
      filtered = filtered.filter(q => q.sectionId === filterSection);
    }

    // Filter by subject
    if (filterSubject) {
      filtered = filtered.filter(q => q.subject === filterSubject);
    }

    // Filter by chapter
    if (filterChapter) {
      filtered = filtered.filter(q => q.chapter === filterChapter);
    }

    // Search by question text
    if (searchText) {
      const plainText = searchText.toLowerCase();
      filtered = filtered.filter(q => {
        const questionTextPlain = q.questionText
          .replace(/<[^>]*>/g, "")
          .toLowerCase();
        return questionTextPlain.includes(plainText);
      });
    }

    return filtered;
  }, [questions, filterSection, filterSubject, filterChapter, searchText]);

  /* PAGINATION */
  const totalPages = Math.ceil(filteredQuestions.length / ITEMS_PER_PAGE);
  const paginatedQuestions = filteredQuestions.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  /* ---------------- SAVE / UPDATE QUESTION ---------------- */
  const handleSave = async () => {
    try {
      if (!formData.questionText && !questionImage)
        return Swal.fire("Error", "Question text or image required", "error");

      let questionImageUrl = editingQuestion?.questionImageUrl || "";
      let explanationImageUrl = editingQuestion?.explanationImageUrl || "";

      if (questionImage) {
        const imageRef = ref(
          storage,
          `questions/${Date.now()}-${questionImage.name}`
        );
        await uploadBytes(imageRef, questionImage);
        questionImageUrl = await getDownloadURL(imageRef);
      }

      if (explanationImage) {
        const imageRef = ref(
          storage,
          `explanations/${Date.now()}-${explanationImage.name}`
        );
        await uploadBytes(imageRef, explanationImage);
        explanationImageUrl = await getDownloadURL(imageRef);
      }

      // Upload option images
      const updatedOptions = await Promise.all(
        formData.options.map(async (opt, index) => {
          let imageUrl = opt.imageUrl || "";

          if (optionImages[index]) {
            const imageRef = ref(
              storage,
              `options/${Date.now()}-${index}-${optionImages[index].name}`
            );
            await uploadBytes(imageRef, optionImages[index]);
            imageUrl = await getDownloadURL(imageRef);
          }

          return {
            text: opt.text,
            imageUrl,
          };
        })
      );

      const payload = {
        ...formData,
        options: updatedOptions,
        questionImageUrl,
        explanationImageUrl,
      };

      if (editingQuestion) {
        await updateDoc(
          doc(
            db,
            "exams",
            examId,
            "tests",
            testId,
            "questions",
            editingQuestion.id
          ),
          {
            ...payload,
            updatedAt: serverTimestamp(),
          }
        );
        Swal.fire("Success", "Question updated", "success");
      } else {
        await addDoc(
          collection(db, "exams", examId, "tests", testId, "questions"),
          {
            ...payload,
            createdAt: serverTimestamp(),
          }
        );
        Swal.fire("Success", "Question added", "success");
      }

      setShowModal(false);
      setEditingQuestion(null);
      setFormData(emptyQuestion);
      setQuestionImage(null);
      setExplanationImage(null);
      setOptionImages([null, null, null, null]);
    } catch (err) {
      Swal.fire("Error", err.message, "error");
    }
  };

  /* ---------------- EDIT ---------------- */
  const handleEdit = (question) => {
    setEditingQuestion(question);
    setFormData(question);
    setOptionImages([null, null, null, null]);
    setShowModal(true);
  };

  /* ---------------- DELETE ---------------- */
  const handleDelete = async (id) => {
    const confirm = await Swal.fire({
      title: "Delete Question?",
      text: "This cannot be undone",
      icon: "warning",
      showCancelButton: true,
    });

    if (!confirm.isConfirmed) return;

    await deleteDoc(
      doc(db, "exams", examId, "tests", testId, "questions", id)
    );

    Swal.fire("Deleted", "Question removed", "success");
  };

  /* ---------------- BULK JSON ADD ---------------- */
  const handleBulkSave = async () => {
    try {
      const parsed = JSON.parse(bulkJson);

      for (let q of parsed) {
        await addDoc(
          collection(db, "exams", examId, "tests", testId, "questions"),
          {
            ...q,
            createdAt: serverTimestamp(),
          }
        );
      }

      Swal.fire("Success", "Bulk questions added", "success");
      setBulkJson("");
      setBulkMode(false);
    } catch (err) {
      Swal.fire("Error", "Invalid JSON format", "error");
    }
  };

  /* ---------------- EXCEL IMPORT ---------------- */
  const handleExcelUpload = async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(sheet);

      for (let row of json) {
        let sectionId = "";

        if (sections && Array.isArray(sections)) {
          const sectionObj = sections.find(
            (s) =>
              s.name?.trim().toLowerCase() ===
              row.Section?.trim().toLowerCase()
          );
          sectionId = sectionObj?.id || "";
        }

        await addDoc(
          collection(db, "exams", examId, "tests", testId, "questions"),
          {
            questionText: row.Question || "",
            subject: row.Subject || "",
            chapter: row.Chapter || "",
            sectionId: sectionId,
            difficulty: row.Difficulty || "easy",
            options: [
              { text: row.Option1 || "", imageUrl: "" },
              { text: row.Option2 || "", imageUrl: "" },
              { text: row.Option3 || "", imageUrl: "" },
              { text: row.Option4 || "", imageUrl: "" },
            ],
            correctOption: Number(row.CorrectIndex || 0),
            explanationText: row.Explanation || "",
            createdAt: serverTimestamp(),
          }
        );
      }

      Swal.fire("Success", "Excel imported successfully", "success");
    } catch (err) {
      console.error(err);
      Swal.fire("Error", "Excel import failed", "error");
    }
  };

  /* Reset filters */
  const resetFilters = () => {
    setSearchText("");
    setFilterSection("");
    setFilterSubject("");
    setFilterChapter("");
    setCurrentPage(1);
  };

  /* UI */
  return (
    <div className="mt-12">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold">
          Questions ({filteredQuestions.length})
        </h3>

        <div className="flex gap-3">
          <button
            onClick={() => setBulkMode(true)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 transition"
          >
            Bulk Add
          </button>

          <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer hover:bg-blue-700 transition">
            Upload Excel
            <input
              type="file"
              hidden
              accept=".xlsx"
              onChange={handleExcelUpload}
            />
          </label>

          <button
            onClick={() => {
              setEditingQuestion(null);
              setFormData(emptyQuestion);
              setOptionImages([null, null, null, null]);
              setShowModal(true);
            }}
            className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition"
          >
            Add Question
          </button>
        </div>
      </div>

      {/* SEARCH & FILTERS */}
      <div className="bg-white rounded-xl shadow p-4 mb-6 space-y-4">
        {/* SEARCH */}
        <div>
          <input
            type="text"
            placeholder="Search questions..."
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
          />
        </div>

        {/* FILTER DROPDOWNS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* SECTION FILTER */}
          <div>
            <select
              value={filterSection}
              onChange={(e) => {
                setFilterSection(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full border p-2 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="">All Sections</option>
              {sections.map(sec => (
                <option key={sec.id} value={sec.id}>
                  {sec.name}
                </option>
              ))}
            </select>
          </div>

          {/* SUBJECT FILTER */}
          <div>
            <select
              value={filterSubject}
              onChange={(e) => {
                setFilterSubject(e.target.value);
                setFilterChapter("");
                setCurrentPage(1);
              }}
              className="w-full border p-2 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            >
              <option value="">All Subjects</option>
              {subjects.map(sub => (
                <option key={sub.id} value={sub.name}>
                  {sub.name}
                </option>
              ))}
            </select>
          </div>

          {/* CHAPTER FILTER */}
          <div>
            <select
              value={filterChapter}
              onChange={(e) => {
                setFilterChapter(e.target.value);
                setCurrentPage(1);
              }}
              disabled={!filterSubject}
              className="w-full border p-2 rounded bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600 disabled:opacity-50"
            >
              <option value="">All Chapters</option>
              {chaptersForSubject.map((ch, i) => (
                <option key={i} value={ch}>
                  {ch}
                </option>
              ))}
            </select>
          </div>

          {/* RESET BUTTON */}
          <button
            onClick={resetFilters}
            className="bg-slate-300 hover:bg-slate-400 text-slate-800 px-4 py-2 rounded transition font-medium"
          >
            Reset Filters
          </button>
        </div>
      </div>

      {/* QUESTION LIST TABLE */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-200">
            <tr>
              <th className="p-3 w-80">Question</th>
              <th className="p-3 w-32">Section</th>
              <th className="p-3 w-28">Subject</th>
              <th className="p-3 w-28">Chapter</th>
              <th className="p-3 w-20">Difficulty</th>
              <th className="p-3 w-24 text-center">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedQuestions.length > 0 ? (
              paginatedQuestions.map((q) => (
                <tr key={q.id} className="border-t hover:bg-slate-50 transition">
                  <td className="p-3 w-80">
                    <div 
                      dangerouslySetInnerHTML={{ __html: q.questionText }} 
                      className="line-clamp-3 text-sm"
                    />
                  </td>
                  <td className="p-3 w-32 text-sm truncate">
                    {(sections || []).find(s => s.id === q.sectionId)?.name || "-"}
                  </td>
                  <td className="p-3 w-28 text-sm truncate">{q.subject || "-"}</td>
                  <td className="p-3 w-28 text-sm truncate">{q.chapter || "-"}</td>
                  <td className="p-3 w-20 text-sm">
                    <span className={`px-2 py-1 rounded text-xs font-medium inline-block ${
                      q.difficulty === "easy" ? "bg-green-100 text-green-700" :
                      q.difficulty === "medium" ? "bg-yellow-100 text-yellow-700" :
                      "bg-red-100 text-red-700"
                    }`}>
                      {q.difficulty}
                    </span>
                  </td>
                  <td className="p-3 w-24 text-center space-x-2">
                    <button
                      onClick={() => handleEdit(q)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(q.id)}
                      className="text-red-600 hover:text-red-800 font-medium text-sm"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="p-6 text-center text-slate-500">
                  No questions found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              className={`px-3 py-1 rounded transition font-medium ${
                currentPage === i + 1
                  ? "bg-indigo-600 text-white"
                  : "bg-white border hover:bg-slate-50"
              }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* BULK MODE MODAL */}
      {bulkMode && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-3xl p-6 rounded-xl shadow">
            <h4 className="font-bold mb-3 text-lg">Paste JSON Array</h4>
            <textarea
              className="w-full border p-3 rounded h-64 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-600"
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
              placeholder='[{"questionText":"...","subject":"...","sectionId":"...","chapter":"..."}]'
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => setBulkMode(false)}
                className="border px-4 py-2 rounded hover:bg-gray-100 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkSave}
                className="bg-green-600 text-white px-6 py-2 rounded hover:bg-green-700 transition"
              >
                Save Bulk
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT QUESTION MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow max-h-[90vh] overflow-y-auto space-y-6">

            <h4 className="text-xl font-bold">
              {editingQuestion ? "Edit Question" : "Add Question"}
            </h4>

            {/* SECTION DROPDOWN */}
            <div>
              <label className="font-medium block mb-2">Section</label>
              <select
                className="border p-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={formData.sectionId}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    sectionId: e.target.value
                  }))
                }
              >
                <option value="">Select Section</option>
                {(sections || []).map(sec => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
            </div>

            {/* SUBJECT */}
            <div>
              <label className="font-medium block mb-2">Subject</label>
              <select
                className="border p-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={formData.subject}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    subject: e.target.value,
                    chapter: ""
                  }))
                }
              >
                <option value="">Select Subject</option>
                {subjects.map(sub => (
                  <option key={sub.id} value={sub.name}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>

            {/* CHAPTER */}
            <div>
              <label className="font-medium block mb-2">Chapter</label>
              <select
                className="border p-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={formData.chapter}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    chapter: e.target.value
                  }))
                }
              >
                <option value="">Select Chapter</option>
                {subjects
                  .find(s => s.name === formData.subject)
                  ?.chapters?.map((ch, i) => (
                    <option key={i} value={ch}>
                      {ch}
                    </option>
                  ))}
              </select>
            </div>

            {/* DIFFICULTY */}
            <div>
              <label className="font-medium block mb-2">Difficulty</label>
              <select
                className="border p-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={formData.difficulty}
                onChange={(e) =>
                  setFormData(prev => ({ ...prev, difficulty: e.target.value }))
                }
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>

            {/* QUESTION TEXT */}
            <div>
              <label className="font-medium block mb-2">Question Text</label>
              <QuillEditor
                value={formData.questionText}
                onChange={(value) =>
                  setFormData(prev => ({ ...prev, questionText: value }))
                }
              />
            </div>

            {/* QUESTION IMAGE */}
            <div>
              <label className="font-medium block mb-2">Question Image (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setQuestionImage(e.target.files[0])}
                className="border p-2 rounded w-full"
              />
              {questionImage && (
                <p className="text-sm text-green-600 mt-1">File selected: {questionImage.name}</p>
              )}
            </div>

            {/* OPTIONS WITH IMAGES */}
            <div>
              <label className="font-medium block mb-2">Options</label>

              {formData.options.map((opt, index) => (
                <div key={index} className="mb-6 border p-4 rounded bg-gray-50">
                  <div className="flex justify-between items-center mb-3">
                    <label className="font-medium">Option {index + 1}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="radio"
                        id={`option-${index}`}
                        name="correctOption"
                        checked={formData.correctOption === index}
                        onChange={() =>
                          setFormData(prev => ({
                            ...prev,
                            correctOption: index,
                          }))
                        }
                      />
                      <label htmlFor={`option-${index}`} className="cursor-pointer text-sm">
                        Mark as Correct
                      </label>
                    </div>
                  </div>

                  {/* OPTION TEXT */}
                  <div className="mb-3">
                    <label className="text-sm text-gray-600 block mb-2">Option Text</label>
                    <QuillEditor
                      value={opt.text}
                      onChange={(value) => {
                        setFormData(prev => {
                          const updated = [...prev.options];
                          updated[index].text = value;
                          return { ...prev, options: updated };
                        });
                      }}
                    />
                  </div>

                  {/* OPTION IMAGE */}
                  <div>
                    <label className="text-sm text-gray-600 block mb-2">Option Image (optional)</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const newImages = [...optionImages];
                        newImages[index] = e.target.files[0];
                        setOptionImages(newImages);
                      }}
                      className="border p-2 rounded w-full text-sm"
                    />
                    {optionImages[index] && (
                      <p className="text-sm text-green-600 mt-1">
                        File selected: {optionImages[index].name}
                      </p>
                    )}
                    {opt.imageUrl && !optionImages[index] && (
                      <p className="text-sm text-blue-600 mt-1">
                        Current image: <a href={opt.imageUrl} target="_blank" rel="noopener noreferrer" className="underline">View</a>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* EXPLANATION */}
            <div>
              <label className="font-medium block mb-2">Explanation</label>
              <QuillEditor
                value={formData.explanationText}
                onChange={(value) =>
                  setFormData(prev => ({ ...prev, explanationText: value }))
                }
              />
            </div>

            {/* EXPLANATION IMAGE */}
            <div>
              <label className="font-medium block mb-2">Explanation Image (optional)</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setExplanationImage(e.target.files[0])}
                className="border p-2 rounded w-full"
              />
              {explanationImage && (
                <p className="text-sm text-green-600 mt-1">File selected: {explanationImage.name}</p>
              )}
            </div>

            {/* EXPLANATION VIDEO URL */}
            <div>
              <label className="font-medium block mb-2">Explanation Video URL</label>
              <input
                className="border p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-600"
                placeholder="https://youtube.com/watch?v=..."
                value={formData.explanationVideoUrl}
                onChange={(e) =>
                  setFormData(prev => ({
                    ...prev,
                    explanationVideoUrl: e.target.value,
                  }))
                }
              />
            </div>

            {/* FORM ACTIONS */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                onClick={() => {
                  setShowModal(false);
                  setOptionImages([null, null, null, null]);
                }}
                className="border px-4 py-2 rounded hover:bg-gray-100 transition"
              >
                Cancel
              </button>

              <button
                onClick={handleSave}
                className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 transition"
              >
                {editingQuestion ? "Update Question" : "Save Question"}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}