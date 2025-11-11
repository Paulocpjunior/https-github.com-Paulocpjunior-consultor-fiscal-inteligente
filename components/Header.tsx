
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="w-full text-center py-6 md:py-8">
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
