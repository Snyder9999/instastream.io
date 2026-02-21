import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import { StorageManager } from '@/utils/storage';
import fs from 'fs';
import path from 'path';

describe('StorageManager', () => {
    const TEST_FILE = 'test_file.txt';
    const TEST_CONTENT = 'Hello World';

    beforeAll(async () => {
        // Setup: ensure directory exists and create a test file
        await StorageManager.ensureDirectory();
        fs.writeFileSync(StorageManager.getFilePath(TEST_FILE), TEST_CONTENT);
    });

    afterAll(() => {
        // Cleanup: remove the test file
        const filePath = StorageManager.getFilePath(TEST_FILE);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    });

    it('should generate a filename', () => {
        const url = 'http://example.com/video.mp4';
        const filename = StorageManager.generateFilename(url);
        expect(filename).toBeDefined();
        expect(filename.endsWith('.mp4')).toBe(true);
    });

    it('should check if file exists (async)', async () => {
        const exists = await StorageManager.fileExists(TEST_FILE);
        expect(exists).toBe(true);
        const notExists = await StorageManager.fileExists('non_existent.txt');
        expect(notExists).toBe(false);
    });

    it('should get file size (async)', async () => {
        const size = await StorageManager.getFileSize(TEST_FILE);
        expect(size).toBe(TEST_CONTENT.length);
        const zeroSize = await StorageManager.getFileSize('non_existent.txt');
        expect(zeroSize).toBe(0);
    });
});
