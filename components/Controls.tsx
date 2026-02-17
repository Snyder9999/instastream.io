'use client';

import React from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize } from 'lucide-react';

interface ControlsProps {
    isPlaying: boolean;
    onPlayPause: () => void;
    currentTime: number;
    duration: number;
    onSeek: (time: number) => void;
    volume: number;
    onVolumeChange: (volume: number) => void;
    isFullscreen: boolean;
    onFullscreenToggle: () => void;
    isVisible: boolean; // Controls fade out logic handled by parent or CSS
}

const Controls: React.FC<ControlsProps> = ({
    isPlaying,
    onPlayPause,
    currentTime,
    duration,
    onSeek,
    volume,
    onVolumeChange,
    isFullscreen,
    onFullscreenToggle,
    isVisible
}) => {

    // Helper to format time (e.g. 1:30)
    const formatTime = (time: number) => {
        if (!time || isNaN(time)) return "0:00";
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    };

    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        onSeek(time);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = parseFloat(e.target.value);
        onVolumeChange(vol);
    };

    return (
        <div
            className={`absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        >
            <div className="flex flex-col gap-2 w-full max-w-6xl mx-auto">
                {/* Seek Bar */}
                <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeekChange}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500 hover:h-2 transition-all"
                />

                <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-4">
                        {/* Play/Pause */}
                        <button
                            onClick={onPlayPause}
                            className="text-white hover:text-blue-400 transition-colors"
                        >
                            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                        </button>

                        {/* Volume */}
                        <div className="flex items-center gap-2 group">
                            <button
                                onClick={() => onVolumeChange(volume === 0 ? 1 : 0)}
                                className="text-white hover:text-blue-400 transition-colors"
                            >
                                {volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                            </button>
                            {/* Simple volume slider that appears on hover/group-hover could be fancy, but stick to visible for now */}
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={volume}
                                onChange={handleVolumeChange}
                                className="w-20 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                        </div>

                        {/* Time Display */}
                        <div className="text-xs text-gray-300 font-mono">
                            {formatTime(currentTime)} / {formatTime(duration)}
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Fullscreen */}
                        <button
                            onClick={onFullscreenToggle}
                            className="text-white hover:text-blue-400 transition-colors"
                        >
                            {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Controls;
