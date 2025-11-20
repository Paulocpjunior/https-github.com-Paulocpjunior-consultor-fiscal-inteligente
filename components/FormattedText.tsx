
import React from 'react';

export const FormattedText: React.FC<{ text: string }> = ({ text }) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let listItems: string[] = [];

    const flushList = () => {
        if (listItems.length > 0) {
            elements.push(
                <ul key={`ul-${elements.length}`} className="list-disc ml-5 my-2 space-y-1">
                    {listItems.map((item, i) => (
                        <li key={i}>{item}</li>
                    ))}
                </ul>
            );
            listItems = [];
        }
    };

    lines.forEach((line, index) => {
        if (line.startsWith('**') && line.endsWith('**')) {
            flushList();
            elements.push(<h3 key={index} className="text-lg font-semibold text-slate-800 dark:text-slate-100 mt-4 mb-2">{line.replace(/\*\*/g, '')}</h3>);
        } else if (line.startsWith('* ')) {
            listItems.push(line.substring(2));
        } else {
            flushList();
            // Não renderiza parágrafos vazios
            if (line.trim() !== '') {
                elements.push(<p key={index} className="my-1">{line}</p>);
            }
        }
    });

    flushList(); // Garante que qualquer lista no final do texto seja renderizada

    return <React.Fragment>{elements}</React.Fragment>;
};
