import { useEffect } from 'react';

interface PlayerShortcutsProps {
    isPlaying: boolean;
    togglePlay: () => void;
    seekRelative: (seconds: number) => void;
    volumeRelative: (change: number) => void;
    toggleFullscreen: () => void;
    toggleMute: () => void;
}

const usePlayerShortcuts = ({
    isPlaying,
    togglePlay,
    seekRelative,
    volumeRelative,
    toggleFullscreen,
    toggleMute
}: PlayerShortcutsProps) => {

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input (though we don't have many inputs yet, good practice)
            if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
                return;
            }

            switch (e.code) {
                case 'Space':
                case 'KeyK': // YouTube style
                    e.preventDefault(); // Prevent scrolling
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

                default:
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [isPlaying, togglePlay, seekRelative, volumeRelative, toggleFullscreen, toggleMute]);
};

export default usePlayerShortcuts;
