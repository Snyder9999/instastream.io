import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const dbPath = path.join(process.cwd(), 'instastream.db');
const db = new Database(dbPath);

// Initialize DB
db.exec(`
  CREATE TABLE IF NOT EXISTS videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    filename TEXT NOT NULL,
    filepath TEXT NOT NULL,
    size INTEGER DEFAULT 0,
    downloaded INTEGER DEFAULT 0, -- bytes downloaded
    status TEXT DEFAULT 'pending', -- pending, downloading, completed, error
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

export interface VideoRecord {
    id: number;
    url: string;
    filename: string;
    filepath: string;
    size: number;
    downloaded: number;
    status: 'pending' | 'downloading' | 'completed' | 'error';
    created_at: string;
    last_accessed: string;
}

export default db;
