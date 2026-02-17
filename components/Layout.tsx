
import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 px-4">
      <header className="mb-8 flex items-center gap-2">
        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xl shadow-lg">V</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">VoltVriend</h1>
      </header>
      <main className="w-full max-w-xl">
        {children}
      </main>
      <footer className="mt-auto pt-12 pb-4 text-center text-gray-400 text-sm">
        &copy; 2026 VoltVriend Netherlands. Simple, Smart, Saved.
      </footer>
    </div>
  );
};
