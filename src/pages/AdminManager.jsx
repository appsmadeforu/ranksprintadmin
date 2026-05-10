import { useEffect, useState } from "react";
import { db, auth, functions } from "../firebase";
import { collection, onSnapshot, doc, getDoc, updateDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Eye, EyeOff, Edit, X } from "lucide-react";

const ALL_PERMISSIONS = [
  "dashboard",
  "exams",
  "tests",
  "pyqs",
  "questions",
  "users",
  "results",
  "subscriptions",
  "faq",
  "privacy",
  "subjects",
  "notifications",
  "user-groups",
  "activity-logs",
  "staticData",
  "settings",
  "reports"
];

export default function AdminManager() {

  const [admins, setAdmins] = useState([]);
  const [currentAdmin, setCurrentAdmin] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "editor",
    permissions: []
  });

  const [editingAdminId, setEditingAdminId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    name: "",
    email: "",
    password: "",
    role: "editor",
    permissions: []
  });

  /* ---------------- FETCH CURRENT ADMIN ---------------- */
  useEffect(() => {
    const fetchAdmin = async () => {
      const user = auth.currentUser;

      if (!user) return;

      const adminDoc = await getDoc(doc(db, "admins", user.uid));

      if (adminDoc.exists()) {
        setCurrentAdmin(adminDoc.data());
      }

      setLoading(false);
    };

    fetchAdmin();
  }, []);

  /* ---------------- FETCH ADMINS LIST ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "admins"),
      (snapshot) => {
        setAdmins(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })));
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) return <div className="p-10">Loading...</div>;

  if (!currentAdmin || currentAdmin.role !== "superadmin") {
    return <div className="p-10 text-red-600 font-semibold">Unauthorized</div>;
  }

  /* ---------------- CREATE ADMIN ---------------- */
  const createAdmin = async () => {

    if (!formData.name || !formData.email || !formData.password) {
      alert("All fields are required.");
      return;
    }

    if (formData.password.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    try {
      const callable = httpsCallable(functions, "createAdminUser");
      await callable(formData);

      alert("Admin created successfully");

      setFormData({
        name: "",
        email: "",
        password: "",
        role: "editor",
        permissions: []
      });

      setShowPassword(false);

    } catch (err) {
      alert(err.message);
    }
  };

  /* ---------------- EDIT ADMIN ---------------- */
  const handleEditAdmin = (admin) => {
    setEditingAdminId(admin.id);
    setShowEditPassword(false);

    setEditFormData({
      name: admin.name,
      email: admin.email,
      password: "",
      role: admin.role,
      permissions: admin.permissions || []
    });

    setIsEditModalOpen(true);
  };

  const updateAdmin = async () => {

    if (!editFormData.name || !editFormData.email) {
      alert("Name & Email are required.");
      return;
    }

    try {

      await updateDoc(doc(db, "admins", editingAdminId), {
        name: editFormData.name,
        email: editFormData.email,
        role: editFormData.role,
        permissions: editFormData.permissions
      });

      // Change password if entered
      if (editFormData.password) {

        const callable = httpsCallable(functions, "updateAdminPassword");

        await callable({
          uid: editingAdminId,
          password: editFormData.password
        });

      }

      alert("Admin updated successfully");

      setIsEditModalOpen(false);

      setEditingAdminId(null);

      setEditFormData({
        name: "",
        email: "",
        password: "",
        role: "editor",
        permissions: []
      });

    } catch (err) {
      alert("Error updating admin: " + err.message);
    }
  };

  const togglePermission = (perm) => {
    const exists = formData.permissions.includes(perm);

    if (exists) {
      setFormData({
        ...formData,
        permissions: formData.permissions.filter(p => p !== perm)
      });
    } else {
      setFormData({
        ...formData,
        permissions: [...formData.permissions, perm]
      });
    }
  };

  const toggleEditPermission = (perm) => {
    const exists = editFormData.permissions.includes(perm);

    if (exists) {
      setEditFormData({
        ...editFormData,
        permissions: editFormData.permissions.filter(p => p !== perm)
      });
    } else {
      setEditFormData({
        ...editFormData,
        permissions: [...editFormData.permissions, perm]
      });
    }
  };

  const deleteAdmin = async (uid) => {
    if (!window.confirm("Delete this admin?")) return;
    try {
      const callable = httpsCallable(functions, "deleteAdminUser");
      await callable({ uid });
      await deleteDoc(doc(db, "admins", uid));
      alert("Admin deleted successfully");
    } catch (err) {
      alert("Error deleting admin: " + err.message);
    }
  };

  return (
    <div className="p-10">

      <h2 className="text-2xl font-bold mb-6">Admin Management</h2>

      {/* Create Admin */}
      <div className="bg-white p-6 rounded-xl shadow mb-8">
        <h3 className="font-semibold mb-4">Create New Admin</h3>

        {/* Name Field */}
        <div className="mb-4">
          <label className="block font-medium mb-2">Name</label>
          <input
            placeholder="Enter admin name"
            className="border p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-600"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        {/* Email Field */}
        <div className="mb-4">
          <label className="block font-medium mb-2">Email</label>
          <input
            placeholder="Enter admin email"
            className="border p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-600"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
          />
        </div>

        {/* Password Field with Eye Icon */}
        <div className="mb-4">
          <label className="block font-medium mb-2">Password</label>
          <div className="relative flex items-center">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Enter password (min 6 characters)"
              className="border p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-600 pr-10"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 text-slate-600 hover:text-indigo-600 transition"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        {/* Role Field */}
        <div className="mb-4">
          <label className="block font-medium mb-2">Role</label>
          <select
            className="border p-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
            value={formData.role}
            onChange={e => setFormData({ ...formData, role: e.target.value })}
          >
            <option value="editor">Editor</option>
          </select>
        </div>

        {/* Permissions Field */}
        <div className="mb-4">
          <label className="block font-medium mb-2">Permissions</label>
          <div className="grid grid-cols-3 gap-3 p-3 border rounded bg-gray-50">
            {ALL_PERMISSIONS.map(perm => (
              <label key={perm} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.permissions.includes(perm)}
                  onChange={() => togglePermission(perm)}
                  className="w-4 h-4"
                />
                <span className="text-sm">{perm}</span>
              </label>
            ))}
          </div>
        </div>

        <button
          onClick={createAdmin}
          className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 transition font-medium"
        >
          Create Admin
        </button>
      </div>

      {/* Admin List */}
      <div className="bg-white p-6 rounded-xl shadow">
        <h3 className="font-semibold mb-4">Existing Admins</h3>

        {admins.map(admin => (
          <div key={admin.id} className="border p-4 mb-2 rounded hover:bg-slate-50 transition flex justify-between items-start">
            <div>
              <div className="font-medium">{admin.name}</div>
              <div className="text-sm text-gray-600">{admin.email}</div>
              <div className="text-xs">Role: {admin.role}</div>
              <div className="text-xs text-slate-500 mt-1">
                Permissions: {admin.permissions?.length > 0 ? admin.permissions.join(", ") : "None"}
              </div>
            </div>
            <div className="flex gap-3">

              <button
                onClick={() => handleEditAdmin(admin)}
                className="text-blue-600 hover:text-blue-800 transition p-2"
              >
                <Edit size={20} />
              </button>

              <button
                onClick={() => deleteAdmin(admin.id)}
                className="text-red-600 hover:text-red-800 transition p-2"
              >
                Delete
              </button>

            </div>
          </div>
        ))}
      </div>

      {/* EDIT MODAL */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white w-[600px] p-8 rounded-xl shadow-xl max-h-[90vh] overflow-y-auto">

            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold">Edit Admin</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-600 hover:text-slate-900"
              >
                <X size={24} />
              </button>
            </div>

            {/* Name Field */}
            <div className="mb-4">
              <label className="block font-medium mb-2">Name</label>
              <input
                placeholder="Enter admin name"
                className="border p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={editFormData.name}
                onChange={e => setEditFormData({ ...editFormData, name: e.target.value })}
              />
            </div>

            {/* Email Field */}
            <div className="mb-4">
              <label className="block font-medium mb-2">Email</label>
              <input
                placeholder="Enter admin email"
                className="border p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={editFormData.email}
                onChange={e => setEditFormData({ ...editFormData, email: e.target.value })}
              />
            </div>

            {/* Password Change */}
            <div className="mb-4">
              <label className="block font-medium mb-2">New Password (optional)</label>

              <div className="relative flex items-center">
                <input
                  type={showEditPassword ? "text" : "password"}
                  placeholder="Leave blank if not changing password"
                  className="border p-2 rounded w-full focus:outline-none focus:ring-2 focus:ring-indigo-600 pr-10"
                  value={editFormData.password || ""}
                  onChange={e =>
                    setEditFormData({ ...editFormData, password: e.target.value })
                  }
                />

                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-3 text-slate-600 hover:text-indigo-600 transition"
                >
                  {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Role Field */}
            <div className="mb-4">
              <label className="block font-medium mb-2">Role</label>
              <select
                className="border p-2 rounded w-full bg-white focus:outline-none focus:ring-2 focus:ring-indigo-600"
                value={editFormData.role}
                onChange={e => setEditFormData({ ...editFormData, role: e.target.value })}
              >
                <option value="editor">Editor</option>
              </select>
            </div>

            {/* Permissions Field */}
            <div className="mb-4">
              <label className="block font-medium mb-2">Permissions</label>
              <div className="grid grid-cols-3 gap-3 p-3 border rounded bg-gray-50">
                {ALL_PERMISSIONS.map(perm => (
                  <label key={perm} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editFormData.permissions.includes(perm)}
                      onChange={() => toggleEditPermission(perm)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm">{perm}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Modal Buttons */}
            <div className="flex justify-end gap-4 mt-6">
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 border rounded hover:bg-slate-50 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={updateAdmin}
                className="bg-indigo-600 text-white px-6 py-2 rounded hover:bg-indigo-700 transition font-medium"
              >
                Save Changes
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
