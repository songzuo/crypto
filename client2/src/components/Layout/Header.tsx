import React from "react";
import { Button } from "@/components/ui/button";
import { CryptoAutocomplete } from "@/components/Search/CryptoAutocomplete";
import { Search } from "lucide-react";

interface HeaderProps {
  toggleSidebar: () => void;
}

const Header: React.FC<HeaderProps> = ({ toggleSidebar }) => {
  return (
    <header className="bg-white dark:bg-slate-900 p-4 shadow-sm flex justify-between items-center sticky top-0 z-10">
      <div className="flex items-center">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden mr-2"
          onClick={toggleSidebar}
        >
          <i className="ri-menu-line text-xl"></i>
        </Button>
        
        {/* New Autocomplete Component */}
        <div className="relative w-full max-w-md">
          <CryptoAutocomplete />
        </div>
      </div>

      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" className="text-slate-600 dark:text-slate-300">
          <i className="ri-notification-2-line text-xl"></i>
        </Button>
        <Button variant="ghost" size="icon" className="text-slate-600 dark:text-slate-300">
          <i className="ri-question-line text-xl"></i>
        </Button>
        <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-300">
          <i className="ri-user-line"></i>
        </div>
      </div>
    </header>
  );
};

export default Header;
