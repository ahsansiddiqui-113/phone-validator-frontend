const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const csvParser = require('csv-parser');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const path = require('path');
const moment = require('moment');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

// Ensure uploads dir exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const upload = multer({ dest: uploadsDir });

// === Helper: Map phone type ===
function mapPhoneType(type) {
  switch (type) {
    case 'MOBILE':
      return 'CELL PHONE';
    case 'FIXED_LINE':
      return 'LANDLINE';
    case 'FIXED_LINE_OR_MOBILE':
      return 'LANDLINE or CELL PHONE';
    case 'VOIP':
      return 'VOIP';
    case 'TOLL_FREE':
      return 'TOLL FREE';
    case 'PREMIUM_RATE':
      return 'PREMIUM RATE';
    case 'SHARED_COST':
      return 'SHARED COST';
    case 'PERSONAL_NUMBER':
      return 'PERSONAL NUMBER';
    case 'PAGER':
      return 'PAGER';
    case 'UAN':
      return 'UAN';
    case 'VOICEMAIL':
      return 'VOICEMAIL';
    default:
      return 'UNKNOWN';
  }
}

// === /api/validate-phone ===
app.post('/api/validate-phone', (req, res) => {
  const { phone } = req.body;
  const phoneNumber = parsePhoneNumberFromString(phone, 'US');

  if (phoneNumber && phoneNumber.isValid()) {
    const rawType = phoneNumber.getType();
    const mappedType = mapPhoneType(rawType);

    res.json({
      valid: true,
      report: {
        "Phone Number": phoneNumber.formatNational(),
        "Date of this Report": moment().format("MMMM DD, YYYY"),
        "Phone Line Type": mappedType,
        "Country": phoneNumber.country,
        "Formatted": phoneNumber.formatInternational()
      }
    });
  } else {
    res.json({ valid: false, report: null });
  }
});

// === /api/upload-file ===
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  const file = req.file;

  try {
    let results = [];

    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdfParse(dataBuffer);
      const textContent = data.text;

      const phoneRegex = /(\+?\d[\d\s\-().]{7,}\d)/g;
      const foundNumbers = textContent.match(phoneRegex) || [];

      results = foundNumbers.map((num) => {
        const phoneNumber = parsePhoneNumberFromString(num, 'US');
        if (phoneNumber && phoneNumber.isValid()) {
          return {
            input: num.trim(),
            valid: true,
            report: {
              "Phone Number": phoneNumber.formatNational(),
              "Date of this Report": moment().format("MMMM DD, YYYY"),
              "Phone Line Type": mapPhoneType(phoneNumber.getType()),
              "Country": phoneNumber.country,
              "Formatted": phoneNumber.formatInternational()
            }
          };
        } else {
          return {
            input: num.trim(),
            valid: false,
            report: null
          };
        }
      });
    }

    else if (file.mimetype === 'text/csv') {
      await new Promise((resolve, reject) => {
        fs.createReadStream(file.path)
          .pipe(csvParser())
          .on('data', (row) => {
            for (const key in row) {
              const value = row[key];
              const phoneRegex = /(\+?\d[\d\s\-().]{7,}\d)/g;
              const foundNumbers = value ? value.match(phoneRegex) : [];
              if (foundNumbers) {
                foundNumbers.forEach((num) => {
                  const phoneNumber = parsePhoneNumberFromString(num, 'US');
                  if (phoneNumber && phoneNumber.isValid()) {
                    results.push({
                      input: num.trim(),
                      valid: true,
                      report: {
                        "Phone Number": phoneNumber.formatNational(),
                        "Date of this Report": moment().format("MMMM DD, YYYY"),
                        "Phone Line Type": mapPhoneType(phoneNumber.getType()),
                        "Country": phoneNumber.country,
                        "Formatted": phoneNumber.formatInternational()
                      }
                    });
                  } else {
                    results.push({
                      input: num.trim(),
                      valid: false,
                      report: null
                    });
                  }
                });
              }
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });
    }

    else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const workbook = XLSX.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      sheet.forEach((row) => {
        for (const key in row) {
          const value = row[key];
          const phoneRegex = /(\+?\d[\d\s\-().]{7,}\d)/g;
          const foundNumbers = value ? value.match(phoneRegex) : [];
          if (foundNumbers) {
            foundNumbers.forEach((num) => {
              const phoneNumber = parsePhoneNumberFromString(num, 'US');
              if (phoneNumber && phoneNumber.isValid()) {
                results.push({
                  input: num.trim(),
                  valid: true,
                  report: {
                    "Phone Number": phoneNumber.formatNational(),
                    "Date of this Report": moment().format("MMMM DD, YYYY"),
                    "Phone Line Type": mapPhoneType(phoneNumber.getType()),
                    "Country": phoneNumber.country,
                    "Formatted": phoneNumber.formatInternational()
                  }
                });
              } else {
                results.push({
                  input: num.trim(),
                  valid: false,
                  report: null
                });
              }
            });
          }
        }
      });
    }

    else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    res.json({ count: results.length, results });

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file' });
  } finally {
    // Cleanup
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
