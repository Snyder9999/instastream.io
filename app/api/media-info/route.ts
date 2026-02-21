import { NextRequest, NextResponse } from 'next/server';
import { probeMedia, MediaProbeResult } from '@/utils/mediaProbe';
import { normalizeMediaUrl, assertMediaLikeSource, MediaValidationError } from '@/utils/mediaUrl';
import { SimpleLRUCache } from '@/utils/lruCache';

export const dynamic = 'force-dynamic';

const PROBE_CACHE_CAPACITY = 100;
const probeCache = new SimpleLRUCache<string, MediaProbeResult>(PROBE_CACHE_CAPACITY);

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const { normalizedUrl } = normalizeMediaUrl(url);

        let metadata = probeCache.get(normalizedUrl);

        if (!metadata) {
            // Assert that the source is actually media before probing.
            // This also performs SSRF and LFI validation.
            await assertMediaLikeSource(normalizedUrl, { signal: req.signal });

            metadata = await probeMedia(normalizedUrl);
            probeCache.set(normalizedUrl, metadata);
        }

        // Filter for audio tracks specifically for the frontend selector
        const audioTracks = metadata.tracks.filter(t => t.type === 'audio');

        return NextResponse.json({
            duration: metadata.duration,
            audioTracks,
            allTracks: metadata.tracks
        });
    } catch (error: unknown) {
        if (error instanceof MediaValidationError) {
            return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
        }
        console.error('Probe error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to probe media' },
            { status: 500 }
        );
    }
}
