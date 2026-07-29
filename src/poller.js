const config = require('./config');
const logger = require('./logger');
const { createClient, listDatFiles, downloadFileContent } = require('./ftpService');
const { parseToa5 } = require('./parser');
const { getStateCollection, getDataCollection } = require('./db');

function hasChanged(prevState, size, modifiedAt) {
  if (!prevState) return true;
  if (prevState.size !== size) return true;
  if (modifiedAt && prevState.modifiedAt) {
    return new Date(prevState.modifiedAt).getTime() !== modifiedAt.getTime();
  }
  return false;
}

async function processFile(client, stateCol, station, file) {
  const { id: stationId, remoteDir } = station;
  const fileName = file.name;
  const size = file.size;
  const modifiedAt = file.modifiedAt instanceof Date ? file.modifiedAt : null;

  const prevState = await stateCol.findOne({ _station: stationId, fileName });

  if (!hasChanged(prevState, size, modifiedAt)) {
    logger.info(`No changes for ${stationId}/${fileName} (size ${size}, last seen ${prevState.lastCheckedAt.toISOString()})`);
    await stateCol.updateOne({ _station: stationId, fileName }, { $set: { lastCheckedAt: new Date() } });
    return;
  }

  logger.info(`Update detected for ${stationId}/${fileName} (previous size: ${prevState ? prevState.size : 'n/a'}, new size: ${size}) — downloading...`);

  const content = await downloadFileContent(client, remoteDir, fileName);
  const parsed = parseToa5(content, fileName, stationId);
  const dataCol = await getDataCollection(parsed.table);

  const ops = parsed.rows
    .filter((row) => row.RECORD !== null && !Number.isNaN(row.RECORD))
    .map((row) => ({
      updateOne: {
        filter: { _station: stationId, _sourceFile: fileName, RECORD: row.RECORD },
        update: {
          $set: {
            ...row,
            _sourceFile: fileName,
            _station: stationId,
            _table: parsed.table,
            _ingestedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

  let upsertedCount = 0;
  let modifiedCount = 0;

  if (ops.length > 0) {
    const result = await dataCol.bulkWrite(ops, { ordered: false });
    upsertedCount = result.upsertedCount;
    modifiedCount = result.modifiedCount;
  }

  await stateCol.updateOne(
    { _station: stationId, fileName },
    {
      $set: {
        _station: stationId,
        _table: parsed.table,
        fileName,
        size,
        modifiedAt,
        lastCheckedAt: new Date(),
        lastRowCount: parsed.rows.length,
      },
    },
    { upsert: true },
  );

  logger.info(
    `${stationId}/${fileName} (table: ${parsed.table}): parsed ${parsed.rows.length} rows -> ${upsertedCount} new, ${modifiedCount} updated in MongoDB`,
  );
}

async function pollStation(client, stateCol, station) {
  logger.info(`Polling FTP folder "${station.remoteDir}" for station "${station.id}"...`);

  const files = await listDatFiles(client, station.remoteDir);

  if (files.length === 0) {
    logger.info(`No .dat files found in ${station.remoteDir}`);
    return;
  }

  for (const file of files) {
    try {
      await processFile(client, stateCol, station, file);
    } catch (err) {
      logger.error(`Failed processing ${station.id}/${file.name}`, err);
    }
  }
}

async function pollOnce() {
  const client = await createClient();
  try {
    const stateCol = await getStateCollection();

    for (const station of config.stations) {
      try {
        await pollStation(client, stateCol, station);
      } catch (err) {
        logger.error(`Failed polling station "${station.id}"`, err);
      }
    }
  } finally {
    client.close();
  }
}

module.exports = { pollOnce };
