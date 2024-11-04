const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');
const bodyParser = require("body-parser");
const express = require('express');
const multer = require('multer');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const app = express();
const PORT = 3000;

const swaggerOptions = {
    swaggerDefinition: {
      openapi: '3.1.0',
      info: {
        title: 'Google Drive Upload API',
        version: '1.0.0',
      },
      servers: [
        {
          url: "http://localhost:3000",
        },
      ],
    },
    apis: ['BE/index.js'],
};
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

const OAuth2Data = require('../credentials.json');
const CLIENT_ID = OAuth2Data.web.client_id;
const CLIENT_SECRET = OAuth2Data.web.client_secret;
const REDIRECT_URI = OAuth2Data.web.redirect_uris[0];

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
let authed = false;

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const upload = multer({
    dest: uploadDir,
    limits: { fileSize: 10 * 1024 * 1024 },
});

app.use(express.static(path.join(__dirname, '..','FE')));

/**
 * @swagger
 * /:
 *   get:
 *     summary: Home page for OAuth authentication
 *     responses:
 *       200:
 *         description: Returns the authentication link or file upload page
 */
app.get('/', (req, res) => {
    if (!authed) {
        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline', 
            scope: ['https://www.googleapis.com/auth/drive.file'],
        });
        res.send(`<html>
                    <body>
                      <h1>OAuth 2.0 Authentication</h1>
                      <a href="${authUrl}">Login with Google</a>
                    </body>
                  </html>`);
    } else {
        res.sendFile(path.join(__dirname, '..', 'FE', 'index.html'));
    }
});

/**
 * @swagger
 * /oauth2callback:
 *   get:
 *     summary: Callback for Google OAuth
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *         required: true
 *         description: Authorization code from Google
 *     responses:
 *       200:
 *         description: Redirects to homepage on successful login
 */
app.get('/oauth2callback', (req, res) => {
    const code = req.query.code;
    if (code) {
        oAuth2Client.getToken(code, (err, tokens) => {
            if (err) return console.error('Error getting oAuth tokens:', err);
            oAuth2Client.setCredentials(tokens);
            
            if (tokens.refresh_token) {
                fs.writeFileSync('token.json', JSON.stringify(tokens));
                console.log('Refresh token saved.');
            }

            authed = true;
            res.redirect('/');
        });
    }
});

if (fs.existsSync('token.json')) {
    const tokens = JSON.parse(fs.readFileSync('token.json', 'utf8'));
    oAuth2Client.setCredentials(tokens);
    authed = true;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     FileUpload:
 *       type: object
 *       required:
 *         - file
 *       properties:
 *         file:
 *           type: string
 *           format: binary
 *           description: File cần upload
 */

/**
 * @swagger
 * tags:
 *   name: File Upload
 *   description: The file upload API for Google Drive
 * /upload:
 *   post:
 *     summary: Upload a file to Google Drive
 *     tags: [File Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/FileUpload'
 *     responses:
 *       200:
 *         description: File uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: File uploaded successfully
 *       400:
 *         description: No file uploaded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: No file uploaded
 *       500:
 *         description: Failed to upload file
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   example: Failed to upload file.
 */
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const filePath = path.join(uploadDir, req.file.filename);
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
                res.status(500).json({ error: `Failed to upload file. Error: ${err.message}` });
            } else {
                console.log('File uploaded successfully:', file.data.id);
                res.json({ message: 'File uploaded successfully' });
            }

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

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
