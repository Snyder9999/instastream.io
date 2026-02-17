import React, { ReactNode } from 'react';

interface PlayerLayoutProps {
    children: ReactNode;
}

const PlayerLayout: React.FC<PlayerLayoutProps> = ({ children }) => {
    return (
        <div className="fixed inset-0 bg-black">
            <div className="w-full h-full">
                {children}
            </div>
        </div>
    );
};

export default PlayerLayout;
