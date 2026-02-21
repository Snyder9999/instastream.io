import ffmpeg from 'fluent-ffmpeg';
import { DEFAULT_UPSTREAM_USER_AGENT } from './upstreamFetch';

export interface MediaTrack {
    index: number;
    type: 'video' | 'audio' | 'subtitle';
    codec: string;
    language?: string;
    label?: string;
    channels?: number;
}

export interface MediaProbeResult {
    duration: number;
    tracks: MediaTrack[];
}

export function probeMedia(url: string): Promise<MediaProbeResult> {
    return new Promise((resolve, reject) => {
        // We use an options array to set security parameters for ffprobe.
        const options = [
            '-protocol_whitelist', 'http,https,tcp,tls',
            '-user_agent', DEFAULT_UPSTREAM_USER_AGENT,
        ];

        // We pass undefined as the second argument (stream index) to ensure
        // options is correctly identified as the third argument.
        ffmpeg.ffprobe(url, undefined as unknown as number, options, (err, metadata) => {
            if (err) {
                reject(err);
                return;
            }

            const tracks: MediaTrack[] = metadata.streams.map((stream) => ({
                index: stream.index,
                type: stream.codec_type as 'video' | 'audio' | 'subtitle',
                codec: stream.codec_name || 'unknown',
                language: stream.tags?.language,
                label: stream.tags?.title || stream.tags?.handler_name,
                channels: stream.channels,
            }));

            resolve({
                duration: metadata.format.duration || 0,
                tracks,
            });
        });
    });
}
