'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Controls, { AudioTrack } from './Controls';
import usePlayerShortcuts from '../hooks/usePlayerShortcuts';
import { VideoBufferManager } from '../utils/mseBufferLogic';

interface KMPlayerProps {
    srcUrl: string;
}

type PlaybackMode = 'direct' | 'proxy' | 'transcode' | 'failed';
const KEYFRAME_ALIGN_SECONDS = 2;
const SEEK_DEBOUNCE_MS = 150;
const STALL_RECOVERY_DELAY_MS = 4000;
const PROXY_ESCALATION_DELAY_MS = 6000;
const END_GUARD_SECONDS = 0.25;

function clampPlayableTime(target: number, duration?: number | null): number {
    if (!Number.isFinite(target)) return 0;
    const safeTarget = Math.max(0, target);
    if (!duration || !Number.isFinite(duration) || duration <= 0) return safeTarget;
    const maxTime = Math.max(0, duration - END_GUARD_SECONDS);
    return Math.max(0, Math.min(safeTarget, maxTime));
}

function formatTimestamp(value: number): string {
    if (!Number.isFinite(value)) return '0:00';
    const total = Math.max(0, Math.floor(value));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function readRouteError(url: string, mode: 'proxy' | 'transcode'): Promise<string | null> {
    try {
        const headers: HeadersInit = {};
        if (mode === 'proxy') {
            headers.Range = 'bytes=0-1023';
        }

        const response = await fetch(url, {
            method: 'GET',
            headers,
            cache: 'no-store',
        });

        if (response.ok) {
            await response.body?.cancel();
            return null;
        }

        const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
        if (contentType.includes('application/json')) {
            const payload = (await response.json()) as { message?: string; code?: string };
            return payload.message ?? payload.code ?? `HTTP ${response.status}`;
        }

        const text = (await response.text()).trim();
        return text ? `HTTP ${response.status}: ${text.slice(0, 180)}` : `HTTP ${response.status}`;
    } catch (error: unknown) {
        return error instanceof Error ? error.message : 'Unknown network error';
    }
}

function buildModeUrl(
    mode: PlaybackMode,
    srcUrl: string,
    transcodeStartTime: number,
    transcodeRevision: number,
    audioIndex: number | null,
): string | undefined {
    switch (mode) {
        case 'direct':
            return srcUrl;
        case 'proxy':
            return `/api/stream?url=${encodeURIComponent(srcUrl)}`;
        case 'transcode':
            const base = `/api/transcode?url=${encodeURIComponent(srcUrl)}&time=${transcodeStartTime.toFixed(3)}&r=${transcodeRevision}`;
            return audioIndex !== null ? `${base}&audioIndex=${audioIndex}` : base;
        case 'failed':
            return undefined;
        default:
            return srcUrl;
    }
}

const KMPlayer: React.FC<KMPlayerProps> = ({ srcUrl }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const handledErrorModeRef = useRef<PlaybackMode | null>(null);
    const seekDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stallRecoveryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSeekRef = useRef<number | null>(null);
    const pendingTranscodeOffsetRef = useRef<number | null>(null);
    const lastProgressAtRef = useRef(0);
    const recoveryAttemptRef = useRef(0);
    const sourceDurationRef = useRef<number | null>(null);
    const isSeekingRef = useRef(false);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isSeeking, setIsSeeking] = useState(false); // UI seeking state

    // Playback mode state machine: direct -> proxy -> transcode -> failed
    const [mode, setMode] = useState<PlaybackMode>('direct');
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [transcodeStartTime, setTranscodeStartTime] = useState(0);
    const [transcodeRevision, setTranscodeRevision] = useState(0);

    // Audio Tracks
    const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([]);
    const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | null>(null);

    // MSE state
    const mseManagerRef = useRef<VideoBufferManager | null>(null);
    const [mseUrl, setMseUrl] = useState<string | null>(null);

    // Subtitle state
    const [subtitleUrl, setSubtitleUrl] = useState<string>('');
    const [showSubtitleInput, setShowSubtitleInput] = useState(false);

    // Fetch media info on load to populate audio tracks
    useEffect(() => {
        if (!srcUrl) return;

        // Reset tracks on new URL
        setAudioTracks([]);
        setSelectedAudioIndex(null);

        const fetchInfo = async () => {
            try {
                const res = await fetch(`/api/media-info?url=${encodeURIComponent(srcUrl)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.audioTracks && Array.isArray(data.audioTracks)) {
                        setAudioTracks(data.audioTracks);
                        // Default to first track if available, or stay null to let backend decide
                        if (data.audioTracks.length > 0) {
                            setSelectedAudioIndex(data.audioTracks[0].index);
                        }
                    }
                }
            } catch (e) {
                console.error('Failed to fetch media info:', e);
            }
        };
        fetchInfo();
    }, [srcUrl]);

    const finalUrl = useMemo(
        () => buildModeUrl(mode, srcUrl, transcodeStartTime, transcodeRevision, selectedAudioIndex),
        [mode, srcUrl, transcodeStartTime, transcodeRevision, selectedAudioIndex],
    );

    useEffect(() => {
        if (mode === 'transcode' && finalUrl) {
            // Initialize MSE
            if (mseManagerRef.current) {
                mseManagerRef.current.destroy();
            }
            const manager = new VideoBufferManager(() => videoRef.current?.currentTime || 0);
            mseManagerRef.current = manager;
            setMseUrl(manager.getUrl());
            manager.startFetching(finalUrl);

            return () => {
                if (mseManagerRef.current) {
                    mseManagerRef.current.destroy();
                    mseManagerRef.current = null;
                }
                setMseUrl(null);
            };
        } else {
            // Cleanup MSE if switching away from transcode
            if (mseManagerRef.current) {
                mseManagerRef.current.destroy();
                mseManagerRef.current = null;
            }
            setMseUrl(null);
        }
    }, [mode, finalUrl]);

    const handleSubtitleToggle = useCallback(() => {
        setShowSubtitleInput(prev => !prev);
    }, []);

    const handleSubtitleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        const url = formData.get('subtitleUrl') as string;
        if (url) {
            setSubtitleUrl(url);
            setShowSubtitleInput(false);
            setStatusMessage('Subtitles loaded.');
            setTimeout(() => setStatusMessage(null), 3000);
        }
    };

    const clearStallRecoveryTimer = useCallback(() => {
        if (!stallRecoveryTimerRef.current) return;
        clearTimeout(stallRecoveryTimerRef.current);
        stallRecoveryTimerRef.current = null;
    }, []);

    const getAbsolutePlaybackTime = useCallback(() => {
        const video = videoRef.current;
        if (!video) return currentTime;
        if (mode === 'transcode') {
            return Math.max(0, transcodeStartTime + (video.currentTime || 0));
        }
        return Math.max(0, video.currentTime || currentTime);
    }, [currentTime, mode, transcodeStartTime]);

    const commitTranscodeSeek = useCallback((absoluteTarget: number, reasonMessage?: string) => {
        const absoluteDuration = sourceDurationRef.current ?? duration;
        const clamped = clampPlayableTime(absoluteTarget, absoluteDuration);
        const alignedStart = Math.max(
            0,
            Math.floor(clamped / KEYFRAME_ALIGN_SECONDS) * KEYFRAME_ALIGN_SECONDS,
        );
        const offsetWithinSegment = Math.max(0, clamped - alignedStart);

        pendingTranscodeOffsetRef.current = offsetWithinSegment;
        setIsSeeking(true);
        setCurrentTime(clamped);
        setTranscodeStartTime(alignedStart);
        setTranscodeRevision((prev) => prev + 1);
        handledErrorModeRef.current = null;
        clearStallRecoveryTimer();

        if (reasonMessage) {
            setStatusMessage(reasonMessage);
        } else {
            setStatusMessage(`Seeking to ${formatTimestamp(clamped)}...`);
        }
    }, [clearStallRecoveryTimer, duration]);

    const switchToTranscode = useCallback((absoluteStart: number, message: string) => {
        const absoluteDuration = sourceDurationRef.current ?? duration;
        const start = clampPlayableTime(absoluteStart, absoluteDuration);
        pendingTranscodeOffsetRef.current = 0;
        setIsSeeking(true);
        setCurrentTime(start);
        setTranscodeStartTime(start);
        setTranscodeRevision((prev) => prev + 1);
        setStatusMessage(message);
        setMode('transcode');
        handledErrorModeRef.current = null;
        clearStallRecoveryTimer();
    }, [clearStallRecoveryTimer, duration]);

    const recoverFromStall = useCallback((reason: string) => {
        const video = videoRef.current;
        if (!video || !isPlaying) return;

        if (mode === 'transcode') {
            if (recoveryAttemptRef.current >= 2) {
                setMode('failed');
                setStatusMessage('Playback stalled repeatedly during transcoding.');
                return;
            }

            recoveryAttemptRef.current += 1;
            const absolute = getAbsolutePlaybackTime();
            commitTranscodeSeek(absolute, `Recovering stalled playback (${reason})...`);
            return;
        }

        if (mode === 'proxy') {
            switchToTranscode(
                getAbsolutePlaybackTime(),
                'Proxy playback stalled. Switching to live transcoding.',
            );
            return;
        }

        if (mode === 'direct') {
            setStatusMessage('Direct playback stalled. Retrying through proxy.');
            setMode('proxy');
        }
    }, [commitTranscodeSeek, getAbsolutePlaybackTime, isPlaying, mode, switchToTranscode]);

    const scheduleStallRecovery = useCallback((reason: string) => {
        clearStallRecoveryTimer();
        stallRecoveryTimerRef.current = setTimeout(() => {
            const video = videoRef.current;
            if (!video || video.paused) return;

            const stale = Date.now() - lastProgressAtRef.current >= STALL_RECOVERY_DELAY_MS - 250;
            if (!stale) return;

            recoverFromStall(reason);
        }, STALL_RECOVERY_DELAY_MS);
    }, [clearStallRecoveryTimer, recoverFromStall]);

    // Some browsers can hang on unsupported proxy streams without firing a useful second error.
    // If proxy mode never becomes playable, force escalation to transcoding.
    useEffect(() => {
        if (mode !== 'proxy') return;

        const timer = setTimeout(() => {
            const video = videoRef.current;
            if (!video) return;

            const stalledAtStart = video.readyState < 2 && video.currentTime === 0;
            if (!stalledAtStart) return;

            switchToTranscode(
                getAbsolutePlaybackTime(),
                'Proxy did not become playable. Switching to live transcoding.',
            );
        }, PROXY_ESCALATION_DELAY_MS);

        return () => clearTimeout(timer);
    }, [getAbsolutePlaybackTime, mode, switchToTranscode]);

    useEffect(() => {
        isSeekingRef.current = isSeeking;
    }, [isSeeking]);

    useEffect(() => {
        lastProgressAtRef.current = Date.now();
    }, []);

    const togglePlay = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video.paused) {
            video.play().catch(() => undefined);
        } else {
            video.pause();
        }
    }, []);

    const handleSeek = useCallback((time: number) => {
        const video = videoRef.current;
        if (!video) return;

        const absoluteDuration = sourceDurationRef.current ?? duration;
        const safeTime = clampPlayableTime(time, absoluteDuration);
        setCurrentTime(safeTime);

        if (mode === 'transcode') {
            pendingSeekRef.current = safeTime;

            if (seekDebounceRef.current) {
                clearTimeout(seekDebounceRef.current);
            }

            seekDebounceRef.current = setTimeout(() => {
                const target = pendingSeekRef.current ?? safeTime;
                commitTranscodeSeek(target);
            }, SEEK_DEBOUNCE_MS);
            return;
        }

        setIsSeeking(true);
        video.currentTime = safeTime;
    }, [commitTranscodeSeek, duration, mode]);

    const seekRelative = useCallback((seconds: number) => {
        handleSeek(currentTime + seconds);
    }, [currentTime, handleSeek]);

    const handleVolume = useCallback((vol: number) => {
        const video = videoRef.current;
        if (!video) return;

        const safeVol = Math.max(0, Math.min(vol, 1));
        video.volume = safeVol;
        video.muted = safeVol === 0;
        setVolume(safeVol);
    }, []);

    const volumeRelative = useCallback((change: number) => {
        const video = videoRef.current;
        if (!video) return;
        handleVolume(video.volume + change);
    }, [handleVolume]);

    const toggleMute = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;

        if (video.volume === 0) {
            handleVolume(1);
            return;
        }

        handleVolume(0);
    }, [handleVolume]);

    const toggleFullscreen = useCallback(() => {
        if (!containerRef.current) return;

        if (!document.fullscreenElement) {
            containerRef.current.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message}`);
            });
            return;
        }

        document.exitFullscreen().catch(() => undefined);
    }, []);

    usePlayerShortcuts({
        isPlaying,
        togglePlay,
        seekRelative,
        volumeRelative,
        toggleFullscreen,
        toggleMute,
    });

    const handleMouseMove = useCallback(() => {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }

        controlsTimeoutRef.current = setTimeout(() => {
            if (isPlaying) {
                setShowControls(false);
            }
        }, 3000);
    }, [isPlaying]);

    const advanceMode = useCallback(async (currentMode: Exclude<PlaybackMode, 'failed'>) => {
        if (currentMode === 'direct') {
            setStatusMessage('Direct playback failed. Retrying through proxy.');
            setMode('proxy');
            return;
        }

        if (currentMode === 'proxy') {
            const diagnostics = await readRouteError(
                `/api/stream?url=${encodeURIComponent(srcUrl)}`,
                'proxy',
            );
            setStatusMessage(
                diagnostics
                    ? `Proxy failed: ${diagnostics}. Retrying with live transcoding.`
                    : 'Proxy failed. Retrying with live transcoding.',
            );
            switchToTranscode(getAbsolutePlaybackTime(), 'Switching to live transcoding...');
            return;
        }

        if (recoveryAttemptRef.current < 2) {
            recoveryAttemptRef.current += 1;
            commitTranscodeSeek(getAbsolutePlaybackTime(), 'Transcoding stream errored. Recovering...');
            return;
        }

        const diagnostics = await readRouteError(
            `/api/transcode?url=${encodeURIComponent(srcUrl)}`,
            'transcode',
        );

        setStatusMessage(
            diagnostics
                ? `Transcoding failed: ${diagnostics}`
                : 'Transcoding failed after all fallback modes.',
        );
        setMode('failed');
    }, [commitTranscodeSeek, getAbsolutePlaybackTime, srcUrl, switchToTranscode]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onTimeUpdate = () => {
            const raw = video.currentTime || 0;
            const absolute = mode === 'transcode' ? transcodeStartTime + raw : raw;
            setCurrentTime(absolute);
            lastProgressAtRef.current = Date.now();
        };
        const onLoadedMetadata = () => {
            const nativeDuration = Number.isFinite(video.duration) && video.duration > 0
                ? video.duration
                : null;

            if (mode === 'transcode') {
                const inferredTotal = nativeDuration !== null
                    ? transcodeStartTime + nativeDuration
                    : null;
                const absoluteDuration = sourceDurationRef.current ?? inferredTotal;

                if (absoluteDuration !== null && Number.isFinite(absoluteDuration) && absoluteDuration > 0) {
                    setDuration(absoluteDuration);
                }

                const pendingOffset = pendingTranscodeOffsetRef.current;
                if (pendingOffset !== null) {
                    const maxOffset = nativeDuration !== null
                        ? Math.max(0, nativeDuration - END_GUARD_SECONDS)
                        : pendingOffset;
                    const safeOffset = Math.max(0, Math.min(pendingOffset, maxOffset));

                    if (safeOffset > 0.01) {
                        try {
                            video.currentTime = safeOffset;
                        } catch {
                            // Ignore browser-specific seek failures; stall recovery handles fallback.
                        }
                    }
                    pendingTranscodeOffsetRef.current = null;
                }
            } else if (nativeDuration !== null) {
                sourceDurationRef.current = nativeDuration;
                setDuration(nativeDuration);
            }

            setIsSeeking(false);
            clearStallRecoveryTimer();
        };
        const onVolumeChange = () => {
            setVolume(video.volume);
        };
        const onSeeking = () => {
            setIsSeeking(true);
            clearStallRecoveryTimer();
        };
        const onSeeked = () => {
            setIsSeeking(false);
            lastProgressAtRef.current = Date.now();
            clearStallRecoveryTimer();
        };
        const onWaiting = () => {
            if (!isSeekingRef.current) {
                scheduleStallRecovery('buffering');
            }
        };
        const onStalled = () => {
            if (!isSeekingRef.current) {
                scheduleStallRecovery('stalled');
            }
        };
        const onCanPlay = () => clearStallRecoveryTimer();
        const onPlaying = () => {
            clearStallRecoveryTimer();
            setIsSeeking(false);
            recoveryAttemptRef.current = 0;
            setStatusMessage((prev) => {
                if (!prev) return prev;
                if (
                    prev.includes('Seeking') ||
                    prev.includes('Recovering') ||
                    prev.includes('Switching to live transcoding') ||
                    prev.includes('Proxy did not become playable')
                ) {
                    return null;
                }
                return prev;
            });
        };

        const onError = () => {
            if (mode === 'failed') return;

            if (handledErrorModeRef.current === mode) {
                return;
            }
            handledErrorModeRef.current = mode;

            const err = video.error;
            console.error('Video Error Details:', {
                mode,
                code: err?.code,
                message: err?.message,
                original: err,
            });

            void advanceMode(mode);
        };

        video.addEventListener('play', onPlay);
        video.addEventListener('pause', onPause);
        video.addEventListener('timeupdate', onTimeUpdate);
        video.addEventListener('loadedmetadata', onLoadedMetadata);
        video.addEventListener('volumechange', onVolumeChange);
        video.addEventListener('seeking', onSeeking);
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('waiting', onWaiting);
        video.addEventListener('stalled', onStalled);
        video.addEventListener('canplay', onCanPlay);
        video.addEventListener('playing', onPlaying);
        video.addEventListener('error', onError);

        return () => {
            video.removeEventListener('play', onPlay);
            video.removeEventListener('pause', onPause);
            video.removeEventListener('timeupdate', onTimeUpdate);
            video.removeEventListener('loadedmetadata', onLoadedMetadata);
            video.removeEventListener('volumechange', onVolumeChange);
            video.removeEventListener('seeking', onSeeking);
            video.removeEventListener('seeked', onSeeked);
            video.removeEventListener('waiting', onWaiting);
            video.removeEventListener('stalled', onStalled);
            video.removeEventListener('canplay', onCanPlay);
            video.removeEventListener('playing', onPlaying);
            video.removeEventListener('error', onError);
        };
    }, [advanceMode, clearStallRecoveryTimer, mode, scheduleStallRecovery, transcodeStartTime]);

    useEffect(() => {
        handledErrorModeRef.current = null;
        clearStallRecoveryTimer();
    }, [clearStallRecoveryTimer, finalUrl, mode]);

    useEffect(() => {
        const onFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };

        document.addEventListener('fullscreenchange', onFullscreenChange);
        return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
    }, []);

    useEffect(() => {
        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
            if (seekDebounceRef.current) {
                clearTimeout(seekDebounceRef.current);
            }
            clearStallRecoveryTimer();
        };
    }, [clearStallRecoveryTimer]);

    if (!srcUrl) {
        return <div className="flex items-center justify-center h-full text-gray-500">No Video Source</div>;
    }

    return (
        <div
            ref={containerRef}
            className="relative w-full h-full bg-black group overflow-hidden"
            onMouseMove={handleMouseMove}
            onMouseLeave={() => isPlaying && setShowControls(false)}
        >
            <video
                key={`${mode}:${finalUrl ?? 'none'}`}
                ref={videoRef}
                className="w-full h-full object-contain cursor-pointer"
                onClick={togglePlay}
                autoPlay
                playsInline
                src={mode === 'transcode' ? (mseUrl ?? undefined) : finalUrl}
                crossOrigin="anonymous"
            >
                {subtitleUrl && (
                    <track
                        kind="subtitles"
                        src={`/api/subtitles?url=${encodeURIComponent(subtitleUrl)}`}
                        label="English"
                        default
                    />
                )}
                Your browser does not support the video tag.
            </video>

            <Controls
                isPlaying={isPlaying}
                onPlayPause={togglePlay}
                currentTime={currentTime}
                duration={duration}
                onSeek={handleSeek}
                volume={volume}
                onVolumeChange={handleVolume}
                isFullscreen={isFullscreen}
                onFullscreenToggle={toggleFullscreen}
                onSubtitleToggle={handleSubtitleToggle}
                hasSubtitles={!!subtitleUrl}
                isVisible={showControls}
                audioTracks={audioTracks}
                selectedAudioIndex={selectedAudioIndex}
                onAudioTrackChange={(index) => {
                    setSelectedAudioIndex(index);
                    // Force reload if in transcode mode by bumping revision or just letting dependency update
                    // Dependency update on finalUrl -> useEffect -> MSE reload
                    if (mode === 'transcode') {
                        setTranscodeRevision(prev => prev + 1);
                        setStatusMessage('Switching audio track...');
                    }
                }}
            />

            {mode === 'proxy' && (
                <div className="absolute top-2 right-2 bg-yellow-600 text-white text-xs px-2 py-1 rounded opacity-90 pointer-events-none z-10">
                    Proxy Fallback
                </div>
            )}

            {mode === 'transcode' && (
                <div className="absolute top-2 right-2 bg-red-600 text-white text-xs px-2 py-1 rounded opacity-90 pointer-events-none z-10">
                    Transcoding Live
                </div>
            )}

            {isSeeking && (
                <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs px-2 py-1 rounded opacity-90 pointer-events-none z-10">
                    Seeking...
                </div>
            )}

            {showSubtitleInput && (
                <div className="absolute inset-0 bg-black/80 flex items-center justify-center z-20">
                    <form onSubmit={handleSubtitleSubmit} className="bg-gray-900 p-6 rounded-xl border border-gray-700 space-y-4 w-96">
                        <h3 className="text-white font-semibold">Load Subtitles (SRT/VTT)</h3>
                        <input
                            name="subtitleUrl"
                            type="url"
                            placeholder="https://example.com/subs.srt"
                            className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            autoFocus
                        />
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowSubtitleInput(false)}
                                className="px-3 py-1 text-gray-400 hover:text-white"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-500"
                            >
                                Load
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {statusMessage && (
                <div className="absolute bottom-2 left-2 right-2 bg-gray-900/90 text-gray-100 text-xs px-3 py-2 rounded pointer-events-none z-10">
                    {statusMessage}
                </div>
            )}

            {mode === 'failed' && (
                <div className="absolute inset-0 bg-black/70 flex items-center justify-center px-6 text-center text-sm text-red-300 z-10">
                    Playback failed after trying direct, proxy, and transcoding modes.
                </div>
            )}
        </div>
    );
};

export default KMPlayer;
