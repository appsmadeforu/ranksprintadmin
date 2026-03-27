import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  doc,
  getDoc
} from "firebase/firestore";

export default function TestAttempts() {

  const [attempts, setAttempts] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [examsMap, setExamsMap] = useState({});
  const [testsMap, setTestsMap] = useState({});
  const [questionsMap, setQuestionsMap] = useState({});

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [examFilter, setExamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [attemptFilter, setAttemptFilter] = useState("");
  const [testFilter, setTestFilter] = useState("");

  /* ---------------- FETCH ATTEMPTS ---------------- */

  useEffect(() => {

    const unsub = onSnapshot(
      collection(db, "testAttempts"),
      (snapshot) => {

        const list = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));

        setAttempts(list);

        list.forEach(loadTestData);

      }
    );

    return () => unsub();

  }, []);

  /* ---------------- LOAD TEST + QUESTIONS ---------------- */

  const loadTestData = async (attempt) => {

    try {

      /* LOAD TEST NAME */

      if (!testsMap[attempt.testId]?.name) {

        const testRef = doc(
          db,
          "exams",
          attempt.examId,
          "tests",
          attempt.testId
        );

        const testSnap = await getDoc(testRef);

        if (testSnap.exists()) {

          setTestsMap(prev => ({
            ...prev,
            [attempt.testId]: {
              name: testSnap.data().name,
              marksPerQuestion:
                testSnap.data().marksPerQuestion || 1,
              negativeMarks:
                testSnap.data().negativeMarks || 0,
              negativeMarkingEnabled:
                testSnap.data().negativeMarkingEnabled || false
            }
          }));

        }

      }

      /* LOAD QUESTIONS */

      const answers = attempt.answers || {};

      Object.keys(answers).forEach(async (qid) => {

        if (!questionsMap[qid]) {

          const qRef = doc(
            db,
            "exams",
            attempt.examId,
            "tests",
            attempt.testId,
            "questions",
            qid
          );

          const qSnap = await getDoc(qRef);

          if (qSnap.exists()) {

            const correctNumber =
              qSnap.data().correctOption;

            const optionLetters = {
              0: "A",
              1: "B",
              2: "C",
              3: "D"
            };

            const correctLetter =
              optionLetters[correctNumber] || "-";

            setQuestionsMap(prev => ({
              ...prev,
              [qid]: {
                text: qSnap.data().questionText,
                correct: correctLetter
              }
            }));

          }

        }

      });

    } catch (err) {
      console.log("Load error:", err);
    }

  };

  /* ---------------- USERS ---------------- */

  useEffect(() => {

    const unsub = onSnapshot(
      collection(db, "users"),
      (snapshot) => {

        const map = {};

        snapshot.docs.forEach(doc => {
          map[doc.id] = doc.data();
        });

        setUsersMap(map);

      }
    );

    return () => unsub();

  }, []);

  /* ---------------- EXAMS ---------------- */

  useEffect(() => {

    const unsub = onSnapshot(
      collection(db, "exams"),
      (snapshot) => {

        const examMap = {};

        snapshot.docs.forEach(doc => {

          const examId = doc.id;

          examMap[examId] =
            doc.data().name;

          /* LOAD TESTS */

          onSnapshot(
            collection(
              db,
              "exams",
              examId,
              "tests"
            ),
            (testSnap) => {

              const testList = {};

              testSnap.docs.forEach(t => {

                testList[t.id] = {
                  name: t.data().name
                };

              });

              setTestsMap(prev => ({
                ...prev,
                [examId]: testList
              }));

            }
          );

        });

        setExamsMap(examMap);

      }
    );

    return () => unsub();

  }, []);

  /* ---------------- FILTERS ---------------- */

  const filtered = useMemo(() => {

    return attempts.filter(a => {

      const user = usersMap[a.userId];

      const name =
        user?.name?.toLowerCase() || "";

      const email =
        user?.email?.toLowerCase() || "";

      const matchesSearch =
        name.includes(search.toLowerCase()) ||
        email.includes(search.toLowerCase());

      const matchesExam =
        !examFilter ||
        a.examId === examFilter;

      const matchesTest =
        !testFilter ||
        a.testId === testFilter;

      const matchesStatus =
        !statusFilter ||
        a.status === statusFilter;

      const matchesAttempt =
        !attemptFilter ||
        String(a.attemptNumber) === attemptFilter;

      return (
        matchesSearch &&
        matchesExam &&
        matchesTest &&
        matchesStatus &&
        matchesAttempt
      );

    });

  }, [
    attempts,
    usersMap,
    search,
    examFilter,
    testFilter,
    statusFilter,
    attemptFilter
  ]);

  /* ---------------- UI ---------------- */

  return (

    <div className="p-10 bg-slate-100 min-h-screen">

      <h2 className="text-3xl font-bold mb-6">
        User Test Attempts
      </h2>

      {/* FILTERS */}

      <div className="flex flex-wrap gap-4 mb-6">

        <input
          type="text"
          placeholder="Search user..."
          className="border p-3 rounded-lg w-64"
          onChange={(e) =>
            setSearch(e.target.value)
          }
        />

        <select
          value={examFilter}
          onChange={(e) => {
            setExamFilter(e.target.value);
            setTestFilter("");
          }}
          className="border p-3 rounded-lg bg-white w-48"
        >
          <option value="">
            All Exams
          </option>

          {Object.entries(examsMap)
            .map(([id, name]) => (

              <option key={id} value={id}>
                {name}
              </option>

            ))}

        </select>

        {/* TEST FILTER */}

        <select
          value={testFilter}
          onChange={(e) =>
            setTestFilter(e.target.value)
          }
          className="border p-3 rounded-lg bg-white w-48"
        >

          <option value="">
            All Tests
          </option>

          {Object.entries(

            examFilter
              ? testsMap[examFilter] || {}

              : Object.values(testsMap)
                .reduce(
                  (acc, tests) => ({
                    ...acc,
                    ...tests
                  }),
                  {}
                )

          ).map(([id, test]) => (

            <option key={id} value={id}>
              {test.name}
            </option>

          ))}

        </select>

        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(e.target.value)
          }
          className="border p-3 rounded-lg bg-white w-48"
        >
          <option value="">
            All Status
          </option>

          <option value="completed">
            Completed
          </option>

          <option value="in_progress">
            In Progress
          </option>

        </select>

        <select
          value={attemptFilter}
          onChange={(e) =>
            setAttemptFilter(e.target.value)
          }
          className="border p-3 rounded-lg bg-white w-40"
        >
          <option value="">
            All Attempts
          </option>

          <option value="1">Attempt 1</option>
          <option value="2">Attempt 2</option>
          <option value="3">Attempt 3</option>

        </select>

      </div>

      {/* TABLE */}

      <div className="bg-white rounded-xl shadow overflow-hidden">

        <table className="w-full text-left">

          <thead className="bg-slate-100 text-sm uppercase">

            <tr>

              <th className="p-4 w-10"></th>

              <th className="p-4">User</th>

              <th className="p-4">Exam</th>

              <th className="p-4">Test</th>

              <th className="p-4">Attempt #</th>

              <th className="p-4">Status</th>

              <th className="p-4">Submitted</th>

            </tr>

          </thead>

          <tbody>

            {filtered.map(attempt => {

              const user =
                usersMap[attempt.userId];

              return (

                <>

                  {/* MAIN ROW */}

                  <tr
                    key={attempt.id}
                    className="border-t"
                  >

                    <td className="p-4">

                      <button
                        onClick={() =>
                          setExpandedId(
                            expandedId === attempt.id
                              ? null
                              : attempt.id
                          )
                        }
                        className="text-indigo-600"
                      >

                        {expandedId === attempt.id
                          ? "−"
                          : "+"}

                      </button>

                    </td>

                    <td className="p-4">

                      <div>

                        <p className="font-semibold">
                          {user?.name || "Unknown"}
                        </p>

                        <p className="text-xs text-slate-500">
                          {user?.email}
                        </p>

                      </div>

                    </td>

                    <td className="p-4">
                      {examsMap[attempt.examId]}
                    </td>

                    <td className="p-4">
                      {
                        testsMap[attempt.examId]?.[attempt.testId]?.name
                        || "Loading..."
                      }
                    </td>

                    <td className="p-4">
                      {attempt.attemptNumber}
                    </td>

                    <td className="p-4">
                      <StatusBadge status={attempt.status} />
                    </td>

                    <td className="p-4 text-sm">

                      {attempt.submittedAt
                        ? new Date(
                          attempt.submittedAt.toDate()
                        ).toLocaleString()
                        : "-"}

                    </td>

                  </tr>

                  {/* EXPANDED ROW */}

                  {expandedId === attempt.id && (

                    <ExpandedSection
                      attempt={attempt}
                      questionsMap={questionsMap}
                      testsMap={testsMap}
                    />

                  )}

                </>

              );

            })}

          </tbody>

        </table>

      </div>

    </div>

  );

}

