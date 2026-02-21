import { NextRequest, NextResponse } from 'next/server';
import { srtToVtt } from '@/utils/srtToVtt';
import { fetchUpstreamWithRedirects } from '@/utils/upstreamFetch';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing url parameter', { status: 400 });
    }

    try {
        const response = await fetchUpstreamWithRedirects(url);

        if (!response.ok) {
            return new NextResponse(`Failed to fetch subtitles: ${response.statusText}`, { status: response.status });
        }

        const text = await response.text();

        // Simple check if it's already VTT
        if (text.startsWith('WEBVTT')) {
            return new NextResponse(text, {
                headers: {
                    'Content-Type': 'text/vtt',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        // Convert SRT to VTT
        const vtt = srtToVtt(text);

        return new NextResponse(vtt, {
            headers: {
                'Content-Type': 'text/vtt',
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=3600',
            },
        });
    } catch (error: any) {
        console.error('Subtitle proxy error:', error);
        const msg = error.message || '';
        if (msg === 'Upstream URL is not safe.' || msg.includes('Upstream URL is not safe')) {
             return new NextResponse('Forbidden: Unsafe URL', { status: 403 });
        }
        if (msg.includes('Only HTTP(S) upstream URLs are supported')) {
             return new NextResponse('Bad Request: Invalid Protocol', { status: 400 });
        }
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
