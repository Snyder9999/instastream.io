import React, { ReactNode } from 'react';

interface PlayerLayoutProps {
    children: ReactNode;
}

const PlayerLayout: React.FC<PlayerLayoutProps> = ({ children }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black text-white">
            <div className="w-full max-w-6xl aspect-video bg-gray-900 shadow-2xl relative group">
                {children}
            </div>
        </div>
    );
};

export default PlayerLayout;
