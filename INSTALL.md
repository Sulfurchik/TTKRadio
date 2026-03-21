# Local Install Guide

## Development install

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm ci
```

## Development run

The easiest way:

```bash
./start.sh
```

Manual run:

```bash
cd backend
source venv/bin/activate
python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

In another terminal:

```bash
cd frontend
npm run dev
```

## Production / server install

Use the Ubuntu deployment guide:

- [DEPLOYMENT.md](./DEPLOYMENT.md)

Main command:

```bash
sudo ./install.sh --domain radio.example.com --public-ip 203.0.113.10 --email ops@example.com
```
