import { describe, it, expect, spyOn } from 'bun:test';
import fs from 'node:fs';
import { StorageManager } from './storage';

describe('StorageManager.getFileSize', () => {
    const filename = 'test-file.mp4';

    it('should return the file size when the file exists', () => {
        const expectedSize = 1024;
        const statSpy = spyOn(fs, 'statSync').mockReturnValue({
            size: expectedSize
        } as any);

        const size = StorageManager.getFileSize(filename);
        expect(size).toBe(expectedSize);
        expect(statSpy).toHaveBeenCalled();

        statSpy.mockRestore();
    });

    it('should return 0 when an error occurs (e.g., file not found)', () => {
        const statSpy = spyOn(fs, 'statSync').mockImplementation(() => {
            throw new Error('File not found');
        });

        const size = StorageManager.getFileSize(filename);
        expect(size).toBe(0);
        expect(statSpy).toHaveBeenCalled();

        statSpy.mockRestore();
    });
});
