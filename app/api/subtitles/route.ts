import { NextRequest, NextResponse } from 'next/server';
import { srtToVtt } from '@/utils/srtToVtt';

export const runtime = 'edge'; // Use Edge if possible for speed, or nodejs if we need it. 
// Actually srtToVtt is pure JS, so Edge is fine. But let's stick to nodejs defaults if unsure about project config.
// The project uses standard Next.js. srtToVtt is simple string manipulation.

export async function GET(req: NextRequest) {
    const url = req.nextUrl.searchParams.get('url');

    if (!url) {
        return new NextResponse('Missing url parameter', { status: 400 });
    }

    try {
        const response = await fetch(url);
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
    } catch (error) {
        console.error('Subtitle proxy error:', error);
        return new NextResponse('Internal Server Error', { status: 500 });
    }
}
