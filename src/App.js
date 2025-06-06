import React, { useState } from 'react';
import PhoneForm from './PhoneForm';
import FileUpload from './FileUpload';
import './App.css';
import { saveAs } from 'file-saver';
import Papa from 'papaparse';

function App() {
  const [results, setResults] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handlePhoneValidation = async (phone) => {
    const res = await fetch('http://localhost:5000/api/validate-phone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    setResults(data);
  };

  const handleFileUpload = async (file) => {
    const formData = new FormData();
    formData.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', 'http://localhost:5000/api/upload-file');

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      const response = JSON.parse(xhr.responseText);
      setResults(response);
      setUploadProgress(0); // Reset after done
    };

    xhr.onerror = () => {
      console.error('Upload failed');
      setUploadProgress(0);
    };

    xhr.send(formData);
  };

  const handleExportCSV = () => {
    if (!results || !results.results) return;

    const csv = Papa.unparse(results.results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    saveAs(blob, 'validated-results.csv');
  };

  return (
    <div className="container">
      <h1>📱 Phone Validator</h1>
      <PhoneForm onValidate={handlePhoneValidation} />
      <FileUpload onUpload={handleFileUpload} />

      {uploadProgress > 0 && (
        <div style={{ marginTop: '10px' }}>
          <strong>Uploading: {uploadProgress}%</strong>
          <div style={{ background: '#eee', height: '10px', borderRadius: '4px', overflow: 'hidden' }}>
            <div
              style={{
                width: `${uploadProgress}%`,
                background: '#007bff',
                height: '100%',
                transition: 'width 0.3s'
              }}
            ></div>
          </div>
        </div>
      )}

      {results && !results.results && (
        <div className="results">
          <h2>Phone Validation Result:</h2>
          <ul>
            <li><strong>Valid:</strong> {results.valid ? '✅ Yes' : '❌ No'}</li>
            {results.valid && (
              <>
                <li><strong>Country:</strong> {results.country}</li>
                <li><strong>Formatted:</strong> {results.formatted}</li>
                <li><strong>Type:</strong> {results.type || 'N/A'}</li>
              </>
            )}
          </ul>
        </div>
      )}

      {results && results.results && (
        <div>
          <div className="results">
            <h2>📂 File Validation Results ({results.count} found):</h2>
            <button onClick={handleExportCSV} className="button" style={{ marginBottom: '10px' }}>
              📥 Export as CSV
            </button>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>Input</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>Valid</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>Country</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>Formatted</th>
                  <th style={{ border: '1px solid #ccc', padding: '8px' }}>Type</th>
                </tr>
              </thead>
              <tbody>
                {results.results.map((item, index) => (
                  <tr key={index}>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{item.input}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>
                      {item.valid ? '✅' : '❌'}
                    </td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{item.country || '-'}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{item.formatted || '-'}</td>
                    <td style={{ border: '1px solid #ccc', padding: '8px' }}>{item.type || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
