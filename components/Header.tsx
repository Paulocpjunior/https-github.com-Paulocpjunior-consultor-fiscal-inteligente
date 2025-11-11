import React from 'react';
import ThemeSwitcher from './ThemeSwitcher';

interface HeaderProps {
    theme: 'light' | 'dark';
    toggleTheme: () => void;
}

const Header: React.FC<HeaderProps> = ({ theme, toggleTheme }) => {
  return (
    <header className="w-full text-center py-6 md:py-8 relative">
       <div className="absolute top-4 right-4">
        <ThemeSwitcher theme={theme} toggleTheme={toggleTheme} />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-slate-800 dark:text-slate-100">
        Consultor Fiscal Inteligente
      </h1>
      <p className="mt-2 text-sm font-semibold text-sky-600 dark:text-sky-400 tracking-wider">
        DESENVOLVIDO BY SP ASSESSORIA CONTÁBIL
      </p>
      <p className="mt-2 text-md text-slate-600 dark:text-slate-400">
        Seu assistente de IA para consultas de CFOP e NCM
      </p>
    </header>
  );
};

export default Header;
