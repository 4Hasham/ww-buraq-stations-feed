const config = require('./config');
const logger = require('./logger');
const { getDataCollection } = require('./db');

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 5000;

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function parseLimit(raw) {
  const n = Number(raw);
  if (!raw || !Number.isInteger(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function parseDateParam(raw) {
  if (!raw) return { value: undefined, error: null };
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return { value: undefined, error: `invalid date: "${raw}"` };
  return { value: date, error: null };
}

async function handleReadings(searchParams, res) {
  const station = searchParams.get('station');
  const table = searchParams.get('table');

  if (!station) {
    return sendJson(res, 400, { error: 'missing required query param "station"' });
  }
  if (!config.stations.some((s) => s.id === station)) {
    return sendJson(res, 400, {
      error: `unknown station "${station}"`,
      knownStations: config.stations.map((s) => s.id),
    });
  }
  if (!table) {
    return sendJson(res, 400, { error: 'missing required query param "table" (e.g. "Hourly" or "DecMin")' });
  }

  const from = parseDateParam(searchParams.get('from'));
  if (from.error) return sendJson(res, 400, { error: from.error });

  const to = parseDateParam(searchParams.get('to'));
  if (to.error) return sendJson(res, 400, { error: to.error });

  const dataCol = await getDataCollection(table);
  const filter = { _station: station };

  if (from.value || to.value) {
    filter.TIMESTAMP = {};
    if (from.value) filter.TIMESTAMP.$gte = from.value;
    if (to.value) filter.TIMESTAMP.$lte = to.value;

    const limit = parseLimit(searchParams.get('limit'));
    const readings = await dataCol.find(filter).sort({ TIMESTAMP: 1 }).limit(limit).toArray();

    return sendJson(res, 200, {
      station,
      table,
      mode: 'range',
      from: from.value || null,
      to: to.value || null,
      count: readings.length,
      readings,
    });
  }

  const latest = await dataCol.find(filter).sort({ TIMESTAMP: -1 }).limit(1).toArray();

  if (latest.length === 0) {
    return sendJson(res, 404, { error: `no readings found for station "${station}", table "${table}"` });
  }

  return sendJson(res, 200, {
    station,
    table,
    mode: 'latest',
    count: 1,
    readings: latest,
  });
}

async function handleRequest(req, res) {
  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return sendJson(res, 200, { status: 'ok' });
    }

    if (req.method === 'GET' && url.pathname === '/readings') {
      return await handleReadings(url.searchParams, res);
    }

    return sendJson(res, 404, { error: 'not found' });
  } catch (err) {
    logger.error(`Request failed: ${req.method} ${req.url}`, err);
    return sendJson(res, 500, { error: 'internal server error' });
  }
}

module.exports = { handleRequest };
