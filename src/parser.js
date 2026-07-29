const config = require('./config');

// Parses Campbell Scientific "TOA5" .dat files (the standard format used by
// AWS/CR-series dataloggers), e.g.:
//
//   "TOA5","9027","CR350","9027","CR350-CELL215.1.9.0","CPU:AWS_Khairpur.CRB","46761","Hourly"
//   "TIMESTAMP","RECORD","BattV_Avg",...
//   "TS","RN","Volts",...
//   "","","Avg",...
//   "2026-07-01 00:00:00",3915,12.85,...

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

function convertValue(raw) {
  if (raw === undefined || raw === '') return null;
  if (raw.toUpperCase() === 'NAN') return null;
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
  return raw;
}

function extractStationName(fileName) {
  const match = /^AWS_([A-Za-z0-9]+)_/.exec(fileName);
  if (match) return match[1];
  return fileName.replace(/\.dat$/i, '');
}

// Datalogger timestamps ("2026-07-01 00:00:00") have no timezone info and are
// recorded in the station's local time (Pakistan Standard Time, UTC+5, no DST).
// Parsing them without an explicit offset would make the result depend on the
// host machine's timezone (e.g. UTC on Railway vs. whatever a dev machine uses),
// so the offset is attached explicitly before handing the string to Date().
function parseStationTimestamp(raw) {
  if (!raw) return null;
  const isoLike = raw.trim().replace(' ', 'T');
  return new Date(`${isoLike}${config.stationUtcOffset}`);
}

function buildRow(values, fieldNames) {
  const row = {};

  fieldNames.forEach((name, idx) => {
    const raw = values[idx];

    if (name === 'TIMESTAMP') {
      row[name] = parseStationTimestamp(raw);
    } else if (name === 'RECORD') {
      row[name] = raw !== undefined && raw !== '' ? Number(raw) : null;
    } else {
      row[name] = convertValue(raw);
    }
  });

  return row;
}

function parseToa5(content, fileName) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length < 5) {
    throw new Error(`${fileName}: expected at least 4 header lines + 1 data line, got ${lines.length} lines`);
  }

  const envInfo = parseCsvLine(lines[0]);
  const fieldNames = parseCsvLine(lines[1]);
  const units = parseCsvLine(lines[2]);
  const processing = parseCsvLine(lines[3]);
  const dataLines = lines.slice(4);

  const rows = dataLines.map((line) => buildRow(parseCsvLine(line), fieldNames));

  return {
    stationName: extractStationName(fileName),
    envInfo,
    fieldNames,
    units,
    processing,
    rows,
  };
}

module.exports = { parseToa5, parseCsvLine, convertValue };
