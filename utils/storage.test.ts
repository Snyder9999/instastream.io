import { describe, it, expect } from 'bun:test';
import { StorageManager } from './storage';
import crypto from 'crypto';
import path from 'path';

describe('StorageManager.generateFilename', () => {
  it('should generate a correct filename for a standard URL', () => {
    const url = 'http://example.com/video.mp4';
    const filename = StorageManager.generateFilename(url);
    const expectedHash = crypto.createHash('md5').update(url).digest('hex');
    expect(filename).toBe(`${expectedHash}.mp4`);
  });

  it('should ignore query parameters when extracting extension', () => {
    const url = 'http://example.com/video.mp4?token=123';
    const filename = StorageManager.generateFilename(url);
    const expectedHash = crypto.createHash('md5').update(url).digest('hex');
    expect(filename).toBe(`${expectedHash}.mp4`);
  });

  it('should default to .mp4 extension if none is present', () => {
    const url = 'http://example.com/video';
    const filename = StorageManager.generateFilename(url);
    const expectedHash = crypto.createHash('md5').update(url).digest('hex');
    expect(filename).toBe(`${expectedHash}.mp4`);
  });

  it('should produce the same filename for the same URL', () => {
    const url = 'http://example.com/video.mp4';
    const filename1 = StorageManager.generateFilename(url);
    const filename2 = StorageManager.generateFilename(url);
    expect(filename1).toBe(filename2);
  });
});
