// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/phone_validator', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Phone validation schema
const validationSchema = new mongoose.Schema({
  phoneNumber: String,
  type: String,
  country: String,
  valid: Boolean,
  validatedAt: { type: Date, default: Date.now },
  sessionId: String,
});

const PhoneValidation = mongoose.model('PhoneValidation', validationSchema);

// Bulk validation session schema
const bulkSessionSchema = new mongoose.Schema({
  sessionId: String,
  filename: String,
  totalCount: Number,
  processedCount: Number,
  validCount: Number,
  invalidCount: Number,
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  createdAt: { type: Date, default: Date.now },
});

const BulkSession = mongoose.model('BulkSession', bulkSessionSchema);

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({ 
  storage,
  limits: { fileSize: 50 * 1024 * 1024 * 1024 } // 50GB limit
});

// Phone validation utilities
class PhoneValidator {
  static validatePhoneNumber(phoneNumber) {
    // Remove all non-digit characters except + at the beginning
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    
    // Basic validation patterns
    const patterns = {
      US: /^\+?1[2-9]\d{2}[2-9]\d{2}\d{4}$/,
      UK: /^\+?44[1-9]\d{8,9}$/,
      INTL: /^\+?[1-9]\d{1,14}$/
    };

    let country = 'Unknown';
    let type = 'Unknown';
    let valid = false;

    // Determine country and type based on pattern matching
    if (patterns.US.test(cleanNumber)) {
      country = 'US';
      valid = true;
      // Simple VOIP detection (this is a simplified example)
      type = this.detectLineType(cleanNumber);
    } else if (patterns.UK.test(cleanNumber)) {
      country = 'UK';
      valid = true;
      type = this.detectLineType(cleanNumber);
    } else if (patterns.INTL.test(cleanNumber)) {
      country = this.detectCountry(cleanNumber);
      valid = true;
      type = this.detectLineType(cleanNumber);
    }

    return {
      phoneNumber: phoneNumber,
      type,
      country,
      valid
    };
  }

  static detectLineType(phoneNumber) {
    // Simplified line type detection
    // In a real implementation, you'd use a service like Twilio Lookup API
    const voipPrefixes = ['855', '844', '833', '822', '880', '881', '882', '883', '884', '885', '886', '887', '888', '889'];
    const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
    
    if (cleanNumber.length >= 6) {
      const prefix = cleanNumber.substring(cleanNumber.length >= 11 ? 4 : 3, cleanNumber.length >= 11 ? 7 : 6);
      if (voipPrefixes.includes(prefix)) {
        return 'VOIP';
      }
    }
    
    // Random assignment for demo purposes
    const types = ['Mobile', 'Landline', 'VOIP'];
    return types[Math.floor(Math.random() * types.length)];
  }

  static detectCountry(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/[^\d+]/g, '');
    
    // Country code detection (simplified)
    const countryCodes = {
      '1': 'US',
      '44': 'UK',
      '33': 'FR',
      '49': 'DE',
      '39': 'IT',
      '34': 'ES',
      '91': 'IN',
      '86': 'CN',
      '81': 'JP',
      '82': 'KR',
    };

    for (const [code, country] of Object.entries(countryCodes)) {
      if (cleanNumber.startsWith(`+${code}`) || cleanNumber.startsWith(code)) {
        return country;
      }
    }

    return 'Unknown';
  }
}

// Routes

