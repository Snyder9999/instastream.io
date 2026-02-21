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

    static async ensureDirectory(): Promise<void> {
        try {
            await fs.promises.access(DOWNLOAD_DIR);
        } catch {
            await fs.promises.mkdir(DOWNLOAD_DIR, { recursive: true });
        }
    }

    static async fileExists(filename: string): Promise<boolean> {
        try {
            await fs.promises.access(this.getFilePath(filename));
            return true;
        } catch {
            return false;
        }
    }

    static async getFileSize(filename: string): Promise<number> {
        try {
            const stats = await fs.promises.stat(this.getFilePath(filename));
            return stats.size;
        } catch (e) {
            return 0;
        }
    }
}
