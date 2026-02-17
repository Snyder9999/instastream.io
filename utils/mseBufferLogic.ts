export class VideoBufferManager {
    private mediaSource: MediaSource;
    private sourceBuffer: SourceBuffer | null = null;
    private queue: Uint8Array[] = [];
    private isUpdating = false;
    private mimeType: string;
    private getCurrentTime: () => number;

    constructor(getCurrentTime: () => number, mimeType = 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"') {
        this.getCurrentTime = getCurrentTime;
        this.mediaSource = new MediaSource();
        this.mimeType = mimeType;

        this.mediaSource.addEventListener('sourceopen', this.onSourceOpen.bind(this));
    }

    public getUrl(): string {
        return URL.createObjectURL(this.mediaSource);
    }

    public destroy() {
        if (this.mediaSource.readyState === 'open') {
            try {
                this.mediaSource.endOfStream();
            } catch {
                // Ignore
            }
        }
        // URL revocation is handled by caller or GC. 
    }

    private onSourceOpen() {
        if (this.sourceBuffer) return;

        try {
            if (MediaSource.isTypeSupported(this.mimeType)) {
                this.sourceBuffer = this.mediaSource.addSourceBuffer(this.mimeType);
                this.sourceBuffer.addEventListener('updateend', this.onUpdateEnd.bind(this));
                this.sourceBuffer.addEventListener('error', (e) => console.error('SourceBuffer error:', e));
            } else {
                console.error(`MIME type ${this.mimeType} not supported for MSE.`);
            }
        } catch (e) {
            console.error('Error adding SourceBuffer:', e);
        }

        this.processQueue();
    }

    public append(data: Uint8Array) {
        this.queue.push(data);
        this.processQueue();
    }

    private processQueue() {
        if (!this.sourceBuffer || this.isUpdating || this.queue.length === 0) return;

        const data = this.queue.shift();
        if (data) {
            try {
                this.isUpdating = true;
                // Cast to any to avoid TS lib mismatch issues with Uint8Array/BufferSource
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                this.sourceBuffer.appendBuffer(data as any);
            } catch (e) {
                console.error('Error appending buffer:', e);
                this.isUpdating = false; // Reset if append fails synchronously

                if (e instanceof DOMException && e.name === 'QuotaExceededError') {
                    this.cleanupBuffer(10); // Clear 10 seconds
                    this.queue.unshift(data); // Retry
                }
            }
        }
    }

    private onUpdateEnd() {
        this.isUpdating = false;
        this.processQueue();
    }

    public cleanupBuffer(secondsToKeep = 60) {
        if (!this.sourceBuffer || this.isUpdating || this.mediaSource.readyState !== 'open') return;

        try {
            const currentTime = this.getCurrentTime();
            const buffered = this.sourceBuffer.buffered;

            for (let i = 0; i < buffered.length; i++) {
                const start = buffered.start(i);
                const end = buffered.end(i);

                const removeEnd = currentTime - secondsToKeep;
                if (removeEnd > start) {
                    this.sourceBuffer.remove(start, Math.min(end, removeEnd));
                    this.isUpdating = true;
                    return;
                }
            }
        } catch (e) {
            console.error('Error cleaning buffer:', e);
        }
    }

    public flushRange(start: number, end: number) {
        if (!this.sourceBuffer || this.isUpdating || this.mediaSource.readyState !== 'open') return;
        try {
            this.isUpdating = true;
            this.sourceBuffer.remove(start, end);
        } catch (e) {
            console.error('Error removing buffer:', e);
            this.isUpdating = false;
        }
    }

    public endOfStream() {
        if (this.mediaSource.readyState === 'open') {
            try {
                this.mediaSource.endOfStream();
            } catch { }
        }
    }

    private abortController: AbortController | null = null;

    public async startFetching(url: string) {
        this.stopFetching();
        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        try {
            const response = await fetch(url, { signal });
            if (!response.ok || !response.body) {
                console.error('Fetch failed:', response.status);
                return;
            }

            const reader = response.body.getReader();

            while (true) {
                const { done, value } = await reader.read();
                if (done) {
                    this.endOfStream();
                    break;
                }
                if (value) {
                    this.append(value);
                }
            }
        } catch (e) {
            if (signal.aborted) {
                console.log('Fetching aborted');
            } else {
                console.error('Error fetching stream:', e);
            }
        }
    }

    public stopFetching() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}
