import { NextRequest, NextResponse } from 'next/server';
import { probeMedia } from '@/utils/mediaProbe';
import { normalizeMediaUrl, assertMediaLikeSource, MediaValidationError } from '@/utils/mediaUrl';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const { normalizedUrl } = normalizeMediaUrl(url);

        // Assert that the source is actually media before probing.
        // This also performs SSRF and LFI validation.
        await assertMediaLikeSource(normalizedUrl, { signal: req.signal });

        const metadata = await probeMedia(normalizedUrl);

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
