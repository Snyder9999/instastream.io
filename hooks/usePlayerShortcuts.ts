import { useEffect } from 'react';

interface PlayerShortcutsProps {
    isPlaying: boolean;
    togglePlay: () => void;
    seekRelative: (seconds: number) => void;
    volumeRelative: (change: number) => void;
    toggleFullscreen: () => void;
    toggleMute: () => void;
    adjustBrightness?: (delta: number) => void;
    adjustContrast?: (delta: number) => void;
}

const usePlayerShortcuts = ({
    isPlaying,
    togglePlay,
    seekRelative,
    volumeRelative,
    toggleFullscreen,
    toggleMute,
    adjustBrightness,
    adjustContrast,
}: PlayerShortcutsProps) => {

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.code) {
                case 'Space':
                case 'KeyK': // YouTube style
                    e.preventDefault();
                    togglePlay();
                    break;

                case 'ArrowRight':
                case 'KeyL': // YouTube style
                    e.preventDefault();
                    seekRelative(5); // +5 seconds
                    break;

                case 'ArrowLeft':
                case 'KeyJ': // YouTube style
                    e.preventDefault();
                    seekRelative(-5); // -5 seconds
                    break;

                case 'ArrowUp':
                    e.preventDefault();
                    volumeRelative(0.1); // +10% volume
                    break;

                case 'ArrowDown':
                    e.preventDefault();
                    volumeRelative(-0.1); // -10% volume
                    break;

                case 'KeyF':
                    e.preventDefault();
                    toggleFullscreen();
                    break;

                case 'KeyM':
                    e.preventDefault();
                    toggleMute();
                    break;

                // Brightness: Shift + ArrowUp / Shift + ArrowDown
                // Contrast: Ctrl + ArrowUp / Ctrl + ArrowDown
                default:
                    break;
            }

            // Brightness shortcuts (Shift + Up/Down)
            if (e.shiftKey && !e.ctrlKey) {
                if (e.code === 'ArrowUp') {
                    e.preventDefault();
                    adjustBrightness?.(0.05);
                } else if (e.code === 'ArrowDown') {
                    e.preventDefault();
                    adjustBrightness?.(-0.05);
                }
            }

            // Contrast shortcuts (Ctrl + Up/Down)
            if (e.ctrlKey && !e.shiftKey) {
                if (e.code === 'ArrowUp') {
                    e.preventDefault();
                    adjustContrast?.(0.05);
                } else if (e.code === 'ArrowDown') {
                    e.preventDefault();
                    adjustContrast?.(-0.05);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isPlaying, togglePlay, seekRelative, volumeRelative, toggleFullscreen, toggleMute, adjustBrightness, adjustContrast]);
};

export default usePlayerShortcuts;
