import { useEffect, useState } from "react";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    deleteDoc,
    onSnapshot
} from "firebase/firestore";

import { db } from "../firebase";
import Swal from "sweetalert2";
import { logActivity } from "../utils/logActivity";

export default function FeaturedContentSettings() {
    const [exams, setExams] = useState([]);
    const [rows, setRows] = useState([]);
    const [tests, setTests] = useState([]);
    const [pyqSubjects, setPyqSubjects] = useState([]);
    const [pyqChapters, setPyqChapters] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [selectedExam, setSelectedExam] = useState("");
    const [selectedTests, setSelectedTests] = useState([]);
    const [selectedPyqs, setSelectedPyqs] = useState([]);
    const [testMap, setTestMap] = useState({});
    const [chapterMap, setChapterMap] = useState({});
    const [mapsLoaded, setMapsLoaded] = useState(false);

    /* ---------------- LOAD EXAMS ---------------- */

    useEffect(() => {
        return onSnapshot(
            collection(db, "exams"),
            snap => {
                const examList =
                    snap.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    }));
                setExams(examList);
                loadFeaturedRows(examList);
            }
        );
    }, []);

    /* ---------------- LOAD GLOBAL NAME MAPS ---------------- */

    useEffect(() => {
        const loadAllNames = async () => {
            let tMap = {};
            let cMap = {};
            const examSnap =
                await getDocs(
                    collection(db, "exams")
                );
            for (let examDoc of examSnap.docs) {
                const examId = examDoc.id;
                /* -------- LOAD TESTS -------- */
                const testSnap =
                    await getDocs(
                        collection(
                            db,
                            "exams",
                            examId,
                            "tests"
                        )
                    );
                testSnap.docs.forEach(d => {
                    tMap[d.id] =
                        d.data().name;
                });
                /* -------- LOAD PYQ CHAPTERS -------- */
                const pyqSnap =
                    await getDocs(
                        collection(
                            db,
                            "exams",
                            examId,
                            "pyqs"
                        )
                    );
                for (let subDoc of pyqSnap.docs) {
                    const chapterSnap =
                        await getDocs(
                            collection(
                                db,
                                "exams",
                                examId,
                                "pyqs",
                                subDoc.id,
                                "chapters"
                            )
                        );
                    chapterSnap.docs.forEach(c => {

                        cMap[c.id] =
                            c.data().name;
                    });
                }
            }
            setTestMap(tMap);
            setChapterMap(cMap);
            setMapsLoaded(true);
        };
        loadAllNames();
    }, []);

    /* ---------------- LOAD FEATURED ---------------- */

    const loadFeaturedRows = async (examList) => {
        let temp = [];
        for (let exam of examList) {
            const ref =
                doc(
                    db,
                    "exams",
                    exam.id,
                    "home_config",
                    "featured"
                );
            const snap =
                await getDoc(ref);
            if (snap.exists()) {
                temp.push({
                    examId: exam.id,
                    examName: exam.name,
                    ...snap.data()
                });
            }
        }
        setRows(temp);
    };

    /* ---------------- LOAD TESTS ---------------- */

    useEffect(() => {
        if (!selectedExam) return;
        return onSnapshot(
            collection(
                db,
                "exams",
                selectedExam,
                "tests"
            ),
            snap => {
                let list =
                    snap.docs.map(d => ({
                        id: d.id,
                        ...d.data()
                    }));
                setTests(list);
            }
        );
    }, [selectedExam]);

    /* ---------------- LOAD PYQ SUBJECTS ---------------- */

    useEffect(() => {
        if (!selectedExam) return;
        getDocs(
            collection(
                db,
                "exams",
                selectedExam,
                "pyqs"
            )
        ).then(snap => {
            let subjects =
                snap.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                }));
            setPyqSubjects(subjects);
            loadAllChapters(subjects);
        });
    }, [selectedExam]);

    /* ---------------- LOAD CHAPTERS ---------------- */

    const loadAllChapters = async (subjects) => {
        let chapters = [];
        let map = {};
        for (let sub of subjects) {
            const snap =
                await getDocs(
                    collection(
                        db,
                        "exams",
                        selectedExam,
                        "pyqs",
                        sub.id,
                        "chapters"
                    )
                );
            snap.docs.forEach(c => {
                chapters.push({
                    id: c.id,
                    subjectName: sub.name,
                    ...c.data()
                });
                map[c.id] = c.data().name;
            });
        }
        setPyqChapters(chapters);
        setChapterMap(map);
    };

    /* ---------------- TOGGLE ---------------- */

    const toggleTest = id => {
        setSelectedTests(prev =>
            prev.includes(id)
                ? prev.filter(x => x !== id)
                : [...prev, id]
        );
    };
    const togglePyq = id => {
        setSelectedPyqs(prev =>
            prev.includes(id)
                ? prev.filter(x => x !== id)
                : [...prev, id]
        );
    };

    /* ---------------- ADD ---------------- */

    const openAdd = () => {
        setSelectedExam("");
        setSelectedTests([]);
        setSelectedPyqs([]);
        setShowModal(true);
    };

    /* ---------------- EDIT ---------------- */

    const handleEdit = row => {
        setSelectedExam(row.examId);
        setSelectedTests(
            row.featuredMockTestIds || []
        );
        setSelectedPyqs(
            row.featuredPyqIds || []
        );
        setShowModal(true);
    };

    /* ---------------- DELETE ---------------- */

    const handleDelete = async row => {
        const confirm =
            await Swal.fire({
                title: "Delete Featured Content?",
                icon: "warning",
                showCancelButton: true
            });
        if (!confirm.isConfirmed) return;
        await deleteDoc(
            doc(
                db,
                "exams",
                row.examId,
                "home_config",
                "featured"
            )
        );
        await logActivity({
            actionType: "DELETE_FEATURED",
            description: `Deleted featured config for ${row.examName}`,
            entityId: row.examId,
            entityType: "exam"
        });
        Swal.fire(
            "Deleted",
            "Removed successfully",
            "success"
        )
        loadFeaturedRows(exams);
    };

    /* ---------------- SAVE ---------------- */

    const handleSave = async () => {
        if (!selectedExam) {
            Swal.fire(
                "Select Exam",
                "Please choose exam",
                "warning"
            );
            return;
        }
        await setDoc(
            doc(
                db,
                "exams",
                selectedExam,
                "home_config",
                "featured"
            ),
            {
                featuredMockTestIds: selectedTests,
                featuredPyqIds: selectedPyqs
            }
        );

        await logActivity({
            actionType: "SAVE_FEATURED",
            description:
                `Saved featured config for ${selectedExam}`,
            entityId: selectedExam,
            entityType: "exam"
        });
        Swal.fire(
            "Saved",
            "Featured updated",
            "success"
        );
        setShowModal(false);
        loadFeaturedRows(exams);
    };

    /* ---------------- UI ---------------- */

    return (
        <div className="bg-white p-6 rounded-xl shadow">
            <div className="flex justify-between mb-6">
                <h3 className="text-lg font-semibold">
                    Featured Tests & PYQs
                </h3>

                <button
                    onClick={openAdd}
                    className="bg-indigo-600 text-white px-4 py-2 rounded"
                >
                    Add Featured
                </button>
            </div>

            {/* TABLE */}

            <div className="overflow-x-auto">
                <table className="w-full">
                    <thead className="bg-slate-200">
                        <tr>
                            <th className="p-3 text-left">
                                Exam
                            </th>

                            <th className="p-3 text-left">
                                Featured Tests
                            </th>

                            <th className="p-3 text-left">
                                Featured PYQs
                            </th>

                            <th className="p-3 text-left">
                                Actions
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {!mapsLoaded ? (
                            <tr>
                                <td colSpan="4" className="p-6 text-center text-gray-500">
                                    Loading featured content...
                                </td>
                            </tr>
                        ) : (
                            rows.map(row => (
                                <tr
                                    key={row.examId}
                                    className="border-t"
                                >
                                    <td className="p-3">
                                        {row.examName}
                                    </td>

                                    <td className="p-3">
                                        {(row.featuredMockTestIds || [])
                                            .map(id => testMap[id] || id)
                                            .join(", ")}
                                    </td>

                                    <td className="p-3">
                                        {(row.featuredPyqIds || [])
                                            .map(id => chapterMap[id] || id)
                                            .join(", ")}
                                    </td>

                                    <td className="p-3 space-x-3">

                                        <button
                                            onClick={() => handleEdit(row)}
                                            className="text-indigo-600"
                                        >
                                            Edit
                                        </button>

                                        <button
                                            onClick={() => handleDelete(row)}
                                            className="text-red-600"
                                        >
                                            Delete
                                        </button>

                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* MODAL */}

            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
                    <div className="bg-white p-4 rounded-xl w-[700px] max-h-[90vh] overflow-y-auto">
                        <h3 className="font-bold mb-4">
                            Featured Configuration
                        </h3>

                        <select
                            value={selectedExam}
                            onChange={e =>
                                setSelectedExam(e.target.value)
                            }
                            className="border p-2 rounded w-full mb-4"
                        >
                            <option value="">
                                Select Exam
                            </option>

                            {exams.map(ex => (
                                <option
                                    key={ex.id}
                                    value={ex.id}
                                >
                                    {ex.name}
                                </option>
                            ))}
                        </select>

                        {selectedExam && (
                            <div className="grid grid-cols-2 gap-4">

                                {/* TESTS */}

                                <div>
                                    <h4 className="font-semibold mb-2">
                                        Tests
                                    </h4>

                                    <div className="border p-2 rounded max-h-[300px] overflow-y-auto text-sm">

                                        {tests.map(t => (

                                            <label
                                                key={t.id}
                                                className="block mb-2"
                                            >

                                                <input
                                                    type="checkbox"
                                                    checked={selectedTests.includes(t.id)}
                                                    onChange={() => toggleTest(t.id)}
                                                />

                                                <span className="ml-2">
                                                    {t.name}
                                                </span>

                                            </label>
                                        ))}
                                    </div>
                                </div>

                                {/* PYQ CHAPTERS */}

                                <div>
                                    <h4 className="font-semibold mb-2">
                                        PYQ Chapters
                                    </h4>

                                    <div className="border p-2 rounded max-h-[300px] overflow-y-auto text-sm">

                                        {pyqChapters.map(p => (

                                            <label
                                                key={p.id}
                                                className="block mb-1"
                                            >

                                                <input
                                                    type="checkbox"
                                                    checked={selectedPyqs.includes(p.id)}
                                                    onChange={() => togglePyq(p.id)}
                                                />

                                                <span className="ml-2">

                                                    {p.subjectName}
                                                    {" → "}
                                                    {p.name}

                                                </span>

                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-4 sticky bottom-0 bg-white pt-3">
                            <button
                                onClick={() => setShowModal(false)}
                                className="border px-4 py-2 rounded"
                            >
                                Cancel
                            </button>

                            <button
                                onClick={handleSave}
                                className="bg-indigo-600 text-white px-6 py-2 rounded"
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
