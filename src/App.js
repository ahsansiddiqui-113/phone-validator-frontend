import React, { useState, useRef } from 'react';
import { Upload, Phone, Download, FileText, CheckCircle, XCircle, Loader2 } from 'lucide-react';

const PhoneValidator = () => {
  const [singlePhone, setSinglePhone] = useState('');
  const [singleResult, setSingleResult] = useState(null);
  const [bulkResults, setBulkResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingProgress, setProcessingProgress] = useState(0);
  const fileInputRef = useRef(null);

  const API_BASE = 'http://localhost:5000/api';

  // Validate single phone number
  const validateSinglePhone = async () => {
    if (!singlePhone.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/validate-single`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ phoneNumber: singlePhone }),
      });
      
      const result = await response.json();
      setSingleResult(result);
    } catch (error) {
      console.error('Error validating phone:', error);
      setSingleResult({ error: 'Failed to validate phone number' });
    } finally {
      setLoading(false);
    }
  };

  // Handle bulk file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = [
      'text/csv',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ];
    
    if (!allowedTypes.includes(file.type)) {
      alert('Please upload a CSV or Excel file');
      return;
    }

    setBulkLoading(true);
    setUploadProgress(0);
    setProcessingProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch(`${API_BASE}/validate-bulk`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              
              if (data.type === 'progress') {
                setProcessingProgress(data.progress);
              } else if (data.type === 'result') {
                setBulkResults(data.data);
              }
            } catch (e) {
              console.error('Error parsing SSE data:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Failed to process file');
    } finally {
      setBulkLoading(false);
      setUploadProgress(0);
      setProcessingProgress(0);
    }
  };

  // Download results as CSV
  const downloadResults = () => {
    if (!bulkResults || !bulkResults.results) return;

    const csvContent = [
      'Phone Number,Type,Country,Valid',
      ...bulkResults.results.map(r => 
        `"${r.phoneNumber}","${r.type}","${r.country}",${r.valid}`
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'phone_validation_results.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">Phone Number Validator</h1>
          <p className="text-gray-600">Validate phone numbers individually or in bulk from CSV/Excel files</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Single Phone Validation */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Phone className="w-6 h-6 text-blue-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-800">Single Phone Validation</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <input
                  type="text"
                  value={singlePhone}
                  onChange={(e) => setSinglePhone(e.target.value)}
                  placeholder="Enter phone number (e.g., +1 773-776-5277)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => e.key === 'Enter' && validateSinglePhone()}
                />
              </div>
              
              <button
                onClick={validateSinglePhone}
                disabled={loading || !singlePhone.trim()}
                className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    Validating...
                  </>
                ) : (
                  'Validate Phone Number'
                )}
              </button>

              {singleResult && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  {singleResult.error ? (
                    <div className="text-red-600 flex items-center">
                      <XCircle className="w-5 h-5 mr-2" />
                      {singleResult.error}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-center">
                        {singleResult.valid ? (
                          <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 mr-2" />
                        )}
                        <span className="font-medium">
                          {singleResult.valid ? 'Valid' : 'Invalid'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div><strong>Phone:</strong> {singleResult.phoneNumber}</div>
                        <div><strong>Type:</strong> {singleResult.type}</div>
                        <div><strong>Country:</strong> {singleResult.country}</div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Bulk File Upload */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <div className="flex items-center mb-4">
              <Upload className="w-6 h-6 text-green-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-800">Bulk Validation</h2>
            </div>
            
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-green-500 cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">
                  Click to upload CSV or Excel file
                </p>
                <p className="text-sm text-gray-500">
                  Supports files up to 50GB+
                </p>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />

              {bulkLoading && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm text-gray-600">
                    <span>Processing...</span>
                    <span>{processingProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-green-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${processingProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}

              {bulkResults && (
                <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <h3 className="font-semibold mb-2">Validation Results</h3>
                    <div className="text-sm text-gray-600 space-y-1">
                      <div><strong>Total Numbers:</strong> {bulkResults.count}</div>
                      <div><strong>Valid:</strong> {bulkResults.results.filter(r => r.valid).length}</div>
                      <div><strong>Invalid:</strong> {bulkResults.results.filter(r => !r.valid).length}</div>
                    </div>
                  </div>
                  
                  <button
                    onClick={downloadResults}
                    className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 flex items-center justify-center"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download Results CSV
                  </button>

                  <div className="max-h-60 overflow-y-auto">
                    <div className="space-y-2">
                      {bulkResults.results.slice(0, 10).map((result, index) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <span className="text-sm">{result.phoneNumber}</span>
                          <div className="flex items-center">
                            {result.valid ? (
                              <CheckCircle className="w-4 h-4 text-green-600" />
                            ) : (
                              <XCircle className="w-4 h-4 text-red-600" />
                            )}
                          </div>
                        </div>
                      ))}
                      {bulkResults.results.length > 10 && (
                        <div className="text-sm text-gray-500 text-center">
                          And {bulkResults.results.length - 10} more results...
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PhoneValidator;