import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { db, auth } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import Swal from "sweetalert2";
import SectionsManager from "../components/SectionsManager";
import QuestionsManager from "../components/QuestionsManager";
import { logActivity } from "../utils/logActivity";

export default function TestEditor() {
  const { examId, testId } = useParams();
  const navigate = useNavigate();
  const isNew = testId === "new";

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("settings");
  const [sections, setSections] = useState([]);
  const [users, setUsers] = useState([]);
  const [userGroups, setUserGroups] = useState([]);

  const [formData, setFormData] = useState({
    name: "",
    type: "full",
    status: "draft",
    isDemo: false,
    visibilityStart: "",
    visibilityEnd: "",

    totalQuestions: 0,
    totalMarks: 0,
    marksPerQuestion: 1,
    negativeMarkingEnabled: false,
    negativeMarks: 0,

    attemptLimit: 1,
    randomizeQuestions: false,
    randomizeOptions: false,

    timing: {
      totalDurationMinutes: 0,
      serverEnforced: true,
    },

    securityConfig: {
      allowedAppSwitch: 3,
      screenshotDetection: true,
      screenRecordingDetection: true,
      blockRootedDevice: true,
      autoSubmitOnViolation: false,
    },

    resultSettings: {
      visibility: "immediate",
      leaderboardSize: 100,
      rankingBasis: "testScore",
      firstAttemptOnlyRanking: true,
    },

    userType: "all",
    userIds: [],
    userGroupIds: [],
  });

  /* ---------------- FETCH ---------------- */

  useEffect(() => {
    if (isNew) return;

    const fetchTest = async () => {
      const snap = await getDoc(
        doc(db, "exams", examId, "tests", testId)
      );

      if (snap.exists()) {
        const data = snap.data();

        setFormData({
          ...data,
          visibilityStart: data.visibilityStart
            ? data.visibilityStart.toDate().toISOString().slice(0, 16)
            : "",
          visibilityEnd: data.visibilityEnd
            ? data.visibilityEnd.toDate().toISOString().slice(0, 16)
            : "",
          userType: data.userType || "all",
          userIds: data.userIds || [],
          userGroupIds: data.userGroupIds || []
        });
      }
    };

    fetchTest();
  }, [examId, testId]);

  useEffect(() => {
    if (isNew) return;

    const unsubscribe = onSnapshot(
      collection(db, "exams", examId, "tests", testId, "sections"),
      (snapshot) => {
        setSections(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      }
    );

    return () => unsubscribe();
  }, [examId, testId, isNew]);

  /* ---------------- FETCH USERS ---------------- */

  useEffect(() => {
    return onSnapshot(
      collection(db, "users"),
      snap => {
        setUsers(
          snap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }))
        );
      }
    );
  }, []);

  /* ---------------- FETCH GROUPS ---------------- */

  useEffect(() => {
    return onSnapshot(
      collection(db, "userGroups"),
      snap => {
        setUserGroups(
          snap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }))
        );
      }
    );
  }, []);

  const toggleUser = (userId) => {
    const list =
      formData.userIds || [];
    const exists =
      list.includes(userId);
    setFormData({
      ...formData,
      userIds: exists
        ? list.filter(id => id !== userId)
        : [...list, userId]
    });
  };

  const toggleUserGroup = (groupId) => {
    const list =
      formData.userGroupIds || [];
    const exists =
      list.includes(groupId);
    setFormData({
      ...formData,
      userGroupIds: exists
        ? list.filter(id => id !== groupId)
        : [...list, groupId]
    });
  };

  /* ---------------- SAVE ---------------- */

  // const handleSave = async () => {
  //   try {
  //     setLoading(true);

  //     const refDoc = isNew
  //       ? doc(collection(db, "exams", examId, "tests"))
  //       : doc(db, "exams", examId, "tests", testId);

  //     /* -------- DETERMINE TARGET USERS -------- */

  //     let finalUsers = [];

  //     if (formData.userType === "all") {

  //       finalUsers =
  //         users.map(u => u.id);

  //     }

  //     if (formData.userType === "specific") {

  //       finalUsers =
  //         formData.userIds;

  //     }

  //     if (formData.userType === "groups") {

  //       formData.userGroupIds.forEach(groupId => {

  //         const group =
  //           userGroups.find(
  //             g => g.id === groupId
  //           );

  //         if (group?.userIds) {

  //           finalUsers.push(
  //             ...group.userIds
  //           );

  //         }

  //       });

  //     }

  //     finalUsers =
  //       [...new Set(finalUsers)];

  //     /* -------- PAYLOAD -------- */

  //     const payload = {

  //       ...formData,

  //       userIds: finalUsers,

  //       visibilityStart:
  //         formData.visibilityStart
  //           ? new Date(formData.visibilityStart)
  //           : null,

  //       visibilityEnd:
  //         formData.visibilityEnd
  //           ? new Date(formData.visibilityEnd)
  //           : null,

  //       createdBy:
  //         auth.currentUser?.uid || "admin",

  //       updatedAt:
  //         serverTimestamp()

  //     };

  //     if (isNew) {
  //       await setDoc(refDoc, {
  //         ...payload,
  //         createdAt: serverTimestamp(),
  //       });

  //       // ✅ LOG CREATE
  //       await logActivity({
  //         actionType: "CREATE_TEST",
  //         description: `Created test: ${formData.name}`,
  //         entityId: refDoc.id,
  //         entityType: "test",
  //       });

  //     } else {
  //       await updateDoc(refDoc, payload);

  //       // ✅ LOG UPDATE
  //       await logActivity({
  //         actionType: "UPDATE_TEST",
  //         description: `Updated test: ${formData.name}`,
  //         entityId: testId,
  //         entityType: "test",
  //       });
  //     }

  //     Swal.fire("Success", "Test saved successfully", "success");
  //     navigate("/admin/tests");

  //   } catch (err) {
  //     Swal.fire("Error", err.message, "error");
  //   } finally {
  //     setLoading(false);
  //   }
  // };


    const handleSave = async () => {
    try {
      setLoading(true);

      const refDoc = isNew
        ? doc(collection(db, "exams", examId, "tests"))
        : doc(db, "exams", examId, "tests", testId);

      /* -------- DETERMINE TARGET USERS -------- */

      let finalUsers = [];

      if (formData.userType === "all") {
        finalUsers = users.map(u => u.id);
      }

      if (formData.userType === "specific") {
        finalUsers = formData.userIds;
      }

      if (formData.userType === "groups") {
        formData.userGroupIds.forEach(groupId => {
          const group = userGroups.find(g => g.id === groupId);
          if (group?.userIds) {
            finalUsers.push(...group.userIds);
          }
        });
      }

      finalUsers = [...new Set(finalUsers)];

      /* -------- PAYLOAD -------- */

      const payload = {
        ...formData,
        userIds: finalUsers,
        visibilityStart:
          formData.visibilityStart
            ? new Date(formData.visibilityStart)
            : null,
        visibilityEnd:
          formData.visibilityEnd
            ? new Date(formData.visibilityEnd)
            : null,
        createdBy: auth.currentUser?.uid || "admin",
        updatedAt: serverTimestamp()
      };

      if (isNew) {
        await setDoc(refDoc, {
          ...payload,
          createdAt: serverTimestamp(),
        });

        await logActivity({
          actionType: "CREATE_TEST",
          description: `Created test: ${formData.name}`,
          entityId: refDoc.id,
          entityType: "test",
        });

      } else {
        await updateDoc(refDoc, payload);

        await logActivity({
          actionType: "UPDATE_TEST",
          description: `Updated test: ${formData.name}`,
          entityId: testId,
          entityType: "test",
        });
      }

      Swal.fire("Success", "Test saved successfully", "success");
      
      // ✅ CHANGED: Navigate to Tests page with examId preserved
      navigate(`/admin/tests?exam=${examId}`);

    } catch (err) {
      Swal.fire("Error", err.message, "error");
    } finally {
      setLoading(false);
    }
  };

  /* ---------------- UI ---------------- */

  return (
    <div className="p-8 bg-slate-100 min-h-screen">

      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate("/admin/tests")}>←</button>
        <h2 className="text-2xl font-bold">
          {isNew ? "Create Test" : "Edit Test"}
        </h2>
      </div>

      {!isNew && (
        <div className="flex gap-6 mb-6 border-b">
          <button
            onClick={() => setActiveTab("settings")}
            className={`pb-3 px-1 font-medium transition-colors ${activeTab === "settings"
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-gray-600 hover:text-gray-900"
              }`}
          >
            Test Settings
          </button>
          <button
            onClick={() => setActiveTab("sections")}
            className={`pb-3 px-1 font-medium transition-colors ${activeTab === "sections"
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-gray-600 hover:text-gray-900"
              }`}
          >
            Sections
          </button>
          <button
            onClick={() => setActiveTab("questions")}
            className={`pb-3 px-1 font-medium transition-colors ${activeTab === "questions"
              ? "text-indigo-600 border-b-2 border-indigo-600"
              : "text-gray-600 hover:text-gray-900"
              }`}
          >
            Questions
          </button>
        </div>
      )}

      {(isNew || activeTab === "settings") && (
        <div className="bg-white p-6 rounded-xl shadow space-y-8">

          {/* BASIC INFO */}
          <div>
            <h3 className="font-bold mb-4">Basic Information</h3>

            <label className="block text-sm mb-1">Test Name</label>
            <input
              className="w-full border p-3 rounded mb-4"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label>Test Type</label>
                <select
                  className="border p-2 rounded w-full"
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                >
                  <option value="full">Full</option>
                  <option value="sectional">Sectional</option>
                  <option value="demo">Demo</option>
                </select>
              </div>

              <div>
                <label>Status</label>
                <select
                  className="border p-2 rounded w-full"
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({ ...formData, status: e.target.value })
                  }
                >
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label>Visibility Start</label>
                <input
                  type="datetime-local"
                  className="border p-2 rounded w-full"
                  value={formData.visibilityStart}
                  onChange={(e) =>
                    setFormData({ ...formData, visibilityStart: e.target.value })
                  }
                />
              </div>

              <div>
                <label>Visibility End</label>
                <input
                  type="datetime-local"
                  className="border p-2 rounded w-full"
                  value={formData.visibilityEnd}
                  onChange={(e) =>
                    setFormData({ ...formData, visibilityEnd: e.target.value })
                  }
                />
              </div>
            </div>

            <label className="flex gap-2 mt-3">
              <input
                type="checkbox"
                checked={formData.isDemo}
                onChange={(e) =>
                  setFormData({ ...formData, isDemo: e.target.checked })
                }
              />
              Demo Test
            </label>
          </div>

          {/* MARKS */}
          <div>
            <h3 className="font-bold mb-4">Marks & Structure</h3>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <label>Total Questions</label>
                <input type="number" className="border p-2 rounded w-full"
                  value={formData.totalQuestions}
                  onChange={(e) =>
                    setFormData({ ...formData, totalQuestions: Number(e.target.value) })
                  }
                />
              </div>

              <div>
                <label>Total Marks</label>
                <input type="number" className="border p-2 rounded w-full"
                  value={formData.totalMarks}
                  onChange={(e) =>
                    setFormData({ ...formData, totalMarks: Number(e.target.value) })
                  }
                />
              </div>

              <div>
                <label>Marks Per Question</label>
                <input type="number" className="border p-2 rounded w-full"
                  value={formData.marksPerQuestion}
                  onChange={(e) =>
                    setFormData({ ...formData, marksPerQuestion: Number(e.target.value) })
                  }
                />
              </div>

              <div>
                <label>Negative Marks</label>
                <input type="number" className="border p-2 rounded w-full"
                  value={formData.negativeMarks}
                  onChange={(e) =>
                    setFormData({ ...formData, negativeMarks: Number(e.target.value) })
                  }
                />
              </div>
            </div>

            <label className="flex gap-2 mt-3">
              <input
                type="checkbox"
                checked={formData.negativeMarkingEnabled}
                onChange={(e) =>
                  setFormData({ ...formData, negativeMarkingEnabled: e.target.checked })
                }
              />
              Enable Negative Marking
            </label>
          </div>

          {/* TEST TIMING */}
          <div>
            <h3 className="font-bold mb-4">Test Timing</h3>

            <label>Total Duration (Minutes)</label>
            <input
              type="number"
              className="border p-2 rounded w-full"
              value={formData.timing.totalDurationMinutes}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  timing: {
                    ...formData.timing,
                    totalDurationMinutes: Number(e.target.value),
                  },
                })
              }
            />

            <label className="flex gap-2 mt-3">
              <input
                type="checkbox"
                checked={formData.timing.serverEnforced}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    timing: {
                      ...formData.timing,
                      serverEnforced: e.target.checked,
                    },
                  })
                }
              />
              Enforce Server Timing
            </label>
          </div>

          {/* ATTEMPTS & RANDOMIZATION */}
          <div>
            <h3 className="font-bold mb-4">Attempts & Randomization</h3>

            <label>Attempt Limit</label>
            <input
              type="number"
              className="border p-2 rounded w-full mb-3"
              value={formData.attemptLimit}
              onChange={(e) =>
                setFormData({ ...formData, attemptLimit: Number(e.target.value) })
              }
            />

            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={formData.randomizeQuestions}
                onChange={(e) =>
                  setFormData({ ...formData, randomizeQuestions: e.target.checked })
                }
              />
              Randomize Questions
            </label>

            <label className="flex gap-2 mt-2">
              <input
                type="checkbox"
                checked={formData.randomizeOptions}
                onChange={(e) =>
                  setFormData({ ...formData, randomizeOptions: e.target.checked })
                }
              />
              Randomize Options
            </label>
          </div>

          {/* RESULT SETTINGS */}
          <div>
            <h3 className="font-bold mb-4">Result Settings</h3>

            <label>Ranking Basis</label>
            <select
              className="border p-2 rounded w-full mb-3"
              value={formData.resultSettings.rankingBasis}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  resultSettings: {
                    ...formData.resultSettings,
                    rankingBasis: e.target.value,
                  },
                })
              }
            >
              <option value="testScore">Test Score</option>
              <option value="averageScore">Average Score</option>
            </select>

            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={formData.resultSettings.firstAttemptOnlyRanking}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    resultSettings: {
                      ...formData.resultSettings,
                      firstAttemptOnlyRanking: e.target.checked,
                    },
                  })
                }
              />
              First Attempt Only Ranking
            </label>
          </div>

          {/* TARGET USERS */}

          <div>
            <h3 className="font-bold mb-4">
              Target Users
            </h3>
            <div className="flex gap-4 mb-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  checked={formData.userType === "all"}
                  onChange={() =>
                    setFormData({
                      ...formData,
                      userType: "all",
                      userIds: [],
                      userGroupIds: []
                    })
                  }
                />
                <span className="ml-2">
                  All Users
                </span>
              </label>

              <label className="flex items-center">
                <input
                  type="radio"
                  checked={formData.userType === "specific"}
                  onChange={() =>
                    setFormData({
                      ...formData,
                      userType: "specific",
                      userGroupIds: []
                    })
                  }
                />
                <span className="ml-2">
                  Specific Users
                </span>
              </label>

              <label className="flex items-center">
                <input
                  type="radio"
                  checked={formData.userType === "groups"}
                  onChange={() =>
                    setFormData({
                      ...formData,
                      userType: "groups",
                      userIds: []
                    })
                  }
                />
                <span className="ml-2">
                  User Groups
                </span>
              </label>
            </div>
          </div>

          {formData.userType === "specific" && (
            <div>
              <label className="block font-medium mb-2">
                Select Users
              </label>
              <div className="max-h-40 overflow-y-auto border p-3 rounded bg-slate-50">
                {users.map(u => (
                  <label
                    key={u.id}
                    className="flex gap-2 mb-2 items-center"
                  >
                    <input
                      type="checkbox"
                      checked={
                        formData.userIds?.includes(u.id)
                      }
                      onChange={() =>
                        toggleUser(u.id)
                      }
                    />
                    <span>
                      <span className="font-medium">
                        {u.name || "No Name"}
                      </span>
                      <span className="text-gray-500 text-sm ml-2">
                        ({u.phone || u.email})
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {formData.userType === "groups" && (
            <div>
              <label className="block font-medium mb-2">
                Select Groups
              </label>
              <div className="max-h-40 overflow-y-auto border p-3 rounded bg-slate-50">
                {userGroups.map(group => (
                  <label
                    key={group.id}
                    className="flex gap-2 mb-2"
                  >
                    <input
                      type="checkbox"
                      checked={
                        formData.userGroupIds?.includes(group.id)
                      }
                      onChange={() =>
                        toggleUserGroup(group.id)
                      }
                    />
                    {group.name}
                    ({group.userIds?.length || 0})
                  </label>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={handleSave}
            className="bg-indigo-600 text-white px-6 py-2 rounded"
          >
            Save Test
          </button>
        </div>
      )}

      {activeTab === "sections" && !isNew && (
        <SectionsManager examId={examId} testId={testId} />
      )}

      {activeTab === "questions" && !isNew && (
        <QuestionsManager
          examId={examId}
          testId={testId}
          sections={sections}
        />
      )}
    </div>
  );
}
