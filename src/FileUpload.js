import React from 'react';
import { useDropzone } from 'react-dropzone';

function FileUpload({ onUpload }) {
  const onDrop = (acceptedFiles) => {
    if (acceptedFiles.length > 0) {
      onUpload(acceptedFiles[0]);
    }
  };

  const { getRootProps, getInputProps } = useDropzone({
    onDrop,
    accept: ['.pdf', '.docx', '.csv', '.xlsx'],
    multiple: false,
  });

  return (
    <div {...getRootProps()} className="dropzone">
      <input {...getInputProps()} />
      <p>📂 Drag & drop a file here, or click to select (PDF, DOCX, CSV, XLSX)</p>
    </div>
  );
}

export default FileUpload;
