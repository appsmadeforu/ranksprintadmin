import { useEffect, useState } from "react";
import { db, storage } from "../firebase";
import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    onSnapshot,
    serverTimestamp
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Upload, X } from "lucide-react";
import { logActivity } from "../utils/logActivity";
import Swal from "sweetalert2";

export default function NotificationManager() {
    const [notifications, setNotifications] = useState([]);
    const [users, setUsers] = useState([]);
    const [userGroups, setUserGroups] = useState([]);
    const [exams, setExams] = useState([]);

    const [isOpen, setIsOpen] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [uploading, setUploading] = useState(false);

    const emptyForm = {
        title: "",
        msg: "",
        imageUrl: "",
        type: "test",
        examId: "",
        userType: "all",
        userIds: [],
        userGroupIds: [],
        showNotification: true
    };

    const [form, setForm] = useState(emptyForm);

    const toggleUser = (userId) => {

        const exists = form.userIds.includes(userId);

        setForm({
            ...form,
            userIds: exists
                ? form.userIds.filter(id => id !== userId)
                : [...form.userIds, userId]
        });

    };

    const toggleUserGroup = (groupId) => {

        const exists = form.userGroupIds.includes(groupId);

        setForm({
            ...form,
            userGroupIds: exists
                ? form.userGroupIds.filter(id => id !== groupId)
                : [...form.userGroupIds, groupId]
        });

    };

    /* ---------------- FETCH USERS ---------------- */
    useEffect(() => {
        return onSnapshot(collection(db, "users"), snap =>
            setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
        );
    }, []);

    /* ---------------- FETCH USER GROUPS ---------------- */

    useEffect(() => {
        return onSnapshot(collection(db, "userGroups"), snap =>
            setUserGroups(
                snap.docs.map(d => ({
                    id: d.id,
                    ...d.data()
                }))
            )
        );
    }, []);

    /* ---------------- FETCH EXAMS ---------------- */

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

    /* ---------------- FETCH NOTIFICATIONS ---------------- */
    useEffect(() => {
        return onSnapshot(collection(db, "notification"), snap =>
            setNotifications(
                snap.docs.map(d => ({ id: d.id, ...d.data() }))
            )
        );
    }, []);

    /* ---------------- HANDLE IMAGE UPLOAD ---------------- */
    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            Swal.fire("Invalid File", "Please upload an image file", "error");
            return;
        }

        setUploading(true);
        try {
            const storageRef = ref(
                storage,
                `notifications/${Date.now()}_${file.name}`
            );
            await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(storageRef);
            setForm({ ...form, imageUrl: downloadURL });
            Swal.fire({
                icon: "success",
                title: "Image Uploaded",
                timer: 1200,
                showConfirmButton: false
            });
        } catch (err) {
            Swal.fire("Upload Failed", err.message, "error");
        } finally {
            setUploading(false);
        }
    };

    /* ---------------- REMOVE IMAGE ---------------- */
    const handleRemoveImage = () => {
        setForm({ ...form, imageUrl: "" });
    };

    /* ---------------- SAVE NOTIFICATION ---------------- */
    const handleSave = async (e) => {
        e.preventDefault();

        if (!form.title || !form.msg) {
            Swal.fire("Missing Fields", "Title & Message are required", "warning");
            return;
        }

        /* -------- DETERMINE TARGET USERS -------- */

        let finalUsers = [];

        // All Users
        if (form.userType === "all") {
            finalUsers = users.map(u => u.id);
        }

        // Specific Users
        if (form.userType === "specific") {
            finalUsers = form.userIds;
        }

        // Users from Selected Groups
        if (form.userType === "groups") {

            form.userGroupIds.forEach(groupId => {

                const group = userGroups.find(g => g.id === groupId);

                if (group?.userIds) {
                    finalUsers.push(...group.userIds);
                }

            });

        }

        // Remove duplicates
        finalUsers = [...new Set(finalUsers)];


        /* -------- NOTIFICATION PAYLOAD -------- */

        const payload = {
            title: form.title,
            msg: form.msg,
            imageUrl: form.imageUrl || "",
            type: form.type,
            examId: form.examId || "",
            userId: finalUsers,
            showNotification: form.showNotification,
            updatedAt: serverTimestamp()
        };

        if (editingId) {

            await updateDoc(doc(db, "notification", editingId), payload);

            // ✅ LOG UPDATE
            await logActivity({
                actionType: form.showNotification
                    ? "ENABLE_NOTIFICATION"
                    : "DISABLE_NOTIFICATION",
                description: `Changed visibility of notification: ${form.title}`,
                entityId: editingId,
                entityType: "notification",
            });

        } else {

            const ref = await addDoc(collection(db, "notification"), {
                ...payload,
                isRead: false,
                createdAt: serverTimestamp()
            });

            // ✅ LOG CREATE
            await logActivity({
                actionType: "CREATE_NOTIFICATION",
                description: `Created notification: ${form.title}`,
                entityId: ref.id,
                entityType: "notification",
            });
        }

        Swal.fire({
            icon: "success",
            title: editingId ? "Notification Updated" : "Notification Created",
            timer: 1500,
            showConfirmButton: false
        });

        setIsOpen(false);
        setEditingId(null);
        setForm(emptyForm);
    };

    /* ---------------- EDIT ---------------- */
    const handleEdit = (n) => {

        setEditingId(n.id);

        const ids = n.userId || [];

        setForm({
            title: n.title || "",
            msg: n.msg || "",
            imageUrl: n.imageUrl || "",
            type: n.type || "test",
            examId: n.examId || "",
            userType:
                ids.length === users.length
                    ? "all"
                    : "specific",
            userIds: ids || [],
            userGroupIds: [],
            showNotification: n.showNotification ?? true
        });

        setIsOpen(true);
    };

    /* ---------------- DELETE ---------------- */
    const handleDelete = async (id) => {

        const confirm = await Swal.fire({
            title: "Delete notification?",
            text: "This action cannot be undone",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#d33",
            cancelButtonColor: "#3085d6",
            confirmButtonText: "Yes, delete it"
        });

        if (!confirm.isConfirmed) return;

        const notif = notifications.find(n => n.id === id);

        await deleteDoc(doc(db, "notification", id));

        await logActivity({
            actionType: "DELETE_NOTIFICATION",
            description: `Deleted notification: ${notif?.title}`,
            entityId: id,
            entityType: "notification",
        });

        Swal.fire(
            "Deleted!",
            "Notification removed successfully",
            "success"
        );
    };

    return (
        <div className="p-10 bg-slate-100 min-h-screen">

            {/* HEADER */}
            <div className="flex justify-between items-center mb-8">
                <h2 className="text-3xl font-bold">🔔 Notifications</h2>

                <button
                    onClick={() => {
                        setEditingId(null);
                        setForm(emptyForm);
                        setIsOpen(true);
                    }}
                    className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
                >
                    + Add Notification
                </button>
            </div>

            {/* TABLE */}
            <div className="bg-white rounded-xl shadow overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-slate-200">
                        <tr>
                            <th className="p-4">Title</th>
                            <th className="p-4">Image</th>
                            <th className="p-4">Type</th>
                            <th className="p-4">Exam</th>
                            <th className="p-4">Target</th>
                            <th className="p-4">Status</th>
                            <th className="p-4">Date</th>
                            <th className="p-4">Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {notifications.map(n => (
                            <tr key={n.id} className="border-t">
                                <td className="p-4 font-semibold">
                                    {n.title}
                                </td>

                                <td className="p-4">
                                    {n.imageUrl ? (
                                        <img
                                            src={n.imageUrl}
                                            alt={n.title}
                                            className="w-12 h-12 object-cover rounded"
                                        />
                                    ) : (
                                        <span className="text-gray-400 text-sm">No Image</span>
                                    )}
                                </td>

                                <td className="p-4 capitalize">
                                    {n.type}
                                </td>

                                <td className="p-4">
                                    {n.examId
                                        ? exams.find(e => e.id === n.examId)?.name
                                        : "All Exams"}
                                </td>

                                <td className="p-4">
                                    {n.userId?.length > 1 ? "All Users" : n.userId?.length === 1 ? "Specific User" : "All Users"}
                                </td>

                                <td className="p-4">
                                    {n.showNotification ? (
                                        <span className="text-green-600 font-semibold">
                                            Active
                                        </span>
                                    ) : (
                                        <span className="text-red-500 font-semibold">
                                            Hidden
                                        </span>
                                    )}
                                </td>

                                <td className="p-4 text-sm text-gray-600">
                                    {n.createdAt?.toDate().toLocaleDateString()}
                                </td>

                                <td className="p-4 flex gap-3">
                                    <button
                                        onClick={() => handleEdit(n)}
                                        className="text-blue-600 hover:underline"
                                    >
                                        Edit
                                    </button>

                                    <button
                                        onClick={() => handleDelete(n.id)}
                                        className="text-red-600 hover:underline"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}

                        {notifications.length === 0 && (
                            <tr>
                                <td colSpan="7" className="p-6 text-center text-gray-500">
                                    No notifications found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* MODAL */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
                    <div className="bg-white w-[500px] p-8 rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">

                        <h3 className="text-xl font-bold mb-6">
                            {editingId ? "Edit Notification" : "Add Notification"}
                        </h3>

                        <form onSubmit={handleSave} className="space-y-4">

                            <div>
                                <label className="block font-medium mb-2">Title</label>
                                <input
                                    placeholder="Notification Title"
                                    className="border p-3 w-full rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                                    value={form.title}
                                    onChange={e =>
                                        setForm({ ...form, title: e.target.value })
                                    }
                                />
                            </div>

                            <div>
                                <label className="block font-medium mb-2">Message</label>
                                <textarea
                                    placeholder="Notification Message"
                                    className="border p-3 w-full rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                                    rows="3"
                                    value={form.msg}
                                    onChange={e =>
                                        setForm({ ...form, msg: e.target.value })
                                    }
                                />
                            </div>

                            {/* IMAGE UPLOAD */}
                            <div>
                                <label className="block font-medium mb-2">Image (Optional)</label>

                                {form.imageUrl ? (
                                    <div className="relative w-full mb-4">
                                        <img
                                            src={form.imageUrl}
                                            alt="Preview"
                                            className="w-full h-40 object-cover rounded border"
                                        />
                                        <button
                                            type="button"
                                            onClick={handleRemoveImage}
                                            className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                                        >
                                            <X size={18} />
                                        </button>
                                    </div>
                                ) : (
                                    <label className="border-2 border-dashed border-slate-300 p-6 rounded-lg cursor-pointer hover:border-indigo-600 transition flex flex-col items-center gap-2">
                                        <Upload size={24} className="text-slate-400" />
                                        <span className="text-sm text-slate-600">
                                            Click to upload image
                                        </span>
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleImageUpload}
                                            disabled={uploading}
                                            className="hidden"
                                        />
                                    </label>
                                )}

                                {uploading && (
                                    <div className="text-center text-indigo-600 text-sm mt-2">
                                        Uploading...
                                    </div>
                                )}
                            </div>

                            <div>
                                <label className="block font-medium mb-2">Type</label>
                                <select
                                    className="border p-3 w-full rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                                    value={form.type}
                                    onChange={e =>
                                        setForm({ ...form, type: e.target.value })
                                    }
                                >
                                    <option value="tests">Test Alerts</option>
                                    <option value="results">Results</option>
                                    <option value="offers">Offers</option>
                                </select>
                            </div>

                            {/* EXAM DROPDOWN */}

                            <div>
                                <label className="block font-medium mb-2">
                                    Select Exam
                                </label>

                                <select
                                    className="border p-3 w-full rounded"
                                    value={form.examId}
                                    onChange={e =>
                                        setForm({
                                            ...form,
                                            examId: e.target.value
                                        })
                                    }
                                >
                                    <option value="">
                                        All Exams
                                    </option>

                                    {exams.map(exam => (
                                        <option
                                            key={exam.id}
                                            value={exam.id}
                                        >
                                            {exam.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            {/* TARGET */}

                            <div>
                                <label className="block font-medium mb-2">Target</label>

                                <div className="flex gap-4">

                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            checked={form.userType === "all"}
                                            onChange={() =>
                                                setForm({ ...form, userType: "all", userIds: [], userGroupIds: [] })
                                            }
                                        />
                                        <span className="ml-2">All Users</span>
                                    </label>

                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            checked={form.userType === "specific"}
                                            onChange={() =>
                                                setForm({ ...form, userType: "specific", userGroupIds: [] })
                                            }
                                        />
                                        <span className="ml-2">Specific Users</span>
                                    </label>

                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            checked={form.userType === "groups"}
                                            onChange={() =>
                                                setForm({ ...form, userType: "groups", userIds: [] })
                                            }
                                        />
                                        <span className="ml-2">User Groups</span>
                                    </label>

                                </div>

                            </div>

                            {form.userType === "groups" && (
                                <div>

                                    <label className="block font-medium mb-2">Select User Groups</label>

                                    <div className="max-h-40 overflow-y-auto border p-3 rounded bg-slate-50">

                                        {userGroups.map(group => (

                                            <label key={group.id} className="flex gap-2 mb-2">

                                                <input
                                                    type="checkbox"
                                                    checked={form.userGroupIds?.includes(group.id)}
                                                    onChange={() => toggleUserGroup(group.id)}
                                                />

                                                {group.name} ({group.userIds?.length || 0} users)

                                            </label>

                                        ))}

                                    </div>

                                </div>
                            )}

                            {form.userType === "specific" && (
                                <div>

                                    <label className="block font-medium mb-2">Select Users</label>

                                    <div className="max-h-40 overflow-y-auto border p-3 rounded bg-slate-50">

                                        {users.map(u => (

                                            <label key={u.id} className="flex gap-2 mb-2 items-center">

                                                <input
                                                    type="checkbox"
                                                    checked={form.userIds?.includes(u.id)}
                                                    onChange={() => toggleUser(u.id)}
                                                />

                                                <span>
                                                    <span className="font-medium">{u.name || "No Name"}</span>
                                                    <span className="text-gray-500 text-sm ml-2">
                                                        ({u.phone || u.email || u.id})
                                                    </span>
                                                </span>

                                            </label>

                                        ))}

                                    </div>

                                </div>
                            )}

                            <label className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    checked={form.showNotification}
                                    onChange={e =>
                                        setForm({
                                            ...form,
                                            showNotification: e.target.checked
                                        })
                                    }
                                />
                                <span className="font-medium">Show Notification</span>
                            </label>

                            <div className="flex justify-end gap-4 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 border rounded hover:bg-slate-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    type="submit"
                                    className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700"
                                >
                                    Save
                                </button>
                            </div>

                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
