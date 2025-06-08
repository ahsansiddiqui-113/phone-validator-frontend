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
    accept: ['.csv', '.xlsx'],
    multiple: false,
  });

  return (
    <div {...getRootProps()} className="border border-primary p-4 mb-3 text-center rounded">
      <input {...getInputProps()} />
      <p>📂 Drag & drop CSV or XLSX file here, or click to select</p>
    </div>
  );
}

export default FileUpload;
