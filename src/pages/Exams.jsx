import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { logActivity } from "../utils/logActivity";
import Swal from "sweetalert2";

const ITEMS_PER_PAGE = 20;

export default function Exams() {
  const [exams, setExams] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);

  const [selected, setSelected] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingExam, setEditingExam] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    year: "",
    isActive: true,
    subscriptionPlanIds: [],
  });

  /* ---------------- FETCH EXAMS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "exams"),
      (snapshot) => {
        setExams(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      }
    );

    return () => unsubscribe();
  }, []);

  /* ---------------- FETCH SUBSCRIPTION PLANS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "subscriptionPlans"),
      (snapshot) => {
        setSubscriptionPlans(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      }
    );

    return () => unsubscribe();
  }, []);

  /* ---------------- SEARCH + FILTER ---------------- */
  const processedExams = useMemo(() => {
    let data = [...exams];

    if (search) {
      data = data.filter((e) =>
        e.name?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (filter === "active") {
      data = data.filter((e) => e.isActive);
    }

    if (filter === "inactive") {
      data = data.filter((e) => !e.isActive);
    }

    return data;
  }, [exams, search, filter]);

  const totalPages = Math.ceil(processedExams.length / ITEMS_PER_PAGE);

  const paginatedExams = processedExams.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name || !formData.year) {
      Swal.fire("Missing Fields", "Exam Name and Year required", "warning");
      return;
    }

    if (editingExam) {
      await updateDoc(doc(db, "exams", editingExam.id), formData);

      // ✅ LOG UPDATE
      await logActivity({
        actionType: "UPDATE_EXAM",
        description: `Updated exam: ${formData.name}`,
        entityId: editingExam.id,
        entityType: "exam",
      });

    } else {
      const ref = await addDoc(collection(db, "exams"), {
        ...formData,
        createdAt: serverTimestamp(),
      });

      // ✅ LOG CREATE
      await logActivity({
        actionType: "CREATE_EXAM",
        description: `Created exam: ${formData.name}`,
        entityId: ref.id,
        entityType: "exam",
      });
    }

    Swal.fire({
      icon: "success",
      title: editingExam ? "Exam Updated" : "Exam Created",
      timer: 1500,
      showConfirmButton: false
    });

    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      year: "",
      isActive: true,
      subscriptionPlanIds: [],
    });
    setEditingExam(null);
    setShowModal(false);
  };

  const toggleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const bulkDelete = async () => {

    const confirm = await Swal.fire({
      title: "Delete Selected Exams?",
      text: `You are deleting ${selected.length} exams`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete"
    });

    if (!confirm.isConfirmed) return;

    for (let id of selected) {

      const exam = exams.find(e => e.id === id);

      await deleteDoc(doc(db, "exams", id));

      await logActivity({
        actionType: "DELETE_EXAM",
        description: `Deleted exam: ${exam?.name}`,
        entityId: id,
        entityType: "exam",
      });

    }

    setSelected([]);

    Swal.fire(
      "Deleted!",
      "Selected exams deleted successfully",
      "success"
    );
  };

  return (
    <div className="p-10 bg-slate-100 min-h-screen">

      {/* HEADER */}
      <div className="flex justify-between mb-6">
        <h2 className="text-2xl font-bold">Exam Management</h2>

        <div className="flex gap-3">
          {selected.length > 0 && (
            <button
              onClick={bulkDelete}
              className="bg-red-500 text-white px-4 py-2 rounded"
            >
              Delete Selected
            </button>
          )}

          <button
            onClick={() => setShowModal(true)}
            className="bg-indigo-600 text-white px-4 py-2 rounded"
          >
            Add Exam
          </button>
        </div>
      </div>

      {/* FILTERS */}
      <div className="flex gap-4 mb-6">
        <input
          type="text"
          placeholder="Search Exam..."
          className="border p-2 rounded"
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="border p-2 rounded"
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-200">
            <tr>
              <th className="p-3"></th>
              <th className="p-3">Exam Name</th>
              <th className="p-3">Year</th>
              <th className="p-3">Active</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {paginatedExams.map((exam) => (
              <tr key={exam.id} className="border-t">
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={selected.includes(exam.id)}
                    onChange={() => toggleSelect(exam.id)}
                  />
                </td>

                <td className="p-3 font-medium">{exam.name}</td>
                <td className="p-3">{exam.year}</td>

                <td className="p-3">
                  {exam.isActive ? "Active" : "Inactive"}
                </td>

                <td className="p-3 space-x-3">
                  <button
                    onClick={() => {
                      setEditingExam(exam);
                      setFormData(exam);
                      setShowModal(true);
                    }}
                    className="text-indigo-600"
                  >
                    Edit
                  </button>

                  <button
                    onClick={async () => {

                      const confirm = await Swal.fire({
                        title: "Delete Exam?",
                        text: "This cannot be undone",
                        icon: "warning",
                        showCancelButton: true,
                        confirmButtonColor: "#d33",
                        cancelButtonColor: "#3085d6",
                        confirmButtonText: "Yes, delete it"
                      });

                      if (!confirm.isConfirmed) return;

                      await deleteDoc(doc(db, "exams", exam.id));

                      await logActivity({
                        actionType: "DELETE_EXAM",
                        description: `Deleted exam: ${exam.name}`,
                        entityId: exam.id,
                        entityType: "exam",
                      });

                      Swal.fire("Deleted!", "Exam removed successfully", "success");
                    }}
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

      {/* PAGINATION */}
      <div className="flex justify-center gap-2 mt-6">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i + 1)}
            className={`px-3 py-1 rounded ${currentPage === i + 1
              ? "bg-indigo-600 text-white"
              : "bg-white border"
              }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center">
          <div className="bg-white w-full max-w-lg p-6 rounded-xl shadow">
            <h3 className="text-xl font-bold mb-4">
              {editingExam ? "Edit Exam" : "Create Exam"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">

              <input
                type="text"
                placeholder="Exam Name (e.g., JEE Main)"
                value={formData.name}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    name: e.target.value,
                  })
                }
                className="w-full border p-3 rounded"
              />

              <input
                type="number"
                placeholder="Exam Year (e.g., 2026)"
                value={formData.year}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    year: e.target.value,
                  })
                }
                className="w-full border p-3 rounded"
              />

              <textarea
                placeholder="Exam Description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    description: e.target.value,
                  })
                }
                className="w-full border p-3 rounded"
              />

              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      isActive: e.target.checked,
                    })
                  }
                />
                Exam Active
              </label>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border rounded"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-4 py-2 rounded"
                >
                  Save Exam
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
