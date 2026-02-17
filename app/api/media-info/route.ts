import { NextRequest, NextResponse } from 'next/server';
import { probeMedia } from '@/utils/mediaProbe';
import { normalizeMediaUrl } from '@/utils/mediaUrl';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const { normalizedUrl } = normalizeMediaUrl(url);
        const metadata = await probeMedia(normalizedUrl);

        // Filter for audio tracks specifically for the frontend selector
        const audioTracks = metadata.tracks.filter(t => t.type === 'audio');

        return NextResponse.json({
            duration: metadata.duration,
            audioTracks,
            allTracks: metadata.tracks
        });
    } catch (error: unknown) {
        console.error('Probe error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to probe media' },
            { status: 500 }
        );
    }
}
