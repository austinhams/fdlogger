require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db/pool');

const stationsRouter = require('./routes/stations');
const contactsRouter = require('./routes/contacts');
const exportRouter = require('./routes/export');
const wsjtx = require('./lib/wsjtx');
const { runMigrations } = require('./db/migrate');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Dashboard
app.get('/', async (req, res) => {
  try {
    const statsResult = await pool.query(`
      SELECT
        COUNT(*) as total_qsos,
        COUNT(DISTINCT callsign) as unique_calls,
        COUNT(DISTINCT section) as unique_sections
      FROM contacts
    `);
    const stats = statsResult.rows[0];

    const recentResult = await pool.query(`
      SELECT c.*, s.name as station_name
      FROM contacts c
      JOIN stations s ON c.station_id = s.id
      ORDER BY c.created_at DESC
      LIMIT 20
    `);

    const scoreboardResult = await pool.query(`
      SELECT operator, COUNT(*) as contact_count
      FROM contacts
      WHERE operator != ''
      GROUP BY operator
      ORDER BY contact_count DESC
    `);

    res.render('dashboard', {
      stats,
      recentContacts: recentResult.rows,
      scoreboard: scoreboardResult.rows,
      page: 'dashboard'
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Server error');
  }
});

app.use('/stations', stationsRouter);
app.use('/contacts', contactsRouter);
app.use('/export', exportRouter);

runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`FD Logger running on http://localhost:${PORT}`);
  });

  // Start WSJT-X UDP listener (default port 2237)
  wsjtx.startListener();
}).catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
