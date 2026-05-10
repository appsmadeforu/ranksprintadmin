import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Check, X } from "lucide-react";

export default function ScreenshotSettings() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    /* ---------------- FETCH USERS ---------------- */
    useEffect(() => {
        const unsubscribe = onSnapshot(collection(db, "users"), (snap) => {
            setUsers(
                snap.docs.map((doc) => ({
                    id: doc.id,
                    ...doc.data(),
                }))
            );
        });

        return () => unsubscribe();
    }, []);

    /* ---------------- TOGGLE SCREENSHOT ACCESS ---------------- */
    const toggleScreenshotAccess = async (userId, currentStatus) => {
        setLoading(true);
        try {
            await updateDoc(doc(db, "users", userId), {
                screenshotEnabled: !currentStatus,
            });
        } catch (err) {
            alert("Error updating screenshot access: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    /* ---------------- FILTER USERS BY SEARCH ---------------- */
    const filteredUsers = users.filter(
        (user) =>
            user.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            user.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="bg-white p-6 rounded-xl shadow">
            <h3 className="text-lg font-semibold mb-4">Screenshot Access Control</h3>

            <p className="text-sm text-gray-600 mb-6">
                Users with screenshot access enabled can take screenshots during exams.
                By default, all users have this disabled for security.
            </p>

            {/* SEARCH BAR */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search by phone, email, or user ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full border p-3 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                />
            </div>

            {/* USERS TABLE */}
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-100 border-b">
                        <tr>
                            <th className="p-3">User Name/ID</th>
                            <th className="p-3">Phone</th>
                            <th className="p-3">Email</th>
                            <th className="p-3">Status</th>
                            <th className="p-3">Action</th>
                        </tr>
                    </thead>

                    <tbody>
                        {filteredUsers.length > 0 ? (
                            filteredUsers.map((user) => (
                                <tr key={user.id} className="border-b hover:bg-slate-50 transition">
                                    <td className="p-3 text-sm font-medium">
                                        {user.name || user.id}
                                    </td>

                                    <td className="p-3">{user.phone || "N/A"}</td>

                                    <td className="p-3">{user.email || "N/A"}</td>

                                    <td className="p-3">
                                        <div className="flex items-center gap-2">
                                            {user.screenshotEnabled ? (
                                                <>
                                                    <Check size={18} className="text-green-600" />
                                                    <span className="text-green-600 font-medium">
                                                        Enabled
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <X size={18} className="text-red-600" />
                                                    <span className="text-red-600 font-medium">
                                                        Disabled
                                                    </span>
                                                </>
                                            )}
                                        </div>
                                    </td>

                                    <td className="p-3">
                                        <button
                                            onClick={() =>
                                                toggleScreenshotAccess(
                                                    user.id,
                                                    user.screenshotEnabled
                                                )
                                            }
                                            disabled={loading}
                                            className={`px-4 py-2 rounded font-medium transition ${user.screenshotEnabled
                                                    ? "bg-red-500 hover:bg-red-600 text-white"
                                                    : "bg-green-500 hover:bg-green-600 text-white"
                                                } disabled:opacity-50`}
                                        >
                                            {user.screenshotEnabled ? "Disable" : "Enable"}
                                        </button>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr>
                                <td colSpan="5" className="p-6 text-center text-gray-500">
                                    No users found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* STATS */}
            <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="bg-green-50 p-4 rounded border border-green-200">
                    <p className="text-sm text-gray-600">Screenshot Enabled</p>
                    <p className="text-2xl font-bold text-green-600">
                        {users.filter((u) => u.screenshotEnabled).length}
                    </p>
                </div>

                <div className="bg-red-50 p-4 rounded border border-red-200">
                    <p className="text-sm text-gray-600">Screenshot Disabled</p>
                    <p className="text-2xl font-bold text-red-600">
                        {users.filter((u) => !u.screenshotEnabled).length}
                    </p>
                </div>
            </div>
        </div>
    );
}
