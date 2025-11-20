
import React from 'react';

interface LogoProps {
    className?: string;
}

const Logo: React.FC<LogoProps> = ({ className }) => {
    // Se nenhuma classe for passada, usa o padrão (texto escuro no claro, claro no escuro)
    const finalClassName = className || "h-14 sm:h-16 w-auto text-slate-800 dark:text-slate-100";

    return (
        <svg
            className={finalClassName}
            viewBox="0 0 200 200"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            aria-label="Logo da SP Assessoria Contábil"
        >
            {/* Anel externo do logotipo */}
            <path 
                d="M100 180C144.183 180 180 144.183 180 100C180 55.8172 144.183 20 100 20C55.8172 20 20 55.8172 20 100C20 144.183 55.8172 180 100 180ZM100 164C135.346 164 164 135.346 164 100C164 64.6538 135.346 36 100 36C64.6538 36 36 64.6538 36 100C36 135.346 64.6538 164 100 164Z"
            />
            {/* Letras 'SP' estilizadas */}
            <path
                d="M136 126.342C126.953 133.58 116.328 138 104.5 138C82.721 138 65 120.279 65 98.5C65 76.721 82.721 59 104.5 59C119.52 59 132.387 66.845 139 78H118V92H153V65H139V71.49C130.25 61.161 118.176 54 104.5 54C79.419 54 59 74.198 59 98.5C59 122.802 79.419 143 104.5 143C118.847 143 131.595 136.52 140.174 126.342H136Z"
            />
        </svg>
    );
};

export default Logo;
