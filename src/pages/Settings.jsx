import { useState } from "react";
import QuotesSettings from "./QuotesSettings";
import FeaturedContentSettings from "./FeaturedContentSettings";

export default function Settings() {

  const [activeTab, setActiveTab] = useState("quotes");

  return (

    <div className="p-8 bg-slate-100 min-h-screen">

      <h2 className="text-2xl font-bold mb-6">
        Settings
      </h2>

      {/* NAV BAR */}

      <div className="flex gap-4 mb-6">

        <button
          onClick={() => setActiveTab("quotes")}
          className={`px-4 py-2 rounded ${
            activeTab === "quotes"
              ? "bg-indigo-600 text-white"
              : "bg-white border"
          }`}
        >
          Quotes
        </button>

        {/* NEW TAB */}

        <button
          onClick={() => setActiveTab("featured")}
          className={`px-4 py-2 rounded ${
            activeTab === "featured"
              ? "bg-indigo-600 text-white"
              : "bg-white border"
          }`}
        >
          Featured Content
        </button>

      </div>

      {/* TAB CONTENT */}

      {activeTab === "quotes" && (
        <QuotesSettings />
      )}

      {activeTab === "featured" && (
        <FeaturedContentSettings />
      )}

    </div>

  );

}
