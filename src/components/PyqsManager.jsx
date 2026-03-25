import { useEffect, useState, useMemo } from "react";
import { db, storage } from "../firebase";
import {
    collection,
    addDoc,
    deleteDoc,
    doc,
    updateDoc,
    getDocs,
    serverTimestamp,
    setDoc,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import Swal from "sweetalert2";

export default function PyqsManager({ examId }) {

    const [subjects, setSubjects] = useState([]);
    const [allChapters, setAllChapters] = useState([]);
    const [showModal, setShowModal] = useState(false);
    const [editingData, setEditingData] = useState(null);

    const emptyForm = {
        subjectId: "",
        chapterName: "",
        questionCount: 0,
        isLocked: false,
        status: "draft",
    };

    const [formData, setFormData] = useState(emptyForm);
    const [pdfFile, setPdfFile] = useState(null);

    const [filterSubject, setFilterSubject] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    const ITEMS_PER_PAGE = 20;
    const [currentPage, setCurrentPage] = useState(1);

    /* ---------------- FETCH SUBJECTS ---------------- */

    useEffect(() => {
        const fetchSubjects = async () => {
            const snap = await getDocs(collection(db, "subjects"));
            setSubjects(
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                }))
            );
        };
        fetchSubjects();
    }, []);

    /* ---------------- FETCH PYQS ---------------- */

    useEffect(() => {
        if (!examId) return;

        const fetchData = async () => {

            const pyqSubjectsSnap = await getDocs(
                collection(db, "exams", examId, "pyqs")
            );

            let temp = [];

            for (let subjectDoc of pyqSubjectsSnap.docs) {

                const subjectId = subjectDoc.id;
                const subjectName = subjectDoc.data().name;

                const chaptersSnap = await getDocs(
                    collection(
                        db,
                        "exams",
                        examId,
                        "pyqs",
                        subjectId,
                        "chapters"
                    )
                );

                chaptersSnap.docs.forEach(ch => {
                    temp.push({
                        id: ch.id,
                        subjectId,
                        subjectName,
                        ...ch.data(),
                    });
                });
            }

            setAllChapters(temp);
        };

        fetchData();

    }, [examId]);

    /* ---------------- FILTER + SEARCH ---------------- */

    const filteredData = useMemo(() => {
        return allChapters.filter(item => {

            const matchesSubject = filterSubject
                ? item.subjectId === filterSubject
                : true;

            const matchesSearch =
                item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.subjectName?.toLowerCase().includes(searchTerm.toLowerCase());

            return matchesSubject && matchesSearch;

        });
    }, [allChapters, filterSubject, searchTerm]);

    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

    const paginatedData = filteredData.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    /* ---------------- SAVE (FAST VERSION) ---------------- */

    const handleSave = async () => {

        try {

            if (!formData.subjectId)
                return Swal.fire("Error", "Please select Subject", "error");

            if (!formData.chapterName)
                return Swal.fire("Error", "Please select Chapter", "error");

            await setDoc(
                doc(db, "exams", examId, "pyqs", formData.subjectId),
                {
                    name: subjects.find(s => s.id === formData.subjectId)?.name || "",
                },
                { merge: true }
            );

            const basePayload = {
                name: formData.chapterName,
                pdfUrl: "",
                questionCount: Number(formData.questionCount),
                isLocked: formData.isLocked,
                status: formData.status,
                createdAt: serverTimestamp(),
            };

            let savedDocId;
            let subjectName =
                subjects.find(s => s.id === formData.subjectId)?.name || "";

            if (editingData) {

                const docRef = doc(
                    db,
                    "exams",
                    examId,
                    "pyqs",
                    formData.subjectId,
                    "chapters",
                    editingData.id
                );

                await updateDoc(docRef, basePayload);
                savedDocId = editingData.id;

                setAllChapters(prev =>
                    prev.map(item =>
                        item.id === savedDocId
                            ? { ...item, ...basePayload }
                            : item
                    )
                );

            } else {

                const newDoc = await addDoc(
                    collection(
                        db,
                        "exams",
                        examId,
                        "pyqs",
                        formData.subjectId,
                        "chapters"
                    ),
                    basePayload
                );

                savedDocId = newDoc.id;

                setAllChapters(prev => [
                    {
                        id: savedDocId,
                        subjectId: formData.subjectId,
                        subjectName,
                        ...basePayload,
                    },
                    ...prev,
                ]);
            }

            Swal.fire("Success", "Saved successfully", "success");

            setShowModal(false);
            setEditingData(null);
            setFormData(emptyForm);

            /* ---- Upload PDF in background ---- */

            if (pdfFile) {

                const pdfRef = ref(
                    storage,
                    `pyqs/${examId}/${formData.subjectId}/${Date.now()}-${pdfFile.name}`
                );

                uploadBytes(pdfRef, pdfFile).then(async () => {

                    const pdfUrl = await getDownloadURL(pdfRef);

                    const updateRef = doc(
                        db,
                        "exams",
                        examId,
                        "pyqs",
                        formData.subjectId,
                        "chapters",
                        savedDocId
                    );

                    await updateDoc(updateRef, { pdfUrl });

                    // Update UI after upload completes
                    setAllChapters(prev =>
                        prev.map(item =>
                            item.id === savedDocId
                                ? { ...item, pdfUrl }
                                : item
                        )
                    );
                });
            }

        } catch (err) {
            Swal.fire("Error", err.message, "error");
        }
    };

    /* ---------------- DELETE ---------------- */

    const handleDelete = async (item) => {

        const confirm = await Swal.fire({
            title: "Delete Chapter?",
            icon: "warning",
            showCancelButton: true,
        });

        if (!confirm.isConfirmed) return;

        await deleteDoc(
            doc(
                db,
                "exams",
                examId,
                "pyqs",
                item.subjectId,
                "chapters",
                item.id
            )
        );

        setAllChapters(prev =>
            prev.filter(ch => ch.id !== item.id)
        );

        Swal.fire("Deleted", "Chapter removed", "success");
    };

    /* ---------------- EDIT ---------------- */

    const handleEdit = (item) => {
        setEditingData(item);
        setFormData({
            subjectId: item.subjectId,
            chapterName: item.name,
            questionCount: item.questionCount,
            isLocked: item.isLocked,
            status: item.status,
        });
        setShowModal(true);
    };
    /* ---------------- UI (UNCHANGED) ---------------- */

    return (
        <div className="p-8 bg-slate-100 min-h-screen">

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">PYQs Management</h2>

                <button
                    onClick={() => setShowModal(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded"
                >
                    + Add PYQ
                </button>
            </div>

            {/* FILTERS */}
            <div className="bg-white p-4 rounded-xl shadow mb-6 flex gap-4">

                <div>
                    <label className="block text-sm font-medium">Filter by Subject</label>
                    <select
                        className="border p-2 rounded"
                        value={filterSubject}
                        onChange={(e) => setFilterSubject(e.target.value)}
                    >
                        <option value="">All Subjects</option>
                        {subjects.map(sub => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                    </select>
                </div>

                <div className="flex-1">
                    <label className="block text-sm font-medium">Search</label>
                    <input
                        className="border p-2 rounded w-full"
                        placeholder="Search subject or chapter..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

            </div>

            {/* TABLE */}
            <div className="bg-white rounded-xl shadow p-6">

                <table className="w-full text-left">
                    <thead className="bg-slate-200">
                        <tr>
                            <th className="p-3">Subject</th>
                            <th className="p-3">Chapter</th>
                            <th className="p-3">Question Count</th>
                            <th className="p-3">PDF</th>
                            <th className="p-3">Locked</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map(item => (
                            <tr key={item.id} className="border-t">
                                <td className="p-3">{item.subjectName}</td>
                                <td className="p-3">{item.name}</td>
                                <td className="p-3">{item.questionCount}</td>
                                <td className="p-3">
                                    <a href={item.pdfUrl} target="_blank" rel="noreferrer">
                                        View
                                    </a>
                                </td>
                                <td className="p-3">{item.isLocked ? "Yes" : "No"}</td>
                                <td className="p-3">{item.status}</td>
                                <td className="p-3 space-x-3">
                                    <button onClick={() => handleEdit(item)} className="text-indigo-600">Edit</button>
                                    <button onClick={() => handleDelete(item)} className="text-red-600">Delete</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

            </div>

            {/* MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
                    <div className="bg-white w-full max-w-xl p-6 rounded-xl space-y-4">

                        <h3 className="text-lg font-bold">
                            {editingData ? "Edit PYQ" : "Add PYQ"}
                        </h3>

                        {/* SUBJECT */}
                        <div>
                            <label className="block text-sm font-medium">Subject</label>
                            <select
                                className="border p-2 rounded w-full"
                                value={formData.subjectId}
                                onChange={(e) =>
                                    setFormData({ ...formData, subjectId: e.target.value, chapterName: "" })
                                }
                            >
                                <option value="">Select Subject</option>
                                {subjects.map(sub => (
                                    <option key={sub.id} value={sub.id}>{sub.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* CHAPTER DROPDOWN */}
                        {formData.subjectId && (
                            <div>
                                <label className="block text-sm font-medium">Chapter</label>
                                <select
                                    className="border p-2 rounded w-full"
                                    value={formData.chapterName}
                                    onChange={(e) =>
                                        setFormData({ ...formData, chapterName: e.target.value })
                                    }
                                >
                                    <option value="">Select Chapter</option>
                                    {subjects
                                        .find(s => s.id === formData.subjectId)
                                        ?.chapters?.map((ch, i) => (
                                            <option key={i} value={ch}>{ch}</option>
                                        ))}
                                </select>
                            </div>
                        )}

                        {/* QUESTION COUNT */}
                        <div>
                            <label className="block text-sm font-medium">Question Count</label>
                            <input
                                type="number"
                                className="border p-2 rounded w-full"
                                value={formData.questionCount}
                                onChange={(e) =>
                                    setFormData({ ...formData, questionCount: e.target.value })
                                }
                            />
                        </div>

                        {/* PDF */}
                        <div>
                            <label className="block text-sm font-medium">Upload PDF</label>
                            <input
                                type="file"
                                accept="application/pdf"
                                onChange={(e) => setPdfFile(e.target.files[0])}
                            />
                        </div>

                        {/* LOCK */}
                        <div>
                            <label className="block text-sm font-medium">Lock Chapter</label>
                            <input
                                type="checkbox"
                                checked={formData.isLocked}
                                onChange={(e) =>
                                    setFormData({ ...formData, isLocked: e.target.checked })
                                }
                            />
                        </div>

                        {/* STATUS */}
                        <div>
                            <label className="block text-sm font-medium">Status</label>
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

                        <div className="flex justify-end gap-3">
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