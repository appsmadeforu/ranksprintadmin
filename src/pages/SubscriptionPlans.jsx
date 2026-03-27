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
  getDocs,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import Swal from "sweetalert2";
import { logActivity } from "../utils/logActivity";

const ITEMS_PER_PAGE = 20;

export default function SubscriptionPlans() {
  const [plans, setPlans] = useState([]);
  const [exams, setExams] = useState([]);
  const [testsMap, setTestsMap] = useState({});
  const [pyqsMap, setPyqsMap] = useState({});

  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editingPlan, setEditingPlan] = useState(null);

  const [formData, setFormData] = useState({
    name: "",
    durationDays: 30,
    price: 0,
    examsIncluded: {},
    storeProductId: "",
    isActive: true,
  });

  const [selectedExamForEdit, setSelectedExamForEdit] = useState("");

  /* ---------------- FETCH PLANS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "subscriptionPlans"),
      (snapshot) => {
        setPlans(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      }
    );
    return () => unsubscribe();
  }, []);

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

  /* ---------------- FETCH TESTS FOR EACH EXAM ---------------- */
  useEffect(() => {
    const fetchAllTests = async () => {
      const tempTestsMap = {};

      for (let exam of exams) {
        try {
          const testsSnap = await getDocs(
            collection(db, "exams", exam.id, "tests")
          );

          tempTestsMap[exam.id] = testsSnap.docs.map((doc) => ({
            id: doc.id,
            name: doc.data().name || "Unnamed Test",
          }));
        } catch (err) {
          console.error(`Error fetching tests for exam ${exam.id}:`, err);
          tempTestsMap[exam.id] = [];
        }
      }

      setTestsMap(tempTestsMap);
    };

    if (exams.length > 0) fetchAllTests();
  }, [exams]);

  /* ---------------- FETCH PYQS FOR EACH EXAM ---------------- */
  useEffect(() => {
    const fetchAllPyqs = async () => {
      const tempPyqsMap = {};

      for (let exam of exams) {
        try {
          const pyqsSubjectsSnap = await getDocs(
            collection(db, "exams", exam.id, "pyqs")
          );

          let pyqsList = [];

          for (let subjectDoc of pyqsSubjectsSnap.docs) {
            const chaptersSnap = await getDocs(
              collection(
                db,
                "exams",
                exam.id,
                "pyqs",
                subjectDoc.id,
                "chapters"
              )
            );

            chaptersSnap.docs.forEach((ch) => {
              pyqsList.push({
                id: ch.id,
                subjectId: subjectDoc.id,
                name: `${subjectDoc.data().name} - ${ch.data().name}`,
              });
            });
          }

          tempPyqsMap[exam.id] = pyqsList;
        } catch (err) {
          console.error(`Error fetching PYQs for exam ${exam.id}:`, err);
          tempPyqsMap[exam.id] = [];
        }
      }

      setPyqsMap(tempPyqsMap);
    };

    if (exams.length > 0) fetchAllPyqs();
  }, [exams]);

  /* ---------------- SEARCH PLANS ---------------- */
  const filteredPlans = useMemo(() => {
    let data = [...plans];

    if (search) {
      data = data.filter((p) =>
        p.name?.toLowerCase().includes(search.toLowerCase())
      );
    }

    return data;
  }, [plans, search]);

  const totalPages = Math.ceil(filteredPlans.length / ITEMS_PER_PAGE);

  const paginatedPlans = filteredPlans.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  /* ---------------- RESET FORM ---------------- */
  const resetForm = () => {
    setFormData({
      name: "",
      durationDays: 30,
      price: 0,
      examsIncluded: {},
      storeProductId: "",
      isActive: true,
    });
    setEditingPlan(null);
    setSelectedExamForEdit("");
    setShowModal(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name) {
      Swal.fire("Error", "Plan Name is required", "error");
      return;
    }

    try {
      const payload = {
        name: formData.name,
        durationDays: formData.durationDays,
        price: formData.price,
        storeProductId: formData.storeProductId,
        isActive: formData.isActive,
        examsIncluded: formData.examsIncluded,
      };

      let planId;

      /* ================= CREATE ================= */
      if (!editingPlan) {

        const newPlanRef = await addDoc(
          collection(db, "subscriptionPlans"),
          {
            ...payload,
            createdAt: serverTimestamp(),
          }
        );

        planId = newPlanRef.id;

      }

      /* ================= UPDATE ================= */
      else {

        const oldPlan = editingPlan;
        planId = oldPlan.id;

        await updateDoc(
          doc(db, "subscriptionPlans", planId),
          payload
        );

        /* ===================== SYNC REMOVE FIRST ===================== */

        const oldIncluded = oldPlan.examsIncluded || {};
        const newIncluded = formData.examsIncluded || {};

        for (const examId in oldIncluded) {

          const oldTests = oldIncluded[examId]?.tests || [];
          const oldPyqs = oldIncluded[examId]?.pyqs || [];

          const newTests = newIncluded[examId]?.tests || [];
          const newPyqs = newIncluded[examId]?.pyqs || [];

          /* ---- REMOVE TESTS THAT WERE UNCHECKED ---- */
          for (const testId of oldTests) {

            if (!newTests.includes(testId)) {

              const testRef = doc(
                db,
                "exams",
                examId,
                "tests",
                testId
              );

              await updateDoc(testRef, {
                subscriptionPlanIds: arrayRemove(planId),
              });
            }
          }

          /* ---- REMOVE PYQS THAT WERE UNCHECKED ---- */
          for (const pyqId of oldPyqs) {

            if (!newPyqs.includes(pyqId)) {

              const subjectsSnap = await getDocs(
                collection(db, "exams", examId, "pyqs")
              );

              for (const subjectDoc of subjectsSnap.docs) {

                const chapterRef = doc(
                  db,
                  "exams",
                  examId,
                  "pyqs",
                  subjectDoc.id,
                  "chapters",
                  pyqId
                );

                try {
                  await updateDoc(chapterRef, {
                    subscriptionPlanIds: arrayRemove(planId),
                  });
                  break;
                } catch (err) { }
              }
            }
          }
        }
      }

      /* ===================== APPLY NEW ITEMS ===================== */

      for (const examId in formData.examsIncluded) {

        const { tests = [], pyqs = [] } =
          formData.examsIncluded[examId];

        /* ---- ADD TESTS ---- */
        for (const testId of tests) {

          const testRef = doc(
            db,
            "exams",
            examId,
            "tests",
            testId
          );

          await updateDoc(testRef, {
            subscriptionPlanIds: arrayUnion(planId),
          });
        }

        /* ---- ADD PYQS ---- */
        for (const pyqId of pyqs) {

          const subjectsSnap = await getDocs(
            collection(db, "exams", examId, "pyqs")
          );

          for (const subjectDoc of subjectsSnap.docs) {

            const chapterRef = doc(
              db,
              "exams",
              examId,
              "pyqs",
              subjectDoc.id,
              "chapters",
              pyqId
            );

            try {
              await updateDoc(chapterRef, {
                subscriptionPlanIds: arrayUnion(planId),
              });
              break;
            } catch (err) { }
          }
        }
      }

      Swal.fire(
        "Success",
        editingPlan
          ? "Plan updated successfully"
          : "Plan created successfully",
        "success"
      );

      resetForm();

    } catch (err) {
      console.error(err);
      Swal.fire("Error", err.message, "error");
    }
  };

  /* ---------------- EXAM SELECTION IN MODAL ---------------- */
  const toggleExamSelection = (examId) => {
    const isSelected = examId in formData.examsIncluded;

    if (isSelected) {
      const updated = { ...formData.examsIncluded };
      delete updated[examId];
      setFormData({
        ...formData,
        examsIncluded: updated,
      });
    } else {
      setFormData({
        ...formData,
        examsIncluded: {
          ...formData.examsIncluded,
          [examId]: { tests: [], pyqs: [] },
        },
      });
    }

    setSelectedExamForEdit("");
  };

  /* ---------------- TEST SELECTION FOR EXAM ---------------- */
  const toggleTestSelection = (examId, testId) => {
    const currentTests = formData.examsIncluded[examId]?.tests || [];
    const isSelected = currentTests.includes(testId);

    let updatedTests;
    if (isSelected) {
      updatedTests = currentTests.filter((id) => id !== testId);
    } else {
      updatedTests = [...currentTests, testId];
    }

    setFormData({
      ...formData,
      examsIncluded: {
        ...formData.examsIncluded,
        [examId]: {
          ...formData.examsIncluded[examId],
          tests: updatedTests,
        },
      },
    });
  };

  const toggleAllTests = (examId) => {
    const allTests = testsMap[examId]?.map(t => t.id) || [];
    const selectedTests = formData.examsIncluded[examId]?.tests || [];

    const isAllSelected = selectedTests.length === allTests.length;

    const updatedTests = isAllSelected ? [] : allTests;

    setFormData({
      ...formData,
      examsIncluded: {
        ...formData.examsIncluded,
        [examId]: {
          ...formData.examsIncluded[examId],
          tests: updatedTests,
        },
      },
    });
  };

  const toggleAllPyqs = (examId) => {
    const allPyqs = pyqsMap[examId]?.map(p => p.id) || [];
    const selectedPyqs = formData.examsIncluded[examId]?.pyqs || [];

    const isAllSelected = selectedPyqs.length === allPyqs.length;

    const updatedPyqs = isAllSelected ? [] : allPyqs;

    setFormData({
      ...formData,
      examsIncluded: {
        ...formData.examsIncluded,
        [examId]: {
          ...formData.examsIncluded[examId],
          pyqs: updatedPyqs,
        },
      },
    });
  };

  /* ---------------- PYQ SELECTION FOR EXAM ---------------- */
  const togglePyqSelection = (examId, pyqId) => {
    const currentPyqs = formData.examsIncluded[examId]?.pyqs || [];
    const isSelected = currentPyqs.includes(pyqId);

    let updatedPyqs;
    if (isSelected) {
      updatedPyqs = currentPyqs.filter((id) => id !== pyqId);
    } else {
      updatedPyqs = [...currentPyqs, pyqId];
    }

    setFormData({
      ...formData,
      examsIncluded: {
        ...formData.examsIncluded,
        [examId]: {
          ...formData.examsIncluded[examId],
          pyqs: updatedPyqs,
        },
      },
    });
  };

  /* ---------------- DELETE PLAN ---------------- */
  const handleDeletePlan = async (planId) => {
    const result = await Swal.fire({
      title: "Delete Plan?",
      text: "This action cannot be undone",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Delete",
    });

    if (!result.isConfirmed) return;

    const plan = plans.find(p => p.id === planId);

    await deleteDoc(doc(db, "subscriptionPlans", planId));

    await logActivity({
      actionType: "DELETE_PLAN",
      description: `Deleted subscription plan: ${plan?.name}`,
      entityId: planId,
      entityType: "subscriptionPlan",
    });

    Swal.fire("Deleted", "Plan deleted successfully", "success");
  };

  return (
    <div className="p-10 bg-slate-100 min-h-screen">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Subscription Plans</h2>

        <button
          onClick={() => {
            setEditingPlan(null);
            setFormData({
              name: "",
              durationDays: 30,
              price: 0,
              examsIncluded: {},
              storeProductId: "",
              isActive: true,
            });
            setSelectedExamForEdit("");
            setShowModal(true);
          }}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition"
        >
          Create Plan
        </button>
      </div>

      {/* SEARCH */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search plan by name..."
          className="border p-2 rounded w-64"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-200">
            <tr>
              <th className="p-3">Plan Name</th>
              <th className="p-3">Duration</th>
              <th className="p-3">Price</th>
              <th className="p-3">Exams Included</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {paginatedPlans.map((plan) => (
              <tr key={plan.id} className="border-t hover:bg-slate-50 transition">
                <td className="p-3 font-medium">{plan.name}</td>
                <td className="p-3">{plan.durationDays} Days</td>
                <td className="p-3 font-semibold">₹ {plan.price}</td>
                <td className="p-3">
                  <span className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded">
                    {Object.keys(plan.examsIncluded || {}).length} Exams
                  </span>
                </td>
                <td className="p-3">
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${plan.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                      }`}
                  >
                    {plan.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="p-3 space-x-2">
                  <button
                    onClick={() => {
                      setEditingPlan(plan);
                      setFormData({
                        name: plan.name || "",
                        durationDays: plan.durationDays || 30,
                        price: plan.price || 0,
                        examsIncluded: plan.examsIncluded || {},
                        storeProductId: plan.storeProductId || "",
                        isActive: plan.isActive ?? true,
                      });
                      setSelectedExamForEdit("");
                      setShowModal(true);
                    }}
                    className="text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeletePlan(plan.id)}
                    className="text-red-600 hover:text-red-800 font-medium"
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
            className={`px-3 py-1 rounded transition ${currentPage === i + 1
              ? "bg-indigo-600 text-white"
              : "bg-white border hover:bg-slate-50"
              }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-4xl rounded-xl shadow-lg flex flex-col max-h-[90vh]">

            {/* HEADER */}
            <div className="p-6 border-b bg-gradient-to-r from-indigo-50 to-slate-50">
              <h3 className="text-xl font-bold text-slate-800">
                {editingPlan
                  ? "Edit Subscription Plan"
                  : "Create Subscription Plan"}
              </h3>
            </div>

            {/* SCROLLABLE BODY */}
            <form
              onSubmit={handleSubmit}
              className="p-6 overflow-y-auto space-y-6 flex-1"
            >

              {/* PLAN NAME */}
              <div>
                <label className="block font-semibold mb-2 text-slate-700">
                  Plan Name
                </label>
                <input
                  type="text"
                  placeholder="Example: Premium Plan"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      name: e.target.value,
                    })
                  }
                  className="w-full border p-3 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              {/* DURATION */}
              <div>
                <label className="block font-semibold mb-2 text-slate-700">
                  Plan Duration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={formData.durationDays}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      durationDays: Number(e.target.value),
                    })
                  }
                  className="w-full border p-3 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              {/* PRICE */}
              <div>
                <label className="block font-semibold mb-2 text-slate-700">
                  Price (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      price: Number(e.target.value),
                    })
                  }
                  className="w-full border p-3 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              {/* EXAMS INCLUDED WITH TESTS & PYQS */}
              <div>
                <label className="block font-semibold mb-3 text-slate-700">
                  Exams Included
                </label>

                {/* EXAM DROPDOWN */}
                <div className="mb-4">
                  <select
                    value={selectedExamForEdit}
                    onChange={(e) => setSelectedExamForEdit(e.target.value)}
                    className="w-full border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                  >
                    <option value="">Select Exam to Add/Remove</option>
                    {exams.map((exam) => (
                      <option key={exam.id} value={exam.id}>
                        {exam.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* ADD/REMOVE EXAM BUTTON */}
                {selectedExamForEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      toggleExamSelection(selectedExamForEdit)
                    }
                    className={`mb-4 px-4 py-2 rounded font-medium transition ${selectedExamForEdit in formData.examsIncluded
                      ? "bg-red-500 text-white hover:bg-red-600"
                      : "bg-green-500 text-white hover:bg-green-600"
                      }`}
                  >
                    {selectedExamForEdit in formData.examsIncluded
                      ? "Remove Exam"
                      : "Add Exam"}
                  </button>
                )}

                {/* SELECTED EXAMS WITH TESTS & PYQS */}
                <div className="space-y-6">
                  {Object.keys(formData.examsIncluded).map((examId) => {
                    const exam = exams.find((e) => e.id === examId);
                    const tests = testsMap[examId] || [];
                    const pyqs = pyqsMap[examId] || [];

                    return (
                      <div
                        key={examId}
                        className="border rounded-lg p-4 bg-slate-50"
                      >
                        <h4 className="font-semibold text-slate-800 mb-3">
                          {exam?.name}
                        </h4>

                        {/* TESTS SECTION */}
                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-sm font-medium text-slate-700">
                              Tests ({formData.examsIncluded[examId].tests.length})
                            </p>

                            <label className="text-xs flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  tests.length > 0 &&
                                  formData.examsIncluded[examId].tests.length === tests.length
                                }
                                onChange={() => toggleAllTests(examId)}
                                className="accent-indigo-600"
                              />
                              Select All
                            </label>
                          </div>
                          <div className="border rounded bg-white p-3 max-h-32 overflow-y-auto space-y-2">
                            {tests.length > 0 ? (
                              tests.map((test) => (
                                <label
                                  key={test.id}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                                >
                                  <input
                                    type="checkbox"
                                    checked={formData.examsIncluded[
                                      examId
                                    ].tests.includes(test.id)}
                                    onChange={() =>
                                      toggleTestSelection(examId, test.id)
                                    }
                                    className="accent-indigo-600"
                                  />
                                  <span className="text-sm">
                                    {test.name}
                                  </span>
                                </label>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500">
                                No tests available
                              </p>
                            )}
                          </div>
                        </div>

                        {/* PYQS SECTION */}
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-sm font-medium text-slate-700">
                              PYQs ({formData.examsIncluded[examId].pyqs.length})
                            </p>

                            <label className="text-xs flex items-center gap-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={
                                  pyqs.length > 0 &&
                                  formData.examsIncluded[examId].pyqs.length === pyqs.length
                                }
                                onChange={() => toggleAllPyqs(examId)}
                                className="accent-indigo-600"
                              />
                              Select All
                            </label>
                          </div>
                          <div className="border rounded bg-white p-3 max-h-32 overflow-y-auto space-y-2">
                            {pyqs.length > 0 ? (
                              pyqs.map((pyq) => (
                                <label
                                  key={pyq.id}
                                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded"
                                >
                                  <input
                                    type="checkbox"
                                    checked={formData.examsIncluded[
                                      examId
                                    ].pyqs.includes(pyq.id)}
                                    onChange={() =>
                                      togglePyqSelection(examId, pyq.id)
                                    }
                                    className="accent-indigo-600"
                                  />
                                  <span className="text-sm">
                                    {pyq.name}
                                  </span>
                                </label>
                              ))
                            ) : (
                              <p className="text-xs text-slate-500">
                                No PYQs available
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {Object.keys(formData.examsIncluded).length === 0 && (
                  <p className="text-sm text-slate-500 p-4 bg-slate-100 rounded">
                    No exams selected yet
                  </p>
                )}
              </div>

              {/* PRODUCT ID */}
              <div>
                <label className="block font-semibold mb-2 text-slate-700">
                  Product Id
                </label>
                <input
                  type="text"
                  placeholder="Enter Store Product ID"
                  value={formData.storeProductId}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      storeProductId: e.target.value,
                    })
                  }
                  className="w-full border p-3 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
              </div>

              {/* ACTIVE STATUS */}
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isActive: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                  Activate This Plan
                </label>
              </div>

              {/* FORM ACTIONS */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border rounded hover:bg-slate-50 transition font-medium"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 transition font-medium"
                >
                  {editingPlan ? "Update Plan" : "Create Plan"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
    </div>
  );
}
