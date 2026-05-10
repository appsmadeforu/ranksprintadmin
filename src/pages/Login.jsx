import { useState } from "react";
import {
  signInWithEmailAndPassword,
  signOut
} from "firebase/auth";
import { auth } from "../firebase";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      // 🔐 CHECK IF USER EXISTS IN ADMINS COLLECTION
      const adminDoc = await getDoc(doc(db, "admins", user.uid));

      if (!adminDoc.exists()) {
        await signOut(auth);
        alert("You are not authorized to access admin panel.");
        setLoading(false);
        return;
      }

      const adminData = adminDoc.data();

      // ✅ REDIRECT BASED ON ROLE & PERMISSIONS
      if (adminData.role === "superadmin") {
        // Superadmin has all access - redirect to Dashboard
        navigate("/admin");
      } else if (adminData.role === "editor") {
        // Editor - check if has dashboard permission
        if (adminData.permissions?.includes("dashboard")) {
          navigate("/admin");
        } else {
          // If no dashboard access, redirect to first available page
          const availablePages = [
            { perm: "exams", path: "/admin/exams" },
            { perm: "tests", path: "/admin/tests" },
            { perm: "pyqs", path: "/admin/pyqs" },
            { perm: "questions", path: "/admin/questions" },
            { perm: "users", path: "/admin/users" },
            { perm: "results", path: "/admin/results" },
            { perm: "subscriptions", path: "/admin/subscriptions" },
            { perm: "notifications", path: "/admin/notifications" },
            { perm: "user-groups", path: "/admin/user-groups" },
            { perm: "staticData", path: "/admin/static-data" },
            { perm: "settings", path: "/admin/settings" },
            { perm: "activity-logs", path: "/admin/activity-logs" }
          ];

          const firstAvailable = availablePages.find(page =>
            adminData.permissions?.includes(page.perm)
          );

          if (firstAvailable) {
            navigate(firstAvailable.path);
          } else {
            await signOut(auth);
            alert("You do not have access to any admin pages.");
            setLoading(false);
            return;
          }
        }
      } else {
        await signOut(auth);
        alert("Invalid admin role.");
        setLoading(false);
        return;
      }

    } catch (err) {
      alert(err.message);
    }

    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600">
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white/20 backdrop-blur-xl p-10 rounded-2xl shadow-2xl w-96 text-white"
      >
        <h2 className="text-3xl font-bold mb-6 text-center">
          RankSprintAi Admin Login
        </h2>

        <form onSubmit={handleLogin} className="space-y-4">

          <input
            type="email"
            placeholder="Email"
            required
            className="w-full p-3 rounded-lg bg-white/30 placeholder-white focus:outline-none"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            type="password"
            placeholder="Password"
            required
            className="w-full p-3 rounded-lg bg-white/30 placeholder-white focus:outline-none"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            disabled={loading}
            className="w-full bg-white text-indigo-600 p-3 rounded-lg font-semibold hover:scale-105 transition disabled:opacity-60"
          >
            {loading ? "Checking..." : "Login"}
          </button>

        </form>

      </motion.div>
    </div>
  );
}