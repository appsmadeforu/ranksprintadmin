import { Routes, Route } from "react-router-dom";

import Login from "./pages/Login";
import DashboardLayout from "./layout/DashboardLayout";

import Dashboard from "./pages/Dashboard";
import Exams from "./pages/Exams";
import Tests from "./pages/Tests";
import TestEditor from "./pages/TestEditor";
import Users from "./pages/Users";
import SubscriptionPlans from "./pages/SubscriptionPlans";
import Coupons from "./pages/Coupons";
import SubjectsManager from "./pages/SubjectsManager";
import TestAttempts from "./pages/TestAttempts";
import UserResults from "./pages/UserResults";
import PoliciesManager from "./pages/PoliciesManager";
import HelpFaqManager from "./pages/HelpFaqManager";
import AdminManager from "./pages/AdminManager";
import UserGroups from "./pages/UserGroups";
import NotificationManager from "./pages/NotificationManager";
import ActivityLogs from "./pages/ActivityLogs";
import PyqsPage from "./pages/PyqsPage";
import Settings from "./pages/Settings";
import UserStaticData from "./pages/UserStaticData";
import ReportFromUsers from "./pages/ReportFromUsers";

import ProtectedRoute from "./components/ProtectedRoute";

export default function App() {
  return (
    <Routes>

      {/* 🔐 Public Route */}
      <Route path="/" element={<Login />} />

      {/* 🔐 Protected Admin Area */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="exams" element={<Exams />} />
        <Route path="tests" element={<Tests />} />
        <Route path="users" element={<Users />} />
        <Route path="plans" element={<SubscriptionPlans />} />
        <Route path="coupons" element={<Coupons />} />
        <Route path="subjects" element={<SubjectsManager />} />
        <Route path="test-attempts" element={<TestAttempts />} />
        <Route path="users-results" element={<UserResults />} />
        <Route path="policies" element={<PoliciesManager />} />
        <Route path="help-faq" element={<HelpFaqManager />} />
        <Route path="user-groups" element={<UserGroups />} />
        <Route path="notifications" element={<NotificationManager />} />
        <Route path="activity-logs" element={<ActivityLogs />} />
        <Route path="pyqs" element={<PyqsPage />} />
        <Route path="settings" element={<Settings />} />
        <Route path="reports-from-users" element={<ReportFromUsers />} />
        {/* 👑 Super Admin Only */}
        <Route path="admins" element={<AdminManager />} />
        <Route path="exams/:examId/tests/:testId" element={<TestEditor />} />
        <Route
          path="/admin/static-data"
          element={
            <ProtectedRoute requiredPermission="staticData">
              <UserStaticData />
            </ProtectedRoute>
          }
        />
      </Route>

    </Routes>
  );
}