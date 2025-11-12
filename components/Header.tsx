import React from 'react';
import ThemeSwitcher from './ThemeSwitcher';
import Logo from './Logo';

interface HeaderProps {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme }) => {
  return (
    <header className="w-full py-6 md:py-8 relative">
       <div className="absolute top-4 right-4">
        <ThemeSwitcher theme={theme} toggleTheme={toggleTheme} />
      </div>
      
      <div className="flex justify-center items-center gap-4 sm:gap-6">
        <Logo />
        <div className="text-left">
          <h1 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-slate-100">
            Consultor Fiscal Inteligente
          </h1>
          <p className="mt-1 text-sm font-semibold text-sky-600 dark:text-sky-400 tracking-wider">
            DESENVOLVIDO BY SP ASSESSORIA CONTÁBIL
          </p>
        </div>
      </div>

      <p className="mt-4 text-center text-md text-slate-600 dark:text-slate-400">
        Seu assistente de IA para consultas de CFOP e NCM
      </p>
    </header>
  );
};

export default Header;