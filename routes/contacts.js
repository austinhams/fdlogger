const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

const BAND_FREQ = {
  '160m': 1800, '80m': 3500, '40m': 7000, '20m': 14000,
  '15m': 21000, '10m': 28000, '6m': 50, '2m': 144,
  '220': 222, '440': 432, 'SAT': 50
};

// Create contact
router.post('/', async (req, res) => {
  const { station_id, callsign, class: contactClass, section } = req.body;

  try {
    const stationResult = await pool.query('SELECT * FROM stations WHERE id = $1', [station_id]);
    if (stationResult.rows.length === 0) {
      return res.status(404).json({ error: 'Station not found' });
    }

    const station = stationResult.rows[0];
    const frequency = BAND_FREQ[station.band] || 0;

    const result = await pool.query(
      `INSERT INTO contacts (station_id, callsign, class, section, band, mode, power, operator, frequency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        station_id,
        callsign.toUpperCase().trim(),
        contactClass.toUpperCase().trim(),
        section.toUpperCase().trim(),
        station.band,
        station.mode,
        station.power,
        station.current_operator,
        frequency
      ]
    );

    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json(result.rows[0]);
    }
    res.redirect(`/stations/${station_id}`);
  } catch (err) {
    console.error(err);
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(500).json({ error: 'Server error' });
    }
    res.status(500).send('Server error');
  }
});

// Delete contact
router.post('/:id/delete', async (req, res) => {
  try {
    const result = await pool.query('SELECT station_id FROM contacts WHERE id = $1', [req.params.id]);
    await pool.query('DELETE FROM contacts WHERE id = $1', [req.params.id]);

    const stationId = result.rows[0]?.station_id;
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.json({ success: true });
    }
    res.redirect(`/stations/${stationId}`);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all contacts as JSON (for map)
router.get('/api/all', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, s.name as station_name
      FROM contacts c
      JOIN stations s ON c.station_id = s.id
      ORDER BY c.created_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Dashboard stats + recent contacts as JSON
router.get('/api/dashboard', async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_qsos,
        COUNT(DISTINCT callsign) as unique_calls,
        COUNT(DISTINCT section) as unique_sections
      FROM contacts
    `);
    const recentResult = await pool.query(`
      SELECT c.*, s.name as station_name
      FROM contacts c
      JOIN stations s ON c.station_id = s.id
      ORDER BY c.created_at DESC
      LIMIT 20
    `);
    res.json({
      stats: statsResult.rows[0],
      recentContacts: recentResult.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
