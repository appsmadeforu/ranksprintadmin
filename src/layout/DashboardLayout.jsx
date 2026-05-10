import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import rankSprintLogo from "../assets/rankSprintLogo.png";
import UserStaticData from "../pages/UserStaticData";

import {
  LayoutDashboard,
  BookOpen,
  FileText,
  Users,
  LogOut,
  CreditCard,
  Ticket,
  BookText,
  FileUser,
  ClipboardCheck,
  ShieldCheck,
  FileQuestionMark,
  UserCog,
  ChevronLeft,
  ChevronRight,
  SquareUser,
  Bell,
  Logs,
  LibraryBig,
  Settings,
} from "lucide-react";

export default function DashboardLayout() {

  const navigate = useNavigate();
  const location = useLocation();
  const [admin, setAdmin] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  /* 🔐 Load Admin Info */
  useEffect(() => {

    const unsubscribe = onAuthStateChanged(auth, async (user) => {

      if (!user) return;

      const adminDoc = await getDoc(doc(db, "admins", user.uid));

      if (adminDoc.exists()) {
        setAdmin(adminDoc.data());
      }

    });

    return () => unsubscribe();

  }, []);

  const logout = async () => {
    await signOut(auth);
    navigate("/");
  };

  const menuItemClass = (path) =>
    `flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition ${
      location.pathname.includes(path)
        ? "bg-indigo-600 text-white"
        : "text-slate-300 hover:bg-slate-800 hover:text-white"
    }`;

  const hasPermission = (perm) =>
    admin?.role === "superadmin" ||
    admin?.permissions?.includes(perm);

  const menuItems = [
    { perm: "dashboard", path: "/admin", icon: LayoutDashboard, label: "Dashboard" },
    { perm: "exams", path: "/admin/exams", icon: BookOpen, label: "Exams" },
    { perm: "tests", path: "/admin/tests", icon: FileText, label: "Tests" },
    { perm: "pyqs", path: "/admin/pyqs", icon: LibraryBig, label: "PYQs" },
    { perm: "users", path: "/admin/users", icon: Users, label: "Users" },
    { perm: "subscriptions", path: "/admin/plans", icon: CreditCard, label: "Subscription Plans" },
    { perm: "subscriptions", path: "/admin/coupons", icon: Ticket, label: "Coupons" },
    { perm: "exams", path: "/admin/subjects", icon: BookText, label: "Subjects" },
    { perm: "results", path: "/admin/test-attempts", icon: FileUser, label: "Test Attempts" },
    { perm: "results", path: "/admin/users-results", icon: ClipboardCheck, label: "User Results" },
    { perm: "privacy", path: "/admin/policies", icon: ShieldCheck, label: "Policies" },
    { perm: "faq", path: "/admin/help-faq", icon: FileQuestionMark, label: "Help & FAQ" },
    { perm: "user-groups", path: "/admin/user-groups", icon: SquareUser, label: "User Groups" },
    { perm: "notifications", path: "/admin/notifications", icon: Bell, label: "Notifications" },
    { perm: "activity-logs", path: "/admin/activity-logs", icon: Logs, label: "Activity Logs" },
    { perm: "settings", path: "/admin/settings", icon: Settings, label: "Settings" },
    { perm: "staticData", path: "/admin/static-data", icon: Settings, label: "User Static Data" },
    { perm: "reports", path: "/admin/reports-from-users", icon: FileText, label: "User Reports" }
  ];

  return (
    <div className="flex min-h-screen">

      {/* SIDEBAR - FIXED & COLLAPSIBLE */}
      <div
        className={`bg-slate-900 flex flex-col justify-between fixed left-0 top-0 h-screen overflow-y-auto transition-all duration-300 ease-in-out z-0 ${
          sidebarOpen ? "w-72" : "w-20"
        }`}
      >

        {/* LOGO & COLLAPSE BUTTON */}
        <div className={`${sidebarOpen ? "p-4" : "p-0"} border-b border-slate-700 flex justify-between items-center gap-2`}>
          {sidebarOpen && (
            <div className="flex items-center gap-0 flex-1">
              <img src={rankSprintLogo} alt="RankSprint" className="w-12 h-12 flex-shrink-0" />
              <h1 className="text-xl font-bold text-white truncate">
                RankSprintAi
              </h1>
            </div>
          )}
          {!sidebarOpen && (
            <img src={rankSprintLogo} alt="RankSprint" className="w-12 h-10 mx-auto" />
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-slate-400 hover:text-white transition flex-shrink-0"
          >
            {sidebarOpen ? <ChevronLeft size={20} /> : <ChevronRight size={20} />}
          </button>
        </div>

        {/* ADMIN INFO */}
        {sidebarOpen && admin && (
          <div className="px-4 pt-4 pb-2 text-xs text-slate-400">
            {admin.name} ({admin.role})
          </div>
        )}

        {/* NAVIGATION */}
        <nav className={`flex-1 ${sidebarOpen ? "p-4 space-y-2" : "p-2 space-y-3"}`}>
          {menuItems.map((item) => {
            const Icon = item.icon;
            if (!hasPermission(item.perm)) return null;

            return (
              <div
                key={item.path}
                onClick={() => navigate(item.path)}
                className={menuItemClass(item.path)}
                title={!sidebarOpen ? item.label : ""}
              >
                <Icon size={18} className="flex-shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </div>
            );
          })}

          {/* SUPER ADMIN ONLY */}
          {admin?.role === "superadmin" && (
            <div
              onClick={() => navigate("/admin/admins")}
              className={menuItemClass("/admins")}
              title={!sidebarOpen ? "Admin Management" : ""}
            >
              <UserCog size={18} className="flex-shrink-0" />
              {sidebarOpen && <span>Admin Management</span>}
            </div>
          )}
        </nav>

        {/* LOGOUT BUTTON */}
        <div className={sidebarOpen ? "p-4" : "p-3"}>
          <button
            onClick={logout}
            className={`flex items-center justify-center gap-2 w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-lg transition ${
              !sidebarOpen && "p-2"
            }`}
            title={!sidebarOpen ? "Logout" : ""}
          >
            <LogOut size={16} className="flex-shrink-0" />
            {sidebarOpen && <span>Logout</span>}
          </button>
        </div>

      </div>

      {/* MAIN CONTENT - SCROLLABLE WITH DYNAMIC MARGIN */}
      <div
        className={`flex-1 bg-slate-100 overflow-y-auto h-screen transition-all duration-300 ease-in-out ${
          sidebarOpen ? "ml-72" : "ml-20"
        }`}
      >
        <Outlet />
      </div>

    </div>
  );
}
