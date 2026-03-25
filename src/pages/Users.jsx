import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  updateDoc,
  doc,
} from "firebase/firestore";
import Swal from "sweetalert2";

const ITEMS_PER_PAGE = 20;

export default function Users() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [examMap, setExamMap] = useState({});

  /* ---------------- REALTIME FETCH ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "users"),
      (snapshot) => {
        setUsers(
          snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          }))
        );
      }
    );

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(
        collection(db, "exams"),
        (snapshot) => {
        const map = {};
        snapshot.docs.forEach((doc) => {
            map[doc.id] = doc.data().name;
        });
        setExamMap(map);
        }
    );

    return () => unsubscribe();
    }, []);

  /* ---------------- SEARCH + FILTER ---------------- */
  const processedUsers = useMemo(() => {
    let data = [...users];

    if (search) {
      data = data.filter(
        (u) =>
          u.name?.toLowerCase().includes(search.toLowerCase()) ||
          u.email?.toLowerCase().includes(search.toLowerCase())
      );
    }

    if (filter === "blocked") {
      data = data.filter((u) => u.isBlocked);
    }

    if (filter === "activeSubscription") {
      data = data.filter((u) => u.subscriptionStatus === "active");
    }

    return data;
  }, [users, search, filter]);

  const totalPages = Math.ceil(
    processedUsers.length / ITEMS_PER_PAGE
  );

  const paginatedUsers = processedUsers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  /* ---------------- BLOCK / UNBLOCK ---------------- */
  const toggleBlock = async (user) => {
    const result = await Swal.fire({
      title: user.isBlocked ? "Unblock User?" : "Block User?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: user.isBlocked
        ? "Unblock"
        : "Block",
    });

    if (!result.isConfirmed) return;

    await updateDoc(doc(db, "users", user.id), {
      isBlocked: !user.isBlocked,
    });

    Swal.fire(
      "Success",
      `User ${
        user.isBlocked ? "unblocked" : "blocked"
      } successfully`,
      "success"
    );
  };

  const toggleExpand = (id) => {
    setExpandedUserId(expandedUserId === id ? null : id);
  };

  return (
    <div className="p-10 bg-slate-100 min-h-screen">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold text-slate-800">
          User Management
        </h2>

        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search user..."
            className="border p-2 rounded-lg w-64 focus:ring-2 focus:ring-indigo-500 outline-none"
            onChange={(e) => setSearch(e.target.value)}
          />

          <select
            className="border p-2 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All Users</option>
            <option value="blocked">Blocked</option>
            <option value="activeSubscription">Active Subscription</option>
          </select>
        </div>
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-100 text-slate-600 text-sm uppercase tracking-wide">
            <tr>
              <th className="p-4 w-12"></th>
              <th className="p-4">User</th>
              <th className="p-4">Email</th>
              <th className="p-4">Exam</th>
              <th className="p-4">Subscription</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-center">Actions</th>
            </tr>
          </thead>

          <tbody>
            {paginatedUsers.map((user) => (
              <>
                {/* MAIN ROW */}
                <tr
                  key={user.id}
                  className="border-t hover:bg-slate-50 transition"
                >
                  <td className="p-4 text-center">
                    <button
                      onClick={() => toggleExpand(user.id)}
                      className="w-8 h-8 rounded-full bg-indigo-50 hover:bg-indigo-100 text-indigo-600 flex items-center justify-center transition"
                    >
                      {expandedUserId === user.id ? "−" : "+"}
                    </button>
                  </td>

                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          user.photoURL ||
                          "https://ui-avatars.com/api/?name=" +
                            user.name
                        }
                        alt=""
                        className="w-10 h-10 rounded-full"
                      />
                      <div>
                        <p className="font-semibold text-slate-800">
                          {user.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          ID: {user.id.slice(0, 8)}...
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="p-4 text-slate-600">
                    {user.email}
                  </td>

                  <td className="p-4">
                    {user.activeExam || "-"}
                  </td>

                  <td className="p-4">
                    <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                      {user.subscriptionStatus || "none"}
                    </span>
                  </td>

                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.isBlocked
                          ? "bg-red-100 text-red-700"
                          : "bg-green-100 text-green-700"
                      }`}
                    >
                      {user.isBlocked ? "Blocked" : "Active"}
                    </span>
                  </td>

                  <td className="p-4 text-center">
                    <button
                      onClick={() => toggleBlock(user)}
                      className="px-4 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition"
                    >
                      {user.isBlocked ? "Unblock" : "Block"}
                    </button>
                  </td>
                </tr>

                {/* EXPANDED SECTION */}
                {expandedUserId === user.id && (
                  <tr>
                    <td colSpan="7" className="bg-slate-50 p-6">
                      <div className="bg-white rounded-xl shadow-sm p-6">

                        <h3 className="text-lg font-semibold text-slate-800 mb-6">
                          User Details
                        </h3>

                        <div className="grid grid-cols-3 gap-6 text-sm">

                          <Info label="Device ID" value={user.deviceId} />
                          <Info label="Created At" value={
                            user.createdAt
                              ? new Date(user.createdAt.toDate?.() || user.createdAt).toLocaleString()
                              : "-"
                          } />
                          <Info label="Last Login" value={
                            user.lastLoginAt
                              ? new Date(user.lastLoginAt.toDate?.() || user.lastLoginAt).toLocaleString()
                              : "-"
                          } />

                        </div>

                        {/* Selected Exams */}
                        {user.selectedExams?.length > 0 && (
                          <div className="mt-6">
                            <p className="font-medium text-slate-700 mb-2">
                              Selected Exams
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {user.selectedExams.map((examId, idx) => (
                                <span
                                    key={idx}
                                    className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs"
                                >
                                    {examMap[examId] || examId}
                                </span>
                                ))}
                            </div>
                          </div>
                        )}

                        {/* Subscription IDs */}
                        {user.subscriptionIds?.length > 0 && (
                          <div className="mt-6">
                            <p className="font-medium text-slate-700 mb-2">
                              Subscription IDs
                            </p>
                            <div className="space-y-2">
                              {user.subscriptionIds.map((id, idx) => (
                                <div
                                  key={idx}
                                  className="bg-slate-100 p-2 rounded text-xs font-mono break-all"
                                >
                                  {id}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="flex justify-center gap-2 mt-8">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i + 1)}
            className={`px-4 py-2 rounded-lg transition ${
              currentPage === i + 1
                ? "bg-indigo-600 text-white"
                : "bg-white border hover:bg-slate-50"
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------- Small reusable info component -------- */

function Info({ label, value }) {
  return (
    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
      <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold mb-1">
        {label}
      </p>
      <p className="text-sm text-slate-800 break-all">
        {value || "-"}
      </p>
    </div>
  );
}
