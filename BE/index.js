const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const express = require('express');
const multer = require('multer');

// Load credentials.json
const OAuth2Data = require('../credentials.json'); // Đảm bảo đường dẫn đúng

const app = express();
const PORT = 3000;

// OAuth 2.0 setup
const CLIENT_ID = OAuth2Data.web.client_id;
const CLIENT_SECRET = OAuth2Data.web.client_secret;
const REDIRECT_URI = OAuth2Data.web.redirect_uris[0];

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Store tokens after login
let authed = false;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

// Multer setup for file upload
const upload = multer({
    dest: uploadDir, // Temporary folder for uploaded files
    limits: { fileSize: 10 * 1024 * 1024 }, // Limit file size to 10MB
});
// Serve static files (like CSS, JS) from 'FE' folder
app.use(express.static(path.join(__dirname, '..','FE')));

// Step 1: OAuth Login route
app.get('/', (req, res) => {
    if (!authed) {
        // Create a URL to request access
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',  // Đảm bảo lấy refresh token
            scope: ['https://www.googleapis.com/auth/drive.file'],
        });
        res.send(`<html>
                    <body>
                      <h1>OAuth 2.0 Authentication</h1>
                      <a href="${authUrl}">Login with Google</a>
                    </body>
                  </html>`);
    } else {
        // Serve the upload page once authenticated
        res.sendFile(path.join(__dirname, '..', 'FE', 'index.html'));
    }
});

// Step 2: OAuth2 callback
app.get('/oauth2callback', (req, res) => {
    const code = req.query.code;
    if (code) {
        // Get access and refresh tokens
        oAuth2Client.getToken(code, (err, tokens) => {
            if (err) return console.error('Error getting oAuth tokens:', err);
            oAuth2Client.setCredentials(tokens);
            
            // Save refresh token to a file (or database)
            if (tokens.refresh_token) {
                fs.writeFileSync('token.json', JSON.stringify(tokens));
                console.log('Refresh token saved.');
            }

            authed = true;
            res.redirect('/');
        });
    }
});

// Load refresh token from file when server starts
if (fs.existsSync('token.json')) {
    const tokens = JSON.parse(fs.readFileSync('token.json', 'utf8'));
    oAuth2Client.setCredentials(tokens);
    authed = true;
}

// Step 3: Upload file to Google Drive
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }

    const filePath = path.join(__dirname, 'uploads', req.file.filename);

    const drive = google.drive({ version: 'v3', auth: oAuth2Client });
    const fileMetadata = {
        name: req.file.originalname,
    };
    const media = {
        mimeType: req.file.mimetype,
        body: fs.createReadStream(filePath),
    };

    drive.files.create(
        {
            resource: fileMetadata,
            media: media,
            fields: 'id',
        },
        (err, file) => {
            if (err) {
                console.error('Error uploading file:', err);
                res.status(500).send(`Failed to upload file. Error: ${err.message}`);
            } else {
                console.log('File uploaded successfully:', file.data.id);
                res.send('File uploaded successfully');
            }

            // Delete temporary file after upload
            fs.unlink(filePath, (err) => {
                if (err) {
                    console.error('Error deleting file:', err);
                } else {
                    console.log('Temporary file deleted');
                }
            });
        }
    );
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
