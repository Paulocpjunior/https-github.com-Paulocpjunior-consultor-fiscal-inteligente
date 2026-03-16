import React, { useState, useEffect, useCallback } from 'react';
import { FileText, Download, Users, TrendingUp, Loader2, LogOut, Search, BarChart3, Calendar, Bell, Code, Upload, FileKey, Zap, Cloud, Sun, Moon, ChevronDown, Clock, Trash2, UserPlus, Lock, RefreshCcw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ─── Types ────────────────────────────────────────────────────────────────────
type Aba = 'conectar' | 'certificados' | 'clientes' | 'agendamento' | 'resultados' | 'graficos' | 'historico' | 'alertas' | 'repositorio' | 'codigo';

interface Certificate {
  id: number; nome: string; tipo: string; tamanho: string;
  dataUpload: string; base64: string; senha: string;
  validado: boolean; cnpj: string; razaoSocial: string; validade: string; status: string;
}
interface Client {
  id: number; nome: string; cnpj: string; im: string; certificadoId: string; ativo: boolean;
}
interface Result {
  cliente: string; cnpj: string; im: string; periodo: string;
  prestados: { notas: number; valor: string; iss: string; creditos: string; semTomador: number; lista?: any[] };
  tomados: { notas: number; valor: string };
  fonte: string; status: string;
}
interface HistoryItem { id: number; data: string; qt: number; resultados: Result[]; }
interface Log { time: string; msg: string; tipo: 'info' | 'success' | 'warning' | 'error'; id: number; }
interface Agendamento { id: number; clientId: number; periodo: string; dataAgendamento: string; status: string; }
interface GcpConfig {
  projectId: string; region: string; configured: boolean; connectionVerified: boolean;
  endpoints: { validarCertificado: string; consultarNFP: string; healthCheck: string; };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AssistenteNFPPro() {
  const [aba, setAba] = useState<Aba>('certificados');
  const [theme, setTheme] = useState(() => localStorage.getItem('nfp_theme') || 'light');
  const [certificados, setCertificados] = useState<Certificate[]>(() => { try { return JSON.parse(localStorage.getItem('nfp_certificados') || '[]'); } catch { return []; } });
  const [clientes, setClientes] = useState<Client[]>(() => { try { return JSON.parse(localStorage.getItem('nfp_clientes') || '[]'); } catch { return []; } });
  const [resultados, setResultados] = useState<Result[]>([]);
  const [historico, setHistorico] = useState<HistoryItem[]>(() => { try { return JSON.parse(localStorage.getItem('nfp_historico') || '[]'); } catch { return []; } });
  const [logs, setLogs] = useState<Log[]>([]);
  const [analiseIA, setAnaliseIA] = useState('');
  const [processando, setProcessando] = useState(false);
  const [filtros, setFiltros] = useState({ busca: '', status: 'todos', periodo: '' });
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>(() => { try { return JSON.parse(localStorage.getItem('nfp_agendamentos') || '[]'); } catch { return []; } });
  const [novoAgendamento, setNovoAgendamento] = useState({ clientId: '', periodo: `${(new Date().getMonth()+1).toString().padStart(2,'0')}/${new Date().getFullYear()}`, data: new Date(Date.now()+60000*5).toISOString().slice(0,16) });
  const [certValidando, setCertValidando] = useState<number | null>(null);
  const [uploadingCert, setUploadingCert] = useState(false);
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<HistoryItem | null>(null);
  const [gcpConfig, setGcpConfig] = useState<GcpConfig>(() => { try { return JSON.parse(localStorage.getItem('nfp_gcp_config') || '{"projectId":"","region":"southamerica-east1","configured":false,"connectionVerified":false,"endpoints":{"validarCertificado":"","consultarNFP":"","healthCheck":""}}'); } catch { return { projectId: '', region: 'southamerica-east1', configured: false, connectionVerified: false, endpoints: { validarCertificado: '', consultarNFP: '', healthCheck: '' } }; } });
  const [repositorio, setRepositorio] = useState<any[]>(() => { try { return JSON.parse(localStorage.getItem('nfp_repositorio') || '[]'); } catch { return []; } });
  const [lembretes, setLembretes] = useState<any[]>(() => { try { return JSON.parse(localStorage.getItem('nfp_lembretes') || '[]'); } catch { return []; } });
  const [showLembretes, setShowLembretes] = useState(false);

  // Persistência
  useEffect(() => {
    localStorage.setItem('nfp_certificados', JSON.stringify(certificados));
    localStorage.setItem('nfp_clientes', JSON.stringify(clientes));
    localStorage.setItem('nfp_agendamentos', JSON.stringify(agendamentos));
    localStorage.setItem('nfp_historico', JSON.stringify(historico));
    localStorage.setItem('nfp_gcp_config', JSON.stringify(gcpConfig));
  }, [certificados, clientes, agendamentos, historico, gcpConfig]);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('nfp_theme', theme);
  }, [theme]);

  // Agendamentos automáticos
  const executarAgendamento = useCallback(async (ag: Agendamento) => {
    setAgendamentos(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'executado' } : a));
    const cli = clientes.find(c => c.id === ag.clientId);
    if (!cli) return;
    try {
      const res = await consultarNFP(cli, ag.periodo);
      setHistorico(prev => [{ id: Date.now(), data: new Date().toLocaleString('pt-BR'), qt: 1, resultados: [res] }, ...prev].slice(0, 10));
      addLog('Agendamento executado: ' + cli.nome, 'success');
    } catch (e) {
      addLog('Falha agendamento: ' + (e instanceof Error ? e.message : 'Erro'), 'error');
      setAgendamentos(prev => prev.map(a => a.id === ag.id ? { ...a, status: 'erro' } : a));
    }
  }, [clientes]);

  useEffect(() => {
    const interval = setInterval(() => {
      const agora = new Date();
      agendamentos.forEach(ag => { if (ag.status === 'agendado' && new Date(ag.dataAgendamento) <= agora) executarAgendamento(ag); });
    }, 30000);
    return () => clearInterval(interval);
  }, [agendamentos, executarAgendamento]);

  const addLog = useCallback((msg: string, tipo: Log['tipo'] = 'info') => {
    setLogs(p => [...p.slice(-100), { time: new Date().toLocaleTimeString('pt-BR'), msg, tipo, id: Date.now() }]);
  }, []);

  const applyCnpjMask = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 14);
    if (d.length > 12) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
    if (d.length > 8) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{0,4})/, '$1.$2.$3/$4');
    if (d.length > 5) return d.replace(/^(\d{2})(\d{3})(\d{0,3})/, '$1.$2.$3');
    if (d.length > 2) return d.replace(/^(\d{2})(\d{0,3})/, '$1.$2');
    return d;
  };

  // Validar certificado via backend
  const validarCertificado = async (certId: number) => {
    const cert = certificados.find(c => c.id === certId);
    if (!cert || !cert.senha) { alert('Digite a senha do certificado!'); return; }
    setCertValidando(certId);
    addLog('Validando certificado...', 'info');
    try {
      const res = await fetch('/api/nfp/validar-certificado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ certificateBase64: cert.base64, senha: cert.senha })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro na validacao');
      const expirado = data.expirado || false;
      const validadeStr = data.validade ? new Date(data.validade).toLocaleDateString('pt-BR') : '';
      setCertificados(p => p.map(c => c.id === certId ? {
        ...c, validado: !expirado,
        cnpj: data.cnpj ? applyCnpjMask(data.cnpj) : 'N/A',
        razaoSocial: data.razaoSocial || 'Nao identificado',
        validade: validadeStr, status: expirado ? 'vencido' : 'valido'
      } : c));
      addLog((expirado ? 'VENCIDO em ' : 'Valido! Vence: ') + validadeStr, expirado ? 'warning' : 'success');
      // Auto-preencher cliente
      if (!expirado && data.razaoSocial) {
        setClientes(prev => {
          const alvo = prev.find(c => !c.nome || !c.cnpj);
          if (!alvo) return prev;
          return prev.map(c => c.id === alvo.id ? { ...c, nome: c.nome || data.razaoSocial, cnpj: c.cnpj || (data.cnpj ? applyCnpjMask(data.cnpj) : ''), certificadoId: String(certId), ativo: true } : c);
        });
        addLog('Auto-preenchido: ' + data.razaoSocial, 'info');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Erro';
      setCertificados(p => p.map(c => c.id === certId ? { ...c, status: 'invalido' } : c));
      addLog('Falha: ' + msg, 'error');
    } finally {
      setCertValidando(null);
    }
  };

  // Consultar NFP
  const consultarNFP = async (cli: Client, periodoOverride?: string): Promise<Result> => {
    const periodo = periodoOverride || `${(new Date().getMonth()+1).toString().padStart(2,'0')}/${new Date().getFullYear()}`;
    const cert = certificados.find(c => c.validado);
    if (cert?.base64 && cert?.senha) {
      addLog('Consultando Focus NFe: ' + cli.nome, 'info');
      try {
        const res = await fetch('/api/nfp/consultar-focus', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cnpj: cli.cnpj.replace(/[^0-9]/g,''), periodo })
        });
        if (res.ok) {
          const data = await res.json();
          addLog('Focus NFe: ' + data.prestados.notas + ' notas', 'success');
          return { cliente: cli.nome, cnpj: cli.cnpj, im: cli.im, periodo, prestados: data.prestados, tomados: data.tomados || { notas: 0, valor: '0.00' }, fonte: 'FOCUS_NFE_REAL', status: 'sucesso' };
        }
      } catch (e) { addLog('Erro Focus NFe, usando simulacao', 'warning'); }
    }
    // Simulação
    addLog('Modo simulacao: ' + cli.nome, 'warning');
    await new Promise(r => setTimeout(r, 600));
    const n = Math.floor(Math.random()*30)+5, v = (Math.random()*50000+5000).toFixed(2);
    return { cliente: cli.nome, cnpj: cli.cnpj, im: cli.im, periodo,
      prestados: { notas: n, valor: v, iss: (parseFloat(v)*0.05).toFixed(2), creditos: (parseFloat(v)*0.02).toFixed(2), semTomador: Math.random()>0.7?Math.floor(Math.random()*3):0 },
      tomados: { notas: Math.floor(n/2), valor: (parseFloat(v)/2).toFixed(2) }, fonte: 'SIMULACAO', status: 'simulado' };
  };

  // Analisar com IA
  const analisarIA = async (dados: Result[]) => {
    addLog('Analisando com Gemini AI...', 'info');
    try {
      const res = await fetch('/api/fiscal/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `Analise os dados NFP e gere relatorio Markdown com alertas e acoes: ${JSON.stringify(dados)}`, searchType: 'NFP' })
      });
      if (!res.ok) throw new Error('Erro ' + res.status);
      const data = await res.json();
      addLog('Analise IA concluida', 'success');
      return data.text || data.result || 'Sem resposta';
    } catch (e) {
      const total = dados.reduce((a, r) => a + parseFloat(r.prestados.valor||'0'), 0);
      const alertas = dados.reduce((a, r) => a + (r.prestados.semTomador||0), 0);
      return `## Resumo NFP\n\n**Empresas:** ${dados.length}\n\n**Valor total:** R$ ${total.toLocaleString('pt-BR',{minimumFractionDigits:2})}\n\n**Alertas:** ${alertas}\n\n` +
        dados.map(r => `### ${r.cliente}\n- Notas: ${r.prestados.notas}\n- Valor: R$ ${parseFloat(r.prestados.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}\n- Fonte: ${r.fonte}`).join('\n\n');
    }
  };

  // Processar todos os clientes
  const processar = async () => {
    const ativos = clientes.filter(c => c.ativo && c.nome && c.cnpj);
    if (!ativos.length) { alert('Adicione clientes ativos com Nome e CNPJ!'); return; }
    setProcessando(true); setResultados([]); setLogs([]); setAnaliseIA('');
    addLog('Processando ' + ativos.length + ' cliente(s)...', 'info');
    const res: Result[] = [];
    for (const cli of ativos) {
      try {
        const d = await consultarNFP(cli);
        res.push(d);
        addLog(cli.nome + ': OK', 'success');
        setResultados([...res]);
      } catch (e) { addLog('Erro: ' + cli.nome, 'error'); }
    }
    if (res.length > 0) {
      const h: HistoryItem = { id: Date.now(), data: new Date().toLocaleString('pt-BR'), qt: res.length, resultados: res };
      setHistorico(prev => [h, ...prev].slice(0, 10));
      const ia = await analisarIA(res);
      setAnaliseIA(ia);
      setAba('resultados');
    }
    setProcessando(false);
  };

  const filtrados = resultados.filter(r => {
    const b = r.cliente.toLowerCase().includes(filtros.busca.toLowerCase());
    const s = filtros.status === 'todos' || (filtros.status === 'alertas' ? (r.prestados.semTomador||0)>0 : (r.prestados.semTomador||0)===0);
    return b && s;
  });

  const handleCertUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadingCert(true);
    const reader = new FileReader();
    reader.onload = e => {
      const bytes = new Uint8Array(e.target?.result as ArrayBuffer);
      let bin = '';
      for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
      const cert: Certificate = { id: Date.now(), nome: file.name, tipo: (file.name.split('.').pop()||'').toUpperCase(), tamanho: (file.size/1024).toFixed(2)+' KB', dataUpload: new Date().toLocaleString('pt-BR'), base64: btoa(bin), senha: '', validado: false, cnpj: '', razaoSocial: '', validade: '', status: 'pendente' };
      setCertificados(p => [...p, cert]);
      addLog('Certificado carregado: ' + file.name, 'success');
      setUploadingCert(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const adicionarLembrete = (msg: string) => {
    const l = { id: Date.now(), msg, data: new Date().toLocaleString('pt-BR'), lido: false };
    setLembretes((prev: any[]) => { const n = [l, ...prev].slice(0,50); localStorage.setItem('nfp_lembretes', JSON.stringify(n)); return n; });
  };

  const abas: { id: Aba; icon: React.ElementType; label: string; badge?: () => any }[] = [
    { id: 'conectar', icon: Cloud, label: '1. Conectar', badge: () => gcpConfig.connectionVerified ? '✓' : '' },
    { id: 'certificados', icon: FileKey, label: '2. Certificados', badge: () => certificados.filter(c => c.validado).length || null },
    { id: 'clientes', icon: Users, label: '3. Clientes', badge: () => clientes.filter(c => c.ativo).length || null },
    { id: 'agendamento', icon: Clock, label: '4. Agendamento', badge: () => agendamentos.filter(a => a.status === 'agendado').length || null },
    { id: 'resultados', icon: TrendingUp, label: 'Resultados', badge: () => resultados.length || null },
    { id: 'graficos', icon: BarChart3, label: 'Graficos' },
    { id: 'historico', icon: Calendar, label: 'Historico', badge: () => historico.length || null },
    { id: 'alertas', icon: Bell, label: 'Alertas', badge: () => resultados.filter(r => (r.prestados.semTomador||0)>0).length || null },
    { id: 'repositorio', icon: FileText, label: 'Repositorio', badge: () => repositorio.length || null },
    { id: 'codigo', icon: Code, label: 'Codigo' },
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 font-sans">
      <div className="max-w-7xl mx-auto p-4">
        {/* Header */}
        <header className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 mb-4">
          <div className="flex justify-between items-center mb-4">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-blue-600 dark:text-blue-400 flex items-center gap-2">
                <Cloud className="w-7 h-7" /> NFP Pro Cloud
              </h1>
              <p className="text-xs text-gray-500 hidden sm:block">Portal de Consulta Automatica</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Lembretes */}
              <div className="relative">
                <button onClick={() => setShowLembretes(v => !v)} className="relative p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                  <Bell className="w-5 h-5" />
                  {lembretes.filter((l: any) => !l.lido).length > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                      {lembretes.filter((l: any) => !l.lido).length}
                    </span>
                  )}
                </button>
                {showLembretes && (
                  <div className="absolute right-0 top-10 w-72 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border dark:border-gray-700 z-50 max-h-80 overflow-y-auto">
                    <div className="flex justify-between items-center p-3 border-b dark:border-gray-700">
                      <span className="font-bold text-sm">Lembretes</span>
                      <button onClick={() => { const m = lembretes.map((l: any) => ({...l, lido:true})); setLembretes(m); localStorage.setItem('nfp_lembretes', JSON.stringify(m)); }} className="text-xs text-blue-500">Limpar</button>
                    </div>
                    {lembretes.length === 0 ? <p className="p-4 text-sm text-gray-400 text-center">Sem lembretes</p> : (lembretes as any[]).map((l: any) => (
                      <div key={l.id} className={`p-3 border-b dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${!l.lido ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}
                        onClick={() => { const m = lembretes.map((x: any) => x.id===l.id ? {...x,lido:true} : x); setLembretes(m); localStorage.setItem('nfp_lembretes', JSON.stringify(m)); }}>
                        <p className="text-xs">{l.msg}</p>
                        <p className="text-xs text-gray-400">{l.data}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700">
                {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
              </button>
            </div>
          </div>
          {/* Abas */}
          <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
            {abas.map(t => {
              const badge = t.badge ? t.badge() : null;
              return (
                <button key={t.id} onClick={() => setAba(t.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 border-b-2 text-sm whitespace-nowrap transition-colors ${aba === t.id ? 'border-blue-600 text-blue-600 font-semibold' : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900'}`}>
                  <t.icon className="w-4 h-4" />{t.label}
                  {badge && (typeof badge === 'string' || badge > 0) && (
                    <span className="px-1.5 py-0.5 rounded-full text-xs font-mono bg-blue-100 text-blue-700">{badge}</span>
                  )}
                </button>
              );
            })}
          </div>
        </header>

        <main>
          {/* ABA: CONECTAR */}
          {aba === 'conectar' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Cloud className="w-5 h-5" />Conectar Backend Google Cloud</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Project ID *</label>
                    <input type="text" value={gcpConfig.projectId} onChange={e => setGcpConfig({...gcpConfig, projectId: e.target.value})}
                      className="w-full p-3 border rounded-lg bg-gray-50 dark:bg-gray-700 dark:border-gray-600" disabled={gcpConfig.configured} />
                  </div>
                  <button onClick={() => {
                    if (!gcpConfig.projectId) { alert('Digite o Project ID'); return; }
                    const base = `https://${gcpConfig.region}-${gcpConfig.projectId}.cloudfunctions.net`;
                    setGcpConfig(p => ({...p, configured: true, endpoints: { validarCertificado: base+'/validarCertificado', consultarNFP: base+'/consultarNFP', healthCheck: base+'/healthCheck' }}));
                  }} disabled={gcpConfig.configured} className="w-full p-3 bg-blue-600 text-white rounded-lg font-bold disabled:bg-gray-400">
                    {gcpConfig.configured ? 'Configurado' : 'Gerar URLs'}
                  </button>
                  {gcpConfig.configured && (
                    <button onClick={() => setGcpConfig(p => ({...p, configured: false, connectionVerified: false}))} className="w-full p-2 bg-gray-200 dark:bg-gray-700 rounded-lg text-sm">
                      Redefinir
                    </button>
                  )}
                </div>
                <p className="mt-4 text-xs text-gray-500">Sem backend configurado o sistema usa modo simulacao com dados de demonstracao.</p>
              </div>
              {/* Log viewer */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="text-green-400 font-bold mb-3">Logs</h3>
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {logs.length === 0 ? <p className="text-gray-500 text-xs">Aguardando...</p> : logs.map(l => (
                    <div key={l.id} className={`text-xs font-mono ${l.tipo==='error'?'text-red-400':l.tipo==='success'?'text-green-400':l.tipo==='warning'?'text-yellow-400':'text-blue-300'}`}>
                      {l.time} {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA: CERTIFICADOS */}
          {aba === 'certificados' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="font-bold text-lg mb-4">Upload Certificado Digital A1</h3>
                  <div className="border-2 border-dashed border-gray-300 p-8 text-center rounded-lg">
                    <input type="file" accept=".pfx,.p12" onChange={handleCertUpload} className="hidden" id="cert-upload" />
                    <label htmlFor="cert-upload" className="cursor-pointer bg-blue-600 text-white px-6 py-3 rounded-lg flex items-center justify-center gap-2 mx-auto w-fit">
                      {uploadingCert ? <Loader2 className="animate-spin" /> : <Upload />} Selecionar .pfx / .p12
                    </label>
                    <p className="text-xs text-gray-500 mt-2">Certificado A1 - arquivo .pfx ou .p12</p>
                  </div>
                </div>
                {certificados.map(cert => (
                  <div key={cert.id} className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border dark:border-gray-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-bold text-sm truncate">{cert.nome}</span>
                      <span className={`px-2 py-1 text-xs rounded font-bold ${cert.status==='valido'?'bg-green-100 text-green-700':cert.status==='vencido'?'bg-red-100 text-red-700':'bg-yellow-100 text-yellow-700'}`}>{cert.status}</span>
                    </div>
                    {cert.validado && <p className="text-xs text-gray-600 dark:text-gray-400">{cert.razaoSocial} | {cert.cnpj} | Vence: {cert.validade}</p>}
                    {!cert.validado && (
                      <div className="flex gap-2 mt-2">
                        <input type="password" placeholder="Senha do certificado" className="border p-2 rounded flex-1 text-sm dark:bg-gray-700 dark:border-gray-600"
                          value={cert.senha} onChange={e => setCertificados(p => p.map(c => c.id===cert.id ? {...c, senha: e.target.value} : c))} />
                        <button onClick={() => validarCertificado(cert.id)} className="bg-green-600 text-white px-4 rounded font-bold text-sm">
                          {certValidando===cert.id ? <Loader2 className="animate-spin w-4 h-4" /> : 'Validar'}
                        </button>
                      </div>
                    )}
                    <button onClick={() => setCertificados(p => p.filter(c => c.id!==cert.id))} className="text-red-400 text-xs mt-2 hover:text-red-600">Remover</button>
                  </div>
                ))}
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="text-green-400 font-bold mb-3">Logs</h3>
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {logs.length === 0 ? <p className="text-gray-500 text-xs">Aguardando...</p> : logs.map(l => (
                    <div key={l.id} className={`text-xs font-mono ${l.tipo==='error'?'text-red-400':l.tipo==='success'?'text-green-400':l.tipo==='warning'?'text-yellow-400':'text-blue-300'}`}>
                      {l.time} {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA: CLIENTES */}
          {aba === 'clientes' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex justify-between mb-4">
                  <h2 className="font-bold text-lg">Gestao de Clientes</h2>
                  <div className="flex gap-2">
                    <button onClick={processar} disabled={processando} className="bg-green-600 text-white px-3 py-1.5 rounded flex items-center gap-2 text-sm font-bold">
                      {processando ? <Loader2 className="animate-spin w-4 h-4" /> : <Zap className="w-4 h-4" />} Processar
                    </button>
                    <button onClick={() => setClientes(prev => {
                      const cert = certificados.find(c => c.validado);
                      return [...prev, { id: Date.now(), nome: cert?.razaoSocial||'', cnpj: cert?.cnpj||'', im: '', certificadoId: cert?String(cert.id):'', ativo: true }];
                    })} className="bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-2 text-sm font-bold">
                      <UserPlus className="w-4 h-4" /> Novo
                    </button>
                  </div>
                </div>
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {clientes.map(c => (
                    <div key={c.id} className="border p-3 rounded bg-gray-50 dark:bg-gray-700 dark:border-gray-600">
                      <div className="flex justify-between mb-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={c.ativo} onChange={e => setClientes(clientes.map(x => x.id===c.id ? {...x, ativo: e.target.checked} : x))} />
                          Ativo
                        </label>
                        <button onClick={() => setClientes(clientes.filter(x => x.id!==c.id))} className="text-red-500 text-xs font-bold">Remover</button>
                      </div>
                      <input placeholder="Nome" value={c.nome} onChange={e => setClientes(clientes.map(x => x.id===c.id ? {...x, nome: e.target.value} : x))}
                        className="w-full mb-2 p-2 border rounded text-sm dark:bg-gray-600 dark:border-gray-500" />
                      <div className="flex gap-2 mb-2">
                        <input placeholder="CNPJ" value={c.cnpj} onChange={e => setClientes(clientes.map(x => x.id===c.id ? {...x, cnpj: applyCnpjMask(e.target.value)} : x))}
                          className="w-1/2 p-2 border rounded text-sm dark:bg-gray-600 dark:border-gray-500" />
                        <input placeholder="Insc. Municipal" value={c.im} onChange={e => setClientes(clientes.map(x => x.id===c.id ? {...x, im: e.target.value} : x))}
                          className="w-1/2 p-2 border rounded text-sm dark:bg-gray-600 dark:border-gray-500" />
                      </div>
                      <select value={c.certificadoId} onChange={e => setClientes(clientes.map(x => x.id===c.id ? {...x, certificadoId: e.target.value} : x))}
                        className="w-full p-2 border rounded text-sm dark:bg-gray-600 dark:border-gray-500">
                        <option value="">Selecionar certificado...</option>
                        {certificados.filter(cf => cf.validado).map(cf => <option key={cf.id} value={cf.id}>{cf.razaoSocial || cf.nome}</option>)}
                      </select>
                    </div>
                  ))}
                  {clientes.length === 0 && <p className="text-center text-gray-400 py-8">Nenhum cliente. Clique em Novo para adicionar.</p>}
                </div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="text-green-400 font-bold mb-3">Logs de Processamento</h3>
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {logs.length === 0 ? <p className="text-gray-500 text-xs">Aguardando processamento...</p> : logs.map(l => (
                    <div key={l.id} className={`text-xs font-mono ${l.tipo==='error'?'text-red-400':l.tipo==='success'?'text-green-400':l.tipo==='warning'?'text-yellow-400':'text-blue-300'}`}>
                      {l.time} {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA: AGENDAMENTO */}
          {aba === 'agendamento' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Clock className="w-5 h-5" />Agendar / Consultar</h3>
                  <div className="space-y-3">
                    <select value={novoAgendamento.clientId} onChange={e => setNovoAgendamento(p => ({...p, clientId: e.target.value}))}
                      className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600">
                      <option value="">Selecione um cliente...</option>
                      {clientes.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    <input type="text" value={novoAgendamento.periodo} onChange={e => setNovoAgendamento(p => ({...p, periodo: e.target.value}))}
                      placeholder="MM/AAAA" className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" />
                    <input type="datetime-local" value={novoAgendamento.data} onChange={e => setNovoAgendamento(p => ({...p, data: e.target.value}))}
                      className="w-full p-3 border rounded-lg dark:bg-gray-700 dark:border-gray-600" />
                    <button onClick={() => {
                      if (!novoAgendamento.clientId) { alert('Selecione um cliente'); return; }
                      const ag: Agendamento = { id: Date.now(), clientId: parseInt(novoAgendamento.clientId), periodo: novoAgendamento.periodo, dataAgendamento: new Date(novoAgendamento.data).toISOString(), status: 'agendado' };
                      setAgendamentos(prev => [...prev, ag]);
                      adicionarLembrete('Agendado: ' + clientes.find(c=>String(c.id)===novoAgendamento.clientId)?.nome + ' - ' + novoAgendamento.periodo);
                      addLog('Agendado: ' + new Date(ag.dataAgendamento).toLocaleString('pt-BR'), 'success');
                    }} className="w-full p-3 bg-blue-600 text-white rounded-lg font-bold">Agendar</button>
                    <button disabled={processando} onClick={async () => {
                      if (!novoAgendamento.clientId) { alert('Selecione um cliente'); return; }
                      const cli = clientes.find(c => String(c.id) === novoAgendamento.clientId);
                      if (!cli) return;
                      setProcessando(true);
                      try {
                        const res = await consultarNFP(cli, novoAgendamento.periodo);
                        setResultados(prev => [...prev.filter(r => r.cnpj!==res.cnpj), res]);
                        const h = { id: Date.now(), data: new Date().toLocaleString('pt-BR'), qt: 1, resultados: [res] };
                        setHistorico(prev => [h, ...prev].slice(0,10));
                        const ia = await analisarIA([res]); setAnaliseIA(ia);
                        adicionarLembrete('Consulta: ' + cli.nome + ' - ' + novoAgendamento.periodo);
                        setAba('resultados');
                      } catch(e) { addLog('Erro: '+(e instanceof Error?e.message:'Erro'), 'error'); }
                      finally { setProcessando(false); }
                    }} className="w-full p-3 bg-green-600 text-white rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                      {processando ? <Loader2 className="animate-spin" /> : <Search className="w-5 h-5" />} Pesquisar Agora
                    </button>
                  </div>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                  <h3 className="font-bold text-lg mb-4">Consultas Agendadas</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {agendamentos.map(ag => (
                      <div key={ag.id} className="flex justify-between items-center border-l-4 border-yellow-500 bg-yellow-50 dark:bg-gray-700 p-3 rounded-r-lg">
                        <div>
                          <p className="font-bold text-sm">{clientes.find(c=>c.id===ag.clientId)?.nome}</p>
                          <p className="text-xs text-gray-500">{new Date(ag.dataAgendamento).toLocaleString('pt-BR')} | {ag.periodo}</p>
                          <span className={`text-xs font-bold ${ag.status==='executado'?'text-green-600':ag.status==='erro'?'text-red-600':'text-yellow-600'}`}>{ag.status.toUpperCase()}</span>
                        </div>
                        <button onClick={() => setAgendamentos(prev => prev.filter(a => a.id!==ag.id))}><Trash2 className="text-red-500 w-4 h-4" /></button>
                      </div>
                    ))}
                    {agendamentos.length === 0 && <p className="text-gray-400 text-sm text-center py-4">Nenhum agendamento</p>}
                  </div>
                </div>
              </div>
              <div className="bg-gray-900 rounded-lg p-4">
                <h3 className="text-green-400 font-bold mb-3">Logs</h3>
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {logs.length === 0 ? <p className="text-gray-500 text-xs">Aguardando...</p> : logs.map(l => (
                    <div key={l.id} className={`text-xs font-mono ${l.tipo==='error'?'text-red-400':l.tipo==='success'?'text-green-400':l.tipo==='warning'?'text-yellow-400':'text-blue-300'}`}>
                      {l.time} {l.msg}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ABA: RESULTADOS */}
          {aba === 'resultados' && (
            <div className="space-y-4">
              {resultados.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center text-gray-400">
                  <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum resultado ainda. Use Processar ou Pesquisar Agora.</p>
                </div>
              ) : (
                <>
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 flex gap-4 items-center">
                    <input placeholder="Buscar..." value={filtros.busca} onChange={e => setFiltros({...filtros, busca: e.target.value})} className="flex-1 p-2 border rounded dark:bg-gray-700 dark:border-gray-600" />
                    <button onClick={() => {
                      const csv = 'Cliente;CNPJ;Periodo;Notas;Valor;ISS;Creditos;Alertas;Fonte\n' +
                        filtrados.map(r => [r.cliente,r.cnpj,r.periodo,r.prestados.notas,r.prestados.valor,r.prestados.iss,r.prestados.creditos,r.prestados.semTomador||0,r.fonte].join(';')).join('\n');
                      const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,\ufeff'+encodeURIComponent(csv); a.download = 'NFP_Export.csv'; a.click();
                    }} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 font-bold"><Download className="w-4 h-4" /> CSV</button>
                  </div>
                  <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700">
                        <tr>
                          <th className="p-3 text-left">Empresa</th>
                          <th className="p-3 text-center">Notas Prest.</th>
                          <th className="p-3 text-left">Valor Prest.</th>
                          <th className="p-3 text-left">Creditos</th>
                          <th className="p-3 text-center">Alertas</th>
                          <th className="p-3 text-center">Notas Tom.</th>
                          <th className="p-3 text-left">Valor Tom.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtrados.map((r, i) => (
                          <tr key={i} className="border-t dark:border-gray-700">
                            <td className="p-3">
                              <div className="font-bold">{r.cliente}</div>
                              <div className="text-xs text-gray-500 flex gap-2">
                                <span>{r.periodo}</span>
                                <span className={`px-1.5 rounded font-bold ${r.fonte.includes('REAL')?'bg-green-100 text-green-700':'bg-yellow-100 text-yellow-700'}`}>{r.fonte.includes('SIMUL')?'SIM':'REAL'}</span>
                              </div>
                            </td>
                            <td className="p-3 text-center">{r.prestados.notas}</td>
                            <td className="p-3">R$ {parseFloat(r.prestados.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                            <td className="p-3 text-green-600 font-bold">R$ {parseFloat(r.prestados.creditos||'0').toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                            <td className="p-3 text-center text-red-500 font-bold">{r.prestados.semTomador||0}</td>
                            <td className="p-3 text-center">{r.tomados.notas}</td>
                            <td className="p-3">R$ {parseFloat(r.tomados.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Detalhamento notas */}
                  {filtrados.some(r => r.prestados.lista && r.prestados.lista.length > 0) && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                      <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b dark:border-gray-700">
                        <h4 className="font-bold text-blue-800 dark:text-blue-300">Detalhamento das Notas</h4>
                      </div>
                      {filtrados.map(r => r.prestados.lista && r.prestados.lista.length > 0 ? (
                        <div key={r.cnpj}>
                          <div className="px-4 py-2 bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                            <span className="font-bold text-sm">{r.cliente} - {r.periodo}</span>
                          </div>
                          <table className="w-full text-xs">
                            <thead className="bg-gray-100 dark:bg-gray-700">
                              <tr><th className="p-2 text-left">Numero</th><th className="p-2 text-left">Data</th><th className="p-2 text-left">Tomador</th><th className="p-2 text-right">Valor</th><th className="p-2 text-right">ISS</th></tr>
                            </thead>
                            <tbody>
                              {(r.prestados.lista as any[]).map((nota: any, i: number) => (
                                <tr key={i} className={`border-t dark:border-gray-700 ${nota.tomador==='NAO IDENTIFICADO'?'bg-red-50 dark:bg-red-900/20':''}`}>
                                  <td className="p-2">{nota.numero||'-'}</td>
                                  <td className="p-2">{nota.dataEmissao?new Date(nota.dataEmissao).toLocaleDateString('pt-BR'):'-'}</td>
                                  <td className="p-2 font-medium">{nota.tomador}</td>
                                  <td className="p-2 text-right">R$ {parseFloat(nota.valor||'0').toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                                  <td className="p-2 text-right text-blue-600">R$ {parseFloat(nota.iss||'0').toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : null)}
                    </div>
                  )}
                  {analiseIA && (
                    <div className="bg-purple-50 dark:bg-gray-800 p-6 rounded shadow prose dark:prose-invert max-w-none">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{analiseIA}</ReactMarkdown>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ABA: GRAFICOS */}
          {aba === 'graficos' && resultados.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="font-bold mb-4">Creditos Gerados por Empresa</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={resultados.map(r => ({ name: r.cliente.substring(0,15), creditos: parseFloat(r.prestados.creditos||'0') }))}>
                    <XAxis dataKey="name" /><YAxis /><Tooltip />
                    <Bar dataKey="creditos" fill="#3b82f6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <h3 className="font-bold mb-4">Status de Alertas</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={[{ name: 'OK', value: resultados.filter(r=>(r.prestados.semTomador||0)===0).length }, { name: 'Alertas', value: resultados.filter(r=>(r.prestados.semTomador||0)>0).length }]}
                      cx="50%" cy="50%" outerRadius={80} dataKey="value" label>
                      <Cell fill="#10B981" /><Cell fill="#F59E0B" />
                    </Pie><Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* ABA: HISTORICO */}
          {aba === 'historico' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="font-bold text-lg mb-4">Historico de Consultas</h3>
              {historico.length === 0 ? <p className="text-gray-400 text-center py-8">Nenhum historico ainda</p> : historico.map(h => (
                <div key={h.id} onClick={() => setSelectedHistoryItem(h)} className="border-b p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 flex justify-between">
                  <span className="text-sm">{h.data}</span>
                  <span className="text-sm text-gray-500">{h.qt} cliente(s)</span>
                </div>
              ))}
            </div>
          )}

          {/* ABA: ALERTAS */}
          {aba === 'alertas' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="font-bold text-lg mb-4">Painel de Alertas</h3>
              {resultados.filter(r=>(r.prestados.semTomador||0)>0).length === 0 ? (
                <p className="text-green-600 text-center py-8">Nenhum alerta! Todas as notas possuem tomador identificado.</p>
              ) : resultados.filter(r=>(r.prestados.semTomador||0)>0).map(r => (
                <div key={r.cnpj} className="border-l-4 border-red-500 bg-red-50 dark:bg-gray-700 p-4 mb-3 rounded-r-lg">
                  <p className="font-bold text-red-700 dark:text-red-300">{r.cliente}</p>
                  <p className="text-sm">{r.prestados.semTomador} nota(s) sem tomador identificado - Periodo: {r.periodo}</p>
                  <p className="text-xs text-gray-500 mt-1">Acao: Regularize no portal da prefeitura</p>
                </div>
              ))}
            </div>
          )}

          {/* ABA: REPOSITORIO */}
          {aba === 'repositorio' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-lg flex items-center gap-2"><FileText className="w-5 h-5" />Repositorio de Documentos</h3>
                <label className="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 flex items-center gap-2 text-sm font-bold">
                  <Upload className="w-4 h-4" /> Upload
                  <input type="file" className="hidden" accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.xml,.txt" onChange={e => {
                    const file = e.target.files?.[0]; if (!file) return;
                    const reader = new FileReader();
                    reader.onload = ev => {
                      const base64 = (ev.target?.result as string).split(',')[1];
                      const doc = { id: Date.now(), nome: file.name, tipo: (file.name.split('.').pop()||'DOC').toUpperCase(), tamanho: (file.size/1024).toFixed(1)+' KB', data: new Date().toLocaleString('pt-BR'), base64 };
                      setRepositorio(prev => { const r = [doc, ...prev]; localStorage.setItem('nfp_repositorio', JSON.stringify(r)); return r; });
                    };
                    reader.readAsDataURL(file); e.target.value = '';
                  }} />
                </label>
              </div>
              {repositorio.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum documento. Faca upload de PDFs, planilhas e XMLs.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {(repositorio as any[]).map(doc => (
                    <div key={doc.id} className="flex items-center gap-3 p-3 border dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-black text-blue-600">{doc.tipo}</span>
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="font-bold text-sm truncate">{doc.nome}</p>
                        <p className="text-xs text-gray-500">{doc.tamanho} - {doc.data}</p>
                      </div>
                      <button onClick={() => { const a = document.createElement('a'); a.href='data:application/octet-stream;base64,'+doc.base64; a.download=doc.nome; a.click(); }} className="p-2 bg-green-100 text-green-600 rounded-lg hover:bg-green-200"><Download className="w-4 h-4" /></button>
                      <button onClick={() => { if(window.confirm('Remover?')){ setRepositorio(prev => { const r=prev.filter((d:any)=>d.id!==doc.id); localStorage.setItem('nfp_repositorio',JSON.stringify(r)); return r; }); }}} className="p-2 bg-red-100 text-red-500 rounded-lg hover:bg-red-200"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ABA: CODIGO */}
          {aba === 'codigo' && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="font-bold text-lg mb-4">Codigo Backend (Cloud Functions)</h3>
              <pre className="bg-gray-900 text-green-400 p-4 rounded text-xs overflow-x-auto">{`// Deploy: gcloud functions deploy consultarNFP --runtime nodejs20 --trigger-http
const functions = require('@google-cloud/functions-framework');
functions.http('healthCheck', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.status(200).send('OK');
});`}</pre>
            </div>
          )}
        </main>

        {/* Modal historico */}
        {selectedHistoryItem && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" onClick={() => setSelectedHistoryItem(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-lg mb-4">Historico: {selectedHistoryItem.data}</h3>
              <table className="w-full text-sm">
                <thead className="bg-gray-100 dark:bg-gray-700">
                  <tr><th className="p-2 text-left">Cliente</th><th className="p-2">Notas</th><th className="p-2">Valor</th><th className="p-2">Alertas</th></tr>
                </thead>
                <tbody>
                  {selectedHistoryItem.resultados.map((r, i) => (
                    <tr key={i} className="border-b dark:border-gray-700">
                      <td className="p-2">{r.cliente}</td>
                      <td className="p-2 text-center">{r.prestados.notas}</td>
                      <td className="p-2">R$ {parseFloat(r.prestados.valor).toLocaleString('pt-BR',{minimumFractionDigits:2})}</td>
                      <td className="p-2 text-center text-red-600">{r.prestados.semTomador||0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={() => setSelectedHistoryItem(null)} className="mt-4 px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold text-sm">Fechar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
