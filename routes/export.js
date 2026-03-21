const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const BAND_FREQ = {
  '160m': 1800, '80m': 3500, '40m': 7000, '20m': 14000,
  '15m': 21000, '10m': 28000, '6m': 50, '2m': 144,
  '220': 222, '440': 432, 'SAT': 50
};

const MODE_MAP = {
  'CW': 'CW', 'SSB': 'PH', 'Phone': 'PH',
  'Digital': 'DG', 'FT8': 'DG', 'FT4': 'DG', 'RTTY': 'DG'
};

// Export page
router.get('/', async (req, res) => {
  try {
    const contactCount = await pool.query('SELECT COUNT(*) as count FROM contacts');
    const operators = await pool.query("SELECT DISTINCT operator FROM contacts WHERE operator != ''");

    res.render('export', {
      contactCount: contactCount.rows[0].count,
      operators: operators.rows.map(r => r.operator),
      page: 'export'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Generate Cabrillo file
router.post('/cabrillo', async (req, res) => {
  const {
    callsign, location, fdclass, club, name,
    address, city, state_province, postalcode, country,
    soapbox
  } = req.body;

  try {
    const contacts = await pool.query('SELECT * FROM contacts ORDER BY created_at ASC');
    const operators = await pool.query("SELECT DISTINCT operator FROM contacts WHERE operator != ''");
    const operatorList = operators.rows.map(r => r.operator).join(', ');

    let cabrillo = '';
    cabrillo += 'START-OF-LOG: 3.0\n';
    cabrillo += 'CONTEST: ARRL-FIELD-DAY\n';
    cabrillo += `CALLSIGN: ${(callsign || '').toUpperCase()}\n`;
    cabrillo += `LOCATION: ${(location || '').toUpperCase()}\n`;
    cabrillo += 'CATEGORY-OPERATOR: MULTI-OP\n';
    cabrillo += 'CATEGORY-STATION: PORTABLE\n';
    cabrillo += 'CATEGORY-TRANSMITTER: UNLIMITED\n';
    cabrillo += `CLUB: ${club || ''}\n`;
    cabrillo += `NAME: ${name || ''}\n`;
    cabrillo += `ADDRESS: ${address || ''}\n`;
    cabrillo += `ADDRESS-CITY: ${city || ''}\n`;
    cabrillo += `ADDRESS-STATE-PROVINCE: ${state_province || ''}\n`;
    cabrillo += `ADDRESS-POSTALCODE: ${postalcode || ''}\n`;
    cabrillo += `ADDRESS-COUNTRY: ${country || 'USA'}\n`;
    cabrillo += `OPERATORS: ${operatorList}\n`;
    cabrillo += `SOAPBOX: ${soapbox || ''}\n`;

    for (const contact of contacts.rows) {
      const freq = BAND_FREQ[contact.band] || contact.frequency || 0;
      const mode = MODE_MAP[contact.mode] || contact.mode;
      const date = new Date(contact.created_at);
      const dateStr = date.toISOString().slice(0, 10);
      const timeStr = date.toISOString().slice(11, 13) + date.toISOString().slice(14, 16);

      const myCall = (callsign || '').toUpperCase();
      const myClass = (fdclass || '').toUpperCase();
      const mySection = (location || '').toUpperCase();
      const theirCall = contact.callsign;
      const theirClass = contact.class;
      const theirSection = contact.section;

      const qsoLine = [
        'QSO:',
        String(freq).padStart(6),
        mode.padEnd(2),
        dateStr,
        timeStr,
        myCall.padEnd(13),
        myClass.padEnd(4),
        mySection.padEnd(4),
        theirCall.padEnd(13),
        theirClass.padEnd(4),
        theirSection
      ].join(' ');

      cabrillo += qsoLine + '\n';
    }

    cabrillo += 'END-OF-LOG:\n';

    res.setHeader('Content-Type', 'text/plain');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="fieldday_${(callsign || 'log').toUpperCase()}.log"`
    );
    res.send(cabrillo);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
