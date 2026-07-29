const { MongoClient } = require('mongodb');
const config = require('./config');
const logger = require('./logger');

let client;
let db;

async function connect() {
  if (db) return db;
  client = new MongoClient(config.mongo.uri);
  await client.connect();
  db = client.db(config.mongo.dbName);
  await ensureIndexes(db);
  logger.info(`Connected to MongoDB database "${config.mongo.dbName}"`);
  return db;
}

async function ensureIndexes(database) {
  await database
    .collection(config.mongo.dataCollection)
    .createIndex({ _station: 1, _sourceFile: 1, RECORD: 1 }, { unique: true, name: 'uniq_station_sourceFile_record' });

  await database
    .collection(config.mongo.stateCollection)
    .createIndex({ _station: 1, fileName: 1 }, { unique: true, name: 'uniq_station_fileName' });
}

async function getDataCollection() {
  const database = await connect();
  return database.collection(config.mongo.dataCollection);
}

async function getStateCollection() {
  const database = await connect();
  return database.collection(config.mongo.stateCollection);
}

async function close() {
  if (client) {
    await client.close();
    client = undefined;
    db = undefined;
  }
}

module.exports = { connect, getDataCollection, getStateCollection, close };
