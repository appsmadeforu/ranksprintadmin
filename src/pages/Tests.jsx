import { useEffect, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  addDoc
} from "firebase/firestore";

import {
  Pencil,
  Trash2,
  Copy
} from "lucide-react";

import { useNavigate } from "react-router-dom";
import Swal from "sweetalert2";
import { logActivity } from "../utils/logActivity";

export default function Tests() {
  const navigate = useNavigate();

  const [exams, setExams] = useState([]);
  const [selectedExam, setSelectedExam] = useState("");
  const [tests, setTests] = useState([]);

  /* ---------------- FETCH EXAMS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "exams"), (snapshot) => {
      const examList = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setExams(examList);
    });

    return () => unsubscribe();
  }, []);

  /* ---------------- FETCH TESTS ---------------- */
  useEffect(() => {
    if (!selectedExam) {
      setTests([]);
      return;
    }

    const unsubscribe = onSnapshot(
      collection(db, "exams", selectedExam, "tests"),
      (snapshot) => {
        const testList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
        setTests(testList);
      }
    );

    return () => unsubscribe();
  }, [selectedExam]);

  /* ---------------- DELETE TEST ---------------- */
  const handleDelete = async (testId) => {
    if (!selectedExam) return;
    const result = await Swal.fire({
      title: "Delete Test?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      confirmButtonText: "Delete",
    });
    if (result.isConfirmed) {
      const testData =
        tests.find(t => t.id === testId);
      await deleteDoc(
        doc(db, "exams", selectedExam, "tests", testId)
      );
      /* LOG */
      await logActivity({
        actionType: "DELETE_TEST",
        description:
          `Deleted test: ${testData?.name || testId}`,
        entityId: testId,
        entityType: "test"
      });
      Swal.fire(
        "Deleted!",
        "Test removed.",
        "success"
      );
    }
  };

  /* ---------------- DUPLICATE TEST ---------------- */

  const handleDuplicate = async (testId) => {
    if (!selectedExam) return;
    const confirm =
      await Swal.fire({
        title: "Duplicate Test?",
        text: "A copy of this test will be created.",
        icon: "question",
        showCancelButton: true,
        confirmButtonText: "Duplicate"
      });

    if (!confirm.isConfirmed) return;
    try {
      /* GET ORIGINAL */
      const testRef =
        doc(
          db,
          "exams",
          selectedExam,
          "tests",
          testId
        );
      const testSnap =
        await getDoc(testRef);
      if (!testSnap.exists()) return;
      const testData =
        testSnap.data();
      /* MODIFY NAME */
      const newData = {
        ...testData,
        name:
          `${testData.name} (Duplicate)`
      };
      /* CREATE NEW TEST */
      const newDocRef =
        await addDoc(
          collection(
            db,
            "exams",
            selectedExam,
            "tests"
          ),
          newData
        );
      /* LOG */
      await logActivity({
        actionType: "DUPLICATE_TEST",
        description:
          `Duplicated test: ${testData.name}`,
        entityId: newDocRef.id,
        entityType: "test"
      });
      Swal.fire(
        "Duplicated!",
        "Test duplicated successfully.",
        "success"
      );
    }

    catch (err) {
      console.error(err);
      Swal.fire(
        "Error",
        err.message,
        "error"
      );
    }
  };

  /* ---------------- ADD TEST ---------------- */
  const handleAddTest = async () => {
    if (!selectedExam) {
      Swal.fire({
        icon: "warning",
        title: "Select Exam First",
        text: "Please select an exam before adding a test.",
      });
      return;
    }

    await logActivity({
      actionType: "NAVIGATE_ADD_TEST",
      description:
        `Navigated to create new test in exam ${selectedExam}`,
      entityId: selectedExam,
      entityType: "exam"
    });
    navigate(
      `/admin/exams/${selectedExam}/tests/new`
    );
  };

  return (
    <div className="p-10 bg-slate-100 min-h-screen">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Tests</h2>

        <button
          onClick={handleAddTest}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          Add Test
        </button>
      </div>

      {/* SELECT EXAM */}
      <div className="mb-6 max-w-md">
        <label className="block mb-2 font-semibold">
          Select Exam
        </label>

        <select
          value={selectedExam}
          onChange={(e) => setSelectedExam(e.target.value)}
          className="w-full border p-3 rounded-lg"
        >
          <option value="">-- Select Exam --</option>
          {exams.map((exam) => (
            <option key={exam.id} value={exam.id}>
              {exam.name || exam.title}
            </option>
          ))}
        </select>
      </div>

      {/* TABLE */}
      {selectedExam && (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-200">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Type</th>
                <th className="p-3">Status</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Start</th>
                <th className="p-3">End</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tests.length === 0 && (
                <tr>
                  <td
                    colSpan="5"
                    className="p-6 text-center text-slate-500"
                  >
                    No tests found for this exam.
                  </td>
                </tr>
              )}

              {tests.map((test) => (
                <tr key={test.id} className="border-t">
                  <td className="p-3">{test.name}</td>
                  <td className="p-3 capitalize">{test.type}</td>
                  <td className="p-3 capitalize">{test.status}</td>
                  <td className="p-3">
                    {test.timing?.totalDurationMinutes || 0} min
                  </td>
                  <td className="p-3 text-sm">
                    {test.visibilityStart
                      ? test.visibilityStart
                        ?.toDate?.()
                        ?.toLocaleString?.()
                      : "-"}
                  </td>
                  <td className="p-3 text-sm">
                    {test.visibilityEnd
                      ? test.visibilityEnd
                        ?.toDate?.()
                        ?.toLocaleString?.()
                      : "-"}
                  </td>
                  <td className="p-3 flex gap-4 items-center">
                    {/* EDIT */}
                    <button
                      title="Edit Test"
                      onClick={async () => {
                        await logActivity({
                          actionType: "EDIT_TEST",
                          description:
                            `Editing test: ${test.name}`,
                          entityId: test.id,
                          entityType: "test"
                        });
                        navigate(
                          `/admin/exams/${selectedExam}/tests/${test.id}`
                        );
                      }}
                      className="text-indigo-600 hover:text-indigo-800"
                    >
                      <Pencil size={18} />
                    </button>
                    {/* DUPLICATE */}
                    <button
                      title="Duplicate Test"
                      onClick={() =>
                        handleDuplicate(test.id)
                      }
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <Copy size={18} />
                    </button>
                    {/* DELETE */}
                    <button
                      title="Delete Test"
                      onClick={() =>
                        handleDelete(test.id)
                      }
                      className="text-red-600 hover:text-red-800"
                    >
                      <Trash2 size={18} />
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
