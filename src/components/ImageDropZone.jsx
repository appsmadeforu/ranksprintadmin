import { useRef } from "react";

export default function ImageDropZone({ image, setImage, label }) {
    const inputRef = useRef();

    const handleDrop = (e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith("image/")) {
            setImage(file);
        }
    };

    const handlePaste = (e) => {
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.type.indexOf("image") !== -1) {
                const file = item.getAsFile();
                setImage(file);
            }
        }
    };

    const handleChange = (e) => {
        const file = e.target.files[0];
        if (file) setImage(file);
    };

    const preview = image ? URL.createObjectURL(image) : null;

    return (
        <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onPaste={handlePaste}
            className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-indigo-500 transition relative"
            onClick={() => inputRef.current.click()}
        >
            <input
                type="file"
                accept="image/*"
                ref={inputRef}
                hidden
                onChange={handleChange}
            />

            {preview ? (
                <div className="relative inline-block">
                    <img
                        src={preview}
                        alt="preview"
                        className="max-h-48 mx-auto rounded"
                    />

                    {/* REMOVE BUTTON */}
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setImage(null);
                        }}
                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-700"
                    >
                        ✕
                    </button>
                </div>
            ) : (
                <p className="text-gray-500">
                    Drag & Drop image here
                    <br />
                    or Click to Upload
                    <br />
                    or Press <b>Ctrl + V</b> to Paste
                </p>
            )}

            {label && (
                <p className="text-sm text-gray-400 mt-2">{label}</p>
            )}
        </div>
    );
}
