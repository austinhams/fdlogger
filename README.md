# FD Logger

A ham radio contact logger for ARRL Field Day, built with Node.js, PostgreSQL, and Tailwind CSS.

## Features

- **Multiple stations** — each with its own band, mode, and power setting
- **Fast contact logging** — AJAX-based form with section autocomplete and dupe warnings
- **Operator switching** — easily swap operators at any station
- **Live dashboard** — real-time stats, recent contacts, and an interactive map that colors contacted states/sections
- **Cabrillo export** — generate a properly formatted log file for ARRL submission

## Quick Start

### Docker (recommended)

```bash
docker compose up --build
```

The app will be available at [http://localhost:3000](http://localhost:3000).

### Local

Prerequisites: Node.js 20+ and PostgreSQL.

```bash
createdb fdlogger
cp .env.example .env
npm install
npm run dev
```

## Environment Variables

| Variable       | Default                               | Description            |
| -------------- | ------------------------------------- | ---------------------- |
| `DATABASE_URL` | `postgresql://localhost:5432/fdlogger` | PostgreSQL connection  |
| `PORT`         | `3000`                                | HTTP server port       |

## License

[MIT](LICENSE)
