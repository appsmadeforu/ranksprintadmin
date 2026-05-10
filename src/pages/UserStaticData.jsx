import { useEffect, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { logActivity } from "../utils/logActivity";
import { Save, RotateCcw, X, Upload } from "lucide-react";
import Swal from "sweetalert2";
import * as XLSX from "xlsx";

export default function UserStaticData() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [schools, setSchools] = useState([]);
  const [schoolInput, setSchoolInput] = useState("");
  const [showSchoolInput, setShowSchoolInput] = useState(false);

  const [mediums, setMediums] = useState([]);
  const [mediumInput, setMediumInput] = useState("");
  const [showMediumInput, setShowMediumInput] = useState(false);

  const [classes, setClasses] = useState([]);
  const [classInput, setClassInput] = useState("");
  const [showClassInput, setShowClassInput] = useState(false);

  const [sources, setSources] = useState([]);
  const [sourceInput, setSourceInput] = useState("");
  const [showSourceInput, setShowSourceInput] = useState(false);

  const [initialData, setInitialData] = useState(null);

  /* ---------------- FETCH STATIC DATA ---------------- */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const snap = await getDoc(doc(db, "staticData", "config"));
        if (snap.exists()) {
          setSchools(snap.data().schools || []);
          setMediums(snap.data().mediums || []);
          setClasses(snap.data().classes || []);
          setSources(snap.data().sources || []);
          setInitialData(snap.data());
        }
        setLoading(false);
      } catch (err) {
        Swal.fire("Error", "Failed to load data: " + err.message, "error");
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  /* ============ SCHOOLS ============ */
  const handleAddSchool = () => {
    if (!schoolInput.trim()) {
      alert("Please enter school name");
      return;
    }
    if (!schools.includes(schoolInput)) {
      setSchools([...schools, schoolInput]);
      setSchoolInput("");
      setShowSchoolInput(false);
    }
  };

  const handleRemoveSchool = (school) => {
    setSchools(schools.filter(s => s !== school));
  };

  /* ============ MEDIUMS ============ */
  const handleAddMedium = () => {
    if (!mediumInput.trim()) {
      alert("Please enter medium");
      return;
    }
    if (!mediums.includes(mediumInput)) {
      setMediums([...mediums, mediumInput]);
      setMediumInput("");
      setShowMediumInput(false);
    }
  };

  const handleRemoveMedium = (medium) => {
    setMediums(mediums.filter(m => m !== medium));
  };

  /* ============ CLASSES ============ */
  const handleAddClass = () => {
    if (!classInput.trim()) {
      alert("Please enter class");
      return;
    }
    if (!classes.includes(classInput)) {
      setClasses([...classes, classInput]);
      setClassInput("");
      setShowClassInput(false);
    }
  };

  const handleRemoveClass = (classItem) => {
    setClasses(classes.filter(c => c !== classItem));
  };

  /* ============ SOURCES ============ */
  const handleAddSource = () => {
    if (!sourceInput.trim()) {
      alert("Please enter source");
      return;
    }
    if (!sources.includes(sourceInput)) {
      setSources([...sources, sourceInput]);
      setSourceInput("");
      setShowSourceInput(false);
    }
  };

  const handleRemoveSource = (source) => {
    setSources(sources.filter(s => s !== source));
  };

  /* ============ BULK UPLOAD ============ */
  const handleBulkUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (!rows || rows.length === 0) {
        Swal.fire("Error", "Excel file is empty", "error");
        return;
      }

      // Known headers to skip
      const headerMap = {
        schools: "Schools",
        mediums: "Mediums",
        classes: "Classes/Grades",
        sources: "How Did You Know About App (Sources)"
      };

      // Extract non-empty values from first column, skip header row
      let newItems = rows
        .map(row => row[0])
        .filter(item => item && String(item).trim());

      // Remove header if it matches the type's header
      if (newItems.length > 0 && newItems[0] === headerMap[type]) {
        newItems = newItems.slice(1);
      }

      if (newItems.length === 0) {
        Swal.fire("Error", "No valid items found in Excel", "error");
        return;
      }

      if (type === "schools") {
        setSchools([...new Set([...schools, ...newItems])]);
        Swal.fire("Success", `Added ${newItems.length} schools`, "success");
      } else if (type === "mediums") {
        setMediums([...new Set([...mediums, ...newItems])]);
        Swal.fire("Success", `Added ${newItems.length} mediums`, "success");
      } else if (type === "classes") {
        setClasses([...new Set([...classes, ...newItems])]);
        Swal.fire("Success", `Added ${newItems.length} classes`, "success");
      } else if (type === "sources") {
        setSources([...new Set([...sources, ...newItems])]);
        Swal.fire("Success", `Added ${newItems.length} sources`, "success");
      }

      // Reset file input
      e.target.value = "";
    } catch (err) {
      Swal.fire("Error", "Failed to parse Excel: " + err.message, "error");
    }
  };

  /* ============ DOWNLOAD TEMPLATE ============ */
  const downloadTemplate = (type) => {
    let data = [];
    let filename = "";

    if (type === "schools") {
      data = schools.length > 0 ? schools : ["Bal Vikas Vidyalaya", "DAV", "DPS", "St. Joseph"];
      filename = "schools_template.xlsx";
    } else if (type === "mediums") {
      data = mediums.length > 0 ? mediums : ["Hindi", "English", "Marathi", "Urdu"];
      filename = "mediums_template.xlsx";
    } else if (type === "classes") {
      data = classes.length > 0 ? classes : ["Class 1", "Class 2", "Class 3", "Class 4"];
      filename = "classes_template.xlsx";
    } else if (type === "sources") {
      data = sources.length > 0 ? sources : ["Via LinkedIn", "Via Friend", "Via Family", "Via Social Media"];
      filename = "sources_template.xlsx";
    }

    const worksheet = XLSX.utils.aoa_to_sheet(data.map(item => [item]));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, filename);
  };

  /* ---------------- SAVE DATA ---------------- */
  const handleSave = async () => {
    try {
      setSaving(true);

      await setDoc(doc(db, "staticData", "config"), {
        schools,
        mediums,
        classes,
        sources,
        updatedAt: serverTimestamp()
      });

      await logActivity({
        actionType: "UPDATE_STATIC_DATA",
        description: "Updated user static data configuration",
        entityId: "config",
        entityType: "staticData"
      });

      Swal.fire("Success", "Static data saved successfully", "success");
      setInitialData({ schools, mediums, classes, sources });
    } catch (err) {
      Swal.fire("Error", "Failed to save: " + err.message, "error");
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- RESET DATA ---------------- */
  const handleReset = () => {
    if (initialData) {
      setSchools(initialData.schools || []);
      setMediums(initialData.mediums || []);
      setClasses(initialData.classes || []);
      setSources(initialData.sources || []);
    }
  };

  if (loading) return <div className="p-10">Loading...</div>;

  return (
    <div className="p-10 bg-slate-100 min-h-screen">

      <div className="flex justify-between items-center mb-8">
        <h2 className="text-3xl font-bold">User Static Data</h2>
        <div className="flex gap-3">
          <button
            onClick={handleReset}
            className="flex items-center gap-2 bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg transition font-medium"
          >
            <RotateCcw size={18} />
            Reset
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg transition font-medium disabled:opacity-50"
          >
            <Save size={18} />
            Save Changes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ============ SCHOOLS ============ */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-semibold mb-4">Schools</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add schools that users can select from. Users can also enter custom school names.
          </p>

          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {schools.map((school, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center bg-slate-50 p-3 rounded border"
              >
                <span>{school}</span>
                <button
                  onClick={() => handleRemoveSchool(school)}
                  className="text-red-600 hover:text-red-800"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          {!showSchoolInput ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowSchoolInput(true)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium"
              >
                + Add School
              </button>
              <button
                onClick={() => downloadTemplate("schools")}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
              >
                Download Template
              </button>
              <label className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-medium cursor-pointer flex items-center justify-center gap-2">
                <Upload size={18} />
                Upload Excel
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => handleBulkUpload(e, "schools")}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter school name"
                value={schoolInput}
                onChange={(e) => setSchoolInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddSchool()}
                className="flex-1 border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                autoFocus
              />
              <button
                onClick={handleAddSchool}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowSchoolInput(false);
                  setSchoolInput("");
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ============ MEDIUMS ============ */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-semibold mb-4">Mediums</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add mediums available for users to choose from.
          </p>

          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {mediums.map((medium, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center bg-slate-50 p-3 rounded border"
              >
                <span>{medium}</span>
                <button
                  onClick={() => handleRemoveMedium(medium)}
                  className="text-red-600 hover:text-red-800"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          {!showMediumInput ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowMediumInput(true)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium"
              >
                + Add Medium
              </button>
              <button
                onClick={() => downloadTemplate("mediums")}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
              >
                Download Template
              </button>
              <label className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-medium cursor-pointer flex items-center justify-center gap-2">
                <Upload size={18} />
                Upload Excel
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => handleBulkUpload(e, "mediums")}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter medium (e.g., English, Hindi)"
                value={mediumInput}
                onChange={(e) => setMediumInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddMedium()}
                className="flex-1 border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                autoFocus
              />
              <button
                onClick={handleAddMedium}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowMediumInput(false);
                  setMediumInput("");
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ============ CLASSES ============ */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-semibold mb-4">Classes/Grades</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add classes/grades available for users to choose from.
          </p>

          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {classes.map((classItem, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center bg-slate-50 p-3 rounded border"
              >
                <span>{classItem}</span>
                <button
                  onClick={() => handleRemoveClass(classItem)}
                  className="text-red-600 hover:text-red-800"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          {!showClassInput ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowClassInput(true)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium"
              >
                + Add Class
              </button>
              <button
                onClick={() => downloadTemplate("classes")}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
              >
                Download Template
              </button>
              <label className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-medium cursor-pointer flex items-center justify-center gap-2">
                <Upload size={18} />
                Upload Excel
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => handleBulkUpload(e, "classes")}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter class (e.g., Class 1, Grade 9)"
                value={classInput}
                onChange={(e) => setClassInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddClass()}
                className="flex-1 border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                autoFocus
              />
              <button
                onClick={handleAddClass}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowClassInput(false);
                  setClassInput("");
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* ============ SOURCES ============ */}
        <div className="bg-white p-6 rounded-xl shadow">
          <h3 className="text-lg font-semibold mb-4">How Did You Know About App (Sources)</h3>
          <p className="text-sm text-gray-600 mb-4">
            Add options that users can select from when asked how they found out about the app.
          </p>

          <div className="space-y-2 mb-4 max-h-48 overflow-y-auto">
            {sources.map((source, idx) => (
              <div
                key={idx}
                className="flex justify-between items-center bg-slate-50 p-3 rounded border"
              >
                <span>{source}</span>
                <button
                  onClick={() => handleRemoveSource(source)}
                  className="text-red-600 hover:text-red-800"
                >
                  <X size={18} />
                </button>
              </div>
            ))}
          </div>

          {!showSourceInput ? (
            <div className="flex gap-2">
              <button
                onClick={() => setShowSourceInput(true)}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded font-medium"
              >
                + Add Source
              </button>
              <button
                onClick={() => downloadTemplate("sources")}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-medium"
              >
                Download Template
              </button>
              <label className="flex-1 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded font-medium cursor-pointer flex items-center justify-center gap-2">
                <Upload size={18} />
                Upload Excel
                <input
                  type="file"
                  accept=".xlsx, .xls"
                  onChange={(e) => handleBulkUpload(e, "sources")}
                  className="hidden"
                />
              </label>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Enter source (e.g., Google, Instagram, Friends)"
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAddSource()}
                className="flex-1 border p-2 rounded focus:outline-none focus:ring-2 focus:ring-indigo-600"
                autoFocus
              />
              <button
                onClick={handleAddSource}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-medium"
              >
                Add
              </button>
              <button
                onClick={() => {
                  setShowSourceInput(false);
                  setSourceInput("");
                }}
                className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

      </div>

      {/* INFO BOX */}
      <div className="mt-8 bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <p className="text-sm text-blue-800">
          <strong>ℹ️ Note:</strong> These settings define the options available to users in the mobile app. 
          You can add, edit, or remove Schools, Mediums, Classes, and Sources as needed.
        </p>
      </div>

    </div>
  );
}
