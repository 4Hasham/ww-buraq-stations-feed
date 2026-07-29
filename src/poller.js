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

async function processFile(client, stateCol, dataCol, file) {
  const fileName = file.name;
  const size = file.size;
  const modifiedAt = file.modifiedAt instanceof Date ? file.modifiedAt : null;

  const prevState = await stateCol.findOne({ fileName });

  if (!hasChanged(prevState, size, modifiedAt)) {
    logger.info(`No changes for ${fileName} (size ${size}, last seen ${prevState.lastCheckedAt.toISOString()})`);
    await stateCol.updateOne({ fileName }, { $set: { lastCheckedAt: new Date() } });
    return;
  }

  logger.info(`Update detected for ${fileName} (previous size: ${prevState ? prevState.size : 'n/a'}, new size: ${size}) — downloading...`);

  const content = await downloadFileContent(client, config.ftp.remoteDir, fileName);
  const parsed = parseToa5(content, fileName);

  const ops = parsed.rows
    .filter((row) => row.RECORD !== null && !Number.isNaN(row.RECORD))
    .map((row) => ({
      updateOne: {
        filter: { _sourceFile: fileName, RECORD: row.RECORD },
        update: {
          $set: {
            ...row,
            _sourceFile: fileName,
            _station: parsed.stationName,
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
    { fileName },
    {
      $set: {
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
    `${fileName}: parsed ${parsed.rows.length} rows -> ${upsertedCount} new, ${modifiedCount} updated in MongoDB`,
  );
}

async function pollOnce() {
  logger.info(`Polling FTP folder "${config.ftp.remoteDir}"...`);

  const client = await createClient();
  try {
    const files = await listDatFiles(client, config.ftp.remoteDir);

    if (files.length === 0) {
      logger.info(`No .dat files found in ${config.ftp.remoteDir}`);
      return;
    }

    const stateCol = await getStateCollection();
    const dataCol = await getDataCollection();

    for (const file of files) {
      try {
        await processFile(client, stateCol, dataCol, file);
      } catch (err) {
        logger.error(`Failed processing ${file.name}`, err);
      }
    }
  } finally {
    client.close();
  }
}

module.exports = { pollOnce };
