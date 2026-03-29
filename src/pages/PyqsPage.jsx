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
    const [exams, setExams] = useState([]);
    const [users, setUsers] = useState([]);
    const [userGroups, setUserGroups] = useState([]);
    const [filterLock, setFilterLock] = useState("");
    const [filterStatus, setFilterStatus] = useState("");

    const emptyForm = {
        examId: "",
        subjectId: "",
        chapterName: "",
        questionCount: 0,
        isLocked: false,
        status: "draft",
        userType: "all",
        userIds: [],
        userGroupIds: []
    };

    const [formData, setFormData] = useState(emptyForm);
    const [pdfFile, setPdfFile] = useState(null);

    const [filterSubject, setFilterSubject] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [filterExam, setFilterExam] = useState("");

    const ITEMS_PER_PAGE = 20;
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedItems, setSelectedItems] = useState([]);

    /* ---------------- FETCH SUBJECTS ---------------- */

    useEffect(() => {
        const fetchSubjects = async () => {
            const snap = await getDocs(collection(db, "subjects"));
            setSubjects(
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    chapters: doc.data().chapters || []   // <-- ADD THIS
                }))
            );
        };
        fetchSubjects();
    }, []);

    /* ---------------- FETCH EXAMS ---------------- */

    useEffect(() => {
        const fetchExams = async () => {
            const snap = await getDocs(collection(db, "exams"));

            setExams(
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
            );
        };

        fetchExams();
    }, []);

    /* ---------------- FETCH USERS ---------------- */

    useEffect(() => {
        const fetchUsers = async () => {
            const snap = await getDocs(
                collection(db, "users")
            );
            setUsers(
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
            );
        };
        fetchUsers();
    }, []);

    /* ---------------- FETCH USER GROUPS ---------------- */

    useEffect(() => {
        const fetchGroups = async () => {
            const snap = await getDocs(
                collection(db, "userGroups")
            );
            setUserGroups(
                snap.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }))
            );
        };
        fetchGroups();
    }, []);

    /* ---------------- FETCH PYQS ---------------- */

    useEffect(() => {

        const fetchData = async () => {

            const examsSnap = await getDocs(collection(db, "exams"));

            let temp = [];

            for (let examDoc of examsSnap.docs) {

                const examId = examDoc.id;
                const examName = examDoc.data().name;

                const pyqSubjectsSnap = await getDocs(
                    collection(db, "exams", examId, "pyqs")
                );

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
                            examId,
                            examName,
                            subjectId,
                            subjectName,
                            ...ch.data(),
                        });

                    });
                }
            }
            setAllChapters(temp);
        };
        fetchData();
    }, []);

    /* ---------------- FILTER + SEARCH ---------------- */

    const filteredData = useMemo(() => {
        return allChapters.filter(item => {

            const matchesExam =
                filterExam ? item.examId === filterExam : true;

            const matchesSubject =
                filterSubject ? item.subjectId === filterSubject : true;

            const matchesSearch =
                item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.subjectName?.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesLock =
                filterLock === "locked" ? item.isLocked === true
                    : filterLock === "unlocked" ? item.isLocked === false
                        : true;

            const matchesStatus =
                filterStatus ? item.status === filterStatus : true;

            return (
                matchesExam &&
                matchesSubject &&
                matchesSearch &&
                matchesLock &&
                matchesStatus
            );

        });
    }, [
        allChapters,
        filterExam,
        filterSubject,
        searchTerm,
        filterLock,
        filterStatus
    ]);

    const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);

    const paginatedData = filteredData.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    );

    /* ---------------- TOGGLE USERS ---------------- */

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

    /* ---------------- SAVE (FAST VERSION) ---------------- */

    const handleSave = async () => {

        try {

            if (!formData.examId)
                return Swal.fire("Error", "Please select Exam", "error");

            if (!formData.subjectId)
                return Swal.fire("Error", "Please select Subject", "error");

            if (!formData.chapterName)
                return Swal.fire("Error", "Please select Chapter", "error");

            await setDoc(
                doc(db, "exams", formData.examId, "pyqs", formData.subjectId),
                {
                    name: subjects.find(s => s.id === formData.subjectId)?.name || "",
                },
                { merge: true }
            );

            /* -------- DETERMINE TARGET USERS -------- */

            let finalUsers = [];
            if (formData.userType === "all") {
                finalUsers =
                    users.map(u => u.id);
            }
            if (formData.userType === "specific") {
                finalUsers =
                    formData.userIds;
            }
            if (formData.userType === "groups") {
                formData.userGroupIds.forEach(groupId => {
                    const group =
                        userGroups.find(
                            g => g.id === groupId
                        );
                    if (group?.userIds) {
                        finalUsers.push(
                            ...group.userIds
                        );
                    }
                });
            }
            finalUsers =
                [...new Set(finalUsers)];
            /* -------- BASE PAYLOAD -------- */
            const basePayload = {
                name: formData.chapterName,
                pdfUrl:
                    editingData?.pdfUrl || "",
                questionCount: Number(formData.questionCount),
                isLocked: formData.isLocked,
                status: formData.status,
                userType: formData.userType,
                userIds: finalUsers,
                userGroupIds: formData.userGroupIds
            };

            let savedDocId;
            let subjectName =
                subjects.find(s => s.id === formData.subjectId)?.name || "";

            if (editingData) {

                const docRef = doc(
                    db,
                    "exams",
                    formData.examId,
                    "pyqs",
                    formData.subjectId,
                    "chapters",
                    editingData.id
                );

                await updateDoc(docRef, {
                    ...basePayload,
                    updatedAt: serverTimestamp()
                });
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
                        formData.examId,
                        "pyqs",
                        formData.subjectId,
                        "chapters"
                    ),
                    {
                        ...basePayload,
                        createdAt: serverTimestamp()
                    }
                );

                savedDocId = newDoc.id;

                setAllChapters(prev => [
                    {
                        id: savedDocId,
                        examId: formData.examId,
                        examName: exams.find(e => e.id === formData.examId)?.name || "",
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
            setPdfFile(null);

            /* ---- Upload PDF in background ---- */

            if (pdfFile instanceof File) {
                const pdfRef = ref(
                    storage,
                    `pyqs/${formData.examId}/${formData.subjectId}/${Date.now()}-${pdfFile.name}`
                );
                uploadBytes(pdfRef, pdfFile).then(async () => {
                    const pdfUrl = await getDownloadURL(pdfRef);
                    const updateRef = doc(
                        db,
                        "exams",
                        formData.examId,
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

    /* ---------------- SELECT ROW ---------------- */

    const toggleSelect = (item) => {
        const exists =
            selectedItems.some(
                i => i.id === item.id
            );
        if (exists) {
            setSelectedItems(prev =>
                prev.filter(i => i.id !== item.id)
            );
        } else {
            setSelectedItems(prev => [
                ...prev,
                item
            ]);
        }
    };

    /* ---------------- SELECT ALL ---------------- */

    const toggleSelectAll = () => {
        if (
            selectedItems.length ===
            paginatedData.length
        ) {
            setSelectedItems([]);
        } else {
            setSelectedItems(
                paginatedData
            );
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
                item.examId,
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

    /* ---------------- BULK DELETE ---------------- */

    const handleBulkDelete = async () => {
        try {
            if (!filterExam && !filterSubject) {
                return Swal.fire(
                    "Warning",
                    "Please select Exam or Subject filter first",
                    "warning"
                );
            }
            const confirm = await Swal.fire({
                title: "Bulk Delete?",
                text: "This will delete filtered chapters permanently!",
                icon: "warning",
                showCancelButton: true,
                confirmButtonColor: "#d33",
                confirmButtonText: "Delete"
            });
            if (!confirm.isConfirmed) return;
            let deleteCount = 0;
            const itemsToDelete =
                filteredData; // uses active filters
            for (let item of itemsToDelete) {
                await deleteDoc(
                    doc(
                        db,
                        "exams",
                        item.examId,
                        "pyqs",
                        item.subjectId,
                        "chapters",
                        item.id
                    )
                );
                deleteCount++;
            }
            /* Update UI */
            setAllChapters(prev =>
                prev.filter(ch =>
                    !itemsToDelete.some(d => d.id === ch.id)
                )
            );
            Swal.fire(
                "Deleted",
                `${deleteCount} chapters removed`,
                "success"
            );
        } catch (err) {
            Swal.fire(
                "Error",
                err.message,
                "error"
            );
        }
    };

    /* ---------------- DELETE SELECTED ---------------- */

    const handleDeleteSelected = async () => {
        if (selectedItems.length === 0) {
            return Swal.fire(
                "Warning",
                "No items selected",
                "warning"
            );
        }
        const confirm = await Swal.fire({
            title: "Delete Selected?",
            text: `${selectedItems.length} chapters will be deleted`,
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33"
        });
        if (!confirm.isConfirmed) return;
        try {
            for (let item of selectedItems) {
                await deleteDoc(
                    doc(
                        db,
                        "exams",
                        item.examId,
                        "pyqs",
                        item.subjectId,
                        "chapters",
                        item.id
                    )
                );
            }
            /* Update UI */
            setAllChapters(prev =>
                prev.filter(ch =>
                    !selectedItems.some(
                        s => s.id === ch.id
                    )
                )
            );
            setSelectedItems([]);
            Swal.fire(
                "Deleted",
                "Selected chapters removed",
                "success"
            );
        } catch (err) {
            Swal.fire(
                "Error",
                err.message,
                "error"
            );
        }
    };

    /* ---------------- EDIT ---------------- */

    const handleEdit = (item) => {
        setEditingData(item);
        setPdfFile(null);
        setFormData({
            examId: item.examId,
            subjectId: item.subjectId,
            chapterName: item.name,
            questionCount: item.questionCount,
            isLocked: item.isLocked,
            status: item.status,
            userType: item.userType || "all",
            userIds: item.userIds || [],
            userGroupIds: item.userGroupIds || []
        });

        setShowModal(true);

    };
    /* ---------------- UI (UNCHANGED) ---------------- */

    return (
        <div className="p-8 bg-slate-100 min-h-screen">

            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">PYQs Management</h2>

                <button
                    onClick={handleDeleteSelected}
                    className="bg-red-700 text-white px-4 py-2 rounded"
                >
                    Delete Selected
                    ({selectedItems.length})
                </button>

                <button
                    onClick={() => handleBulkDelete()}
                    className="bg-red-600 text-white px-4 py-2 rounded"
                >
                    Bulk Delete
                </button>

                <button
                    onClick={() => setShowModal(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded"
                >
                    + Add PYQ
                </button>

            </div>

            {/* FILTERS */}
            <div className="bg-white p-4 rounded-xl shadow mb-6 flex gap-4 flex-wrap">

                {/* Exam Filter */}
                <div>
                    <label className="block text-sm font-medium">
                        Filter by Exam
                    </label>

                    <select
                        className="border p-2 rounded w-[180px]"
                        value={filterExam}
                        onChange={(e) => {
                            setFilterExam(e.target.value);
                            setCurrentPage(1);
                        }}
                    >
                        <option value="">All Exams</option>

                        {exams.map(exam => (
                            <option key={exam.id} value={exam.id}>
                                {exam.name}
                            </option>
                        ))}

                    </select>
                </div>
                {/* Subject Filter */}
                <div>
                    <label className="block text-sm font-medium">Filter by Subject</label>
                    <select
                        className="border p-2 rounded w-[180px]"
                        value={filterSubject}
                        onChange={(e) => {
                            setFilterSubject(e.target.value);
                            setCurrentPage(1);
                        }}
                    >
                        <option value="">All Subjects</option>
                        {subjects.map(sub => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                    </select>
                </div>

                {/* Search */}
                <div className="w-[220px]">
                    <label className="block text-sm font-medium">Search</label>
                    <input
                        className="border p-2 rounded w-full"
                        placeholder="Search subject or chapter..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* Lock Filter */}
                <div>
                    <label className="block text-sm font-medium">Filter by Lock</label>
                    <select
                        className="border p-2 rounded"
                        value={filterLock}
                        onChange={(e) => { setFilterLock(e.target.value); setCurrentPage(1); }}
                    >
                        <option value="">All</option>
                        <option value="locked">Locked</option>
                        <option value="unlocked">Unlocked</option>
                    </select>
                </div>

                {/* Status Filter */}
                <div>
                    <label className="block text-sm font-medium">Filter by Status</label>
                    <select
                        className="border p-2 rounded"
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value); setCurrentPage(1); }}
                    >
                        <option value="">All</option>
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                    </select>
                </div>
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-xl shadow p-6">

                <table className="w-full text-left">
                    <thead className="bg-slate-200">
                        <tr>
                            <th className="p-3">
                                <input
                                    type="checkbox"
                                    checked={
                                        selectedItems.length ===
                                        paginatedData.length &&
                                        paginatedData.length > 0
                                    }
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="p-3">Exam</th>
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
                                <td className="p-3">
                                    <input
                                        type="checkbox"
                                        checked={
                                            selectedItems.some(
                                                i => i.id === item.id
                                            )
                                        }
                                        onChange={() =>
                                            toggleSelect(item)
                                        }
                                    />
                                </td>
                                <td className="p-3">{item.examName}</td>
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
                {/* PAGINATION */}
                <div className="flex justify-center items-center gap-2 mt-6">

                    <button
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(prev => prev - 1)}
                        className="px-3 py-1 border rounded disabled:opacity-40"
                    >
                        Prev
                    </button>

                    {Array.from({ length: totalPages }, (_, i) => (
                        <button
                            key={i}
                            onClick={() => setCurrentPage(i + 1)}
                            className={`px-3 py-1 border rounded ${currentPage === i + 1
                                ? "bg-indigo-600 text-white"
                                : "bg-white"
                                }`}
                        >
                            {i + 1}
                        </button>
                    ))}

                    <button
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage(prev => prev + 1)}
                        className="px-3 py-1 border rounded disabled:opacity-40"
                    >
                        Next
                    </button>

                </div>

            </div>

            {/* MODAL */}
            {showModal && (
                <div className="fixed inset-0 bg-black/40 flex justify-center items-start overflow-y-auto p-6">
                    <div className="bg-white w-full max-w-xl max-h-[90vh] overflow-y-auto p-6 rounded-xl space-y-4">

                        <h3 className="text-lg font-bold">
                            {editingData ? "Edit PYQ" : "Add PYQ"}
                        </h3>

                        {/* EXAM */}
                        <div>
                            <label className="block text-sm font-medium">Exam</label>

                            <select
                                className="border p-2 rounded w-full"
                                value={formData.examId || ""}
                                onChange={(e) =>
                                    setFormData({ ...formData, examId: e.target.value })
                                }
                            >
                                <option value="">Select Exam</option>

                                {exams.map(exam => (
                                    <option key={exam.id} value={exam.id}>
                                        {exam.name}
                                    </option>
                                ))}

                            </select>
                        </div>

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
                                    {(subjects.find(s => s.id === formData.subjectId)?.chapters || []).map((ch, i) => (
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

                        {/* TARGET USERS */}

                        <div>
                            <label className="block text-sm font-medium">
                                Target Users
                            </label>

                            <div className="flex gap-4 mt-2">
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

                                <label className="block text-sm font-medium">
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

                                <label className="block text-sm font-medium">
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
