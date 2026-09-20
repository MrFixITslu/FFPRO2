import { Router } from '../http.js';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { uploadGate } from '../middleware/uploadGate.js';
import { filesDb } from '../filesDb.js';

const router = Router();
router.use(requireAuth);
const limiter = rateLimit({ windowMs: 60000, max: 20, standardHeaders:true, legacyHeaders:false });
const upload = multer({ storage:multer.memoryStorage(), limits:{fileSize:10*1024*1024, files:1, fields:5, fieldSize:1024, parts:6} });
function uploadOne(req,res,next) {
  upload.single('file')(req,res,error=> {
    if(error) return res.status(error.code==='LIMIT_FILE_SIZE'?413:400).json({error:'Upload one file up to 10 MiB.'});
    next();
  });
}
export function safeFileType(name, bytes) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (!['pdf','png','jpg','jpeg','gif','webp','txt','csv','json','fdoc','fcel','docx','xlsx','doc','xls'].includes(ext)) throw Object.assign(new Error('Unsupported file type.'),{status:415,publicMessage:'Supported files: PDF, images, text, CSV, JSON and Office documents.'});
  const header = bytes.subarray(0,12);
  if (['jpg','jpeg'].includes(ext) && header[0]===255 && header[1]===216 && header[2]===255) return 'image/jpeg';
  if (ext==='png' && header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png';
  if (ext==='gif' && /^GIF8[79]a/.test(header.toString())) return 'image/gif';
  if (ext==='webp' && header.toString('ascii',0,4)==='RIFF' && header.toString('ascii',8,12)==='WEBP') return 'image/webp';
  if (ext==='pdf' && header.toString('ascii',0,5)==='%PDF-') return 'application/pdf';
  if (['docx','xlsx'].includes(ext) && header[0]===80 && header[1]===75) return 'application/octet-stream';
  if (['doc','xls'].includes(ext) && header.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex'))) return 'application/octet-stream';
  if (['txt','csv','json','fdoc','fcel'].includes(ext) && !bytes.includes(0)) return 'text/plain';
  throw Object.assign(new Error('File contents do not match the file extension.'),{status:415});
}
router.post('/upload', limiter, uploadGate, uploadOne, async(req,res)=>{
  if(!req.file) return res.status(400).json({error:'Choose a file to upload.'});
  const name = req.file.originalname.replace(/[\x00-\x1f\x7f/\\]/g,'_').slice(0,200);
  const fileType = safeFileType(name,req.file.buffer);
  const saved = await filesDb.saveFile({
    id: req.body?.fileId || undefined,
    userId: req.user.id,
    projectId: req.body?.projectId || null,
    fileName: name,
    fileType,
    fileSize: req.file.buffer.length,
    buffer: req.file.buffer
  });
  res.status(201).json({ok:true,files:[saved]});
});
router.get('/project/:projectId',async(req,res)=>{
  res.json({ok:true,files:await filesDb.listFilesByProject(req.params.projectId,req.user.id)});
});
async function serve(req,res,download) {
  const file = await filesDb.getFileById(req.params.id,req.user.id);
  if(!file) return res.status(404).json({error:'File not found.'});
  const ascii = file.fileName.replace(/[^\w.\- ]/g,'_');
  const viewableTypes = [
    'image/png','image/jpeg','image/webp','image/gif','image/svg+xml',
    'application/pdf',
    'text/plain','text/csv','application/json'
  ];
  const inline = req.query.inline === 'true' && !download && viewableTypes.includes(file.fileType);
  res.setHeader('Content-Type',inline?file.fileType:(file.fileType || 'application/octet-stream'));
  res.setHeader('Content-Disposition',`${inline?'inline':'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`);
  res.setHeader('Cache-Control','private, no-store');
  if (inline && file.fileType === 'application/pdf') {
    res.setHeader('Content-Security-Policy',"default-src 'self' blob: data:; frame-ancestors 'self'");
  } else {
    res.setHeader('Content-Security-Policy',"sandbox; default-src 'none'; frame-ancestors 'none'");
  }
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Content-Length',file.fileData.length);
  res.send(file.fileData);
}
router.get('/:id/download',(req,res)=>serve(req,res,true));
router.get('/:id',(req,res)=>serve(req,res,false));
router.delete('/:id',limiter,async(req,res)=>{
  if(!(await filesDb.deleteFile(req.params.id,req.user.id))) return res.status(404).json({error:'File not found.'});
  res.json({ok:true});
});
export default router;
