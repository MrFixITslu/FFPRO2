import { Router } from 'express';
import multer from 'multer';
import { filesDb } from '../filesDb.js';

const router = Router();

// Configure multer for in-memory storage (up to 50MB per file)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB max per file
    files: 20 // Up to 20 files per batch
  }
});

// Middleware wrapper that intercepts Multer errors gracefully
const handleUploadMiddleware = (req, res, next) => {
  upload.any()(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({ ok: false, error: 'File too large. Maximum supported file size is 50MB.' });
        }
        return res.status(400).json({ ok: false, error: `Upload error: ${err.message}` });
      }
      return res.status(400).json({ ok: false, error: err.message || 'File upload parsing failed.' });
    }
    next();
  });
};

/**
 * POST /api/files/upload
 * Accepts multipart/form-data with one or multiple files in field 'files' or 'file'
 * Optional form field 'projectId'
 */
router.post('/upload', handleUploadMiddleware, async (req, res) => {
  try {
    const rawFiles = req.files || [];
    const projectId = req.body?.projectId || req.query?.projectId || null;
    const userId = req.user?.id || null;

    if (!rawFiles || rawFiles.length === 0) {
      // Also check if json payload with base64 was sent
      const { fileName, fileType, base64Data, fileSize } = req.body || {};
      if (fileName && base64Data) {
        const buffer = Buffer.from(base64Data, 'base64');
        const saved = await filesDb.saveFile({
          userId,
          projectId,
          fileName,
          fileType: fileType || 'application/octet-stream',
          fileSize: fileSize || buffer.length,
          buffer,
        });
        return res.status(201).json({ ok: true, files: [saved] });
      }
      return res.status(400).json({ ok: false, error: 'No files were provided for upload.' });
    }

    const savedFiles = [];
    for (const f of rawFiles) {
      const saved = await filesDb.saveFile({
        userId,
        projectId,
        fileName: f.originalname || 'document',
        fileType: f.mimetype || 'application/octet-stream',
        fileSize: f.size,
        buffer: f.buffer,
      });
      savedFiles.push(saved);
    }

    res.status(201).json({
      ok: true,
      message: `Successfully uploaded and saved ${savedFiles.length} file(s) in system database.`,
      files: savedFiles,
    });
  } catch (err) {
    console.error('File upload to system database error:', err);
    res.status(500).json({ ok: false, error: err.message || 'Failed to save file to system database.' });
  }
});

/**
 * GET /api/files/:id/download
 * Downloads the binary file with Content-Disposition: attachment
 */
router.get('/:id/download', async (req, res) => {
  try {
    const file = await filesDb.getFileById(req.params.id);
    if (!file || !file.fileData) {
      return res.status(404).send('File not found in system database.');
    }

    const rawName = file.fileName || 'file';
    const asciiName = rawName.replace(/[^\w\.\-\s]/gi, '_');
    res.setHeader('Content-Type', file.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`);
    res.setHeader('Content-Length', file.fileSize || file.fileData.length);
    res.send(file.fileData);
  } catch (err) {
    console.error('GET /api/files/:id/download error:', err);
    res.status(500).send('Failed to retrieve file from system database.');
  }
});

/**
 * GET /api/files/:id
 * Views or streams the file inline with Content-Type header
 */
router.get('/:id', async (req, res) => {
  try {
    const file = await filesDb.getFileById(req.params.id);
    if (!file || !file.fileData) {
      return res.status(404).send('File not found in system database.');
    }

    const rawName = file.fileName || 'file';
    const asciiName = rawName.replace(/[^\w\.\-\s]/gi, '_');
    res.setHeader('Content-Type', file.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`);
    res.setHeader('Content-Length', file.fileSize || file.fileData.length);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(file.fileData);
  } catch (err) {
    console.error('GET /api/files/:id error:', err);
    res.status(500).send('Failed to load file.');
  }
});

/**
 * GET /api/files/project/:projectId
 * Lists all file metadata records associated with this project in the database
 */
router.get('/project/:projectId', async (req, res) => {
  try {
    const files = await filesDb.listFilesByProject(req.params.projectId);
    res.json({ ok: true, files });
  } catch (err) {
    console.error('GET /api/files/project/:projectId error:', err);
    res.status(500).json({ error: 'Failed to load project files from system database.' });
  }
});

/**
 * DELETE /api/files/:id
 * Deletes the file from system database
 */
router.delete('/:id', async (req, res) => {
  try {
    const success = await filesDb.deleteFile(req.params.id, req.user?.id);
    if (!success) {
      return res.status(404).json({ error: 'File not found or already deleted.' });
    }
    res.json({ ok: true, message: 'File deleted from system database.' });
  } catch (err) {
    console.error('DELETE /api/files/:id error:', err);
    res.status(500).json({ error: 'Failed to delete file from system database.' });
  }
});

export default router;
