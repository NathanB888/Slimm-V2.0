
import React from 'react';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-8 px-4">
      <header className="mb-8">
        <img src="/logo.svg" alt="Slimm Besparen" className="h-10" />
      </header>
      <main className="w-full max-w-xl">
        {children}
      </main>
      <footer className="mt-auto pt-12 pb-4 text-center text-gray-400 text-sm">
        &copy; 2026 Slimm Besparen Netherlands. Simple, Smart, Saved.
      </footer>
    </div>
  );
};
