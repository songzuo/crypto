import React, { useState } from "react";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useMobile } from "@/hooks/useMobile";

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useMobile();

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-screen bg-slate-50 dark:bg-slate-800">
      <Sidebar open={sidebarOpen || !isMobile} toggle={toggleSidebar} />
      
      <main className={`flex-1 ${isMobile ? 'w-full' : 'lg:ml-64'} min-h-screen transition-all duration-300`}>
        <Header toggleSidebar={toggleSidebar} />
        {children}
      </main>
    </div>
  );
};

export default Layout;
