const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// List all stations
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*,
        (SELECT COUNT(*) FROM contacts WHERE station_id = s.id) as qso_count
      FROM stations s
      ORDER BY s.created_at DESC
    `);
    res.render('stations', { stations: result.rows, page: 'stations' });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Create station
router.post('/', async (req, res) => {
  const { name, band, mode, power, current_operator } = req.body;
  try {
    await pool.query(
      'INSERT INTO stations (name, band, mode, power, current_operator) VALUES ($1, $2, $3, $4, $5)',
      [name, band, mode, power, current_operator || '']
    );
    res.redirect('/stations');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// View single station
router.get('/:id', async (req, res) => {
  try {
    const stationResult = await pool.query('SELECT * FROM stations WHERE id = $1', [req.params.id]);
    if (stationResult.rows.length === 0) {
      return res.status(404).send('Station not found');
    }

    const contactsResult = await pool.query(
      'SELECT * FROM contacts WHERE station_id = $1 ORDER BY created_at DESC',
      [req.params.id]
    );

    res.render('station', {
      station: stationResult.rows[0],
      contacts: contactsResult.rows,
      page: 'stations'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Update operator
router.post('/:id/operator', async (req, res) => {
  const { current_operator } = req.body;
  try {
    await pool.query(
      'UPDATE stations SET current_operator = $1 WHERE id = $2',
      [current_operator, req.params.id]
    );
    res.redirect(`/stations/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

// Delete station
router.post('/:id/delete', async (req, res) => {
  try {
    await pool.query('DELETE FROM stations WHERE id = $1', [req.params.id]);
    res.redirect('/stations');
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

module.exports = router;
