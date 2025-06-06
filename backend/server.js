const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const csvParser = require('csv-parser');
const { parsePhoneNumberFromString } = require('libphonenumber-js');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Validate phone number
app.post('/api/validate-phone', (req, res) => {
  const { phone } = req.body;
  const phoneNumber = parsePhoneNumberFromString(phone, 'US');

  if (phoneNumber && phoneNumber.isValid()) {
    res.json({
      valid: true,
      type: phoneNumber.getType(),
      country: phoneNumber.country,
      formatted: phoneNumber.formatInternational(),
    });
  } else {
    res.json({ valid: false });
  }
});

// Upload file + extract phone numbers
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  const file = req.file;

  try {
    if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(file.path);
      const data = await pdfParse(dataBuffer);
      const textContent = data.text;

      const phoneRegex = /(\+?\d[\d\s\-().]{7,}\d)/g;
      const foundNumbers = textContent.match(phoneRegex) || [];

      const validatedNumbers = foundNumbers.map((num) => {
        const phoneNumber = parsePhoneNumberFromString(num, 'US');
        return {
          input: num.trim(),
          valid: phoneNumber ? phoneNumber.isValid() : false,
          type: phoneNumber ? phoneNumber.getType() : null,
          country: phoneNumber ? phoneNumber.country : null,
          formatted: phoneNumber ? phoneNumber.formatInternational() : null,
        };
      });

      return res.json({ count: validatedNumbers.length, results: validatedNumbers });
    }

    else if (file.mimetype === 'text/csv') {
      const results = [];

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
                results.push({
                  input: num.trim(),
                  valid: phoneNumber ? phoneNumber.isValid() : false,
                  type: phoneNumber ? phoneNumber.getType() : null,
                  country: phoneNumber ? phoneNumber.country : null,
                  formatted: phoneNumber ? phoneNumber.formatInternational() : null,
                });
              });
            }
          }
        })
        .on('end', () => {
          res.json({ count: results.length, results });
        });
    }

    else if (file.mimetype ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
      const workbook = XLSX.readFile(file.path);
      const sheetName = workbook.SheetNames[0];
      const sheet = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);

      const results = [];

      sheet.forEach((row) => {
        for (const key in row) {
          const value = row[key];
          const phoneRegex = /(\+?\d[\d\s\-().]{7,}\d)/g;
          const foundNumbers = value ? value.match(phoneRegex) : [];
          if (foundNumbers) {
            foundNumbers.forEach((num) => {
              const phoneNumber = parsePhoneNumberFromString(num, 'US');
              results.push({
                input: num.trim(),
                valid: phoneNumber ? phoneNumber.isValid() : false,
                type: phoneNumber ? phoneNumber.getType() : null,
                country: phoneNumber ? phoneNumber.country : null,
                formatted: phoneNumber ? phoneNumber.formatInternational() : null,
              });
            });
          }
        }
      });

      return res.json({ count: results.length, results });
    }

    else {
      return res.status(400).json({ error: 'Unsupported file type' });
    }

  } catch (error) {
    console.error('Error processing file:', error);
    res.status(500).json({ error: 'Failed to process file' });
  } finally {
    fs.unlinkSync(file.path);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
