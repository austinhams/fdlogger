require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./db/pool');

const stationsRouter = require('./routes/stations');
const contactsRouter = require('./routes/contacts');
const exportRouter = require('./routes/export');

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

    res.render('dashboard', {
      stats,
      recentContacts: recentResult.rows,
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

async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        band VARCHAR(20) NOT NULL,
        mode VARCHAR(20) NOT NULL,
        power VARCHAR(20) NOT NULL,
        current_operator VARCHAR(50) DEFAULT '',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        station_id INTEGER NOT NULL REFERENCES stations(id) ON DELETE CASCADE,
        callsign VARCHAR(20) NOT NULL,
        class VARCHAR(10) NOT NULL,
        section VARCHAR(10) NOT NULL,
        band VARCHAR(20) NOT NULL,
        mode VARCHAR(20) NOT NULL,
        power VARCHAR(20) NOT NULL,
        operator VARCHAR(50) NOT NULL,
        frequency INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    await pool.query('CREATE INDEX IF NOT EXISTS idx_contacts_station ON contacts(station_id)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_contacts_section ON contacts(section)');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_contacts_callsign ON contacts(callsign)');
    console.log('Database tables ready');
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    process.exit(1);
  }
}

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`FD Logger running on http://localhost:${PORT}`);
  });
});
