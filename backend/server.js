const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const csvParser = require('csv-parser');
const { parsePhoneNumberFromString } = require('libphonenumber-js');
const path = require('path');
const moment = require('moment');
const ExcelJS = require('exceljs');
const mammoth = require('mammoth');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const upload = multer({ dest: uploadsDir });

// === Better Phone Regex ===
const phoneRegex = /(\+?[1-9]{1}[0-9\s().\-]{7,})/g;

function mapPhoneType(type) {
  switch (type) {
    case 'MOBILE': return 'CELL PHONE';
    case 'FIXED_LINE': return 'LANDLINE';
    case 'FIXED_LINE_OR_MOBILE': return 'LANDLINE or CELL PHONE';
    case 'VOIP': return 'VOIP';
    case 'TOLL_FREE': return 'TOLL FREE';
    default: return 'N/A';
  }
}

function buildPhoneReport(numberStr) {
  try {
    const phoneNumber = parsePhoneNumberFromString(numberStr, 'US'); 
    if (phoneNumber && phoneNumber.isValid()) {
      return {
        input: numberStr.trim(),
        valid: true,
        report: {
          "Phone Number": phoneNumber.formatNational() || 'N/A',
          "Date of this Report": moment().format("MMMM DD, YYYY"),
          "Phone Line Type": mapPhoneType(phoneNumber.getType()),
          "Country": phoneNumber.country || 'N/A',
          "Formatted": phoneNumber.formatInternational() || 'N/A'
        }
      };
    } else {
      return {
        input: numberStr.trim(),
        valid: false,
        report: null
      };
    }
  } catch (error) {
    console.error('Error parsing phone number:', numberStr, error.message);
    return {
      input: numberStr.trim(),
      valid: false,
      report: null
    };
  }
}

app.post('/api/validate-phone', (req, res) => {
  try {
    const { phone } = req.body;
    const result = buildPhoneReport(phone);
    res.json(result);
  } catch (error) {
    console.error('/api/validate-phone error:', error.message);
    res.status(500).json({ error: 'Failed to validate phone' });
  }
});

app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  const file = req.file;
  let results = [];

  try {
    if (file.mimetype === 'text/csv') {
      await new Promise((resolve, reject) => {
        fs.createReadStream(file.path)
          .pipe(csvParser())
          .on('data', (row) => {
            for (const key in row) {
              const value = row[key];
              const foundNumbers = value ? value.match(phoneRegex) : [];
              if (foundNumbers) {
                foundNumbers.forEach(num => {
                  results.push(buildPhoneReport(num));
                });
              }
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });
    }

    else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.readFile(file.path);

      for (const worksheet of workbook.worksheets) {
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            const value = String(cell.value || '');
            const foundNumbers = value.match(phoneRegex) || [];
            foundNumbers.forEach(num => {
              results.push(buildPhoneReport(num));
            });
          });
        });
      }
    }

    else if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdfParse(dataBuffer);
      const textContent = data.text;
      const foundNumbers = textContent.match(phoneRegex) || [];

      results = foundNumbers.map(num => buildPhoneReport(num));
    }

    // === DOCX ===
    else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const data = await mammoth.extractRawText({ path: file.path });
      const textContent = data.value;
      const foundNumbers = textContent.match(phoneRegex) || [];

      results = foundNumbers.map(num => buildPhoneReport(num));
    }

    else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

    res.json({ count: results.length, results });

  } catch (error) {
    console.error('/api/upload-file error:', error.message);
    res.status(500).json({ error: 'Failed to process file' });
  } finally {
    if (file && file.path && fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(` Server running on port ${PORT}`);
});
