import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const DOWNLOAD_DIR = path.join(process.cwd(), 'downloads');

// Ensure download directory exists
if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

export class StorageManager {
    static getFilePath(filename: string): string {
        return path.join(DOWNLOAD_DIR, filename);
    }

    static generateFilename(url: string): string {
        const hash = crypto.createHash('md5').update(url).digest('hex');
        let ext = path.extname(url).split('?')[0].toLowerCase();

        // Whitelist of allowed video extensions
        const allowedExtensions = ['.mp4', '.webm', '.mkv', '.mov', '.avi', '.m4v', '.flv'];

        if (!allowedExtensions.includes(ext)) {
            ext = '.mp4';
        }

        return `${hash}${ext}`;
    }

    static ensureDirectory() {
        if (!fs.existsSync(DOWNLOAD_DIR)) {
            fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
        }
    }

    static fileExists(filename: string): boolean {
        return fs.existsSync(this.getFilePath(filename));
    }

    static getFileSize(filename: string): number {
        try {
            const stats = fs.statSync(this.getFilePath(filename));
            return stats.size;
        } catch (e) {
            return 0;
        }
    }
}
