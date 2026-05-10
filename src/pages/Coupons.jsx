import { useEffect, useState, useMemo } from "react";
import { db } from "../firebase";
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";
import { logActivity } from "../utils/logActivity";
import Swal from "sweetalert2";

const ITEMS_PER_PAGE = 20;

export default function Coupons() {
  const [coupons, setCoupons] = useState([]);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);

  const [users, setUsers] = useState([]);
  const [userGroups, setUserGroups] = useState([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState([]);

  const [formData, setFormData] = useState({
    code: "",
    discountType: "percentage",
    discountValue: 0,
    validFrom: "",
    validUntil: "",
    usageLimit: 1,
    usedCount: 0,
    isActive: true,
    userType: "all",
    userIds: [],
    userGroupIds: [],
    subscriptionPlanIds: []   // ✅ ADD THIS
  });

  /* ---------------- FETCH COUPONS ---------------- */
  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "coupons"),
      (snapshot) => {
        setCoupons(
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
      collection(db, "userGroups"),
      snap => {

        setUserGroups(
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
      collection(db, "subscriptionPlans"),
      snap => {
        setSubscriptionPlans(
          snap.docs.map(d => ({
            id: d.id,
            ...d.data()
          }))
        );
      }
    );
  }, []);

  /* ---------------- SEARCH ---------------- */
  const filteredCoupons = useMemo(() => {
    let data = [...coupons];

    if (search) {
      data = data.filter((c) =>
        c.code?.toLowerCase().includes(search.toLowerCase())
      );
    }

    return data;
  }, [coupons, search]);

  const totalPages = Math.ceil(filteredCoupons.length / ITEMS_PER_PAGE);

  const paginatedCoupons = filteredCoupons.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  /* ---------------- RESET FORM ---------------- */
  const resetForm = () => {
    setFormData({
      code: "",
      discountType: "percentage",
      discountValue: 0,
      validFrom: "",
      validUntil: "",
      usageLimit: 1,
      usedCount: 0,
      isActive: true,
      userType: "all",
      userIds: [],
      userGroupIds: [],
      subscriptionPlanIds: []   // ✅ ADD
    });
    setEditingCoupon(null);
    setShowModal(false);
  };

  const toggleUser = (userId) => {
    const exists =
      formData.userIds.includes(userId);
    setFormData({
      ...formData,
      userIds: exists
        ? formData.userIds.filter(
          id => id !== userId
        )
        : [...formData.userIds, userId]
    });
  };

  const toggleUserGroup = (groupId) => {
    const exists =
      formData.userGroupIds.includes(groupId);
    setFormData({
      ...formData,
      userGroupIds: exists
        ? formData.userGroupIds.filter(
          id => id !== groupId
        )
        : [...formData.userGroupIds, groupId]
    });
  };

  const togglePlan = (planId) => {
    const exists = formData.subscriptionPlanIds.includes(planId);

    setFormData({
      ...formData,
      subscriptionPlanIds: exists
        ? formData.subscriptionPlanIds.filter(id => id !== planId)
        : [...formData.subscriptionPlanIds, planId]
    });
  };

  /* ---------------- SUBMIT ---------------- */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.code) {
      Swal.fire("Missing Field", "Coupon Code is required", "warning");
      return;
    }

    /* -------- DETERMINE TARGET USERS -------- */

    let finalUsers = [];
    // All users
    if (formData.userType === "all") {
      finalUsers =
        users.map(u => u.id);
    }
    // Specific users
    if (formData.userType === "specific") {
      finalUsers =
        formData.userIds;
    }
    // Group users
    if (formData.userType === "groups") {
      formData.userGroupIds
        .forEach(groupId => {
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

    // Remove duplicates
    finalUsers =
      [...new Set(finalUsers)];

    /* -------- FINAL PAYLOAD -------- */
    const payload = {
      ...formData,
      userIds: finalUsers,
      validFrom:
        formData.validFrom
          ? new Date(formData.validFrom)
          : null,
      validUntil:
        formData.validUntil
          ? new Date(formData.validUntil)
          : null
    };

    if (editingCoupon) {
      await updateDoc(
        doc(db, "coupons", editingCoupon.id),
        payload
      );

      // ✅ LOG UPDATE
      await logActivity({
        actionType: "UPDATE_COUPON",
        description: `Updated coupon: ${formData.code}`,
        entityId: editingCoupon.id,
        entityType: "coupon",
      });

    } else {
      const ref = await addDoc(collection(db, "coupons"), {
        ...payload,
        createdAt: serverTimestamp(),
      });

      // ✅ LOG CREATE
      await logActivity({
        actionType: "CREATE_COUPON",
        description: `Created coupon: ${formData.code}`,
        entityId: ref.id,
        entityType: "coupon",
      });
    }

    Swal.fire({
      icon: "success",
      title: editingCoupon ? "Coupon Updated" : "Coupon Created",
      timer: 1500,
      showConfirmButton: false
    });

    resetForm();
  };

  /* ---------------- DELETE ---------------- */
  const handleDelete = async (id) => {

    const confirm = await Swal.fire({
      title: "Delete Coupon?",
      text: "This action cannot be undone",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it"
    });

    if (!confirm.isConfirmed) return;

    const coupon = coupons.find(c => c.id === id);

    await deleteDoc(doc(db, "coupons", id));

    await logActivity({
      actionType: "DELETE_COUPON",
      description: `Deleted coupon: ${coupon?.code}`,
      entityId: id,
      entityType: "coupon",
    });

    // ✅ SUCCESS ALERT
    Swal.fire({
      icon: "success",
      title: "Deleted!",
      text: "Coupon deleted successfully",
      timer: 1500,
      showConfirmButton: false
    });
  };

  /* ---------------- TOGGLE ACTIVE ---------------- */
  const toggleActive = async (coupon) => {
    await updateDoc(doc(db, "coupons", coupon.id), {
      isActive: !coupon.isActive,
    });

    await logActivity({
      actionType: "TOGGLE_COUPON_STATUS",
      description: `Changed status of coupon ${coupon.code} to ${coupon.isActive ? "Inactive" : "Active"
        }`,
      entityId: coupon.id,
      entityType: "coupon",
    });
  };

  return (
    <div className="p-10 bg-slate-100 min-h-screen">

      {/* HEADER */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">
          Coupons
        </h2>

        <button
          onClick={() => setShowModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg"
        >
          Create Coupon
        </button>
      </div>

      {/* SEARCH */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by coupon code..."
          className="border p-2 rounded w-64"
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-200">
            <tr>
              <th className="p-3">Code</th>
              <th className="p-3">Type</th>
              <th className="p-3">Value</th>
              <th className="p-3">Usage</th>
              <th className="p-3">Validity</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>

          <tbody>
            {paginatedCoupons.map((coupon) => (
              <tr key={coupon.id} className="border-t">
                <td className="p-3 font-medium">{coupon.code}</td>

                <td className="p-3 capitalize">
                  {coupon.discountType}
                </td>

                <td className="p-3">
                  {coupon.discountType === "percentage"
                    ? `${coupon.discountValue}%`
                    : `₹ ${coupon.discountValue}`}
                </td>

                <td className="p-3">
                  {coupon.usedCount || 0} /{" "}
                  {coupon.usageLimit}
                </td>

                <td className="p-3 text-sm">
                  {coupon.validFrom?.toDate?.().toLocaleDateString?.() ||
                    "-"}{" "}
                  →{" "}
                  {coupon.validUntil?.toDate?.().toLocaleDateString?.() ||
                    "-"}
                </td>

                <td className="p-3">
                  <button
                    onClick={() => toggleActive(coupon)}
                    className={`px-3 py-1 rounded-full text-sm ${coupon.isActive
                      ? "bg-green-100 text-green-700"
                      : "bg-red-100 text-red-700"
                      }`}
                  >
                    {coupon.isActive ? "Active" : "Inactive"}
                  </button>
                </td>

                <td className="p-3 space-x-3">
                  <button
                    onClick={() => {
                      setEditingCoupon(coupon);
                      setFormData({
                        ...coupon,
                        subscriptionPlanIds: coupon.subscriptionPlanIds || [], // ✅ FIX
                        validFrom: coupon.validFrom
                          ? coupon.validFrom.toDate().toISOString().split("T")[0]
                          : "",
                        validUntil: coupon.validUntil
                          ? coupon.validUntil.toDate().toISOString().split("T")[0]
                          : "",
                      });
                      setShowModal(true);
                    }}
                    className="text-indigo-600"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => handleDelete(coupon.id)}
                    className="text-red-600"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* PAGINATION */}
      <div className="flex justify-center gap-2 mt-6">
        {Array.from({ length: totalPages }, (_, i) => (
          <button
            key={i}
            onClick={() => setCurrentPage(i + 1)}
            className={`px-3 py-1 rounded ${currentPage === i + 1
              ? "bg-indigo-600 text-white"
              : "bg-white border"
              }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white w-full max-w-2xl rounded-xl shadow-lg flex flex-col max-h-[90vh]">

            <div className="p-6 border-b">
              <h3 className="text-xl font-bold">
                {editingCoupon
                  ? "Edit Coupon"
                  : "Create Coupon"}
              </h3>
            </div>

            <form
              onSubmit={handleSubmit}
              className="p-6 overflow-y-auto space-y-6"
            >

              <div>
                <label className="block font-semibold mb-2">
                  Coupon Code
                </label>
                <input
                  type="text"
                  placeholder="Example: RANK50"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value.toUpperCase(),
                    })
                  }
                  className="w-full border p-3 rounded"
                />
              </div>

              <div>
                <label className="block font-semibold mb-2">
                  Discount Type
                </label>
                <select
                  value={formData.discountType}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discountType: e.target.value,
                    })
                  }
                  className="w-full border p-3 rounded"
                >
                  <option value="percentage">
                    Percentage (%)
                  </option>
                  <option value="flat">
                    Flat Amount (₹)
                  </option>
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-2">
                  Discount Value
                </label>
                <input
                  type="number"
                  value={formData.discountValue}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discountValue: Number(e.target.value),
                    })
                  }
                  className="w-full border p-3 rounded"
                />
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block font-semibold mb-2">
                    Valid From
                  </label>
                  <input
                    type="date"
                    value={formData.validFrom}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        validFrom: e.target.value,
                      })
                    }
                    className="w-full border p-3 rounded"
                  />
                </div>

                <div>
                  <label className="block font-semibold mb-2">
                    Valid Until
                  </label>
                  <input
                    type="date"
                    value={formData.validUntil}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        validUntil: e.target.value,
                      })
                    }
                    className="w-full border p-3 rounded"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold mb-2">
                  Maximum Usage Limit
                </label>
                <input
                  type="number"
                  value={formData.usageLimit}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      usageLimit: Number(e.target.value),
                    })
                  }
                  className="w-full border p-3 rounded"
                />
              </div>

              {/* TARGET USERS */}

              <div>

                <label className="block font-semibold mb-2">
                  Target Users
                </label>

                <div className="flex gap-4 mb-3">

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

                  <label className="block font-medium mb-2">
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
                            formData.userIds.includes(u.id)
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

                  <label className="block font-medium mb-2">
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
                            formData.userGroupIds.includes(group.id)
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

              <div>
                <label className="flex items-center gap-2 font-semibold">
                  <input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        isActive: e.target.checked,
                      })
                    }
                  />
                  Activate Coupon
                </label>
              </div>

              <div>
                <label className="block font-semibold mb-2">
                  Subscription Plans
                </label>

                <div className="max-h-40 overflow-y-auto border p-3 rounded bg-slate-50">

                  {subscriptionPlans.map(plan => (

                    <label
                      key={plan.id}
                      className="flex items-center gap-2 mb-2"
                    >

                      <input
                        type="checkbox"
                        checked={
                          formData.subscriptionPlanIds.includes(plan.id)
                        }
                        onChange={() => togglePlan(plan.id)}
                      />

                      <span>
                        {plan.name}
                      </span>

                    </label>

                  ))}

                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2 border rounded"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="bg-indigo-600 text-white px-6 py-2 rounded"
                >
                  Save Coupon
                </button>
              </div>

            </form>

          </div>
        </div>
      )}
    </div>
  );
}
