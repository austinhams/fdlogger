/**
 * WSJT-X UDP listener and binary protocol parser.
 *
 * WSJT-X sends UDP datagrams using a binary format based on Qt's QDataStream.
 * We listen on port 2237 (default) and handle "QSO Logged" (type 5) messages
 * to automatically insert contacts into the database.
 *
 * Protocol reference:
 *   https://sourceforge.net/p/wsjt/wsjtx/ci/master/tree/Network/NetworkMessage.hpp
 */

const dgram = require('dgram');
const pool = require('../db/pool');

const WSJTX_MAGIC = 0xADBCCBDA;

const MSG_HEARTBEAT = 0;
const MSG_STATUS = 1;
const MSG_QSO_LOGGED = 5;
const MSG_CLOSE = 6;
const MSG_LOGGED_ADIF = 12;

// ---------------------------------------------------------------------------
// Binary reader for WSJT-X / Qt QDataStream format
// ---------------------------------------------------------------------------
class QDataStreamReader {
  constructor(buffer) {
    this.buf = buffer;
    this.offset = 0;
  }

  remaining() {
    return this.buf.length - this.offset;
  }

  readUInt8() {
    const v = this.buf.readUInt8(this.offset);
    this.offset += 1;
    return v;
  }

  readInt32() {
    const v = this.buf.readInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  readUInt32() {
    const v = this.buf.readUInt32BE(this.offset);
    this.offset += 4;
    return v;
  }

  readUInt64() {
    const v = this.buf.readBigUInt64BE(this.offset);
    this.offset += 8;
    return Number(v);
  }

  readInt64() {
    const v = this.buf.readBigInt64BE(this.offset);
    this.offset += 8;
    return Number(v);
  }

  readBool() {
    return this.readUInt8() !== 0;
  }

  /**
   * Read a WSJT-X "utf8" field: uint32 length followed by UTF-8 bytes.
   * 0xFFFFFFFF signals null.
   */
  readUtf8() {
    const length = this.readUInt32();
    if (length === 0xFFFFFFFF) return null;
    if (length === 0) return '';
    const str = this.buf.toString('utf8', this.offset, this.offset + length);
    this.offset += length;
    return str;
  }

  /**
   * Read a Qt QDateTime (QDataStream version ≥ 5):
   *   QDate  → int64  Julian Day Number
   *   QTime  → uint32 milliseconds since midnight
   *   uint8  timespec  (0=local, 1=UTC, 2=OffsetFromUTC, 3=TimeZone)
   */
  readQDateTime() {
    const julianDay = this.readInt64();
    const msecsSinceMidnight = this.readUInt32();
    const timespec = this.readUInt8();

    if (timespec === 2) {
      this.readInt32(); // offset seconds – skip
    } else if (timespec === 3) {
      // timezone id as QByteArray
      const len = this.readUInt32();
      if (len !== 0xFFFFFFFF && len > 0) this.offset += len;
    }

    // Julian Day → Gregorian  (algorithm from Meeus / Wikipedia)
    const a = julianDay + 32044;
    const b = Math.floor((4 * a + 3) / 146097);
    const c = a - Math.floor(146097 * b / 4);
    const d = Math.floor((4 * c + 3) / 1461);
    const e = c - Math.floor(1461 * d / 4);
    const m = Math.floor((5 * e + 2) / 153);

    const day = e - Math.floor((153 * m + 2) / 5) + 1;
    const month = m + 3 - 12 * Math.floor(m / 10);
    const year = 100 * b + d - 4800 + Math.floor(m / 10);

    const hours = Math.floor(msecsSinceMidnight / 3600000);
    const minutes = Math.floor((msecsSinceMidnight % 3600000) / 60000);
    const seconds = Math.floor((msecsSinceMidnight % 60000) / 1000);

    return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
  }
}

// ---------------------------------------------------------------------------
// Frequency → FD band
// ---------------------------------------------------------------------------
function freqToBand(freqHz) {
  const mhz = freqHz / 1_000_000;
  if (mhz >= 1.8 && mhz < 2.0) return '160m';
  if (mhz >= 3.5 && mhz < 4.0) return '80m';
  if (mhz >= 7.0 && mhz < 7.3) return '40m';
  if (mhz >= 14.0 && mhz < 14.35) return '20m';
  if (mhz >= 21.0 && mhz < 21.45) return '15m';
  if (mhz >= 28.0 && mhz < 29.7) return '10m';
  if (mhz >= 50.0 && mhz < 54.0) return '6m';
  if (mhz >= 144.0 && mhz < 148.0) return '2m';
  if (mhz >= 222.0 && mhz < 225.0) return '220';
  if (mhz >= 420.0 && mhz < 450.0) return '440';
  return null;
}

// ---------------------------------------------------------------------------
// WSJT-X mode string → app mode value
// ---------------------------------------------------------------------------
function wsjtxModeToAppMode(mode) {
  if (!mode) return 'Digital';
  const upper = mode.toUpperCase();
  if (upper === 'FT8') return 'FT8';
  if (upper === 'FT4') return 'FT4';
  if (upper === 'CW') return 'CW';
  return 'Digital';
}

// ---------------------------------------------------------------------------
// Parse the binary envelope + dispatch by message type
// ---------------------------------------------------------------------------
function parseMessage(buffer) {
  if (buffer.length < 12) return null;

  const reader = new QDataStreamReader(buffer);

  const magic = reader.readUInt32();
  if (magic !== WSJTX_MAGIC) return null;

  const schema = reader.readUInt32();
  const type = reader.readUInt32();
  const id = reader.readUtf8();

  const header = { schema, type, id };

  switch (type) {
    case MSG_QSO_LOGGED:
      return { ...header, msgType: 'qso_logged', ...parseQsoLogged(reader) };
    case MSG_STATUS:
      return { ...header, msgType: 'status', ...parseStatusSafe(reader) };
    case MSG_HEARTBEAT:
      return { ...header, msgType: 'heartbeat' };
    case MSG_CLOSE:
      return { ...header, msgType: 'close' };
    default:
      return { ...header, msgType: 'other' };
  }
}

// ---------------------------------------------------------------------------
// Type 5 – QSO Logged
// ---------------------------------------------------------------------------
function parseQsoLogged(r) {
  const dateTimeOff = r.readQDateTime();
  const dxCall = r.readUtf8();
  const dxGrid = r.readUtf8();
  const txFrequency = r.readUInt64();
  const mode = r.readUtf8();
  const reportSent = r.readUtf8();
  const reportReceived = r.readUtf8();
  const txPower = r.readUtf8();
  const comments = r.readUtf8();
  const name = r.readUtf8();
  const dateTimeOn = r.readQDateTime();
  const operatorCall = r.readUtf8();
  const myCall = r.readUtf8();
  const myGrid = r.readUtf8();
  const exchangeSent = r.readUtf8();
  const exchangeReceived = r.readUtf8();

  return {
    dateTimeOff,
    dxCall,
    dxGrid,
    txFrequency,
    mode,
    reportSent,
    reportReceived,
    txPower,
    comments,
    name,
    dateTimeOn,
    operatorCall,
    myCall,
    myGrid,
    exchangeSent,
    exchangeReceived,
  };
}

// ---------------------------------------------------------------------------
// Type 1 – Status  (best-effort; we don't rely on every field)
// ---------------------------------------------------------------------------
function parseStatusSafe(r) {
  try {
    const dialFrequency = r.readUInt64();
    const mode = r.readUtf8();
    const dxCall = r.readUtf8();
    const report = r.readUtf8();
    const txMode = r.readUtf8();
    const txEnabled = r.readBool();
    const transmitting = r.readBool();
    const decoding = r.readBool();
    const rxDF = r.readUInt32();
    const txDF = r.readUInt32();
    const deCall = r.readUtf8();
    const deGrid = r.readUtf8();
    const dxGrid = r.readUtf8();
    return {
      dialFrequency, mode, dxCall, report, txMode,
      txEnabled, transmitting, decoding, deCall, deGrid, dxGrid,
    };
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Parse Field Day exchange  ("2A EMA" → { class: "2A", section: "EMA" })
// ---------------------------------------------------------------------------
function parseFieldDayExchange(exchange) {
  if (!exchange) return { class: '', section: '' };
  const parts = exchange.trim().split(/\s+/);
  if (parts.length >= 2) return { class: parts[0], section: parts[1] };
  return { class: parts[0] || '', section: '' };
}

// ---------------------------------------------------------------------------
// Persist a QSO Logged message into the contacts table
// ---------------------------------------------------------------------------
async function handleQsoLogged(msg) {
  const band = freqToBand(msg.txFrequency);
  const mode = wsjtxModeToAppMode(msg.mode);
  const exchange = parseFieldDayExchange(msg.exchangeReceived);
  const frequencyKhz = Math.round(msg.txFrequency / 1000);

  if (!band) {
    console.log(`WSJT-X: Unknown band for frequency ${msg.txFrequency} Hz – skipping`);
    return null;
  }
  if (!msg.dxCall) {
    console.log('WSJT-X: No callsign in QSO – skipping');
    return null;
  }

  // Try to match an existing station: exact band+mode first, then band only
  let station = null;

  const exactMatch = await pool.query(
    'SELECT * FROM stations WHERE band = $1 AND mode = $2 LIMIT 1',
    [band, mode],
  );
  if (exactMatch.rows.length > 0) {
    station = exactMatch.rows[0];
  } else {
    const bandMatch = await pool.query(
      'SELECT * FROM stations WHERE band = $1 LIMIT 1',
      [band],
    );
    if (bandMatch.rows.length > 0) {
      station = bandMatch.rows[0];
    }
  }

  // No station exists for this band – auto-create one
  if (!station) {
    const stationName = `WSJT-X ${band} ${mode}`;
    const created = await pool.query(
      `INSERT INTO stations (name, band, mode, power, current_operator)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [stationName, band, mode, 'LOW', msg.operatorCall || ''],
    );
    station = created.rows[0];
    console.log(`WSJT-X: Auto-created station "${stationName}" (id=${station.id})`);
  }

  const result = await pool.query(
    `INSERT INTO contacts
       (station_id, callsign, class, section, band, mode, power, operator, frequency, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      station.id,
      msg.dxCall.toUpperCase().trim(),
      exchange.class.toUpperCase().trim(),
      exchange.section.toUpperCase().trim(),
      band,
      mode,
      station.power,
      msg.operatorCall || station.current_operator || '',
      frequencyKhz,
      msg.dateTimeOff || new Date(),
    ],
  );

  console.log(
    `WSJT-X: Logged QSO #${result.rows[0].id} – ${msg.dxCall} on ${band} ${mode}`,
  );
  return result.rows[0];
}

// ---------------------------------------------------------------------------
// Start the UDP listener
// ---------------------------------------------------------------------------
function startListener(port) {
  const udpPort = port || parseInt(process.env.WSJTX_UDP_PORT, 10) || 2237;
  const server = dgram.createSocket('udp4');

  server.on('message', async (data, rinfo) => {
    try {
      const msg = parseMessage(data);
      if (!msg) return;

      if (msg.msgType === 'qso_logged') {
        console.log(
          `WSJT-X: QSO Logged from ${rinfo.address}:${rinfo.port} – ` +
          `${msg.dxCall} on ${msg.mode}`,
        );
        await handleQsoLogged(msg);
      }
      // heartbeat / status / close are silently ignored
    } catch (err) {
      console.error('WSJT-X: Error processing UDP message:', err.message);
    }
  });

  server.on('error', (err) => {
    console.error('WSJT-X: UDP server error:', err.message);
    server.close();
  });

  server.bind(udpPort, '0.0.0.0', () => {
    console.log(`WSJT-X UDP listener running on port ${udpPort}`);
  });

  return server;
}

module.exports = { startListener, parseMessage, freqToBand, wsjtxModeToAppMode };