/* ---------------- EXPANDED SECTION ---------------- */

function ExpandedSection({
  attempt,
  questionsMap,
  testsMap
}) {

  let correctCount = 0;
  let wrongCount = 0;
  let skippedCount = 0;

  /* ---------------- GET TEST MARKING DATA ---------------- */

  const testData =
    testsMap[attempt.testId] || {};

  const marksPerQuestion =
    testData.marksPerQuestion || 1;

  const negativeMarks =
    testData.negativeMarks || 0;

  const negativeEnabled =
    testData.negativeMarkingEnabled || false;

  let totalMarks = 0;

  /* ---------------- CALCULATE RESULT ---------------- */

  Object.entries(
    attempt.answers || {}
  ).forEach(([qid, ans]) => {

    const question =
      questionsMap[qid];

    const correct =
      question?.correct;

    const isSkipped =
      !ans || ans === "";

    const isCorrect =
      ans === correct && !isSkipped;

    const isWrong =
      !isCorrect && !isSkipped;

    if (isCorrect) {

      correctCount++;

      totalMarks +=
        marksPerQuestion;

    }

    else if (isWrong) {

      wrongCount++;

      if (negativeEnabled) {

        totalMarks -=
          negativeMarks;

      }

    }

    else {

      skippedCount++;

    }

  });

  const totalQuestions =
    Object.keys(
      attempt.answers || {}
    ).length;

  const maxMarks =
    totalQuestions *
    marksPerQuestion;

  const scorePercent =
    maxMarks > 0
      ? Math.round(
        (totalMarks / maxMarks) * 100
      )
      : 0;

  /* ---------------- UI ---------------- */

  return (

    <tr>

      <td
        colSpan="7"
        className="bg-slate-50 p-6"
      >

        <div className="bg-white p-6 rounded-xl">

          <h3 className="font-semibold mb-4">
            Attempt Details
          </h3>

          {/* SUMMARY */}

          <div className="grid grid-cols-7 gap-4 mb-6 text-sm">

            <Info
              label="Total Questions"
              value={totalQuestions}
            />

            <Info
              label="Correct"
              value={correctCount}
            />

            <Info
              label="Wrong"
              value={wrongCount}
            />

            <Info
              label="Skipped"
              value={skippedCount}
            />

            <Info
              label="Marks / Max"
              value={`${totalMarks} / ${maxMarks}`}
            />

            <Info
              label="Marks Per Q"
              value={marksPerQuestion}
            />

            <Info
              label="Negative"
              value={
                negativeEnabled
                  ? negativeMarks
                  : "Disabled"
              }
            />

          </div>

          {/* ANSWERS TABLE */}

          <table className="w-full text-sm border">

            <thead className="bg-slate-100">

              <tr>

                <th className="p-2 border w-12">
                  S.No
                </th>

                <th className="p-2 border">
                  Question
                </th>

                <th className="p-2 border">
                  Selected
                </th>

                <th className="p-2 border">
                  Correct
                </th>

                <th className="p-2 border">
                  Result
                </th>

              </tr>

            </thead>

            <tbody>

              {Object.entries(
                attempt.answers || {}
              ).map(([qid, ans], index) => {

                const question =
                  questionsMap[qid];

                const correct =
                  question?.correct;

                const isSkipped =
                  !ans || ans === "";

                const isCorrect =
                  ans === correct &&
                  !isSkipped;

                const isWrong =
                  !isCorrect &&
                  !isSkipped;

                return (

                  <tr key={qid}>

                    {/* S.No */}

                    <td className="p-2 border text-center font-medium">
                      {index + 1}
                    </td>

                    {/* Question */}

                    <td className="p-2 border">
                      {question?.text || qid}
                    </td>

                    {/* Selected */}

                    <td className="p-2 border">
                      {ans || "-"}
                    </td>

                    {/* Correct */}

                    <td className="p-2 border">
                      {correct}
                    </td>

                    {/* Result */}

                    <td className="p-2 border">

                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${isCorrect
                          ? "bg-green-100 text-green-700"
                          : isWrong
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                          }`}
                      >

                        {isCorrect
                          ? "Correct"
                          : isWrong
                            ? "Wrong"
                            : "Skipped"}

                      </span>

                    </td>

                  </tr>

                );

              })}

            </tbody>

          </table>

        </div>

      </td>

    </tr>

  );

}

/* STATUS BADGE */

function StatusBadge({ status }) {

  return (

    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${status === "completed"
        ? "bg-green-100 text-green-700"
        : "bg-yellow-100 text-yellow-700"
        }`}
    >

      {status}

    </span>

  );

}

function Info({ label, value }) {

  return (

    <div className="bg-slate-50 p-4 rounded-lg border">

      <p className="text-xs uppercase text-slate-500 mb-1">
        {label}
      </p>

      <p className="text-sm font-semibold">
        {value}
      </p>

    </div>

  );

}
