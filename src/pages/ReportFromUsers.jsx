import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
    collection,
    onSnapshot,
    doc,
    getDoc
} from "firebase/firestore";

export default function ReportFromUsers() {

    const [attempts, setAttempts] = useState([]);
    const [users, setUsers] = useState([]);
    const [exams, setExams] = useState([]);

    const [selectedExam, setSelectedExam] = useState("");

    const [questionsMap, setQuestionsMap] = useState({}); // 🔥 cache

    /* ---------------- FETCH BASE DATA ---------------- */

    useEffect(() => {
        return onSnapshot(
            collection(db, "testAttempts"),
            snap => {
                setAttempts(
                    snap.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    }))
                );
            }
        );
    }, []);

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

    useEffect(() => {
        return onSnapshot(
            collection(db, "exams"),
            snap => {
                setExams(
                    snap.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    }))
                );
            }
        );
    }, []);

    /* ---------------- FETCH QUESTIONS (SMART CACHE) ---------------- */

    useEffect(() => {

        const fetchQuestions = async () => {

            let newMap = {};

            for (let attempt of attempts) {

                if (!attempt.reported?.length) continue;

                for (let qId of attempt.reported) {

                    const key = `${attempt.examId}_${attempt.testId}_${qId}`;

                    if (questionsMap[key]) continue;

                    try {

                        const ref = doc(
                            db,
                            "exams",
                            attempt.examId,
                            "tests",
                            attempt.testId,
                            "questions",
                            qId
                        );

                        const snap = await getDoc(ref);

                        if (snap.exists()) {
                            newMap[key] = snap.data();
                        }

                    } catch (err) {
                        console.error("Question fetch failed", err);
                    }

                }

            }

            if (Object.keys(newMap).length) {
                setQuestionsMap(prev => ({
                    ...prev,
                    ...newMap
                }));
            }

        };

        if (attempts.length) fetchQuestions();

    }, [attempts]);

    /* ---------------- BUILD REPORT DATA ---------------- */

    const reports = useMemo(() => {

        let data = [];

        attempts.forEach(attempt => {

            if (!attempt.reported?.length) return;

            const user =
                users.find(u => u.id === attempt.userId);

            const exam =
                exams.find(e => e.id === attempt.examId);

            if (selectedExam && attempt.examId !== selectedExam) return;

            attempt.reported.forEach(qId => {

                const key =
                    `${attempt.examId}_${attempt.testId}_${qId}`;

                const qData =
                    questionsMap[key];

                data.push({

                    userName: user?.name || "Unknown",
                    userEmail: user?.email || "",

                    examName: exam?.name || "-",
                    testId: attempt.testId,

                    questionId: qId,
                    questionText: qData?.questionText || "Loading...",
                    subject: qData?.subject || "-",
                    chapter: qData?.chapter || "-",

                    options: qData?.options || [],
                    correctOption: qData?.correctOption,

                    comment:
                        attempt.reportedComments?.[qId] || "-",

                    submittedAt: attempt.submittedAt

                });

            });

        });

        return data;

    }, [attempts, users, exams, questionsMap, selectedExam]);

    /* ---------------- UI ---------------- */

    return (

        <div className="p-8 bg-slate-100 min-h-screen">

            <h2 className="text-2xl font-bold mb-6">
                Report From Users
            </h2>

            {/* FILTER */}

            <div className="mb-6">

                <select
                    value={selectedExam}
                    onChange={(e) =>
                        setSelectedExam(e.target.value)
                    }
                    className="border p-3 rounded"
                >

                    <option value="">
                        All Exams
                    </option>

                    {exams.map(exam => (
                        <option key={exam.id} value={exam.id}>
                            {exam.name}
                        </option>
                    ))}

                </select>

            </div>

            {/* TABLE */}

            <div className="bg-white rounded-xl shadow overflow-x-auto">

                <table className="w-full text-left">

                    <thead className="bg-slate-200">
                        <tr>
                            <th className="p-3">User</th>
                            <th className="p-3">Exam</th>
                            <th className="p-3">Subject</th>
                            <th className="p-3">Chapter</th>
                            <th className="p-3">Question</th>
                            <th className="p-3">Options</th>
                            <th className="p-3">Comment</th>
                            <th className="p-3">Submitted</th>
                        </tr>
                    </thead>

                    <tbody>

                        {reports.length === 0 && (
                            <tr>
                                <td colSpan="6" className="p-4 text-center">
                                    No reports found
                                </td>
                            </tr>
                        )}

                        {reports.map((r, i) => (

                            <tr key={i} className="border-t align-top">

                                {/* USER */}
                                <td className="p-3">
                                    <div className="font-medium">
                                        {r.userName}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {r.userEmail}
                                    </div>
                                </td>

                                {/* EXAM */}
                                <td className="p-3">
                                    {r.examName || ""}
                                </td>

                                {/* SUBJECT */}
                                <td className="p-3">
                                    {r.subject || "-"}
                                </td>

                                {/* CHAPTER */}
                                <td className="p-3">
                                    {r.chapter || "-"}
                                </td>

                                {/* QUESTION */}
                                <td className="p-3 max-w-[300px]">
                                    <div className="font-medium text-sm">
                                        {r.questionText}
                                    </div>
                                    <div className="text-xs text-gray-400">
                                        {r.questionId}
                                    </div>
                                </td>

                                {/* OPTIONS */}
                                <td className="p-3 text-sm">

                                    {r.options.map((opt, idx) => (

                                        <div
                                            key={idx}
                                            className={`px-2 py-1 rounded mb-1 ${idx === r.correctOption
                                                ? "bg-green-100"
                                                : "bg-gray-100"
                                                }`}
                                        >
                                            {opt.text}
                                        </div>

                                    ))}

                                </td>

                                {/* COMMENT */}
                                <td className="p-3">
                                    {r.comment}
                                </td>

                                {/* TIME */}
                                <td className="p-3 text-sm">
                                    {r.submittedAt?.toDate?.().toLocaleString?.() || "-"}
                                </td>

                            </tr>

                        ))}

                    </tbody>

                </table>

            </div>

        </div>

    );

}
