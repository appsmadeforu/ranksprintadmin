import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot
} from "firebase/firestore";

export default function UserResults() {

  const [results, setResults] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [examsMap, setExamsMap] = useState({});
  const [testsMap, setTestsMap] = useState({});

  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const [examFilter, setExamFilter] = useState("");
  const [testFilter, setTestFilter] = useState("");
  const [attemptFilter, setAttemptFilter] = useState("");
  const [rankFilter, setRankFilter] = useState("");
  const [scoreFilter, setScoreFilter] = useState("");
  const [sortType, setSortType] = useState("");

  /* ---------------- FETCH RESULTS ---------------- */

  useEffect(() => {

    const unsub = onSnapshot(
      collection(db, "results"),
      snap => {
        setResults(
          snap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }))
        );
      }
    );

    return () => unsub();

  }, []);

  /* ---------------- USERS ---------------- */

  useEffect(() => {

    const unsub = onSnapshot(
      collection(db, "users"),
      snap => {
        const map = {};
        snap.docs.forEach(d => {
          map[d.id] = d.data();
        });
        setUsersMap(map);
      }
    );

    return () => unsub();

  }, []);

  /* ---------------- EXAMS + TESTS ---------------- */

  useEffect(() => {

    const unsub = onSnapshot(
      collection(db, "exams"),
      (snapshot) => {

        const examMap = {};

        snapshot.docs.forEach(doc => {
          examMap[doc.id] = doc.data().name;
        });

        setExamsMap(examMap);

        /* LOAD TESTS PER EXAM */

        snapshot.docs.forEach(examDoc => {

          const examId = examDoc.id;

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

                testList[t.id] =
                  t.data().name;

              });

              setTestsMap(prev => ({
                ...prev,
                [examId]: testList
              }));

            }
          );

        });

      }
    );

    return () => unsub();

  }, []);

  /* ---------------- FILTER + SORT ---------------- */

  const filtered = useMemo(() => {

    let data = results.filter(r => {

      const u = usersMap[r.userId];

      const name = u?.name?.toLowerCase() || "";
      const email = u?.email?.toLowerCase() || "";

      return (

        (!search ||
          name.includes(search.toLowerCase()) ||
          email.includes(search.toLowerCase())
        )

        && (!examFilter ||
          r.examId === examFilter)

        && (!testFilter ||
          r.testId === testFilter)

        && (!attemptFilter ||
          String(r.attemptNumber) === attemptFilter)

        && (!rankFilter ||
          r.rank <= Number(rankFilter))

        && (!scoreFilter ||
          r.score >= Number(scoreFilter))

      );

    });

    if (sortType === "rank")
      data.sort((a, b) => a.rank - b.rank);

    if (sortType === "score")
      data.sort((a, b) => b.score - a.score);

    return data;

  }, [
    results,
    usersMap,
    search,
    examFilter,
    testFilter,
    attemptFilter,
    rankFilter,
    scoreFilter,
    sortType
  ]);

  /* ---------------- UI ---------------- */

  return (

    <div className="p-10 bg-slate-100 min-h-screen">

      <h2 className="text-3xl font-bold mb-6">
        User Results
      </h2>

      {/* FILTERS */}

      <div className="flex flex-wrap gap-4 mb-6">

        <input
          placeholder="Search user..."
          className="border p-3 rounded-lg w-72"
          onChange={e => setSearch(e.target.value)}
        />

        {/* EXAM */}

        <select
          value={examFilter}
          onChange={(e) => {
            setExamFilter(e.target.value);
            setTestFilter("");
          }}
          className="border p-3 rounded-lg bg-white"
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

        {/* TEST */}

        <select
          value={testFilter}
          onChange={(e) =>
            setTestFilter(e.target.value)
          }
          className="border p-3 rounded-lg bg-white"
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

          ).map(([id, name]) => (

            <option key={id} value={id}>
              {name}
            </option>

          ))}

        </select>

        {/* ATTEMPT */}

        <select
          value={attemptFilter}
          onChange={e => setAttemptFilter(e.target.value)}
          className="border p-3 rounded-lg bg-white"
        >

          <option value="">
            All Attempts
          </option>

          <option value="1">Attempt 1</option>
          <option value="2">Attempt 2</option>
          <option value="3">Attempt 3</option>

        </select>

        {/* RANK */}

        <select
          value={rankFilter}
          onChange={e => setRankFilter(e.target.value)}
          className="border p-3 rounded-lg bg-white"
        >

          <option value="">
            Top Rank
          </option>

          <option value="10">Top 10</option>
          <option value="50">Top 50</option>
          <option value="100">Top 100</option>

        </select>

        {/* SCORE */}

        <select
          value={scoreFilter}
          onChange={e => setScoreFilter(e.target.value)}
          className="border p-3 rounded-lg bg-white"
        >

          <option value="">
            Min Score
          </option>

          <option value="10">10+</option>
          <option value="20">20+</option>
          <option value="40">40+</option>
          <option value="60">60+</option>

        </select>

        {/* SORT */}

        <select
          value={sortType}
          onChange={e => setSortType(e.target.value)}
          className="border p-3 rounded-lg bg-white"
        >

          <option value="">
            Sort
          </option>

          <option value="rank">
            Sort by Rank
          </option>

          <option value="score">
            Sort by Score
          </option>

        </select>

      </div>

      {/* RESULTS */}

      <div className="space-y-4">

        {filtered.map(r => {

          const u = usersMap[r.userId];

          const total =
            r.correct +
            r.incorrect +
            r.unanswered;

          const accuracy =
            total > 0
              ? Math.round(
                (r.correct / total) * 100
              )
              : 0;

          return (

            <div
              key={r.id}
              className="bg-white rounded-xl shadow hover:shadow-lg"
            >

              {/* MAIN */}

              <div
                onClick={() => setExpandedId(
                  expandedId === r.id ? null : r.id
                )}
                className="p-6 cursor-pointer flex justify-between items-center"
              >

                <div>

                  <p className="font-bold text-lg">
                    {u?.name || "Unknown"}
                  </p>

                  <p className="text-sm text-slate-500">
                    {u?.email}
                  </p>

                  <p className="text-sm text-slate-600 mt-1">
                    {examsMap[r.examId]}
                  </p>

                  <p className="text-xs text-slate-400">
                    {testsMap[r.examId]?.[r.testId]}
                    {" | "}
                    Attempt {r.attemptNumber}
                  </p>

                </div>

                <div className="text-right">

                  <p className="text-2xl font-bold text-indigo-600">
                    {r.score}
                  </p>

                  <p className="text-xs text-slate-500">
                    Score
                  </p>

                </div>

              </div>

              {/* EXPANDED */}

              {expandedId === r.id && (

                <div className="border-t p-6 bg-slate-50">

                  <div className="grid grid-cols-5 gap-6 mb-6">

                    <StatCard label="Correct" value={r.correct} color="green" />

                    <StatCard label="Incorrect" value={r.incorrect} color="red" />

                    <StatCard label="Unanswered" value={r.unanswered} color="yellow" />

                    <StatCard label="Percentile" value={`${r.percentile}%`} color="blue" />

                    <StatCard label="Accuracy" value={`${accuracy}%`} color="purple" />

                  </div>

                  <div className="bg-white p-4 rounded-lg border flex justify-between items-center">

                    <span className="text-slate-600 font-medium">
                      Rank
                    </span>

                    <span className="text-2xl font-bold text-purple-600">
                      #{r.rank}
                    </span>

                  </div>

                  {r.sectionWise?.length > 0 && (

                    <div className="mt-6">

                      <h4 className="font-semibold mb-3">
                        Section Wise Performance
                      </h4>

                      <div className="space-y-3">

                        {r.sectionWise.map((s, i) => (

                          <div key={i} className="bg-white p-4 rounded-lg border">

                            <p className="font-medium">
                              {s.sectionName}
                            </p>

                            <div className="flex gap-6 text-sm mt-2 text-slate-600">

                              <span>Score: {s.score}</span>
                              <span>Correct: {s.correct}</span>
                              <span>Incorrect: {s.incorrect}</span>
                              <span>Unanswered: {s.unanswered}</span>

                            </div>

                          </div>

                        ))}

                      </div>

                    </div>

                  )}

                  <div className="mt-4 text-xs text-slate-500">

                    Created At:{" "}

                    {r.createdAt
                      ? new Date(
                        r.createdAt.toDate()
                      ).toLocaleString()
                      : "-"}

                  </div>

                </div>

              )}

            </div>

          );

        })}

      </div>

    </div>

  );

}

/* ---------------- STAT CARD ---------------- */

function StatCard({ label, value, color }) {

  const colors = {
    green: "bg-green-100 text-green-700",
    red: "bg-red-100 text-red-700",
    yellow: "bg-yellow-100 text-yellow-700",
    blue: "bg-blue-100 text-blue-700",
    purple: "bg-purple-100 text-purple-700"
  };

  return (

    <div className="bg-white p-4 rounded-lg border shadow-sm text-center">

      <p className="text-xs text-slate-500 uppercase mb-1">
        {label}
      </p>

      <p className={`text-xl font-bold px-3 py-1 rounded-full inline-block ${colors[color]}`}>
        {value}
      </p>

    </div>

  );

}
