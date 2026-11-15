import crypto from 'node:crypto';

export class PlanningContractError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.name = 'PlanningContractError';
    this.code = code;
    this.status = status;
  }
}

export function safePlanningSecret(provided, expected) {
  if (typeof expected !== 'string' || expected.length < 32 || typeof provided !== 'string') return false;
  const a = Buffer.from(provided, 'utf8'), b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function parsePlanningApproval(body) {
  const clean = (value, size) => typeof value === 'string' && value.trim().length <= size ? value.trim() : '';
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new PlanningContractError('INVALID', 'Invalid approval.');
  const organizationId = clean(body.organizationId, 180);
  const jobId = clean(body.jobId, 160);
  const ticketNumber = clean(body.ticketNumber, 100);
  const customerName = clean(body.customerName, 180);
  const jobTitle = clean(body.jobTitle, 240);
  const eventId = clean(body.eventId, 160);
  const approvedAt = clean(body.approvedAt, 40);
  const time = Date.parse(approvedAt);
  if (!/^[A-Za-z0-9._:-]{8,180}$/.test(organizationId) ||
      !/^[A-Za-z0-9:._-]{1,160}$/.test(jobId) ||
      !/^[A-Za-z0-9:._-]{1,100}$/.test(ticketNumber) ||
      !customerName || !jobTitle ||
      !/^[A-Za-z0-9:_-]{8,160}$/.test(eventId) ||
      body.approval !== 'client-quote-approved' ||
      !Number.isFinite(time) || Math.abs(Date.now()-time) > 365*86400000)
    throw new PlanningContractError('INVALID', 'Invalid approval.');
  const fingerprint = crypto.createHash('sha256').update(JSON.stringify([
    organizationId, jobId, ticketNumber, customerName, eventId
  ])).digest('hex');
  return { organizationId, jobId, ticketNumber, customerName, jobTitle, eventId,
    approvedAt: new Date(time).toISOString(), fingerprint };
}

export function buildTiquetServiceProject(event) {
  const name = (event.customerName + ' — Tiquet ' + event.ticketNumber).slice(0,255);
  return { name, projectType: 'service', data: {
    name, date: event.approvedAt.slice(0,10), eventType: 'service', status: 'planned',
    items: [], notes: [], files: [], contactIds: [], memberUsernames: [], ious: [], logs: [],
    tasks: [
      {id:'scope', text:'Confirm scope and customer requirements', completed:false, subTasks:[]},
      {id:'resources', text:'Plan resources, costs and dependencies', completed:false, subTasks:[]},
      {id:'review', text:'Prepare client review package', completed:false, subTasks:[]}
    ], lastUpdated:new Date().toISOString(), source:'tiquet',
    tiquet: { organizationId:event.organizationId, jobId:event.jobId,
      ticketNumber:event.ticketNumber, approvedAt:event.approvedAt,
      planningStatus:'in-planning', approvedFileIds:[] }
  }};
}
