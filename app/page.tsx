'use client';

import React, { useState } from 'react';
import PlayerLayout from '@/components/PlayerLayout';
import KMPlayer from '@/components/KMPlayer';

export default function Home() {
  const [urlInput, setUrlInput] = useState('');
  const [streamUrl, setStreamUrl] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const handleStream = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      setStreamUrl(urlInput.trim());
      setIsStreaming(true);
    }
  };

  const handleBack = () => {
    setIsStreaming(false);
    setStreamUrl('');
  };

  if (isStreaming) {
    return (
      <PlayerLayout>
        <div className="absolute top-4 left-4 z-50">
          <button
            onClick={handleBack}
            className="bg-gray-800 text-white px-4 py-2 rounded hover:bg-gray-700 transition-colors opacity-50 hover:opacity-100"
          >
            ← Back
          </button>
        </div>
        <KMPlayer key={streamUrl} srcUrl={streamUrl} />
      </PlayerLayout>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gray-950 text-white p-4">
      <div className="max-w-2xl w-full text-center space-y-8">
        <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-pink-600 bg-clip-text text-transparent">
          StreamFlow
        </h1>
        <p className="text-gray-400 text-lg">
          Instantly stream large videos from direct URLs using our smart chunking proxy.
          Bypass download limits and buffering.
        </p>

        <form onSubmit={handleStream} className="w-full space-y-4">
          <div className="relative">
            <input
              type="url"
              placeholder="Paste direct video URL here..."
              className="w-full px-6 py-4 bg-gray-900 border border-gray-800 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-white text-lg placeholder-gray-600 transition-all shadow-lg"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              required
            />
          </div>
          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-xl hover:opacity-90 transition-opacity shadow-lg shadow-purple-900/20"
          >
            Start Streaming
          </button>
        </form>

        <div className="text-sm text-gray-600 pt-8">
          <p className="font-semibold mb-2">Try these samples:</p>
          <ul className="space-y-1">
            <li
              className="cursor-pointer hover:text-purple-400 transition-colors"
              onClick={() => setUrlInput('https://raw.githubusercontent.com/mediaelement/mediaelement-files/master/big_buck_bunny.mp4')}
            >
              Big Buck Bunny (GitHub Raw)
            </li>
          </ul>
        </div>

      </div>
    </main>
  );
}
