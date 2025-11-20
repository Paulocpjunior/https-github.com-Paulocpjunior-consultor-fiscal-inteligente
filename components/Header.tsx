import React from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import Logo from './Logo';
import { MenuIcon } from './Icons';

interface HeaderProps {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
    onMenuClick: () => void;
    description?: string;
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme, onMenuClick, description }) => {
  return (
    <header className="w-full py-6 md:py-8">
      <div className="flex justify-between items-center">
        {/* Left side: Logo & Title */}
        <div className="flex items-center gap-4">
          <Logo />
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-800 dark:text-slate-100">
              Consultor Fiscal Inteligente
            </h1>
            <p className="mt-1 text-sm font-semibold text-sky-600 dark:text-sky-400 tracking-wider">
              DESENVOLVIDO BY SP ASSESSORIA CONTÁBIL
            </p>
          </div>
        </div>

        {/* Right side: Actions */}
        <div className="flex items-center gap-2">
          <ThemeSwitcher theme={theme} toggleTheme={toggleTheme} />
          <button
              onClick={onMenuClick}
              className="btn-press md:hidden p-2 rounded-full text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 dark:focus:ring-offset-slate-900 transition-colors"
              aria-label="Abrir menu"
          >
              <MenuIcon className="w-6 h-6" />
          </button>
        </div>
      </div>

      <p className="mt-4 text-center text-md text-slate-600 dark:text-slate-400 animate-fade-in">
        {description || "Seu assistente de IA para consultas fiscais inteligentes"}
      </p>
    </header>
  );
};

export default Header;