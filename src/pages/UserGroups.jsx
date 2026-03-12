import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  getDocs
} from "firebase/firestore";
import Swal from "sweetalert2";
import * as XLSX from "xlsx/xlsx.mjs";

export default function UserGroups() {

  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [tests, setTests] = useState([]);
  const [pyqs, setPyqs] = useState([]);

  const [showModal, setShowModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState(null);

  const [searchUser, setSearchUser] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    promoCode: "",
    discountPercentage: 0,
    description: "",
    isActive: true,
    specialTests: [],
    specialPyqs: [],
    userIds: []
  });

  /* ---------------- FETCH GROUPS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "userGroups"),
      snapshot => {
        setGroups(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })));
      }
    );
    return () => unsubscribe();
  }, []);

  /* ---------------- FETCH USERS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      snapshot => {
        setUsers(snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })));
      }
    );
    return () => unsubscribe();
  }, []);

  /* ---------------- FETCH TESTS ---------------- */
  useEffect(() => {
    const fetchData = async () => {
      const testSnap = await getDocs(collection(db, "tests"));
      setTests(testSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const pyqSnap = await getDocs(collection(db, "pyqs"));
      setPyqs(pyqSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchData();
  }, []);

  /* ---------------- FILTERED USERS ---------------- */
  const filteredUsers = useMemo(() => {
    if (!searchUser) return users;
    return users.filter(u =>
      u.name?.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchUser.toLowerCase()) ||
      u.phone?.includes(searchUser)
    );
  }, [users, searchUser]);

  /* ---------------- HANDLE SUBMIT ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.name) {
      Swal.fire("Error", "Group name required", "error");
      return;
    }

    if (editingGroup) {
      await updateDoc(doc(db, "userGroups", editingGroup.id), formData);
    } else {
      await addDoc(collection(db, "userGroups"), {
        ...formData,
        createdAt: serverTimestamp()
      });
    }

    // Update each user groupId
    for (let userId of formData.userIds) {
      await updateDoc(doc(db, "users", userId), {
        groupId: editingGroup?.id || null,
        groupJoinedAt: serverTimestamp()
      });
    }

    Swal.fire("Success", "Group saved", "success");
    setShowModal(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      name: "",
      promoCode: "",
      discountPercentage: 0,
      description: "",
      isActive: true,
      specialTests: [],
      specialPyqs: [],
      userIds: []
    });
    setEditingGroup(null);
  };

  /* ---------------- EXCEL BULK IMPORT ---------------- */
  const handleExcelUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet);

    const matchedUsers = [];

    json.forEach(row => {
      const user = users.find(u =>
        u.email?.toLowerCase() === row.Email?.toLowerCase()
      );
      if (user) matchedUsers.push(user.id);
    });

    setFormData(prev => ({
      ...prev,
      userIds: [...new Set([...prev.userIds, ...matchedUsers])]
    }));

    Swal.fire("Success", "Users imported from Excel", "success");
  };

  const toggleUser = (userId) => {
    const exists = formData.userIds.includes(userId);
    setFormData({
      ...formData,
      userIds: exists
        ? formData.userIds.filter(id => id !== userId)
        : [...formData.userIds, userId]
    });
  };

  const toggleArrayField = (field, id) => {
    const exists = formData[field].includes(id);
    setFormData({
      ...formData,
      [field]: exists
        ? formData[field].filter(i => i !== id)
        : [...formData[field], id]
    });
  };

  /* ---------------- EDIT GROUP ---------------- */
  const handleEdit = (group) => {
    setEditingGroup(group);

    setFormData({
      name: group.name || "",
      promoCode: group.promoCode || "",
      discountPercentage: group.discountPercentage || 0,
      description: group.description || "",
      isActive: group.isActive ?? true,
      specialTests: group.specialTests || [],
      specialPyqs: group.specialPyqs || [],
      userIds: group.userIds || []
    });

    setShowModal(true);
  };


  /* ---------------- DELETE GROUP ---------------- */
  const handleDelete = async (groupId) => {

    const confirm = await Swal.fire({
      title: "Delete this group?",
      text: "This action cannot be undone",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it"
    });

    if (!confirm.isConfirmed) return;

    await deleteDoc(doc(db, "userGroups", groupId));

    Swal.fire(
      "Deleted!",
      "Group has been deleted.",
      "success"
    );
  };

  return (
    <div className="p-10 bg-slate-100 min-h-screen">

      <div className="flex justify-between mb-6">
        <h2 className="text-2xl font-bold">User Groups</h2>

        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded"
        >
          Create Group
        </button>
      </div>

      {/* GROUP TABLE */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-200">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Users</th>
              <th className="p-3">Promo</th>
              <th className="p-3">Discount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.map(group => (
              <tr key={group.id} className="border-t">
                <td className="p-3 font-medium">{group.name}</td>
                <td className="p-3">{group.userIds?.length || 0}</td>
                <td className="p-3">{group.promoCode || "-"}</td>
                <td className="p-3">{group.discountPercentage}%</td>
                <td className="p-3">
                  {group.isActive ? "Active" : "Inactive"}
                </td>
                <td className="p-3 flex gap-2">

                  <button
                    onClick={() => handleEdit(group)}
                    className="bg-blue-500 text-white px-3 py-1 rounded"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDelete(group.id)}
                    className="bg-red-500 text-white px-3 py-1 rounded"
                  >
                    Delete
                  </button>

                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center">
          <div className="bg-white w-full max-w-4xl p-6 rounded-xl shadow overflow-y-auto max-h-[90vh]">

            <h3 className="text-xl font-bold mb-4">
              {editingGroup ? "Edit User Group" : "Create User Group"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* GROUP NAME */}
              <div>
                <label className="block font-semibold mb-2">Group Name</label>
                <input
                  className="w-full border p-3 rounded"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              {/* PROMO */}
              <div>
                <label className="block font-semibold mb-2">Promo Code</label>
                <input
                  className="w-full border p-3 rounded"
                  value={formData.promoCode}
                  onChange={e => setFormData({ ...formData, promoCode: e.target.value })}
                />
              </div>

              {/* DISCOUNT */}
              <div>
                <label className="block font-semibold mb-2">Discount %</label>
                <input
                  type="number"
                  className="w-full border p-3 rounded"
                  value={formData.discountPercentage}
                  onChange={e =>
                    setFormData({ ...formData, discountPercentage: Number(e.target.value) })
                  }
                />
              </div>

              {/* USERS */}
              <div>
                <label className="block font-semibold mb-2">Add Users</label>

                <input
                  placeholder="Search user..."
                  className="w-full border p-2 mb-2 rounded"
                  onChange={e => setSearchUser(e.target.value)}
                />

                <div className="max-h-40 overflow-y-auto border p-3 rounded bg-slate-50">
                  {filteredUsers.map(user => (
                    <label key={user.id} className="flex gap-2 mb-2">
                      <input
                        type="checkbox"
                        checked={formData.userIds.includes(user.id)}
                        onChange={() => toggleUser(user.id)}
                      />
                      {user.name} ({user.email})
                    </label>
                  ))}
                </div>

                <label className="mt-2 block bg-indigo-600 text-white px-3 py-2 rounded cursor-pointer w-fit">
                  Bulk Import Excel
                  <input type="file" hidden accept=".xlsx" onChange={handleExcelUpload} />
                </label>
              </div>

              {/* SPECIAL TESTS */}
              <div>
                <label className="block font-semibold mb-2">Special Tests</label>
                {tests.map(test => (
                  <label key={test.id} className="block">
                    <input
                      type="checkbox"
                      checked={formData.specialTests.includes(test.id)}
                      onChange={() => toggleArrayField("specialTests", test.id)}
                    />
                    {test.name}
                  </label>
                ))}
              </div>

              {/* SPECIAL PYQS */}
              <div>
                <label className="block font-semibold mb-2">Special PYQs</label>
                {pyqs.map(p => (
                  <label key={p.id} className="block">
                    <input
                      type="checkbox"
                      checked={formData.specialPyqs.includes(p.id)}
                      onChange={() => toggleArrayField("specialPyqs", p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="border px-4 py-2 rounded"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-6 py-2 rounded"
                >
                  {editingGroup ? "Update Group" : "Save Group"}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
}
