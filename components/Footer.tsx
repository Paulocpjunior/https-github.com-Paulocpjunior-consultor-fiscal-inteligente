
import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full text-center py-6 px-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        As informações são geradas por IA com base em dados da busca Google e devem ser usadas como referência.
        <br />
        Sempre confirme com as fontes oficiais e a legislação vigente.
      </p>
    </footer>
  );
};

export default Footer;
