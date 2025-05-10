import React from "react";
import { Link, useLocation } from "wouter";
import { useTheme } from "./ThemeProvider";
import { Switch } from "@/components/ui/switch";
import { navItems } from "@/lib/constants";

interface SidebarProps {
  open: boolean;
  toggle: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ open, toggle }) => {
  const [location] = useLocation();
  const { theme, setTheme } = useTheme();
  
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={toggle}
        />
      )}
      
      {/* Sidebar */}
      <aside
        className={`w-64 bg-white dark:bg-slate-900 shadow-md fixed top-0 bottom-0 z-30 transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center space-x-2">
            <i className="ri-radar-line text-2xl text-primary"></i>
            <h1 className="text-xl font-bold">CryptoScan</h1>
          </div>
          <button
            onClick={toggle}
            className="lg:hidden text-slate-600 dark:text-slate-300"
          >
            <i className="ri-close-line text-xl"></i>
          </button>
        </div>

        <nav className="p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <Link href={item.path}>
                  <a
                    className={`flex items-center p-2 rounded-lg ${
                      location === item.path
                        ? "bg-primary text-white"
                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  >
                    <i className={`${item.icon} mr-3`}></i>
                    <span>{item.label}</span>
                  </a>
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-xs uppercase text-slate-500 dark:text-slate-400 font-semibold mb-2">
              Theme
            </h3>
            <div className="flex items-center">
              <span className="text-sm mr-2">
                <i className="ri-sun-line"></i>
              </span>
              <Switch
                checked={isDark}
                onCheckedChange={() => setTheme(isDark ? 'light' : 'dark')}
                id="darkModeToggle"
              />
              <span className="text-sm ml-2">
                <i className="ri-moon-line"></i>
              </span>
            </div>
          </div>
        </nav>
      </aside>
    </>
  );
};

export default Sidebar;
