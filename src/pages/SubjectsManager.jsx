import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
  getDocs
} from "firebase/firestore";
import Swal from "sweetalert2";
import { logActivity } from "../utils/logActivity";

const ITEMS_PER_PAGE = 20;

export default function SubjectsManager() {

  /* ---------------- STATES ---------------- */

  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState("");

  const [subjects, setSubjects] = useState([]);
  const [subjectName, setSubjectName] = useState("");

  const [chapterInput, setChapterInput] = useState("");
  const [chapters, setChapters] = useState([]);

  const [editingId, setEditingId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  /* ---------------- FETCH EXAMS ---------------- */

  useEffect(() => {
    const fetchExams = async () => {
      const snap =
        await getDocs(
          collection(db, "exams")
        );
      setExams(
        snap.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
      );
    };
    fetchExams();
  }, []);

  /* ---------------- FETCH SUBJECTS PER EXAM ---------------- */

  useEffect(() => {
    if (!selectedExam) {
      setSubjects([]);
      setEditingId(null);
      setSubjectName("");
      setChapters([]);
      return;
    }
    const unsub =
      onSnapshot(
        collection(
          db,
          "exams",
          selectedExam,
          "subjects"
        ),
        (snapshot) => {
          setSubjects(
            snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }))
          );
        }
      );
    return () => unsub();
  }, [selectedExam]);

  /* ---------------- PAGINATION ---------------- */

  const totalPages =
    Math.ceil(
      subjects.length / ITEMS_PER_PAGE
    );

  const paginatedSubjects =
    useMemo(() => {

      const start =
        (currentPage - 1) * ITEMS_PER_PAGE;

      return subjects.slice(
        start,
        start + ITEMS_PER_PAGE
      );

    }, [subjects, currentPage]);

  /* ---------------- COUNTS ---------------- */

  const totalSubjects =
    subjects.length;

  const totalChapters =
    subjects.reduce(

      (sum, sub) =>
        sum +
        (sub.chapters?.length || 0),

      0

    );

  /* ---------------- ADD CHAPTER ---------------- */

  const addChapter = () => {

    const trimmed =
      chapterInput.trim();

    if (!trimmed) return;

    if (chapters.includes(trimmed))
      return Swal.fire(
        "Error",
        "Chapter already exists",
        "error"
      );

    setChapters(prev => [
      ...prev,
      trimmed
    ]);

    setChapterInput("");

  };

  const removeChapter = (index) => {

    const updated =
      [...chapters];

    updated.splice(index, 1);

    setChapters(updated);

  };

  /* ---------------- EDIT ---------------- */

  const handleEdit = (subject) => {

    setEditingId(subject.id);
    setSubjectName(subject.name);
    setChapters(subject.chapters || []);

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });

  };

  const handleCancelEdit = () => {

    setEditingId(null);
    setSubjectName("");
    setChapters([]);

  };

  /* ---------------- SAVE ---------------- */

  const handleSave = async () => {

    if (!selectedExam)
      return Swal.fire(
        "Error",
        "Select Exam first",
        "error"
      );

    if (!subjectName.trim())
      return Swal.fire(
        "Error",
        "Subject required",
        "error"
      );

    try {

      if (editingId) {

        const docRef =
          doc(
            db,
            "exams",
            selectedExam,
            "subjects",
            editingId
          );

        await updateDoc(
          docRef,
          {
            name: subjectName.trim(),
            chapters,
            updatedAt:
              serverTimestamp()
          }
        );

        await logActivity({
          actionType: "UPDATE_SUBJECT",
          description:
            `Updated subject ${subjectName}`,
          entityId: editingId,
          entityType: "subject"
        });

        Swal.fire(
          "Success",
          "Subject updated",
          "success"
        );

      } else {

        const ref =
          await addDoc(

            collection(
              db,
              "exams",
              selectedExam,
              "subjects"
            ),

            {
              name:
                subjectName.trim(),
              chapters,
              createdAt:
                serverTimestamp()
            }

          );

        await logActivity({
          actionType:
            "CREATE_SUBJECT",
          description:
            `Created subject ${subjectName}`,
          entityId: ref.id,
          entityType: "subject"
        });

        Swal.fire(
          "Success",
          "Subject added",
          "success"
        );

      }

      setSubjectName("");
      setChapters([]);
      setEditingId(null);

    }

    catch (err) {

      Swal.fire(
        "Error",
        err.message,
        "error"
      );

    }

  };

  /* ---------------- DELETE ---------------- */

  const handleDelete = async (id) => {

    const confirm =
      await Swal.fire({
        title:
          "Delete Subject?",
        icon: "warning",
        showCancelButton: true
      });

    if (!confirm.isConfirmed)
      return;

    const subject =
      subjects.find(
        s => s.id === id
      );

    await deleteDoc(

      doc(
        db,
        "exams",
        selectedExam,
        "subjects",
        id
      )

    );

    await logActivity({

      actionType:
        "DELETE_SUBJECT",

      description:
        `Deleted subject ${subject?.name}`,

      entityId: id,

      entityType: "subject"

    });

    Swal.fire(
      "Deleted",
      "Subject removed",
      "success"
    );

  };

  /* ---------------- UI ---------------- */

  return (

    <div className="p-10 bg-slate-100 min-h-screen">

      <h2 className="text-2xl font-bold mb-6">

        Subjects & Chapters

      </h2>

      {/* SELECT EXAM */}

      <div className="mb-6">

        <label className="font-semibold block mb-2">
          Select Exam
        </label>

        <select
          className="border p-3 rounded w-[300px]"
          value={selectedExam}
          onChange={(e) => {
            const examId = e.target.value;
            setSelectedExam(examId);
            setCurrentPage(1);
            setEditingId(null);
            setSubjectName("");
            setChapters([]);
          }}
        >

          <option value="">
            Select Exam
          </option>

          {exams.map(exam => (

            <option
              key={exam.id}
              value={exam.id}
            >

              {exam.name}

            </option>

          ))}

        </select>

      </div>

      {/* ADD FORM */}

      {selectedExam && (

        <div className="bg-white p-6 rounded-xl shadow mb-8 space-y-4">

          <div>

            <label className="font-semibold block mb-2">
              Subject Name
            </label>

            <input
              className="border p-3 rounded w-full"
              value={subjectName}
              onChange={(e) =>
                setSubjectName(e.target.value)
              }
            />

          </div>

          <div>

            <label className="font-semibold block mb-2">
              Add Chapter
            </label>

            <input
              className="border p-3 rounded w-full"
              placeholder="Press Enter to add chapter"
              value={chapterInput}
              onChange={(e) =>
                setChapterInput(e.target.value)
              }
              onKeyDown={(e) => {

                if (e.key === "Enter") {

                  e.preventDefault();
                  addChapter();

                }

              }}
            />

          </div>

          {chapters.length > 0 && (

            <div className="space-y-2">

              {chapters.map((ch, i) => (

                <div
                  key={i}
                  className="flex justify-between bg-slate-100 p-3 rounded"
                >

                  {ch}

                  <button
                    onClick={() =>
                      removeChapter(i)
                    }
                    className="text-red-500"
                  >
                    Remove
                  </button>

                </div>

              ))}

            </div>

          )}

          <div className="flex gap-3">

            <button
              onClick={handleSave}
              className="bg-green-600 text-white px-6 py-2 rounded"
            >

              {editingId
                ? "Update Subject"
                : "Save Subject"}

            </button>

            {editingId && (

              <button
                onClick={handleCancelEdit}
                className="border px-6 py-2 rounded"
              >
                Cancel
              </button>

            )}

          </div>

        </div>

      )}

      {/* SUBJECT COUNTS */}
      {selectedExam && (
        <div className="mb-4 flex gap-6">

          <div className="font-semibold">
            Total Subjects:
            <span className="text-indigo-600 ml-2">
              {totalSubjects}
            </span>
          </div>

          <div className="font-semibold">
            Total Chapters:
            <span className="text-indigo-600 ml-2">
              {totalChapters}
            </span>
          </div>

        </div>
      )}

      {/* SUBJECT TABLE */}
      {selectedExam && (
        <div className="bg-white rounded-xl shadow">

          <table className="w-full text-left">

            <thead className="bg-slate-200">

              <tr>

                <th className="p-3">
                  Subject
                </th>

                <th className="p-3">
                  Chapters
                </th>

                <th className="p-3">
                  Actions
                </th>

              </tr>

            </thead>

            <tbody>

              {paginatedSubjects.map(sub => (

                <tr
                  key={sub.id}
                  className="border-t"
                >

                  <td className="p-3 font-semibold">
                    {sub.name}
                  </td>

                  <td className="p-3">

                    {sub.chapters?.map((ch, i) => (

                      <span
                        key={i}
                        className="inline-block bg-slate-100 px-3 py-1 rounded mr-2 mb-1"
                      >

                        {ch}

                      </span>

                    ))}

                  </td>

                  <td className="p-3 space-x-4">

                    <button
                      onClick={() =>
                        handleEdit(sub)
                      }
                      className="text-indigo-600"
                    >
                      Edit
                    </button>

                    <button
                      onClick={() =>
                        handleDelete(sub.id)
                      }
                      className="text-red-600"
                    >
                      Delete
                    </button>

                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>
      )}

    </div>

  );

}