// Single phone validation
app.post('/api/validate-single', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const result = PhoneValidator.validatePhoneNumber(phoneNumber);
    
    // Save to database
    const validation = new PhoneValidation({
      ...result,
      sessionId: 'single-' + Date.now(),
    });
    
    await validation.save();
    
    res.json(result);
  } catch (error) {
    console.error('Validation error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk validation with streaming
app.post('/api/validate-bulk', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const sessionId = 'bulk-' + Date.now();
    const filePath = req.file.path;
    const filename = req.file.originalname;

    // Set up Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });

    // Create bulk session
    const bulkSession = new BulkSession({
      sessionId,
      filename,
      totalCount: 0,
      processedCount: 0,
      validCount: 0,
      invalidCount: 0,
    });

    await bulkSession.save();

    const results = [];
    let processedCount = 0;
    let validCount = 0;
    let invalidCount = 0;
    let totalCount = 0;

    // Function to send progress updates
    const sendProgress = (progress) => {
      res.write(JSON.stringify({
        type: 'progress',
        progress: Math.round(progress),
        processed: processedCount,
        total: totalCount
      }) + '\n');
    };

    // Function to process phone numbers in chunks
    const processPhoneNumbers = async (phoneNumbers) => {
      const chunkSize = 100; // Process in chunks of 100
      const chunks = [];
      
      for (let i = 0; i < phoneNumbers.length; i += chunkSize) {
        chunks.push(phoneNumbers.slice(i, i + chunkSize));
      }

      for (const chunk of chunks) {
        const validations = [];
        
        for (const phoneNumber of chunk) {
          if (phoneNumber && phoneNumber.trim()) {
            const result = PhoneValidator.validatePhoneNumber(phoneNumber.trim());
            results.push(result);
            
            validations.push({
              ...result,
              sessionId,
            });

            if (result.valid) {
              validCount++;
            } else {
              invalidCount++;
            }
            
            processedCount++;
          }
        }

        // Batch insert to database
        if (validations.length > 0) {
          await PhoneValidation.insertMany(validations);
        }

        // Send progress update
        sendProgress((processedCount / totalCount) * 100);
        
        // Small delay to prevent overwhelming the client
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    };

    // Process based on file type
    if (req.file.mimetype === 'text/csv') {
      const phoneNumbers = [];
      
      // First pass: count total numbers
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv())
          .on('data', (row) => {
            // Look for phone number in various column names
            const phoneNumber = row.phone || row.phoneNumber || row.number || row.Phone || row.PhoneNumber || row.Number || Object.values(row)[0];
            if (phoneNumber && phoneNumber.trim()) {
              phoneNumbers.push(phoneNumber.trim());
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });

      totalCount = phoneNumbers.length;
      await processPhoneNumbers(phoneNumbers);

    } else if (req.file.mimetype.includes('sheet')) {
      // Handle Excel files
      const workbook = XLSX.readFile(filePath);
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet);

      const phoneNumbers = [];
      
      data.forEach((row) => {
        const phoneNumber = row.phone || row.phoneNumber || row.number || row.Phone || row.PhoneNumber || row.Number || Object.values(row)[0];
        if (phoneNumber && phoneNumber.toString().trim()) {
          phoneNumbers.push(phoneNumber.toString().trim());
        }
      });

      totalCount = phoneNumbers.length;
      await processPhoneNumbers(phoneNumbers);
    }

    // Update bulk session
    await BulkSession.findOneAndUpdate(
      { sessionId },
      {
        totalCount,
        processedCount,
        validCount,
        invalidCount,
        status: 'completed'
      }
    );

    // Send final results
    res.write(JSON.stringify({
      type: 'result',
      data: {
        count: results.length,
        results: results,
        summary: {
          total: totalCount,
          valid: validCount,
          invalid: invalidCount,
          processed: processedCount
        }
      }
    }) + '\n');

    res.end();

    // Clean up uploaded file
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error deleting file:', err);
    });

  } catch (error) {
    console.error('Bulk validation error:', error);
    res.write(JSON.stringify({
      type: 'error',
      error: 'Processing failed'
    }) + '\n');
    res.end();
  }
});

// Get validation history
app.get('/api/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const validations = await PhoneValidation.find({ sessionId }).sort({ validatedAt: -1 });
    
    const summary = {
      total: validations.length,
      valid: validations.filter(v => v.valid).length,
      invalid: validations.filter(v => !v.valid).length,
    };

    res.json({
      sessionId,
      summary,
      validations
    });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all bulk sessions
app.get('/api/bulk-sessions', async (req, res) => {
  try {
    const sessions = await BulkSession.find().sort({ createdAt: -1 }).limit(50);
    res.json(sessions);
  } catch (error) {
    console.error('Sessions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;