import { useEffect, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs, doc, setDoc } from "firebase/firestore";
import Swal from "sweetalert2";
import * as XLSX from "xlsx/xlsx.mjs";
import { logActivity } from "../utils/logActivity";

export default function QuotesSettings() {

    const [quotes, setQuotes] = useState([]);
    const [inputValue, setInputValue] = useState("");
    const [docId, setDocId] = useState(null);
    const [editingIndex, setEditingIndex] = useState(null);
    const [editValue, setEditValue] = useState("");
    const [selectedIndexes, setSelectedIndexes] = useState([]);

    /* ---------------- LOAD ---------------- */

    useEffect(() => {

        const fetchQuotes = async () => {

            const snap =
                await getDocs(collection(db, "quotes"));

            if (!snap.empty) {

                const firstDoc = snap.docs[0];

                setDocId(firstDoc.id);

                setQuotes(
                    firstDoc.data().quote_list || []
                );

            }

        };

        fetchQuotes();

    }, []);

    /* ---------------- ADD ---------------- */

    const handleKeyDown = async (e) => {

        if (e.key === "Enter") {

            e.preventDefault();

            const trimmed = inputValue.trim();
            if (!trimmed) return;

            const updated = [
                ...quotes,
                trimmed
            ];

            setQuotes(updated);

            /* SAVE */

            await setDoc(
                doc(db, "quotes", docId),
                { quote_list: updated }
            );

            /* LOG */

            await logActivity({

                actionType: "CREATE_QUOTE",

                description:
                    `Added quote: ${trimmed}`,

                entityId: docId,

                entityType: "quote"

            });

            setInputValue("");

        }

    };

    /* ---------------- DELETE ---------------- */

    const removeQuote = async (index) => {
        const confirm =
            await Swal.fire({
                title: "Delete Quote?",
                text: "This cannot be undone",
                icon: "warning",
                showCancelButton: true
            });
        if (!confirm.isConfirmed) return;
        const quoteText =
            quotes[index];
        const updated =
            quotes.filter((_, i) => i !== index);
        setQuotes(updated);
        /* SAVE */
        await setDoc(
            doc(db, "quotes", docId),
            { quote_list: updated }
        );
        /* LOG */
        await logActivity({
            actionType: "DELETE_QUOTE",
            description:
                `Deleted quote: ${quoteText}`,
            entityId: docId,
            entityType: "quote"
        });

        Swal.fire(
            "Deleted",
            "Quote removed",
            "success"
        );
    };

    /* ---------------- BULK DELETE ---------------- */

    const bulkDeleteQuotes = async () => {
        if (!selectedIndexes.length)
            return Swal.fire(
                "No Selection",
                "Select quotes to delete",
                "warning"
            );
        const confirm =
            await Swal.fire({
                title: `Delete ${selectedIndexes.length} quotes?`,
                text: "This cannot be undone",
                icon: "warning",
                showCancelButton: true
            });
        if (!confirm.isConfirmed) return;
        const deletedQuotes =
            selectedIndexes.map(i => quotes[i]);
        const updated =
            quotes.filter(
                (_, i) =>
                    !selectedIndexes.includes(i)
            );
        setQuotes(updated);
        setSelectedIndexes([]);
        /* SAVE */
        await setDoc(
            doc(db, "quotes", docId),
            { quote_list: updated }
        );
        /* LOG */
        await logActivity({
            actionType: "BULK_DELETE_QUOTES",
            description:
                `Deleted ${deletedQuotes.length} quotes`,
            entityId: docId,
            entityType: "quote"
        });
        Swal.fire(
            "Deleted",
            `${deletedQuotes.length} quotes removed`,
            "success"
        );
    };

    /* ---------------- EDIT ---------------- */

    const startEdit = (index) => {
        setEditingIndex(index);
        setEditValue(quotes[index]);
    };

    const saveEdit = async () => {
        if (!editValue.trim()) return;
        const updated = [...quotes];
        updated[editingIndex] =
            editValue.trim();
        setQuotes(updated);
        await setDoc(
            doc(db, "quotes", docId),
            { quote_list: updated }
        );
        await logActivity({
            actionType: "UPDATE_QUOTE",
            description:
                `Updated quote at position ${editingIndex + 1}`,
            entityId: docId,
            entityType: "quote"
        });
        setEditingIndex(null);
        setEditValue("");
    };

    const cancelEdit = () => {
        setEditingIndex(null);
        setEditValue("");
    };

    /* ---------------- SELECT ---------------- */

    const toggleSelect = (index) => {
        setSelectedIndexes(prev =>
            prev.includes(index)
                ? prev.filter(i => i !== index)
                : [...prev, index]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIndexes.length === quotes.length) {
            setSelectedIndexes([]);
        } else {
            setSelectedIndexes(
                quotes.map((_, i) => i)
            );
        }
    };

    /* ---------------- EXCEL IMPORT ---------------- */

    const handleExcelUpload = async (e) => {

        try {

            const file = e.target.files[0];
            if (!file) return;

            const data =
                await file.arrayBuffer();

            const workbook =
                XLSX.read(data);

            const sheet =
                workbook.Sheets[
                workbook.SheetNames[0]
                ];

            const json =
                XLSX.utils.sheet_to_json(sheet);

            if (!json.length)
                return Swal.fire(
                    "Error",
                    "Excel empty",
                    "error"
                );

            const newQuotes =
                json
                    .map(row =>
                        row.Quote?.toString().trim()
                    )
                    .filter(q => q);

            if (!newQuotes.length)
                return Swal.fire(
                    "Error",
                    "Column must be 'Quote'",
                    "error"
                );

            const updatedQuotes = [
                ...quotes,
                ...newQuotes
            ];

            setQuotes(updatedQuotes);

            /* SAVE */

            let currentDocId = docId;

            if (!currentDocId) {

                const newDocRef =
                    doc(collection(db, "quotes"));

                await setDoc(
                    newDocRef,
                    { quote_list: updatedQuotes }
                );

                currentDocId = newDocRef.id;
                setDocId(currentDocId);

            }

            else {

                await setDoc(
                    doc(db, "quotes", currentDocId),
                    { quote_list: updatedQuotes }
                );

            }

            /* LOG */

            await logActivity({

                actionType: "BULK_UPLOAD_QUOTES",

                description:
                    `Uploaded ${newQuotes.length} quotes via Excel`,

                entityId: currentDocId,

                entityType: "quote"

            });

            Swal.fire(
                "Success",
                `${newQuotes.length} quotes uploaded`,
                "success"
            );

        }

        catch (err) {

            console.error(err);

            Swal.fire(
                "Error",
                err.message || "Excel failed",
                "error"
            );

        }

    };

    /* ---------------- UI ---------------- */

    return (

        <div className="bg-white p-6 rounded-xl shadow h-[600px] flex flex-col">

            <h3 className="text-lg font-semibold mb-4">
                Daily Quotes Settings
            </h3>

            <div className="flex gap-3 mb-4 items-center">

                <input
                    type="text"
                    placeholder="Type quote and press Enter..."
                    className="border p-3 rounded w-full"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                />

                <label className="bg-blue-600 text-white px-4 py-2 rounded cursor-pointer whitespace-nowrap">

                    Upload Excel

                    <input
                        type="file"
                        hidden
                        accept=".xlsx"
                        onChange={handleExcelUpload}
                    />

                </label>

                <button
                    onClick={bulkDeleteQuotes}
                    className="bg-red-600 text-white px-4 py-2 rounded whitespace-nowrap"
                >
                    Bulk Delete
                </button>

            </div>

            <div className="flex-1 overflow-y-auto border rounded">

                <table className="w-full">

                    <thead className="bg-slate-200 sticky top-0">

                        <tr>
                            <th className="p-3 w-[50px]">
                                <input
                                    type="checkbox"
                                    checked={
                                        selectedIndexes.length === quotes.length &&
                                        quotes.length > 0
                                    }
                                    onChange={toggleSelectAll}
                                />
                            </th>
                            <th className="p-3 w-[60px]">#</th>
                            <th className="p-3 text-left">Quote</th>
                            <th className="p-3 w-[180px]">Actions</th>
                        </tr>

                    </thead>

                    <tbody>

                        {quotes.map((quote, index) => (

                            <tr key={index} className="border-t">

                                <td className="p-3 text-center">
                                    <input
                                        type="checkbox"
                                        checked={
                                            selectedIndexes.includes(index)
                                        }
                                        onChange={() =>
                                            toggleSelect(index)
                                        }
                                    />
                                </td>

                                <td className="p-3 text-center">
                                    {index + 1}
                                </td>

                                <td className="p-3">

                                    {editingIndex === index ?

                                        <input
                                            className="border p-2 rounded w-full"
                                            value={editValue}
                                            onChange={(e) => setEditValue(e.target.value)}
                                        />

                                        :

                                        quote

                                    }

                                </td>

                                <td className="p-3 text-center space-x-2">

                                    {editingIndex === index ?

                                        <>

                                            <button
                                                onClick={saveEdit}
                                                className="text-green-600"
                                            >
                                                Save
                                            </button>

                                            <button
                                                onClick={cancelEdit}
                                                className="text-gray-600"
                                            >
                                                Cancel
                                            </button>

                                        </>

                                        :

                                        <>

                                            <button
                                                onClick={() => startEdit(index)}
                                                className="text-indigo-600"
                                            >
                                                Edit
                                            </button>

                                            <button
                                                onClick={() => removeQuote(index)}
                                                className="text-red-600"
                                            >
                                                Delete
                                            </button>

                                        </>

                                    }

                                </td>

                            </tr>

                        ))}

                    </tbody>

                </table>

            </div>

        </div>

    );

}
