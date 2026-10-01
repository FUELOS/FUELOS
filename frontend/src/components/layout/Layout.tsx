import React from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "./Navbar";
import { Sidebar } from "./Sidebar";

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#f4f7fe] dark:bg-[#080d1a] flex text-[#2b3674] dark:text-slate-100 antialiased transition-colors duration-200">
      {/* Floating Capsule Sidebar */}
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Navbar />
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 pb-10 pt-2">
          <div className="max-w-7xl mx-auto space-y-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};
