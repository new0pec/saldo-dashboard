(function () {
  'use strict';

  // ---------- Utilidades ----------
  const MES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const MES3 = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const L = d3.formatLocale({ decimal: ',', thousands: ' ', grouping: [3], currency: ['', ' €'], minus: '−' });
  const eur = L.format('$,.2f'), eur0 = L.format('$,.0f');
  const k = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(v));
  const mesLongo = m => { const [y, mm] = m.split('-'); return MES[+mm - 1] + ' ' + y; };
  const mesCurto = m => MES3[+m.split('-')[1] - 1];
  const ico = s => (String(s || '?').replace(/[^\p{L}\p{N}]/gu, '')[0] || '?').toUpperCase();
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = id => document.getElementById(id);
  const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const store = {
    get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} },
    del: k => { try { localStorage.removeItem(k); } catch (e) {} }
  };
  const COLORS = ['#0A84FF','#BF5AF2','#FF9F0A','#30D158','#FF375F','#64D2FF','#5E5CE6','#FFD60A'];
  const GCOL = {'Alimentação':'#FF9F0A','Casa e contas':'#0A84FF','Transportes e viagens':'#64D2FF','Tecnologia':'#5E5CE6','Subscrições':'#BF5AF2','Compras':'#FF375F','Saúde':'#30D158','Família':'#FFD60A','Créditos e impostos':'#FF453A','Educação':'#AC8E68','Investimentos':'#66D4CF','Pessoas (MbWay)':'#8E8E93','Rendimentos':'#30D158','Dinheiro':'#A2845E','Transferências':'#98989D','Outros':'#98989D'};
  const gcol = g => GCOL[g] || '#98989D';

  // ---------- Leitura da exportação MoneyStats ----------
  const INTERNAL = new Set(['.Revolut','.Conta Main','.C.C.ActivoBank','.C.C.WiZink','.Trade Republic','Transferência','Ajuste','Saldo Positivo','Saldo Negativo']);
  const GRUPOS = {
    'Alimentação': ['Continente','Pingo Doce','Indian Market','Talho Silau','Mercadona','Lidl','MiniPreço','Auchan','Uber Eats','BurgerKing','Refeições','Han Table','Taco Bell','Vending Machine D.','Maq. Edf. 31','BB Grill','Casa do Arco','O Tarro','Glovo','1st Coffe','GoTo','Alentejo'],
    'Casa e contas': ['Casa','EDP','Águas de Santarém','SMAS','TV+Net','Digi','iPhone A.','iPhone D.','Lavandaria','Leroy Merlin','Ikea','Action Store','Homa'],
    'Transportes e viagens': ['Bolt','Uber','Táxi','Combustível','ViaVerde','Portagens','Comboio','Rede Expresso','Hotel Rossio'],
    'Tecnologia': ['PC Componentes','Nvidia','Parallels','Nintendo'],
    'Subscrições': ['Apple','Disney Plus','Google Play'],
    'Compras': ['Amazon','ASOS','Lefties','Shein','H&M','Tezenis','Kiko','Fnac','AliExpress','Temu','CTT','Afro','Unhas'],
    'Saúde': ['Farmacia','Médis','Bulk'],
    'Família': ['Filhos','Tlf Papa','P/Armando'],
    'Créditos e impostos': ['Crédito Cofidis','Crédito Mota','Conta Ordenado','Estado','Advogada'],
    'Educação': ['UAB'],
    'Investimentos': ['Crypto','Trade Republic'],
    'Pessoas (MbWay)': ['MbWay','Transferência'],
    'Rendimentos': ['Salário','Salário D.','Sub.Alimentação'],
    'Dinheiro': ['Dinheiro(Notas)']
  };
  const C2G = new Map();
  for (const [g, cs] of Object.entries(GRUPOS)) for (const c of cs) C2G.set(c.toLowerCase(), g);
  const limpa = s => String(s || '')
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍︎️⃣₿]/gu, '')
    .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/\s{2,}/g, ' ')
    .replace(/^[\s.,]+|[\s,]+$/g, '');

  // Nomes das contas no dashboard (o MoneyStats continua com os seus)
  const NOMES_CONTA = [[/^c\.?\s*c\.?\s*activobank$/i, 'ActivoBank C.C.'], [/^c\.?\s*c\.?\s*wizink$/i, 'WiZink C.C.'], [/^activobank$/i, 'ActivoBank'], [/^dinheiro$/i, 'Dinheiro'], [/^cart[aã]o\s+alimenta[cç][aã]o$/i, 'Cartão Alimentação']];
  const nomeConta = c => { c = String(c || '').trim(); for (const [re, n] of NOMES_CONTA) if (re.test(c)) return n; return c; };

  function parseCSV(t) {
    const R = []; let row = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); R.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f || row.length) { row.push(f); R.push(row); }
    return R;
  }

  function parseExport(text) {
    const R = parseCSV(String(text || '').replace(/^﻿/, ''));
    const h = R.findIndex(r => r[0] === 'Conta' && r[1] === 'Data');
    if (h < 0) throw new Error('O ficheiro não parece uma exportação MoneyStats (falta o cabeçalho Conta, Data, Montante…).');
    const rows = [];
    for (const r of R.slice(h + 1)) {
      if (r.length < 10 || !/^\d{2}\/\d{2}\/\d{4}$/.test(r[1])) continue;
      const [dd, mm, yy] = r[1].split('/'); const data = yy + '-' + mm + '-' + dd;
      const v = Math.round(parseFloat(r[2].replace(/\s/g, '').replace(/\./g, '').replace(',', '.')) * 100) / 100;
      if (!isFinite(v)) continue;
      const cat = limpa(r[9] || r[6]) || 'Sem categoria';
      const etq = limpa(r[11]);
      const interna = INTERNAL.has(String(r[9] || r[6] || '').trim()) || INTERNAL.has(cat);
      let grupo = C2G.get(cat.toLowerCase()) || 'Outros';
      if (/teclado|ipad|port[aá]til|monitor/i.test(etq)) grupo = 'Tecnologia';
      if (interna) grupo = 'Transferências';
      rows.push({ data, mes: data.slice(0, 7), montante: v, conta: nomeConta(limpa(r[0])), grupo, categoria: cat, etiquetas: etq,
        tipo: interna ? 'Transferência' : (v > 0 ? 'Receita' : 'Despesa') });
    }
    if (!rows.length) throw new Error('O ficheiro não tem movimentos.');
    return rows;
  }

  // ---------- Dropbox (OAuth PKCE, sem segredos no código) ----------
  const CFG = { key: 'saldo.appKey', folder: 'saldo.folder', tok: 'saldo.tokens', ver: 'saldo.pkce', cache: 'saldo.cache' };
  const redirectUri = () => location.origin + location.pathname;
  const appKey = () => (store.get(CFG.key) || '').trim();
  if ((store.get(CFG.folder) || '').trim().toLowerCase() === '/claudee') store.set(CFG.folder, '/MyNewClaudee');
  const folder = () => { let f = (store.get(CFG.folder) || '/MyNewClaudee').trim(); if (!f.startsWith('/')) f = '/' + f; return f.replace(/\/+$/, ''); };
  const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  async function connect() {
    const key = appKey();
    if (!key) throw new Error('Falta a App key do Dropbox.');
    const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    const estado = b64url(crypto.getRandomValues(new Uint8Array(16)));
    sessionStorage.setItem(CFG.ver, verifier); sessionStorage.setItem(CFG.ver + '.state', estado);
    const u = new URL('https://www.dropbox.com/oauth2/authorize');
    u.search = new URLSearchParams({ client_id: key, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: redirectUri(), token_access_type: 'offline', state: estado });
    location.assign(u.toString());
  }

  async function tokenRequest(params) {
    const r = await fetch('https://api.dropboxapi.com/oauth2/token', { method: 'POST', body: new URLSearchParams(params) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Dropbox recusou o acesso: ' + (j.error_description || j.error || r.status));
    return j;
  }

  async function finishLogin() {
    const p = new URLSearchParams(location.search);
    if (!p.has('code') && !p.has('error')) return;
    history.replaceState(null, '', redirectUri());
    if (p.has('error')) throw new Error('Ligação ao Dropbox cancelada.');
    const verifier = sessionStorage.getItem(CFG.ver), estado = sessionStorage.getItem(CFG.ver + '.state');
    sessionStorage.removeItem(CFG.ver); sessionStorage.removeItem(CFG.ver + '.state');
    if (!verifier) throw new Error('A ligação expirou. Tente outra vez.');
    if (!estado || p.get('state') !== estado) throw new Error('A resposta do Dropbox não corresponde a este pedido. Tente ligar outra vez.');
    const j = await tokenRequest({ code: p.get('code'), grant_type: 'authorization_code', code_verifier: verifier, client_id: appKey(), redirect_uri: redirectUri() });
    store.set(CFG.tok, JSON.stringify({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 60) * 1000 }));
  }

  let renovando = null;
  async function accessToken() {
    let t; try { t = JSON.parse(store.get(CFG.tok) || 'null'); } catch (e) { t = null; }
    if (!t) return null;
    if (t.access && t.exp > Date.now()) return t.access;
    if (!t.refresh) return null;
    // vários pedidos ao mesmo tempo partilham a mesma renovação do token
    if (!renovando) renovando = tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: appKey() })
      .then(j => { t.access = j.access_token; t.exp = Date.now() + (j.expires_in - 60) * 1000; store.set(CFG.tok, JSON.stringify(t)); return t.access; })
      .finally(() => { renovando = null; });
    return renovando;
  }

  async function dbx(url, opts) {
    const tok = await accessToken();
    if (!tok) throw new Error('Ligue o Dropbox em Ajustes.');
    const r = await fetch(url, { method: 'POST', ...opts, headers: { Authorization: 'Bearer ' + tok, ...(opts && opts.headers) } });
    if (r.status === 401) {
      let j = {}; try { j = JSON.parse(await r.text()); } catch (e) {}
      const sum = j.error_summary || '';
      if (/missing_scope|insufficient_scope/.test(sum)) { const err = new Error('Falta a permissão files.content.write na app do Dropbox. Ative-a e ligue de novo.'); err.summary = sum; throw err; }
      store.del(CFG.tok); throw new Error('A sessão do Dropbox expirou. Ligue outra vez.');
    }
    if (!r.ok) {
      const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
      const err = new Error(j.error_summary ? 'Dropbox: ' + j.error_summary.replace(/\/\.*$/, '') : 'Erro do Dropbox (' + r.status + ')');
      err.summary = j.error_summary || ''; err.status = r.status;
      throw err;
    }
    return r;
  }

  const argHeader = o => JSON.stringify(o).replace(/[\u007f-\uffff]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  const ligado = () => !!(appKey() && store.get(CFG.tok));

  async function listFolder(path) {
    return dbx('https://api.dropboxapi.com/2/files/list_folder', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path, recursive: false }) });
  }

  async function latestFromDropbox(seIgual) {
    let r;
    try { r = await listFolder(folder()); }
    catch (e) {
      if (!/not_found/.test(e.summary || '')) throw e;
      let visiveis = [];
      try { const raiz = await (await listFolder('')).json(); visiveis = raiz.entries.filter(x => x['.tag'] === 'folder').map(x => x.path_display); } catch (e2) {}
      throw new Error('Pasta ' + folder() + ' não encontrada. ' + (visiveis.length ? 'Pastas visíveis: ' + visiveis.slice(0, 6).join(', ') + '.' : 'A app só vê uma pasta vazia: cria-a com acesso Full Dropbox (ver README).'));
    }
    let j = await r.json(); let entries = j.entries;
    while (j.has_more) {
      r = await dbx('https://api.dropboxapi.com/2/files/list_folder/continue', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: j.cursor }) });
      j = await r.json(); entries = entries.concat(j.entries);
    }
    // o mais recente: a data mais tarde entre a do ficheiro e a da chegada ao Dropbox
    const quando = e => [e.client_modified || '', e.server_modified || ''].sort().pop();
    const files = entries.filter(e => e['.tag'] === 'file' && /\.(txt|csv)$/i.test(e.name))
      .sort((a, b) => quando(b).localeCompare(quando(a)));
    if (!files.length) throw new Error('Não encontrei ficheiros .txt ou .csv em ' + folder() + '.');
    const f = files[0];
    if (seIgual && seIgual.rev && seIgual.rev === f.rev) return { igual: true };
    const d = await dbx('https://content.dropboxapi.com/2/files/download', { headers: { 'Dropbox-API-Arg': JSON.stringify({ path: f.id }) } });
    return { text: await d.text(), name: f.name, modified: f.client_modified || f.server_modified, rev: f.rev, origem: 'Dropbox' };
  }

  // ---------- Estado e cálculos ----------
  const S = { rows: [], meta: null, ano: '', mes: '', conta: '', grupo: '', categoria: '', q: '', tag: '', lista: '', multi: [] };
  let drawnBars = false;
  // cálculos repetidos guardados até à próxima mudança de dados ou de filtros
  let MEMO = {};
  const memo = (k, f) => (k in MEMO ? MEMO[k] : (MEMO[k] = f()));

  // ---------- Movimentos manuais e grupos personalizados (manuais.json no Dropbox) ----------
  const MAN_KEY = 'saldo.manuais';
  const normaliza = o => {
    o = o && typeof o === 'object' ? o : {};
    return { versao: 1, movimentos: Array.isArray(o.movimentos) ? o.movimentos : [], grupos: o.grupos && typeof o.grupos === 'object' ? o.grupos : {}, contas: Array.isArray(o.contas) ? o.contas : [], saldos: o.saldos && typeof o.saldos === 'object' ? o.saldos : {}, capas: o.capas && typeof o.capas === 'object' ? o.capas : {}, limites: o.limites && typeof o.limites === 'object' ? o.limites : {}, regras: o.regras && typeof o.regras === 'object' ? o.regras : {}, listas: Array.isArray(o.listas) ? o.listas : [], somas: Array.isArray(o.somas) ? o.somas : [], metas: Array.isArray(o.metas) ? o.metas : [], tagsMov: o.tagsMov && typeof o.tagsMov === 'object' ? o.tagsMov : {}, fixosOff: Array.isArray(o.fixosOff) ? o.fixosOff : [] };
  };
  function migraNomes(o) {
    o.movimentos.forEach(m => { if (m) m.conta = nomeConta(m.conta); });
    o.contas = [...new Set(o.contas.map(nomeConta))];
    const sal = {};
    for (const [c, a] of Object.entries(o.saldos)) {
      const n = nomeConta(c);
      if (sal[n]) sal[n] = { real: +sal[n].real + +a.real, calc: +sal[n].calc + +a.calc, em: a.em > sal[n].em ? a.em : sal[n].em };
      else sal[n] = a;
    }
    o.saldos = sal; return o;
  }
  let M = migraNomes(normaliza((() => { try { return JSON.parse(store.get(MAN_KEY) || 'null'); } catch (e) { return null; } })()));
  const manFile = () => folder() + '/manuais.json';
  const grupoBase = cat => C2G.get(String(cat || '').toLowerCase()) || 'Outros';
  function grupoDe(cat, etq, tipo) {
    if (tipo === 'Transferência') return 'Transferências';
    if (M.grupos[cat]) return M.grupos[cat];
    if (/teclado|ipad|port[aá]til|monitor/i.test(etq || '')) return 'Tecnologia';
    return grupoBase(cat);
  }
  function isoDia(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function ocorrencias(m) {
    if (!m.repetir || m.repetir === 'nunca') return [m.data];
    const fim = isoDia(new Date()), out = [], [y, mo, dia] = m.data.split('-').map(Number);
    for (let k = 0; k < 600; k++) {
      let d;
      if (m.repetir === 'semanal') d = new Date(y, mo - 1, dia + 7 * k, 12);
      else if (m.repetir === 'mensal') { const ult = new Date(y, mo - 1 + k + 1, 0).getDate(); d = new Date(y, mo - 1 + k, Math.min(dia, ult), 12); }
      else if (m.repetir === 'anual') { const ult = new Date(y + k, mo, 0).getDate(); d = new Date(y + k, mo - 1, Math.min(dia, ult), 12); }
      else return [m.data];
      const s = isoDia(d); if (s > fim) break; out.push(s);
    }
    return out.length ? out : [m.data];
  }
  function compose() {
    MEMO = {};
    const base = (S.base || []).map(r => r.tipo === 'Transferência' || !M.grupos[r.categoria] ? r : { ...r, grupo: M.grupos[r.categoria] });
    const man = M.movimentos.filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(m.data)).flatMap(m => ocorrencias(m).map((data, k) => ({
      id: m.id, data, mes: data.slice(0, 7), montante: +m.montante, conta: m.conta, categoria: m.categoria, etiquetas: m.etiquetas || '',
      tipo: m.tipo, grupo: grupoDe(m.categoria, m.etiquetas, m.tipo), manual: true, serie: !!m.repetir && m.repetir !== 'nunca' })));
    const vistos = new Map(), extra = M.tagsMov || {};
    S.rows = base.concat(man).map(r => {
      // chave estável para guardar hashtags postas na app (ideia 8)
      const kb = r.manual ? 'm:' + r.id + ':' + r.data : [r.data, r.conta, r.montante, r.categoria].join('|');
      const n = (vistos.get(kb) || 0) + 1; vistos.set(kb, n);
      const key = kb + '#' + n, mais = Array.isArray(extra[key]) ? extra[key] : [];
      const ft = [...new Set(String(r.etiquetas || '').split(',').map(t => t.replace(/^#+/, '').trim()).filter(Boolean).concat(mais))];
      return { ...r, key, tags: [...new Set(tagsDe(r.etiquetas, r.categoria).concat(mais))], ftags: ft };
    });
    if (S.lista && !listaAtiva()) S.lista = '';
  }
  const PEND_KEY = 'saldo.manuais.pendente';
  let gravacao = Promise.resolve();
  async function loadManuais() {
    if (!ligado()) return false;
    // há alterações locais por enviar: envia-as primeiro em vez de as substituir pelas do Dropbox
    if (store.get(PEND_KEY)) { await enviaManuais(); if (store.get(PEND_KEY)) return false; }
    try {
      const r = await dbx('https://content.dropboxapi.com/2/files/download', { headers: { 'Dropbox-API-Arg': argHeader({ path: manFile() }) } });
      const novo = migraNomes(normaliza(JSON.parse(await r.text())));
      const mudou = JSON.stringify(novo) !== JSON.stringify(M);
      M = novo; store.set(MAN_KEY, JSON.stringify(M));
      return mudou;
    } catch (e) { if (/not_found/.test(e.summary || '')) return false; throw e; }
  }
  function enviaManuais(okMsg) {
    // uploads em fila: o último a chegar ao Dropbox é sempre o mais recente
    gravacao = gravacao.then(async () => {
      if (!ligado()) return;
      try {
        await dbx('https://content.dropboxapi.com/2/files/upload', { headers: { 'Dropbox-API-Arg': argHeader({ path: manFile(), mode: 'overwrite', mute: true }), 'Content-Type': 'application/octet-stream' }, body: JSON.stringify(M, null, 1) });
        store.del(PEND_KEY);
        if (okMsg) toast(okMsg);
      } catch (e) { if (okMsg) toast(/scope/.test(e.summary || '') ? e.message : 'Ficou guardado neste dispositivo e será enviado para o Dropbox mais tarde (' + e.message + ').', true); }
    });
    return gravacao;
  }
  async function saveManuais(okMsg) {
    store.set(MAN_KEY, JSON.stringify(M)); store.set(PEND_KEY, '1');
    compose(); render();
    if (!ligado()) { toast('Guardado só neste dispositivo. Ligue o Dropbox para sincronizar.'); return; }
    return enviaManuais(okMsg || 'Guardado no Dropbox');
  }

  function meses() {
    const m = new Map();
    for (const r of S.rows) {
      if (S.conta && r.conta !== S.conta) continue;
      if (S.ano && r.mes.slice(0, 4) !== S.ano) continue;
      if (r.tipo === 'Transferência') continue;
      if (!passaFiltro(r)) continue;
      const o = m.get(r.mes) || { mes: r.mes, receitas: 0, despesas: 0 };
      if (r.montante > 0) o.receitas += r.montante; else o.despesas -= r.montante;
      m.set(r.mes, o);
    }
    return [...m.values()].sort((a, b) => a.mes < b.mes ? -1 : 1)
      .map(o => ({ mes: o.mes, receitas: +o.receitas.toFixed(2), despesas: +o.despesas.toFixed(2), liquido: +(o.receitas - o.despesas).toFixed(2) }));
  }

  function resumo(ms) {
    if (!ms.length) return null;
    let sel = ms, prev = null;
    if (S.mes) { const i = ms.findIndex(x => x.mes === S.mes); sel = i >= 0 ? [ms[i]] : []; prev = i > 0 ? ms[i - 1] : null; }
    const rec = d3.sum(sel, x => x.receitas), des = d3.sum(sel, x => x.despesas);
    return { periodo: S.mes || 'ano', receitas: rec, despesas: des, liquido: rec - des,
      gasto_pct: rec > 0 ? Math.round(des / rec * 100) : null,
      var_despesas: prev && prev.despesas > 0 ? Math.round((des / prev.despesas - 1) * 100) : null, meses: sel.length };
  }

  function despesasFiltradas(comGrupo) {
    return S.rows.filter(r => r.tipo === 'Despesa' && (!S.conta || r.conta === S.conta) && (!S.mes || r.mes === S.mes) && (!S.ano || r.mes.slice(0, 4) === S.ano) && (!comGrupo || !S.grupo || r.grupo === S.grupo) && passaFiltro(r));
  }

  function agrupa(rows, key) {
    const m = new Map();
    for (const r of rows) { const o = m.get(r[key]) || { nome: r[key], grupo: r.grupo, total: 0 }; o.total -= r.montante; m.set(r[key], o); }
    const out = [...m.values()].filter(x => x.total > 0).sort((a, b) => b.total - a.total);
    const tot = d3.sum(out, x => x.total);
    return out.map(x => ({ ...x, quota: tot ? Math.round(x.total / tot * 100) : 0 }));
  }

  // Limite de descoberto (Conta Ordenado do ActivoBank: 500 €)
  const LIMITE_PADRAO = { 'ActivoBank': 500 };
  function contas() {
    const m = d3.rollup(S.rows, v => d3.sum(v, r => r.montante), r => r.conta);
    for (const c of M.contas.concat(Object.keys(M.saldos))) if (!m.has(c)) m.set(c, 0);
    const ORDEM = [/^activobank$/i, /^revolut/i, /^c\.?\s*c\.?\s*activobank|activobank\s*c\.?\s*c/i, /wizink/i, /^dinheiro/i, /alimenta/i];
    const pos = c => { const i = ORDEM.findIndex(re => re.test(c)); return i < 0 ? 99 : i; };
    return [...m].map(([conta, calc]) => {
      const a = M.saldos[conta];
      const saldo = a ? calc + (+a.real - +a.calc) : calc;
      const lim = M.limites && M.limites[conta] != null ? +M.limites[conta] : (LIMITE_PADRAO[conta] || 0);
      return { conta, calc, saldo, acerto: a || null, limite: lim, disponivel: saldo + lim, usado: lim > 0 ? Math.min(lim, Math.max(0, -saldo)) : 0 };
    }).sort((a, b) => pos(a.conta) - pos(b.conta) || a.conta.localeCompare(b.conta, 'pt'));
  }

  const set = patch => { if (('tag' in patch || 'lista' in patch) && !('multi' in patch)) patch.multi = []; Object.assign(S, patch); render(); };

  // ---------- Desenho ----------
  function render() {
    MEMO = {};
    const has = S.rows.length > 0;
    $('app').hidden = !has; $('onboard').hidden = has;
    $('lede').hidden = !has; $('ano').hidden = !has; $('fab').hidden = !has; document.body.classList.toggle('sem-dados', !has);
    if (!has) return;
    const ms = meses(), r = resumo(ms);

    const anos = [...new Set(S.rows.map(x => x.mes.slice(0, 4)))].sort().reverse(), selA = $('ano');
    selA.replaceChildren(new Option('Todos os anos', ''), ...anos.map(a => new Option(a, a)));
    selA.value = S.ano;

    // Frase de resumo
    if (r) {
      const parts = [(S.mes ? 'Em ' + mesLongo(S.mes) + ' ' : S.ano ? 'Em ' + S.ano + ' ' : 'Desde ' + mesLongo(ms[0].mes) + ' ') + 'entraram ', el('b', null, eur0(r.receitas)), ' e saíram ', el('b', null, eur0(r.despesas)), (S.conta ? ' na conta ' + S.conta : '') + '. '];
      if (r.liquido >= 0) parts.push('Sobraram ', el('b', null, eur0(r.liquido)), '.');
      else parts.push('Gastou mais ', el('b', null, eur0(-r.liquido)), ' do que recebeu.');
      $('lede').replaceChildren(...parts);
    }

    // Meses
    const mk = (lab, val) => { const b = el('button', 'chip' + (S.mes === val ? ' on' : ''), lab); b.type = 'button'; b.setAttribute('aria-pressed', S.mes === val); b.onclick = () => set({ mes: val }); return b; };
    const chips = $('chips');
    const anosSel = S.ano ? [S.ano] : [...new Set(S.rows.map(x => x.mes.slice(0, 4)))].sort();
    const comDados = new Set(ms.map(x => x.mes)), multi = anosSel.length > 1, todos = [];
    for (const y of anosSel) for (let i = 1; i <= 12; i++) todos.push(y + '-' + String(i).padStart(2, '0'));
    chips.replaceChildren(mk(S.ano ? 'Ano todo' : 'Tudo', ''), ...todos.map(mes => {
      const b = mk(mesCurto(mes) + (multi ? ' ' + mes.slice(2, 4) : ''), mes);
      if (!comDados.has(mes) && S.mes !== mes) { b.disabled = true; b.classList.add('vazio'); b.title = 'Ainda sem dados'; }
      return b;
    }));
    const on = chips.querySelector('.on'); if (on && chips.scrollWidth > chips.clientWidth) chips.scrollLeft = on.offsetLeft - chips.clientWidth / 2 + on.offsetWidth / 2;

    // Contas (select)
    const cs = contas(), sel = $('conta');
    sel.replaceChildren(new Option('Todas as contas', ''), ...cs.map(x => new Option(x.conta, x.conta)));
    sel.value = S.conta;

    // Resumo
    $('liquido').textContent = r ? eur(r.liquido) : '—';
    $('liquido').style.color = r && r.liquido < 0 ? '#FF453A' : '';
    $('receitas').textContent = r ? eur(r.receitas) : '—';
    $('despesas').textContent = r ? eur(r.despesas) : '—';
    if (r && r.var_despesas != null) {
      const v = r.var_despesas;
      $('delta').replaceChildren(el('span', v > 0 ? 'bad' : 'good', (v > 0 ? '+' : '') + v + ' %'), el('span', 'muted', ' despesas face ao mês anterior'));
    } else if (r) {
      $('delta').replaceChildren(el('span', 'muted', r.periodo === 'ano' ? 'Média mensal de despesas: ' + eur0(r.despesas / Math.max(1, r.meses)) : 'Sem mês anterior para comparar'));
    }
    drawRing(r);
    drawBars(ms);
    drawGroups();
    drawSoma();
    drawCats();
    drawTiles(cs);
    drawList();
    drawUltimos();
    drawRapido();
    drawFixos();
    drawPrevisao();
    drawSemTag();
    drawMetas();
    drawSemana();
    drawCalendario();
    if ($('pg-q').value) pesquisaGlobal($('pg-q').value);
    drawListas();
    if (typeof tvDesenha === 'function' && TV.aberta) tvDesenha();
  }

  function drawRing(r) {
    const box = $('ring'); box.replaceChildren();
    if (!r || r.gasto_pct == null) return;
    const W = 150, R = 62, C = 2 * Math.PI * R, pct = r.gasto_pct, frac = Math.min(pct, 100) / 100;
    const col = pct > 100 ? '#FF453A' : pct > 90 ? '#FF9F0A' : '#30D158';
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${W}`).attr('role', 'img').attr('aria-label', `Gastou ${pct}% da receita do período`);
    svg.append('circle').attr('cx', W / 2).attr('cy', W / 2).attr('r', R).attr('fill', 'none').style('stroke', 'var(--line)').attr('stroke-width', 16);
    const arc = svg.append('circle').attr('cx', W / 2).attr('cy', W / 2).attr('r', R).attr('fill', 'none').style('stroke', col).attr('stroke-width', 16).attr('stroke-linecap', 'round').attr('transform', `rotate(-90 ${W / 2} ${W / 2})`).attr('stroke-dasharray', C);
    if (reduce) arc.attr('stroke-dashoffset', C * (1 - frac)); else arc.attr('stroke-dashoffset', C).transition().duration(900).ease(d3.easeCubicOut).attr('stroke-dashoffset', C * (1 - frac));
    const c = el('div', 'ring-c'); c.append(el('strong', null, pct + '%'), el('span', null, 'da receita gasta')); box.append(c);
  }

  function drawBars(m) {
    const box = $('barras'), tip = $('tip');
    box.querySelectorAll('svg').forEach(n => n.remove());
    if (!m.length) return;
    const W = Math.max(280, box.clientWidth), H = 240, mt = 12, mb = 26;
    const svg = d3.select(box).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', 'Barras de receitas e despesas por mês');
    const y = d3.scaleLinear().domain([0, d3.max(m, d => Math.max(d.receitas, d.despesas)) || 1]).nice().range([H - mb, mt]);
    const gy = svg.append('g').attr('class', 'grid'), ticks = y.ticks(4);
    const tt = gy.selectAll('text').data(ticks).join('text').attr('y', d => y(d)).attr('dy', '0.32em').text(d => k(d) + ' €');
    let ml = 0; tt.each(function () { ml = Math.max(ml, this.getComputedTextLength()); }); ml = Math.ceil(ml) + 10;
    tt.attr('x', ml - 8).attr('text-anchor', 'end');
    gy.selectAll('line').data(ticks).join('line').attr('x1', ml).attr('x2', W).attr('y1', d => y(d)).attr('y2', d => y(d)).attr('stroke-dasharray', d => d ? '2 4' : null);
    const x = d3.scaleBand().domain(m.map(d => d.mes)).range([ml, W]).paddingInner(.28).paddingOuter(.1);
    const x2 = d3.scaleBand().domain(['receitas', 'despesas']).range([0, x.bandwidth()]).padding(.12);
    const every = Math.ceil(m.length / Math.max(1, Math.floor((W - ml) / 34)));
    svg.append('g').selectAll('text').data(m.filter((d, i) => i % every === 0)).join('text').attr('x', d => x(d.mes) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').style('font-weight', d => d.mes === S.mes ? '700' : null).text(d => mesCurto(d.mes));
    const g = svg.append('g').selectAll('g').data(m).join('g').attr('transform', d => `translate(${x(d.mes)},0)`).attr('class', 'bar')
      .style('opacity', d => S.mes && d.mes !== S.mes ? .35 : 1)
      .on('click', (e, d) => set({ mes: S.mes === d.mes ? '' : d.mes }))
      .on('pointermove', (e, d) => {
        tip.hidden = false;
        tip.replaceChildren(el('b', null, mesLongo(d.mes)), el('div', null, 'Receitas  ' + eur(d.receitas)), el('div', null, 'Despesas  ' + eur(d.despesas)), el('div', null, 'Saldo  ' + eur(d.liquido)));
        const [px, py] = d3.pointer(e, box); const tw = tip.offsetWidth;
        tip.style.left = Math.max(0, Math.min(box.clientWidth - tw, px - tw / 2)) + 'px';
        tip.style.top = Math.max(0, py - tip.offsetHeight - 14) + 'px';
      })
      .on('pointerleave', () => { tip.hidden = true; });
    const rr = Math.min(6, x2.bandwidth() / 2);
    ['receitas', 'despesas'].forEach(key => {
      const bars = g.append('rect').attr('x', x2(key)).attr('width', x2.bandwidth()).attr('rx', rr).style('fill', key === 'receitas' ? '#30D158' : '#FF453A');
      if (reduce || drawnBars) bars.attr('y', d => y(d[key])).attr('height', d => Math.max(0, H - mb - y(d[key])));
      else bars.attr('y', H - mb).attr('height', 0).transition().duration(700).delay((d, i) => i * 40).ease(d3.easeCubicOut).attr('y', d => y(d[key])).attr('height', d => Math.max(0, H - mb - y(d[key])));
    });
    g.append('rect').attr('width', x.bandwidth()).attr('y', mt).attr('height', H - mb - mt).attr('fill', 'transparent');
    drawnBars = true;
  }


  // Gastos por hashtag (as hashtags que vêm do ficheiro do MoneyStats)
  // Gastos por hashtag (opção B): ranking com seleção e barra de soma
  let SOMA = (() => { try { return JSON.parse(store.get('saldo.soma') || '[]'); } catch (e) { return []; } })();
  let verTodas = false;
  const guardaSel = () => store.set('saldo.soma', JSON.stringify(SOMA));
  const rowsPeriodo = () => memo('periodo', () => S.rows.filter(r => r.tipo !== 'Transferência' && (!S.conta || r.conta === S.conta) && (!S.mes || r.mes === S.mes) && (!S.ano || r.mes.slice(0, 4) === S.ano)));
  // soma das despesas com qualquer uma das hashtags (cada movimento conta uma vez)
  function somaTags(tags, rows) {
    const sel = rows.filter(r => r.tipo === 'Despesa' && (r.ftags || []).some(t => tags.includes(t)));
    const rec = rows.filter(r => r.tipo === 'Receita' && (r.ftags || []).some(t => tags.includes(t)));
    return { total: -d3.sum(sel, r => r.montante), n: sel.length, rec: d3.sum(rec, r => r.montante), nRec: rec.length };
  }
  function drawGroups() {
    const rows = rowsPeriodo(), desp = rows.filter(r => r.tipo === 'Despesa'), tot = -d3.sum(desp, r => r.montante), m = new Map();
    for (const r of desp) for (const t of (r.ftags && r.ftags.length ? r.ftags : ['Sem hashtag'])) m.set(t, (m.get(t) || 0) - r.montante);
    const gs = [...m].map(([nome, total]) => ({ nome, total })).filter(x => x.total > 0).sort((a, b) => b.total - a.total);
    const max = gs.length ? gs[0].total : 1;
    const toggle = t => { SOMA = SOMA.includes(t) ? SOMA.filter(x => x !== t) : SOMA.concat(t); guardaSel(); drawGroups(); };
    if (!gs.length) { $('gtiles').replaceChildren(el('p', 'empty', 'Sem despesas neste período.')); }
    else {
      const vis = verTodas ? gs : gs.slice(0, 8);
      const linhas = vis.map((r, i) => {
        const on = SOMA.includes(r.nome), sem = r.nome === 'Sem hashtag';
        const b = el('button', 'hrow' + (on ? ' on' : '')); b.type = 'button';
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
        if (sem) b.disabled = true; else b.onclick = () => toggle(r.nome);
        const ck = el('span', 'hck', on ? '✓' : ''), mid = el('span', 'hmid'), top = el('span', 'htop');
        top.append(el('span', 'hn', sem ? r.nome : '#' + r.nome), el('span', 'hv', eur(r.total)));
        const tr = el('span', 'htr'), fill = el('span', 'hfill'); fill.style.width = Math.max(2, Math.round(r.total / max * 100)) + '%'; tr.append(fill);
        mid.append(top, tr, el('span', 'hp', (tot ? Math.round(r.total / tot * 100) : 0) + '% das despesas'));
        b.append(sem ? el('span', 'hck vazio', '') : ck, mid);
        return b;
      });
      if (gs.length > 8) { const mais = el('button', 'link hmais', verTodas ? 'Mostrar menos' : 'Ver todas as ' + gs.length + ' hashtags'); mais.type = 'button'; mais.onclick = () => { verTodas = !verTodas; drawGroups(); }; linhas.push(mais); }
      $('gtiles').replaceChildren(...linhas);
    }
    // barra da soma
    const bar = $('hsoma'), sel = SOMA.filter(t => m.has(t) || S.rows.some(r => (r.ftags || []).includes(t)));
    if (!sel.length) { bar.replaceChildren(el('div', 'hs-n', 'Toque nas hashtags para somar')); bar.classList.remove('on'); }
    else {
      const r = somaTags(sel, rows), info = el('div', 'hs-info');
      info.append(el('div', 'hs-n', sel.length + (sel.length === 1 ? ' hashtag escolhida' : ' hashtags escolhidas') + ' · ' + r.n + ' movimentos'), el('div', 'hs-v', eur(r.total)), el('div', 'hs-t', sel.map(t => '#' + t).join(' + ')));
      const acts = el('div', 'hs-acts');
      const bt = (txt, fn, cls) => { const x = el('button', cls || 'hs-b', txt); x.type = 'button'; x.onclick = fn; return x; };
      acts.append(el('div', 'hs-pct', (tot ? Math.round(r.total / tot * 100) : 0) + '% das despesas'),
        bt('Guardar', () => abrirSoma(null, sel)),
        bt('Ver movimentos', () => { set({ multi: sel.slice(), tag: '', lista: '' }); irPara('movimentos'); }),
        bt('Limpar', () => { SOMA = []; guardaSel(); drawGroups(); }, 'hs-b leve'));
      bar.replaceChildren(info, acts); bar.classList.add('on');
    }
    const fg = $('filtroGrupo');
    if (S.multi.length) { const bt = el('button', 'filter', S.multi.map(t => '#' + t).join(' + ') + '  ×'); bt.type = 'button'; bt.onclick = () => set({ multi: [], tag: '' }); fg.replaceChildren(bt); }
    else if (!S.tag) fg.replaceChildren(el('span', 'hint', 'Todas as hashtags'));
    else { const bt = el('button', 'filter', '#' + S.tag + '  ×'); bt.type = 'button'; bt.onclick = () => set({ tag: '', categoria: '' }); fg.replaceChildren(bt); }
  }

  // Somas guardadas: cartões com seleções de hashtags
  function drawSoma() {
    const rows = rowsPeriodo(), tot = -d3.sum(rows.filter(r => r.tipo === 'Despesa'), r => r.montante), totRec = d3.sum(rows.filter(r => r.tipo === 'Receita'), r => r.montante), somas = M.somas || [];
    if (!somas.length) { $('somas-lista').replaceChildren(el('p', 'empty', 'Ainda não tem somas guardadas. Escolha hashtags no cartão de cima e toque em Guardar.')); return; }
    $('somas-lista').replaceChildren(...somas.map(sm => {
      const r = somaTags(sm.tags, rows), c = el('div', 'scard');
      const top = el('div', 'sc-top'); top.append(el('div', 'sc-nome', sm.nome));
      const ed = el('button', 'link', 'Editar'); ed.type = 'button'; ed.onclick = () => abrirSoma(sm); top.append(ed);
      const ver = el('button', 'link', 'Ver movimentos'); ver.type = 'button'; ver.onclick = () => { set({ multi: sm.tags.slice(), tag: '', lista: '' }); irPara('movimentos'); };
      const tags = el('div', 'sc-tags'); tags.append(...sm.tags.map(t => el('span', 'sc-tag', '#' + t)));
      // hashtags de receitas (ex.: #Ordenado) mostram o que entrou, a verde
      const ehRec = r.rec > 0 && r.rec >= r.total;
      const v = el('div', 'sc-v' + (ehRec ? ' pos' : ''), ehRec ? '+' + eur(r.rec) : eur(r.total));
      const sub = ehRec ? r.nRec + ' movimentos · ' + (totRec ? Math.round(r.rec / totRec * 100) : 0) + '% das receitas'
        : r.n + ' movimentos · ' + (tot ? Math.round(r.total / tot * 100) : 0) + '% das despesas';
      const foot = el('div', 'sc-foot'); foot.append(el('span', 'sc-sub', sub), ver);
      const extra = ehRec ? (r.total > 0 ? 'Despesas: ' + eur(r.total) : '') : (r.rec > 0 ? 'Receitas: +' + eur(r.rec) : '');
      const blocos = [top, v, el('div', 'sc-sub', ehRec ? 'Recebido' : 'Gasto'), ...(extra ? [el('div', 'sc-sub', extra)] : [])];
      // 1. Orçamento por mês
      if (!ehRec && sm.limite > 0) {
        const nM = nMesesPeriodo(), lim = sm.limite * nM, fr = lim ? r.total / lim : 0;
        const cor = fr >= 1 ? '#FF453A' : fr >= 0.8 ? '#FF9F0A' : '#30D158';
        const tr = el('div', 'sc-orc'), f = el('i'); f.style.width = Math.min(100, fr * 100) + '%'; f.style.background = cor; tr.append(f);
        tr.setAttribute('role', 'img'); tr.setAttribute('aria-label', 'Gasto ' + eur(r.total) + ' de ' + eur(lim));
        const txt = fr >= 1 ? 'Passou ' + eur(r.total - lim) + ' do limite de ' + eur(lim) : 'Faltam ' + eur(lim - r.total) + ' de ' + eur(lim);
        const t = el('div', 'sc-orc-t', txt + (nM > 1 ? ' (' + nM + ' meses)' : '')); t.style.color = fr >= 1 ? '#FF453A' : '';
        blocos.push(tr, t);
      }
      // 4. Comparar com o mês anterior
      const cmp = comparaMes(sm.tags, ehRec);
      if (cmp) blocos.push(cmp);
      c.append(...blocos, tags, foot);
      c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', sm.nome + ': ver o valor de cada mês');
      c.onclick = e => { if (!e.target.closest('button')) abrirSomaMeses(sm); };
      c.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === c) { e.preventDefault(); abrirSomaMeses(sm); } };
      return c;
    }));
  }
  const prevMes = k => { let [y, m] = k.split('-').map(Number); m--; if (!m) { m = 12; y--; } return y + '-' + String(m).padStart(2, '0'); };
  function mesRef() { return memo('mesRef', mesRefCalc); }
  function mesRefCalc() {
    if (S.mes) return S.mes;
    const ms = [...new Set(S.rows.filter(r => !S.ano || r.mes.slice(0, 4) === S.ano).map(r => r.mes))].sort();
    return ms[ms.length - 1] || '';
  }
  function nMesesPeriodo() { return memo('nMeses', nMesesCalc); }
  function nMesesCalc() {
    if (S.mes) return 1;
    return Math.max(1, new Set(S.rows.filter(r => !S.ano || r.mes.slice(0, 4) === S.ano).map(r => r.mes)).size);
  }
  function comparaMes(tags, ehRec) {
    const k = mesRef(); if (!k) return null;
    const ant = prevMes(k), pm = memo('porMes', () => d3.group(S.rows.filter(r => r.tipo !== 'Transferência' && (!S.conta || r.conta === S.conta)), r => r.mes));
    const val = mes => { const x = somaTags(tags, pm.get(mes) || []); return ehRec ? x.rec : x.total; };
    const a = val(k), b = val(ant); if (!a && !b) return null;
    const d = a - b, nomeAnt = MES[+ant.slice(5, 7) - 1], nomeK = MES[+k.slice(5, 7) - 1];
    const bom = ehRec ? d >= 0 : d <= 0;
    const e = el('div', 'sc-cmp ' + (Math.abs(d) < 0.005 ? 'igual' : bom ? 'bom' : 'mau'));
    e.textContent = Math.abs(d) < 0.005 ? '= igual a ' + nomeAnt : (d > 0 ? '▲ ' : '▼ ') + eur(Math.abs(d)) + ' em ' + nomeK + ' face a ' + nomeAnt;
    return e;
  }

  // Valor de cada mês de uma soma guardada (segue o ano e a conta do topo, ignora o mês)
  function abrirSomaMeses(sm) {
    const rows = S.rows.filter(r => r.tipo !== 'Transferência' && (!S.conta || r.conta === S.conta) && (!S.ano || r.mes.slice(0, 4) === S.ano) && (r.ftags || []).some(t => sm.tags.includes(t)));
    const m = new Map();
    for (const r of rows) { const o = m.get(r.mes) || { d: 0, rc: 0, n: 0 }; if (r.tipo === 'Despesa') o.d -= r.montante; else if (r.tipo === 'Receita') o.rc += r.montante; o.n++; m.set(r.mes, o); }
    const totD = d3.sum([...m.values()], o => o.d), totR = d3.sum([...m.values()], o => o.rc), ehRec = totR > 0 && totR >= totD;
    // todos os meses do período, mesmo sem movimentos
    const todos = [...new Set(S.rows.map(r => r.mes))].filter(x => !S.ano || x.slice(0, 4) === S.ano).sort();
    let meses = todos;
    if (m.size) { const ks = [...m.keys()].sort(); meses = todos.filter(x => x >= ks[0]); }
    meses = meses.slice().reverse();
    const val = k => { const o = m.get(k); return o ? (ehRec ? o.rc : o.d) : 0; };
    const max = d3.max(meses, val) || 1, comV = meses.filter(k => val(k) > 0);
    const varios = new Set(meses.map(k => k.slice(0, 4))).size > 1;
    const nomeM = k => { const n = MES[+k.slice(5, 7) - 1]; return n[0].toUpperCase() + n.slice(1) + (varios || !S.ano ? ' ' + k.slice(0, 4) : ''); };
    $('sm-title').textContent = sm.nome;
    $('sm-sub').textContent = sm.tags.map(t => '#' + t).join(' + ') + ' · ' + (S.conta || 'todas as contas') + ' · ' + (S.ano || 'todos os anos');
    const tot = ehRec ? totR : totD, media = comV.length ? tot / meses.length : 0, topo = comV.slice().sort((a, b) => val(b) - val(a))[0];
    const st = (lab, v, cls) => { const d = el('div', 'sm-st'); d.append(el('span', 'sm-l', lab), el('b', cls || '', v)); return d; };
    $('sm-resumo').replaceChildren(st(ehRec ? 'Recebido' : 'Gasto no total', (ehRec ? '+' : '') + eur(tot), ehRec ? 'pos' : ''), st('Média por mês', eur(media)), st(topo ? 'Mais alto · ' + MES3[+topo.slice(5, 7) - 1] : 'Mês mais alto', topo ? eur(val(topo)) : '—'));
    if (!meses.length) { $('sm-meses').replaceChildren(el('p', 'empty', 'Sem movimentos neste período.')); abrir('sh-somames'); return; }
    $('sm-meses').replaceChildren(...meses.map(k => {
      const v = val(k), o = m.get(k), b = el('button', 'sm-row' + (v ? '' : ' zero')); b.type = 'button';
      const topL = el('span', 'sm-top'); topL.append(el('span', 'sm-mes', nomeM(k)), el('span', 'sm-v' + (ehRec && v ? ' pos' : ''), v ? (ehRec ? '+' : '') + eur(v) : '—'));
      const tr = el('span', 'htr'), f = el('span', 'hfill'); f.style.width = (v ? Math.max(2, v / max * 100) : 0) + '%'; f.style.background = ehRec ? '#30D158' : '#FF9F0A'; tr.append(f);
      b.append(topL, tr, el('span', 'hp', o ? o.n + (o.n === 1 ? ' movimento' : ' movimentos') + (media && v ? ' · ' + (v >= media ? '+' : '−') + eur(Math.abs(v - media)).replace(/^−/, '') + ' face à média' : '') : 'Sem movimentos'));
      b.onclick = () => { fechar('sh-somames'); set({ mes: k, ano: k.slice(0, 4), multi: sm.tags.slice(), tag: '', lista: '' }); irPara('movimentos'); };
      return b;
    }));
    abrir('sh-somames');
  }
  let SE = null;
  function abrirSoma(sm, tags) {
    SE = { id: sm ? sm.id : null, tags: new Set(sm ? sm.tags : tags || []) };
    $('so-title').textContent = sm ? 'Editar soma' : 'Guardar soma';
    $('so-nome').value = sm ? sm.nome : '';
    $('so-lim').value = sm && sm.limite ? String(sm.limite).replace('.', ',') : '';
    const todas = [...new Set(S.rows.flatMap(r => r.ftags || []))].sort((a, b) => a.localeCompare(b, 'pt'));
    const ordem = [...SE.tags].filter(t => todas.includes(t)).concat(todas.filter(t => !SE.tags.has(t)));
    chipsMulti($('so-tags'), ordem, SE.tags, '#', () => { $('so-cont').textContent = SE.tags.size ? '· ' + SE.tags.size + ' escolhidas' : ''; });
    $('so-del').hidden = !sm; $('so-msg').textContent = '';
    abrir('sh-soma');
  }

  function drawCats() {
    const c = agrupa(despesasFiltradas(true), 'categoria');
    if (!c.length) { $('cats').replaceChildren(el('p', 'empty', 'Sem despesas neste período.')); return; }
    const top = c.slice(0, 12), max = top[0].total;
    $('cats').replaceChildren(...top.map(r => {
      const b = el('button', 'cat' + (S.categoria === r.nome ? ' on' : '')); b.type = 'button';
      b.onclick = () => { const novo = S.categoria === r.nome ? '' : r.nome; set({ categoria: novo }); if (novo) irPara('movimentos'); };
      const mid = el('div'); mid.style.minWidth = '0';
      const tr = el('div', 'cat-track'), fl = el('div', 'cat-fill'); fl.style.width = (r.total / max * 100) + '%'; fl.style.background = gcol(r.grupo); tr.append(fl);
      mid.append(el('div', 'cat-name', r.nome), tr);
      const val = el('div', 'cat-val'); val.append(el('span', null, eur(r.total)), el('small', null, r.quota + '% das despesas'));
      const ci = el('div', 'cat-ico', ico(r.nome)); ci.style.background = gcol(r.grupo); aplicaCapa(ci, r.nome);
      b.append(ci, mid, val); return b;
    }));
  }

  function drawTiles(cs) {
    const total = d3.sum(cs, r => r.saldo), acertadas = cs.filter(r => r.acerto).length;
    $('total-contas').textContent = eur(total);
    $('ini-total-v').textContent = eur(total); $('ini-total-v').style.color = total < 0 ? '#FF453A' : '';
    $('total-contas').style.color = total < 0 ? '#FF453A' : '';
    const comLim = cs.filter(r => r.limite > 0);
    $('total-limite').hidden = !comLim.length;
    if (comLim.length) $('total-limite').textContent = comLim.map(r => r.conta + ': ainda pode usar ' + eur(Math.max(0, r.disponivel)) + (r.usado > 0 ? ' (já usou ' + eur(r.usado) + ' dos ' + eur(r.limite) + ' da Conta Ordenado)' : ' (Conta Ordenado por usar)')).join(' · ');
    $('total-nota').textContent = acertadas === cs.length ? 'Todas as contas acertadas com o saldo real' : acertadas ? acertadas + ' de ' + cs.length + ' contas acertadas com o saldo real' : 'Saldos calculados: toque no lápis de cada conta para pôr o saldo real';
    $('tiles').replaceChildren(...cs.map((r, i) => {
      const t = el('div', 'tile' + (S.conta === r.conta ? ' on' : ''));
      const b = el('button', 'tile-main'); b.type = 'button'; b.setAttribute('aria-pressed', S.conta === r.conta);
      b.onclick = () => verConta(S.conta === r.conta ? '' : r.conta);
      const ic = el('div', 'tile-ico', ico(r.conta)); ic.style.background = COLORS[i % COLORS.length]; aplicaCapa(ic, 'conta:' + r.conta);
      let nota = 'Calculado';
      if (r.acerto) { const d = new Date(r.acerto.em); nota = 'Acertado a ' + d.getDate() + ' ' + MES3[d.getMonth()]; }
      if (r.limite > 0) {
        const v = el('div', 'tile-val', eur(r.disponivel)); if (r.disponivel < 0) v.style.color = '#FF453A';
        const fr = r.usado / r.limite, cor = fr >= 0.85 ? '#FF453A' : fr >= 0.5 ? '#FF9F0A' : '#30D158';
        const barra = el('div', 'lim-bar'); barra.setAttribute('role', 'img'); barra.setAttribute('aria-label', 'Usado ' + eur(r.usado) + ' de ' + eur(r.limite) + ' da Conta Ordenado');
        const fill = el('i'); fill.style.width = Math.min(100, fr * 100) + '%'; fill.style.background = cor; barra.append(fill);
        const sv = el('div', 'tile-saldo'); sv.append('Saldo ', Object.assign(el('b', null, eur(r.saldo)), { style: r.saldo < 0 ? 'color:#FF453A' : '' }));
        b.append(ic, el('div', 'tile-name', r.conta), el('div', 'tile-lab', 'Disponível'), v, sv, barra,
          el('div', 'tile-lim', r.usado > 0 ? 'Usado ' + eur(r.usado) + ' de ' + eur(r.limite) + ' (Conta Ordenado)' : 'Conta Ordenado de ' + eur(r.limite) + ' por usar'),
          el('div', 'tile-nota' + (r.acerto ? ' ok' : ''), nota));
      } else {
        const v = el('div', 'tile-val', eur(r.saldo)); if (r.saldo < 0) v.style.color = '#FF453A';
        b.append(ic, el('div', 'tile-name', r.conta), v, el('div', 'tile-nota' + (r.acerto ? ' ok' : ''), nota));
      }
      const e = el('button', 'tile-edit'); e.type = 'button'; e.setAttribute('aria-label', 'Acertar saldo de ' + r.conta);
      e.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      e.onclick = () => abrirAcerto(r);
      t.append(b, e); return t;
    }));
  }

  // Tocar numa conta: a lista de movimentos mostra só essa conta
  function verConta(conta) {
    set({ conta, categoria: '', grupo: '' });
    if (conta) { fecharLinhas(); const lst = $('lista'); if (lst) lst.scrollTop = 0; irPara('movimentos'); }
  }
  // 2. Adicionar rápido: comerciantes mais usados; o valor é sempre escrito por si
  function drawRapido() {
    const lim = new Date(); lim.setDate(lim.getDate() - 120); const desde = lim.toISOString().slice(0, 10);
    const m = new Map();
    for (const r of S.rows) if (r.tipo === 'Despesa' && r.data >= desde) { const o = m.get(r.categoria) || { n: 0, ult: r }; o.n++; if (r.data >= o.ult.data) o.ult = r; m.set(r.categoria, o); }
    let top = [...m].sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    if (!top.length) top = [...new Map(S.rows.filter(r => r.tipo === 'Despesa').map(r => [r.categoria, { n: 1, ult: r }]))].slice(0, 8);
    $('rapido').replaceChildren(...top.map(([cat, o]) => {
      const b = el('button', 'rq'); b.type = 'button'; b.setAttribute('aria-label', 'Nova despesa em ' + cat);
      const ic = el('span', 'rq-ico', ico(cat)); ic.style.background = gcol(o.ult.grupo); aplicaCapa(ic, cat);
      const tx = el('span', 'rq-t'); tx.append(el('b', '', cat), el('small', '', o.ult.conta));
      b.append(ic, tx);
      b.onclick = () => { abrirForm({ tipo: 'Despesa', montante: 0, conta: o.ult.conta, categoria: cat, etiquetas: o.ult.etiquetas || '' }, true); C = ''; abrirCalc(); fDesenha(); };
      return b;
    }));
  }

  // 3. Calendário de gastos do mês
  let CAL_DIA = '';
  function drawCalendario() {
    const k = mesRef(); if (!k) { $('cal-grid').replaceChildren(); return; }
    const [y, mm] = k.split('-').map(Number), dias = new Date(y, mm, 0).getDate(), pri = (new Date(y, mm - 1, 1).getDay() + 6) % 7;
    const rows = S.rows.filter(r => r.mes === k && r.tipo === 'Despesa' && (!S.conta || r.conta === S.conta));
    const porDia = d3.rollup(rows, v => -d3.sum(v, r => r.montante), r => r.data);
    const max = d3.max([...porDia.values()]) || 1, tot = d3.sum([...porDia.values()]);
    $('cal-tit').textContent = MES[mm - 1][0].toUpperCase() + MES[mm - 1].slice(1) + ' ' + y + ' · ' + eur(tot);
    const cel = [];
    for (const d of ['S', 'T', 'Q', 'Q', 'S', 'S', 'D']) cel.push(el('span', 'cal-h', d));
    for (let i = 0; i < pri; i++) cel.push(el('span', 'cal-vazio'));
    for (let d = 1; d <= dias; d++) {
      const iso = k + '-' + String(d).padStart(2, '0'), v = porDia.get(iso) || 0, b = el('button', 'cal-d' + (iso === CAL_DIA ? ' on' : ''), String(d)); b.type = 'button';
      if (v) { const a = 0.18 + 0.82 * Math.sqrt(v / max); b.style.background = 'rgba(255,159,10,' + a.toFixed(2) + ')'; if (a > 0.55) b.style.color = '#fff'; }
      b.setAttribute('aria-label', d + ' de ' + MES[mm - 1] + ': ' + (v ? eur(v) : 'sem gastos'));
      b.onclick = () => { CAL_DIA = CAL_DIA === iso ? '' : iso; drawCalendario(); };
      cel.push(b);
    }
    $('cal-grid').replaceChildren(...cel);
    const det = $('cal-det');
    if (!CAL_DIA || CAL_DIA.slice(0, 7) !== k) { det.replaceChildren(el('p', 'hint', 'Quanto mais escuro, mais gastou nesse dia. Toque num dia para ver os gastos.')); return; }
    const doDia = rows.filter(r => r.data === CAL_DIA).sort((a, b) => a.montante - b.montante);
    const cab = el('div', 'cal-cab'); cab.append(el('b', '', (+CAL_DIA.slice(8)) + ' de ' + MES[mm - 1]), el('b', '', eur(-d3.sum(doDia, r => r.montante))));
    det.replaceChildren(cab, ...(doDia.length ? doDia.map(r => { const l = el('div', 'cal-l'); l.append(el('span', '', r.categoria + ((r.tags || []).length ? ' · #' + r.tags[0] : '')), el('span', '', eur(r.montante))); return l; }) : [el('p', 'hint', 'Sem gastos neste dia.')]));
  }

  // 5. Pesquisa universal
  function pesquisaGlobal(q) {
    const box = $('pg-res'), k = semAc(q.trim());
    if (!k) { box.hidden = true; box.replaceChildren(); return; }
    const rows = rowsPeriodo(), res = [];
    const tagT = new Map(), catT = new Map();
    for (const r of rows) {
      for (const t of r.ftags || []) if (semAc(t).includes(k)) { const o = tagT.get(t) || { d: 0, rc: 0 }; if (r.tipo === 'Despesa') o.d -= r.montante; else o.rc += r.montante; tagT.set(t, o); }
      if (semAc(r.categoria).includes(k)) { const o = catT.get(r.categoria) || { d: 0, rc: 0 }; if (r.tipo === 'Despesa') o.d -= r.montante; else o.rc += r.montante; catT.set(r.categoria, o); }
    }
    for (const sm of M.somas || []) if (semAc(sm.nome).includes(k)) { const x = somaTags(sm.tags, rows); res.push({ tipo: 'Soma', nome: sm.nome, v: x.rec > x.total ? '+' + eur(x.rec) : eur(x.total), ir: () => abrirSomaMeses(sm) }); }
    for (const c of contas()) if (semAc(c.conta).includes(k)) res.push({ tipo: 'Conta', nome: c.conta, v: 'saldo ' + eur(c.saldo), ir: () => verConta(c.conta) });
    const vt = o => o.d >= o.rc ? eur(o.d) : '+' + eur(o.rc);
    [...tagT].sort((a, b) => (b[1].d + b[1].rc) - (a[1].d + a[1].rc)).slice(0, 6).forEach(([t, o]) => res.push({ tipo: 'Hashtag', nome: '#' + t, v: vt(o), ir: () => { set({ multi: [t], tag: '', lista: '', categoria: '' }); irPara('movimentos'); } }));
    [...catT].sort((a, b) => (b[1].d + b[1].rc) - (a[1].d + a[1].rc)).slice(0, 6).forEach(([c, o]) => res.push({ tipo: 'Comerciante', nome: c, v: vt(o), ir: () => { set({ categoria: c, multi: [], tag: '', lista: '' }); irPara('movimentos'); } }));
    box.hidden = false;
    if (!res.length) { box.replaceChildren(el('p', 'pg-vazio', 'Nada encontrado.')); return; }
    box.replaceChildren(...res.map(x => {
      const b = el('button', 'pg-item'); b.type = 'button';
      const l = el('span', 'pg-l'); l.append(el('b', '', x.nome), el('small', '', x.tipo));
      b.append(l, el('span', 'pg-v', x.v));
      b.onclick = () => { $('pg-q').value = ''; pesquisaGlobal(''); $('pg-q').blur(); x.ir(); };
      return b;
    }));
  }

  // ---------- 6. Pagamentos fixos (e receitas fixas) ----------
  const pad2 = n => String(n).padStart(2, '0');
  const diasEntre = (a, b) => Math.round((new Date(b + 'T12:00') - new Date(a + 'T12:00')) / 864e5);
  function fixos(tipo) { tipo = tipo || 'Despesa'; return memo('fixos:' + tipo, () => fixosCalc(tipo)); }
  function fixosCalc(tipo) {
    const hj = hoje(), mA = hj.slice(0, 7), ult = []; let k = mA;
    for (let i = 0; i < 6; i++) { k = prevMes(k); ult.push(k); }
    const by = new Map();
    for (const r of S.rows) if (r.tipo === tipo && (!S.conta || r.conta === S.conta)) { if (!by.has(r.categoria)) by.set(r.categoria, []); by.get(r.categoria).push(r); }
    const out = [];
    for (const [cat, rs] of by) {
      if ((M.fixosOff || []).includes(cat)) continue;
      const pm = d3.rollup(rs.filter(r => ult.includes(r.mes)), v => ({ v: Math.abs(d3.sum(v, r => r.montante)), dia: d3.median(v, r => +r.data.slice(8)), n: v.length }), r => r.mes);
      if (pm.size < 3 || ult.slice(0, 4).filter(m => pm.has(m)).length < 3) continue;
      const vals = [...pm.values()];
      if (d3.mean(vals, x => x.n) > 2.5) continue;
      const vs = vals.map(x => x.v), med = d3.median(vs), dev = d3.deviation(vs) || 0;
      if (!(med > 0) || dev / med > 0.35) continue;
      const dia = Math.round(d3.median(vals, x => x.dia)), pago = rs.some(r => r.mes === mA);
      let [y, m] = mA.split('-').map(Number); if (pago) { m++; if (m > 12) { m = 1; y++; } }
      const prox = y + '-' + pad2(m) + '-' + pad2(Math.min(dia, new Date(y, m, 0).getDate()));
      const recente = rs.slice().sort((a, b) => b.data.localeCompare(a.data))[0];
      out.push({ cat, valor: med, dia, prox, pago, conta: recente.conta, grupo: recente.grupo, dias: diasEntre(hj, prox) });
    }
    return out.sort((a, b) => a.prox.localeCompare(b.prox));
  }
  function drawFixos() {
    const fx = fixos(), hj = hoje();
    if (!fx.length) { $('fixos').replaceChildren(el('p', 'empty', 'Ainda não encontrei pagamentos que se repitam todos os meses.')); $('fixos-tot').textContent = ''; return; }
    const quando = f => f.dias < 0 ? 'devia ter sido a ' + (+f.prox.slice(8)) + ' ' + MES3[+f.prox.slice(5, 7) - 1] : f.dias === 0 ? 'hoje' : f.dias === 1 ? 'amanhã' : 'em ' + f.dias + ' dias';
    $('fixos').replaceChildren(...fx.slice(0, 8).map(f => {
      const row = el('div', 'fx' + (f.dias < 0 ? ' atraso' : '')), ic = el('span', 'rq-ico', ico(f.cat)); ic.style.background = gcol(f.grupo); aplicaCapa(ic, f.cat);
      const t = el('span', 'rq-t'); t.append(el('b', '', f.cat), el('small', '', f.dias < 0 ? 'Esperado a ' + (+f.prox.slice(8)) + ' ' + MES3[+f.prox.slice(5, 7) - 1] + ' · ainda não apareceu' : (+f.prox.slice(8)) + ' ' + MES3[+f.prox.slice(5, 7) - 1] + ' · ' + quando(f)));
      const x = el('button', 'fx-x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Não é um pagamento fixo: ' + f.cat);
      x.onclick = () => { if (!window.confirm('Deixar de mostrar ' + f.cat + ' como pagamento fixo?')) return; M.fixosOff = (M.fixosOff || []).concat(f.cat); saveManuais('Removido dos pagamentos fixos'); };
      row.append(ic, t, el('b', 'fx-v', '≈ ' + eur(f.valor)), x); return row;
    }));
    const falta = d3.sum(fx.filter(f => !f.pago), f => f.valor), prox = d3.sum(fx, f => f.valor);
    $('fixos-tot').textContent = (falta ? 'Ainda este mês: ' + eur(falta) + ' · ' : 'Este mês já está tudo pago · ') + 'Por mês: ' + eur(prox);
  }

  // ---------- 7. Previsão do fim do mês ----------
  function drawPrevisao() {
    const hj = hoje(), mA = hj.slice(0, 7), card = $('previsao');
    const rows = S.rows.filter(r => r.mes === mA && r.data <= hj && r.tipo !== 'Transferência' && (!S.conta || r.conta === S.conta));
    if (!rows.length) { card.classList.add('fora-dados'); return; }
    card.classList.remove('fora-dados');
    const fxD = fixos('Despesa'), fxR = fixos('Receita'), cats = new Set(fxD.map(f => f.cat));
    const gasto = -d3.sum(rows.filter(r => r.tipo === 'Despesa'), r => r.montante);
    const variavel = -d3.sum(rows.filter(r => r.tipo === 'Despesa' && !cats.has(r.categoria)), r => r.montante);
    const dia = +hj.slice(8), dim = new Date(+mA.slice(0, 4), +mA.slice(5, 7), 0).getDate();
    const pend = d3.sum(fxD.filter(f => !f.pago), f => f.valor), recPend = d3.sum(fxR.filter(f => !f.pago), f => f.valor);
    const prev = gasto + variavel / dia * (dim - dia) + pend;
    const rec = d3.sum(rows.filter(r => r.tipo === 'Receita'), r => r.montante) + recPend, sobra = rec - prev;
    const lin = (a, b, cls) => { const d = el('div', 'pv-l'); d.append(el('span', '', a), el('b', cls || '', b)); return d; };
    const tr = el('div', 'sc-orc'), f = el('i'); f.style.width = Math.min(100, prev ? gasto / prev * 100 : 0) + '%'; f.style.background = '#FF9F0A'; tr.append(f);
    $('pv-corpo').replaceChildren(
      lin('Gasto até hoje (dia ' + dia + ')', eur(gasto)),
      lin('Previsão até dia ' + dim, eur(prev)), tr,
      lin('Receitas do mês' + (recPend ? ' (com as que faltam)' : ''), '+' + eur(rec)),
      lin(sobra >= 0 ? 'Vai sobrar' : 'Vai faltar', eur(Math.abs(sobra)), sobra >= 0 ? 'pv-bom' : 'pv-mau'),
      el('p', 'hint', 'Conta o ritmo dos gastos do dia a dia até agora' + (pend ? ' e ' + eur(pend) + ' de pagamentos fixos que ainda faltam' : '') + '.'));
  }

  // ---------- 8. Arrumar movimentos sem hashtag ----------
  let AR = null, arTimer = null;
  const semHashtag = () => rowsPeriodo().filter(r => !(r.ftags || []).length && !(r.key in (M.tagsMov || {}))).sort((a, b) => b.data.localeCompare(a.data));
  function drawSemTag() {
    const n = semHashtag().length;
    $('semtag-card').classList.toggle('fora-dados', !n);
    $('semtag-n').textContent = n + (n === 1 ? ' movimento sem hashtag' : ' movimentos sem hashtag') + ' neste período';
  }
  function guardaTagsDepois() { clearTimeout(arTimer); arTimer = setTimeout(() => saveManuais('Hashtags guardadas'), 1500); }
  function abrirArrumar() { AR = { fila: semHashtag(), i: 0, feitos: 0 }; abrir('sh-arrumar'); arDesenha(); }
  function arDesenha() {
    const box = $('ar-corpo');
    if (!AR || AR.i >= AR.fila.length) {
      box.replaceChildren(el('p', 'ar-fim', AR && AR.feitos ? 'Tudo arrumado. ' + AR.feitos + (AR.feitos === 1 ? ' movimento ficou' : ' movimentos ficaram') + ' com hashtag.' : 'Não há movimentos sem hashtag neste período.'));
      $('ar-prog').textContent = ''; return;
    }
    const r = AR.fila[AR.i];
    $('ar-prog').textContent = (AR.i + 1) + ' de ' + AR.fila.length;
    const mv = el('div', 'ar-mv'), ic = el('span', 'rq-ico', ico(r.categoria)); ic.style.background = gcol(r.grupo); aplicaCapa(ic, r.categoria);
    const t = el('span', 'rq-t'); t.append(el('b', '', r.categoria), el('small', '', (+r.data.slice(8)) + ' ' + MES3[+r.data.slice(5, 7) - 1] + ' ' + r.data.slice(0, 4) + ' · ' + r.conta));
    mv.append(ic, t, el('b', 'fx-v' + (r.montante > 0 ? ' pv-bom' : ''), (r.montante > 0 ? '+' : '') + eur(r.montante)));
    // sugestões: hashtags usadas no mesmo comerciante, depois as mais usadas
    const cnt = new Map(), glob = new Map();
    for (const x of S.rows) for (const tg of x.ftags || []) { glob.set(tg, (glob.get(tg) || 0) + 1); if (x.categoria === r.categoria) cnt.set(tg, (cnt.get(tg) || 0) + 1); }
    const sug = [...cnt].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    for (const [tg] of [...glob].sort((a, b) => b[1] - a[1])) { if (sug.length >= 8) break; if (!sug.includes(tg)) sug.push(tg); }
    const chips = el('div', 'lchips wrap'), q = $('ar-q');
    const por = tg => { M.tagsMov = M.tagsMov || {}; M.tagsMov[r.key] = [tg]; AR.feitos++; AR.i++; q.value = ''; compose(); arDesenha(); guardaTagsDepois(); };
    const mostra = () => {
      const k = semAc(q.value.trim()), todas = [...glob.keys()];
      const lista = k ? todas.filter(tg => semAc(tg).includes(k)).slice(0, 12) : sug;
      const bs = lista.map(tg => { const b = el('button', 'lchip', '#' + tg); b.type = 'button'; b.onclick = () => por(tg); return b; });
      const novo = q.value.trim().replace(/^#+/, '');
      if (novo && !todas.some(tg => semAc(tg) === semAc(novo))) { const b = el('button', 'lchip on', '+ Criar #' + novo); b.type = 'button'; b.onclick = () => por(novo); bs.unshift(b); }
      chips.replaceChildren(...bs);
    };
    q.oninput = mostra; mostra();
    box.replaceChildren(mv, el('h3', 'sh-sub', 'Sugestões'), chips);
  }
  $('ar-saltar').addEventListener('click', () => { if (AR) { AR.i++; arDesenha(); } });
  $('ar-nao').addEventListener('click', () => { if (!AR || AR.i >= AR.fila.length) return; M.tagsMov = M.tagsMov || {}; M.tagsMov[AR.fila[AR.i].key] = []; AR.i++; arDesenha(); guardaTagsDepois(); });
  $('ar-fechar').addEventListener('click', () => { fechar('sh-arrumar'); if (arTimer) { clearTimeout(arTimer); saveManuais('Hashtags guardadas'); arTimer = null; } });
  $('semtag-btn').addEventListener('click', abrirArrumar);

  // ---------- 9. Metas de poupança ----------
  let ME = null;
  const mesesAte = ate => { const [y, m] = hoje().split('-').map(Number), [y2, m2] = ate.split('-').map(Number); return Math.max(1, (y2 - y) * 12 + (m2 - m) + 1); };
  const atualMeta = mt => mt.conta ? ((contas().find(c => c.conta === mt.conta) || {}).saldo || 0) : (+mt.guardado || 0);
  function drawMetas() {
    const ms = M.metas || [];
    if (!ms.length) { $('metas').replaceChildren(el('p', 'empty', 'Crie uma meta, por exemplo Férias de verão, 1 500 € até julho.')); return; }
    $('metas').replaceChildren(...ms.map(mt => {
      const at = Math.max(0, atualMeta(mt)), fr = mt.alvo ? Math.min(1, at / mt.alvo) : 0, falta = Math.max(0, mt.alvo - at), n = mesesAte(mt.ate);
      const c = el('div', 'scard meta'), top = el('div', 'sc-top'); top.append(el('div', 'sc-nome', mt.nome));
      const ed = el('button', 'link', 'Editar'); ed.type = 'button'; ed.onclick = () => abrirMeta(mt); top.append(ed);
      const v = el('div', 'sc-v'); v.append(eur(at), el('span', 'meta-de', ' de ' + eur(mt.alvo)));
      const tr = el('div', 'sc-orc'), f = el('i'); f.style.width = fr * 100 + '%'; f.style.background = '#30D158'; tr.append(f);
      const [ay, am] = mt.ate.split('-');
      const sub = falta ? 'Até ' + MES[+am - 1] + ' ' + ay + ' · ponha de lado ' + eur(falta / n) + ' por mês' : 'Meta cumprida!';
      const blocos = [top, v, tr, el('div', 'sc-sub', sub), el('div', 'sc-sub', mt.conta ? 'Segue o saldo de ' + mt.conta : 'Valor posto à mão')];
      if (!mt.conta) { const b = el('button', 'hs-b meta-add', '+ Pôr de lado'); b.type = 'button'; b.onclick = () => { const t = window.prompt('Quanto pôs de lado para ' + mt.nome + '? (€)'); if (t == null) return; const x = +t.replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.'); if (!(x > 0 || x < 0)) return; mt.guardado = Math.round(((+mt.guardado || 0) + x) * 100) / 100; saveManuais('Meta atualizada'); }; blocos.push(b); }
      c.append(...blocos); return c;
    }));
  }
  function abrirMeta(mt) {
    ME = mt || null;
    $('me-title').textContent = mt ? 'Editar meta' : 'Nova meta';
    $('me-nome').value = mt ? mt.nome : '';
    $('me-alvo').value = mt ? String(mt.alvo).replace('.', ',') : '';
    const d = new Date(); d.setMonth(d.getMonth() + 6);
    $('me-ate').value = mt ? mt.ate : d.getFullYear() + '-' + pad2(d.getMonth() + 1);
    $('me-conta').replaceChildren(el('option', '', 'Nenhuma (ponho o valor à mão)'), ...listaContas().map(c => { const o = el('option', '', c); o.value = c; return o; }));
    $('me-conta').options[0].value = ''; $('me-conta').value = mt && mt.conta ? mt.conta : '';
    $('me-guard').value = mt && mt.guardado ? String(mt.guardado).replace('.', ',') : '';
    $('me-guard-row').hidden = !!$('me-conta').value;
    $('me-del').hidden = !mt; $('me-msg').textContent = '';
    abrir('sh-meta');
  }
  $('me-conta').addEventListener('change', () => { $('me-guard-row').hidden = !!$('me-conta').value; });
  const numPT = t => { t = String(t || '').trim().replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.'); return t ? +t : 0; };
  $('me-ok').addEventListener('click', () => {
    const nome = $('me-nome').value.trim(), alvo = numPT($('me-alvo').value), ate = $('me-ate').value;
    if (!nome) { $('me-msg').textContent = 'Dê um nome à meta.'; return; }
    if (!(alvo > 0)) { $('me-msg').textContent = 'Escreva o valor que quer juntar, por exemplo 1500.'; return; }
    if (!/^\d{4}-\d{2}$/.test(ate)) { $('me-msg').textContent = 'Escolha até quando.'; return; }
    const mt = { id: ME ? ME.id : novoId(), nome, alvo, ate, conta: $('me-conta').value || '', guardado: $('me-conta').value ? 0 : numPT($('me-guard').value) };
    const l = M.metas || [], i = l.findIndex(x => x.id === mt.id);
    M.metas = i >= 0 ? l.map(x => x.id === mt.id ? mt : x) : l.concat(mt);
    fechar('sh-meta'); saveManuais(ME ? 'Meta atualizada' : 'Meta «' + nome + '» criada');
  });
  $('me-del').addEventListener('click', () => { if (!ME || !window.confirm('Apagar esta meta?')) return; M.metas = (M.metas || []).filter(x => x.id !== ME.id); fechar('sh-meta'); saveManuais('Meta apagada'); });
  $('nova-meta').addEventListener('click', () => abrirMeta(null));

  // ---------- 10. Resumo da semana ----------
  const isoDia2 = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  function semanaRef() {
    const d = new Date(hoje() + 'T12:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7);
    const desp = S.rows.filter(r => r.tipo === 'Despesa' && (!S.conta || r.conta === S.conta));
    for (let i = 0; i < 12; i++) {
      const ini = isoDia2(d), f = new Date(d); f.setDate(f.getDate() + 6); const fim = isoDia2(f);
      if (desp.some(r => r.data >= ini && r.data <= fim)) return { ini, fim };
      d.setDate(d.getDate() - 7);
    }
    return null;
  }
  function slidesSemana() {
    const w = semanaRef(); if (!w) return null;
    const desp = S.rows.filter(r => r.tipo === 'Despesa' && (!S.conta || r.conta === S.conta));
    const pIni = new Date(w.ini + 'T12:00'); pIni.setDate(pIni.getDate() - 7); const pFim = new Date(w.ini + 'T12:00'); pFim.setDate(pFim.getDate() - 1);
    const sem = desp.filter(r => r.data >= w.ini && r.data <= w.fim), ant = desp.filter(r => r.data >= isoDia2(pIni) && r.data <= isoDia2(pFim));
    const tot = -d3.sum(sem, r => r.montante), tA = -d3.sum(ant, r => r.montante);
    const fmt = x => (+x.slice(8)) + ' ' + MES3[+x.slice(5, 7) - 1];
    const sl = [];
    const dif = tA ? Math.round((tot - tA) / tA * 100) : null;
    sl.push(['Semana de ' + fmt(w.ini) + ' a ' + fmt(w.fim), 'Gastou ' + eur(tot), dif == null ? sem.length + ' movimentos' : Math.abs(dif) + '% ' + (dif <= 0 ? 'menos' : 'mais') + ' do que na semana anterior (' + eur(tA) + ')']);
    const porTag = new Map(); for (const r of sem) for (const t of (r.ftags.length ? r.ftags : [r.categoria])) { const o = porTag.get(t) || { v: 0, n: 0 }; o.v -= r.montante; o.n++; porTag.set(t, o); }
    const tt = [...porTag].sort((a, b) => b[1].v - a[1].v)[0];
    if (tt) sl.push(['Onde foi mais', (S.rows.some(r => (r.ftags || []).includes(tt[0])) ? '#' : '') + tt[0] + ' · ' + eur(tt[1].v), tt[1].n + (tt[1].n === 1 ? ' movimento' : ' movimentos') + ' · ' + Math.round(tt[1].v / (tot || 1) * 100) + '% da semana']);
    const porDia = d3.rollup(sem, v => -d3.sum(v, r => r.montante), r => r.data), dd = [...porDia].sort((a, b) => b[1] - a[1])[0];
    if (dd) { const nd = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][new Date(dd[0] + 'T12:00').getDay()];
      const cats = [...d3.rollup(sem.filter(r => r.data === dd[0]), v => -d3.sum(v, r => r.montante), r => r.categoria)].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]);
      sl.push(['Dia mais caro', nd + ' · ' + eur(dd[1]), cats.join(' e ')]); }
    const comLim = (M.somas || []).filter(sm => sm.limite > 0);
    if (comLim.length) {
      const mA = w.fim.slice(0, 7), rowsM = S.rows.filter(r => r.mes === mA && r.tipo !== 'Transferência' && (!S.conta || r.conta === S.conta));
      const passou = comLim.filter(sm => somaTags(sm.tags, rowsM).total > sm.limite);
      sl.push([passou.length ? 'Atenção aos orçamentos' : 'Bom trabalho', (comLim.length - passou.length) + ' de ' + comLim.length + ' orçamentos dentro do limite', passou.length ? 'Passou: ' + passou.map(x => x.nome).join(', ') : 'Em ' + MES[+mA.slice(5, 7) - 1] + ', até agora']);
    } else {
      const rec = d3.sum(S.rows.filter(r => r.tipo === 'Receita' && r.data >= w.ini && r.data <= w.fim && (!S.conta || r.conta === S.conta)), r => r.montante);
      sl.push(['Entrou na semana', '+' + eur(rec), 'Ponha limites nas Somas guardadas para ver aqui os orçamentos']);
    }
    return { w, sl };
  }
  let ST = null;
  function drawSemana() {
    const x = slidesSemana(); $('semana-card').classList.toggle('fora-dados', !x); if (!x) return;
    const fmt = d => (+d.slice(8)) + ' ' + MES3[+d.slice(5, 7) - 1];
    $('semana-sub').textContent = fmt(x.w.ini) + ' a ' + fmt(x.w.fim) + ' · ' + x.sl[0][1];
    $('semana-novo').hidden = new Date().getDay() !== 1;
  }
  function abrirStory() { const x = slidesSemana(); if (!x) return; ST = { sl: x.sl, i: 0 }; $('story').hidden = false; storyDesenha(); }
  function storyDesenha() {
    const [a, b, c] = ST.sl[ST.i];
    $('st-dots').replaceChildren(...ST.sl.map((_, i) => el('i', i <= ST.i ? 'on' : '')));
    $('st-a').textContent = a; $('st-b').textContent = b; $('st-c').textContent = c;
    $('st-dica').textContent = ST.i < ST.sl.length - 1 ? 'Toque à direita para continuar' : 'Toque para fechar';
  }
  $('semana-card').addEventListener('click', abrirStory);
  $('st-x').addEventListener('click', e => { e.stopPropagation(); $('story').hidden = true; });
  $('story').addEventListener('click', e => {
    if (!ST) return; const esq = e.clientX < window.innerWidth / 3;
    if (esq) ST.i = Math.max(0, ST.i - 1); else if (ST.i < ST.sl.length - 1) ST.i++; else { $('story').hidden = true; return; }
    storyDesenha();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('story').hidden) $('story').hidden = true; });

  function drawUltimos() {
    const rows = S.rows.filter(r => !S.conta || r.conta === S.conta).slice().sort((a, b) => a.data < b.data ? 1 : a.data > b.data ? -1 : 0).slice(0, 5);
    if (!rows.length) { $('ult-lista').replaceChildren(el('li', 'empty', 'Sem movimentos.')); return; }
    $('ult-lista').replaceChildren(...rows.map(r => {
      const li = el('li', 'tx-wrap'), row = el('div', 'tx'), mid = el('div'); mid.style.minWidth = '0';
      const [y, m, dd] = r.data.split('-');
      mid.append(el('div', 'tx-t', r.categoria), el('div', 'tx-s', [(+dd) + ' ' + MES[+m - 1].slice(0, 3), (r.tags || []).map(t => '#' + t).join(' '), r.conta].filter(Boolean).join(' · ')));
      const ti = el('div', 'tx-ico', ico(r.categoria)); ti.style.background = gcol(r.grupo); aplicaCapa(ti, r.categoria);
      row.append(ti, mid, el('div', 'tx-v' + (r.tipo === 'Transferência' ? ' mov' : r.montante > 0 ? ' pos' : ''), (r.montante > 0 ? '+' : '') + eur(r.montante)));
      li.append(row); return li;
    }));
  }

  // ---------- Menu de baixo (separadores) ----------
  const TABS = ['inicio', 'contas', 'gastos', 'movimentos', 'ajustes'];
  let TAB = (() => { const h = (location.hash || '').slice(1), g = store.get('saldo.tab'); return TABS.includes(h) ? h : TABS.includes(g) ? g : 'inicio'; })();
  function aplicaTab() {
    document.querySelectorAll('#app [data-tab]').forEach(e => e.classList.toggle('fora', !e.dataset.tab.split(' ').includes(TAB)));
    document.querySelectorAll('#tabbar [data-ir]').forEach(b => b.setAttribute('aria-selected', b.dataset.ir === TAB ? 'true' : 'false'));
    TABS.forEach(t => document.body.classList.toggle('tab-' + t, t === TAB));
  }
  function irPara(t) {
    if (!TABS.includes(t)) return;
    const mudou = t !== TAB; TAB = t; store.set('saldo.tab', t);
    try { history.replaceState(null, '', '#' + t); } catch (e) {}
    aplicaTab();
    if (mudou) window.scrollTo(0, 0);
  }
  // O Safari no iPhone às vezes engole o "click" (ao tocar durante o deslizar da página ou junto à barra de baixo).
  // Por isso o menu reage logo ao levantar o dedo, e o click fica como reserva.
  let toqueTab = null;
  document.querySelectorAll('#tabbar [data-ir]').forEach(b => {
    b.addEventListener('pointerdown', e => { toqueTab = { b, x: e.clientX, y: e.clientY }; });
    b.addEventListener('pointerup', e => {
      const t = toqueTab; toqueTab = null;
      if (t && t.b === b && Math.abs(e.clientX - t.x) < 12 && Math.abs(e.clientY - t.y) < 12) irPara(b.dataset.ir);
    });
    b.addEventListener('pointercancel', () => { toqueTab = null; });
    b.addEventListener('click', () => irPara(b.dataset.ir));
  });
  document.querySelectorAll('#ajustes [data-clica]').forEach(b => b.addEventListener('click', () => { const alvo = $(b.dataset.clica); if (alvo) alvo.click(); }));
  $('ini-total').addEventListener('click', () => $('abrir-total').click());
  $('ver-todos').addEventListener('click', () => irPara('movimentos'));
  $('pg-q').addEventListener('input', e => pesquisaGlobal(e.target.value));
  $('pg-q').addEventListener('keydown', e => { if (e.key === 'Escape') { e.target.value = ''; pesquisaGlobal(''); } });
  document.addEventListener('click', e => { if (!e.target.closest('#pg')) $('pg-res').hidden = true; });
  $('pg-q').addEventListener('focus', e => { if (e.target.value) pesquisaGlobal(e.target.value); });
  aplicaTab();

  function drawList() {
    const fc = $('filtroCat'), chips = [];
    if (S.conta) { const b = el('button', 'filter', S.conta + '  ×'); b.type = 'button'; b.setAttribute('aria-label', 'Mostrar movimentos de todas as contas'); b.onclick = () => set({ conta: '' }); chips.push(b); }
    if (S.categoria) { const b = el('button', 'filter', S.categoria + '  ×'); b.type = 'button'; b.onclick = () => set({ categoria: '' }); chips.push(b); }
    fc.replaceChildren(...chips);
    const q = S.q.trim().toLowerCase();
    let rows = S.rows.filter(r => (!S.mes || r.mes === S.mes) && (!S.ano || r.mes.slice(0, 4) === S.ano) && (!S.conta || r.conta === S.conta) && (!S.grupo || r.grupo === S.grupo) && (!S.categoria || r.categoria === S.categoria) && passaFiltro(r)
      && (!q || (r.categoria + ' ' + r.tags.map(t => '#' + t).join(' ') + ' ' + r.conta + ' ' + r.grupo).toLowerCase().includes(q)));
    rows = rows.slice().sort((a, b) => a.data < b.data ? 1 : a.data > b.data ? -1 : 0);
    if (!rows.length) { $('lista').replaceChildren(el('li', 'empty', 'Nenhum movimento encontrado.')); return; }
    const N = 150, out = []; let last = '';
    const fmtD = s => { const [y, m, dd] = s.split('-'); return (+dd) + ' de ' + MES[+m - 1] + ' ' + y; };
    for (const r of rows.slice(0, N)) {
      if (r.data !== last) { out.push(el('li', 'txhead', fmtD(r.data))); last = r.data; }
      const li = el('li', 'tx-wrap'), row = el('div', 'tx'), mid = el('div'); mid.style.minWidth = '0';
      mid.append(el('div', 'tx-t', r.categoria), el('div', 'tx-s', [r.manual ? (r.serie ? 'Manual · repete' : 'Manual') : '', (r.tags || []).map(t => '#' + t).join(' '), r.conta].filter(Boolean).join(' · ')));
      const ti = el('div', 'tx-ico', ico(r.categoria)); ti.style.background = gcol(r.grupo); aplicaCapa(ti, r.categoria);
      row.append(ti, mid, el('div', 'tx-v' + (r.tipo === 'Transferência' ? ' mov' : r.montante > 0 ? ' pos' : ''), (r.montante > 0 ? '+' : '') + eur(r.montante)));
      const act = el('div', 'tx-act');
      const bR = el('button', 'a-rep', 'Repetir'); bR.type = 'button'; bR.onclick = () => repetir(r);
      const bE = el('button', 'a-edit', 'Editar'); bE.type = 'button'; bE.onclick = () => abrirForm(r, !r.manual);
      act.append(bR, bE);
      li.append(row, act); ligarDeslizar(li, row);
      out.push(li);
    }
    if (rows.length > N) out.push(el('li', 'tx-more', 'A mostrar ' + N + ' de ' + rows.length + ' movimentos. Use os filtros ou a pesquisa para afinar.'));
    $('lista').replaceChildren(...out);
  }

  // ---------- Carregar dados ----------
  function showSource(meta, warn) {
    const f = $('fonte');
    f.classList.toggle('warn', !!warn);
    if (!meta) { f.textContent = warn || 'Sem dados'; return; }
    const d = new Date(meta.modified);
    const hm = x => String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0');
    const quando = isNaN(d) ? '' : d.getDate() + ' ' + MES3[d.getMonth()] + ' ' + hm(d);
    f.textContent = warn ? warn : quando + (S.checked ? ' · verificado ' + hm(S.checked) : '');
  }

  function useData(res, cache) {
    S.base = parseExport(res.text); compose();
    const rows = S.rows; S.meta = { name: res.name, modified: res.modified, rev: res.rev, origem: res.origem };
    if (S.mes && !rows.some(r => r.mes === S.mes)) S.mes = '';
    if (S.ano && !rows.some(r => r.mes.startsWith(S.ano))) S.ano = '';
    if (cache) store.set(CFG.cache, JSON.stringify({ ...S.meta, text: res.text }));
    showSource(S.meta);
    render();
  }

  let busy = false, lastRefresh = 0;
  async function refresh(auto) {
    const btn = $('refresh');
    if (!appKey() || !store.get(CFG.tok)) { if (!auto) openSheet(); return; }
    if (busy) return;
    busy = true; lastRefresh = Date.now();
    btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true');
    try {
      // na atualização automática só descarrega o ficheiro se for outro ou tiver mudado
      const res = await latestFromDropbox(auto && S.rows.length ? S.meta : null);
      let manMudou = false; try { manMudou = await loadManuais(); } catch (e) {}
      carregaCapas();
      S.checked = new Date();
      if (!res.igual) useData(res, true); else { if (manMudou) { compose(); render(); } showSource(S.meta); }
    }
    catch (e) { showSource(S.meta, e.message); if (!S.rows.length) render(); }
    finally { busy = false; btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); }
  }

  // Atualização automática de 2 em 2 minutos (só com a página visível) e ao voltar à página
  const INTERVALO = 2 * 60 * 1000;
  setInterval(() => { if (document.visibilityState === 'visible') refresh(true); }, INTERVALO);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefresh > INTERVALO) refresh(true);
  });

  // ---------- Definições ----------
  function openSheet(msg) {
    $('cfg-key').value = appKey();
    $('cfg-folder').value = folder();
    $('cfg-redirect').textContent = redirectUri();
    $('cfg-msg').textContent = msg || (store.get(CFG.tok) ? 'Dropbox ligado.' : 'Dropbox não ligado.');
    $('sheet').hidden = false;
  }
  const closeSheet = () => { $('sheet').hidden = true; };

  $('open-settings').onclick = () => openSheet();
  $('onboard-settings').onclick = () => openSheet();
  $('cfg-close').onclick = closeSheet;
  $('sheet').addEventListener('click', e => { if (e.target === $('sheet')) closeSheet(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });
  $('cfg-connect').onclick = async () => {
    store.set(CFG.key, $('cfg-key').value.trim());
    store.set(CFG.folder, $('cfg-folder').value.trim() || '/MyNewClaudee');
    try { await connect(); } catch (e) { $('cfg-msg').textContent = e.message; }
  };
  $('cfg-logout').onclick = () => { store.del(CFG.tok); store.del(CFG.cache); store.del(MAN_KEY); M = migraNomes(normaliza(null)); S.base = []; S.rows = []; S.meta = null; showSource(null); render(); $('cfg-msg').textContent = 'Desligado. Os dados guardados neste dispositivo foram apagados.'; };
  const pickFile = () => $('file').click();
  $('cfg-file').onclick = pickFile;
  $('onboard-file').onclick = pickFile;
  $('file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { useData({ text: await f.text(), name: f.name, modified: new Date(f.lastModified).toISOString(), origem: 'Ficheiro local' }, true); closeSheet(); }
    catch (err) { openSheet(err.message); }
    e.target.value = '';
  };
  $('refresh').onclick = () => refresh(false);
  $('conta').onchange = e => set({ conta: e.target.value });
  $('ano').onchange = e => set({ ano: e.target.value, mes: '' });
  $('search').addEventListener('input', e => { S.q = e.target.value; drawList(); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S.rows.length) drawBars(meses()); }, 150); });

  // ---------- Inserir e editar dados ----------
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const novoId = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const ORDEM_C = [/^activobank$/i, /^revolut/i, /^c\.?\s*c\.?\s*activobank|activobank\s*c\.?\s*c/i, /wizink/i, /^dinheiro/i, /alimenta/i];
  const posC = c => { const i = ORDEM_C.findIndex(re => re.test(c)); return i < 0 ? 99 : i; };
  const listaContas = () => [...new Set(contas().map(c => c.conta).concat(M.contas))].sort((a, b) => posC(a) - posC(b) || a.localeCompare(b, 'pt'));
  const listaCats = () => [...new Set(S.rows.filter(r => r.tipo !== 'Transferência').map(r => r.categoria))].sort((a, b) => a.localeCompare(b, 'pt'));

  let toastT;
  function toast(msg, erro) {
    const t = $('toast'); t.textContent = msg; t.classList.toggle('erro', !!erro); t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, erro ? 6000 : 2600);
  }
  // Enquanto há uma folha aberta, a página de trás não rola (iOS incluído)
  let scrollGuardado = 0;
  function bloquearFundo() {
    const aberta = [...document.querySelectorAll('.sheet-wrap, .tv')].some(w => !w.hidden);
    const b = document.body;
    if (aberta && !b.classList.contains('bloqueado')) { scrollGuardado = window.scrollY; b.style.top = -scrollGuardado + 'px'; b.classList.add('bloqueado'); }
    else if (!aberta && b.classList.contains('bloqueado')) { b.classList.remove('bloqueado'); b.style.top = ''; window.scrollTo(0, scrollGuardado); }
  }
  new MutationObserver(bloquearFundo).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  const abrir = id => { $(id).hidden = false; };
  const fechar = id => { $(id).hidden = true; if (id === 'sh-form') fecharCalc(); };
  document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => fechar(b.closest('.sheet-wrap').id)));
  document.querySelectorAll('.sheet-wrap').forEach(w => w.addEventListener('click', e => { if (e.target === w) fechar(w.id); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { document.querySelectorAll('.sheet-wrap').forEach(w => { w.hidden = true; }); fecharCalc(); } });

  function adicionar(mov) { M.movimentos.push({ id: novoId(), ...mov }); }
  function repetir(r) {
    adicionar({ data: hoje(), tipo: r.tipo, montante: r.montante, conta: r.conta, categoria: r.categoria, etiquetas: r.etiquetas || '' });
    fecharLinhas(); saveManuais('Repetido com a data de hoje');
  }

  // Deslizar as linhas da lista para mostrar Repetir e Editar
  let linhaAberta = null;
  function fecharLinhas() { if (linhaAberta) linhaAberta.classList.remove('open'); linhaAberta = null; }
  function ligarDeslizar(li, row) {
    let x0 = null;
    row.addEventListener('pointerdown', e => { x0 = e.clientX; });
    row.addEventListener('pointerup', e => {
      if (x0 == null) return; const dx = e.clientX - x0; x0 = null;
      if (dx < -30) { if (linhaAberta && linhaAberta !== li) fecharLinhas(); li.classList.add('open'); linhaAberta = li; }
      else if (dx > 30) fecharLinhas();
      else if (Math.abs(dx) < 6) { const ia = li.classList.contains('open'); fecharLinhas(); if (!ia) { li.classList.add('open'); linhaAberta = li; } }
    });
  }

  // 1. Formulário completo (estilo MoneyStats)
  const REP = { nunca: 'Nunca', semanal: 'Todas as semanas', mensal: 'Todos os meses', anual: 'Todos os anos' };
  const F = {};
  let fEdit = null;
  function fDesenha() {
    $('f-title').textContent = F.tipo;
    $('f-tipo').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === F.tipo));
    const sinal = F.tipo === 'Receita' ? '+' : F.tipo === 'Despesa' ? '−' : '';
    const calcAberta = !$('calc').hidden;
    $('f-valor').textContent = calcAberta ? (C ? sinal + ' ' + bonito(C) : sinal || '0') : (F.valor && parseFloat(F.valor.replace(',', '.')) ? sinal + ' ' + L.format(',.2f')(parseFloat(F.valor.replace(',', '.'))) : (sinal || '0'));
    $('f-valor-res').textContent = calcAberta && temOp(C) ? '= ' + L.format(',.2f')(calcAvalia(C)) : '';
    if (calcAberta) calcFaixa();
    $('f-conta').textContent = F.conta || 'Escolher';
    $('f-cat').textContent = F.categoria || 'Sem';
    $('f-etq').textContent = F.etiquetas || 'Sem';
    $('f-rep').textContent = REP[F.repetir || 'nunca'];
    const ic = $('f-cat-ico');
    ic.classList.remove('com-capa');
    if (F.categoria) { ic.textContent = ico(F.categoria); ic.style.background = gcol(grupoDe(F.categoria, F.etiquetas, F.tipo)); ic.classList.add('cheio'); aplicaCapa(ic, F.categoria); }
    else { ic.textContent = ''; ic.style.background = ''; ic.classList.remove('cheio'); }
  }
  $('f-tipo').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { F.tipo = b.dataset.v; fDesenha(); }));
  function abrirForm(r, comoNovo) {
    fecharLinhas();
    fEdit = r && r.manual && !comoNovo ? r.id : null;
    const base = fEdit ? (M.movimentos.find(m => m.id === fEdit) || r) : r;
    Object.assign(F, {
      tipo: base ? base.tipo : 'Despesa',
      valor: base && base.montante ? String(Math.abs(+base.montante).toFixed(2)).replace('.', ',').replace(/,00$/, '') : '',
      conta: base && base.conta ? base.conta : (listaContas()[0] || ''),
      categoria: base ? base.categoria || '' : '', etiquetas: base ? base.etiquetas || '' : '',
      repetir: fEdit && base.repetir ? base.repetir : 'nunca'
    });
    const agora = new Date();
    $('f-data').value = fEdit ? base.data : hoje();
    $('f-hora').value = fEdit && base.hora ? base.hora : String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
    $('f-titulo').value = fEdit ? base.titulo || '' : ''; $('f-receb').value = fEdit ? base.recebedor || '' : ''; $('f-uso').value = fEdit ? base.uso || '' : '';
    $('f-del').hidden = !fEdit; $('f-msg').textContent = '';
    fDesenha();
    fecharCalc(); C = ''; abrir('sh-form');
  }

  // Lista de escolha (conta, categoria, hashtags, repetir)
  let P = null;
  function pick(cfg) {
    P = { ...cfg, sel: new Set(cfg.multi ? cfg.atual : [cfg.atual]) };
    $('p-title').textContent = cfg.titulo; $('p-q').value = ''; $('p-q').hidden = cfg.semPesquisa; $('p-ok').hidden = !cfg.multi;
    pDesenha(); abrir('sh-pick');
    if (!cfg.semPesquisa && window.matchMedia('(pointer:fine)').matches) $('p-q').focus();
  }
  function pDesenha() {
    const q = $('p-q').value.trim(), ql = q.toLowerCase();
    let ops = P.opcoes.filter(o => !ql || o.label.toLowerCase().includes(ql));
    const linhas = ops.map(o => {
      const b = el('button', 'mf-row'); b.type = 'button';
      const i = el('span', 'mf-ico', o.ini || ico(o.label)); i.style.background = o.cor || '#8E8E93'; if (P && P.titulo === 'Categoria') aplicaCapa(i, o.v);
      b.append(i, el('span', 'mf-lab', o.label));
      if (P.sel.has(o.v)) b.append(el('span', 'p-check', '✓'));
      b.onclick = () => escolhe(o.v);
      return b;
    });
    if (P.criar && q && !P.opcoes.some(o => o.label.toLowerCase() === ql)) {
      const b = el('button', 'mf-row'); b.type = 'button';
      const i = el('span', 'mf-ico', '+'); i.style.background = '#0A84FF';
      b.append(i, el('span', 'mf-lab', 'Criar «' + q + '»')); b.onclick = () => escolhe(q, true);
      linhas.unshift(b);
    }
    if (!linhas.length) linhas.push(el('p', 'empty', 'Sem resultados.'));
    $('p-list').replaceChildren(...linhas);
  }
  function escolhe(v, nova) {
    if (P.multi) {
      if (nova) P.opcoes.unshift({ v, label: v });
      P.sel.has(v) ? P.sel.delete(v) : P.sel.add(v); $('p-q').value = ''; pDesenha(); return;
    }
    fechar('sh-pick'); P.fim(v, nova); fDesenha();
  }
  $('p-q').addEventListener('input', pDesenha);
  $('p-back').addEventListener('click', () => { if (P && P.multi) P.fim([...P.sel]); fechar('sh-pick'); fDesenha(); });
  $('p-ok').addEventListener('click', () => { P.fim([...P.sel]); fechar('sh-pick'); fDesenha(); });

  $('f-conta-btn').addEventListener('click', () => pick({ titulo: 'Conta', atual: F.conta, criar: true,
    opcoes: listaContas().map((c, i) => ({ v: c, label: c, cor: COLORS[i % COLORS.length] })),
    fim: (v, nova) => { F.conta = v; if (nova && !M.contas.includes(v)) M.contas.push(v); } }));
  $('f-cat-btn').addEventListener('click', () => pick({ titulo: 'Categoria', atual: F.categoria, criar: true,
    opcoes: listaCats().map(c => ({ v: c, label: c, cor: gcol(grupoDe(c, '', F.tipo === 'Transferência' ? 'Despesa' : F.tipo)) })),
    fim: v => { F.categoria = v; } }));
  $('f-etq-btn').addEventListener('click', () => {
    const todas = todasTags();
    pick({ titulo: 'Hashtags', multi: true, criar: true, atual: String(F.etiquetas || '').split(',').map(x => x.trim()).filter(Boolean),
      opcoes: todas.map(t => ({ v: t, label: t, ini: '#', cor: '#0A84FF' })), fim: arr => { F.etiquetas = arr.join(', '); } });
  });
  $('f-rep-btn').addEventListener('click', () => pick({ titulo: 'Repetir', atual: F.repetir || 'nunca', semPesquisa: true,
    opcoes: Object.entries(REP).map(([v, label]) => ({ v, label, ini: '↻', cor: '#BF5AF2' })), fim: v => { F.repetir = v; } }));

  // Teclado calculadora (estilo MoneyStats), preso ao fundo do formulário
  const OPS = '+−×÷';
  let C = '';
  function calcAvalia(s) {
    const t = String(s || '').match(/\d+(?:,\d*)?|[+−×÷]/g) || [];
    while (t.length && OPS.includes(t[t.length - 1])) t.pop();
    if (!t.length || OPS.includes(t[0])) return 0;
    const v = t.map(x => OPS.includes(x) ? x : parseFloat(x.replace(',', '.')) || 0);
    const p = [v[0]];
    for (let i = 1; i < v.length; i += 2) {
      const o = v[i], n = v[i + 1];
      if (o === '×') p[p.length - 1] *= n; else if (o === '÷') p[p.length - 1] = n ? p[p.length - 1] / n : 0; else p.push(o, n);
    }
    let r = p[0]; for (let i = 1; i < p.length; i += 2) r = p[i] === '+' ? r + p[i + 1] : r - p[i + 1];
    return Math.round(r * 100) / 100;
  }
  const temOp = s => /[+−×÷]/.test(String(s || '').replace(/^[+−×÷]/, ''));
  const bonito = s => String(s || '').replace(/\d+/g, (d, i, all) => all[i - 1] === ',' ? d : L.format(',')(+d)).replace(/([+−×÷])/g, ' $1 ');
  function calcTecla(k) {
    let s = C;
    const ultimo = s.slice(-1), numAtual = (s.match(/[\d,]*$/) || [''])[0];
    if (k === 'AC') s = '';
    else if (k === '⌫') s = s.slice(0, -1);
    else if (k === '±') { F.tipo = F.tipo === 'Receita' ? 'Despesa' : 'Receita'; }
    else if (OPS.includes(k)) { if (!s) return; s = OPS.includes(ultimo) ? s.slice(0, -1) + k : (ultimo === ',' ? s.slice(0, -1) : s) + k; }
    else if (k === ',') { if (numAtual.includes(',')) return; s += numAtual ? ',' : '0,'; }
    else { const dec = numAtual.split(',')[1]; if (dec != null && dec.length >= 2) return; if (numAtual.replace(',', '').length >= 9) return; s = (numAtual === '0' ? s.slice(0, -1) : s) + k; }
    C = s; F.valor = String(calcAvalia(C)).replace('.', ','); fDesenha();
  }
  const CALC_ESQ = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', ',', '0', '⌫'];
  const CALC_DIR = ['+', '−', '×', '÷', 'AC'];
  (function montaCalc() {
    const esq = el('div', 'c-esq'), dir = el('div', 'c-dir');
    for (const k of CALC_ESQ) {
      const b = el('button', 'c-key' + (k === '±' || k === ',' ? ' c-mini' : '') + (k === '⌫' ? ' c-fn' : ''), k === '⌫' ? '' : k); b.type = 'button';
      if (k === '⌫') { b.setAttribute('aria-label', 'Apagar'); b.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><path d="M9 5h11a1 1 0 011 1v12a1 1 0 01-1 1H9l-6-7z M12 9l6 6M18 9l-6 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>'; }
      if (k === '±') b.setAttribute('aria-label', 'Trocar despesa e receita');
      b.addEventListener('click', () => calcTecla(k)); esq.append(b);
    }
    for (const k of CALC_DIR) { const b = el('button', 'c-key c-op', k === '−' ? '-' : k); b.type = 'button'; if (k === 'AC') b.setAttribute('aria-label', 'Limpar'); b.addEventListener('click', () => calcTecla(k)); dir.append(b); }
    $('c-grid').replaceChildren(esq, dir);
  })();
  const abrev = s => { const w = String(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean); return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : (w[0] || '?').slice(0, 2).replace(/^./, c => c.toUpperCase()); };
  function calcFaixa() {
    const tipo = F.tipo === 'Receita' ? 'Receita' : 'Despesa', cont = new Map();
    for (const r of S.rows) if (r.tipo === tipo || (F.tipo === 'Transferência' && r.tipo === 'Transferência')) cont.set(r.categoria, (cont.get(r.categoria) || 0) + 1);
    let cats = [...cont].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    if (F.categoria && !cats.includes(F.categoria)) cats.unshift(F.categoria);
    $('c-strip').replaceChildren(...cats.map(c => {
      const b = el('button', 'c-cat' + (F.categoria === c ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-label', c); b.setAttribute('aria-pressed', F.categoria === c);
      const t = el('span', 'c-tile', abrev(c)); t.style.background = gcol(grupoDe(c, '', F.tipo)); aplicaCapa(t, c);
      b.append(t, el('span', 'c-nome', c)); b.onclick = () => { F.categoria = c; fDesenha(); };
      return b;
    }));
  }
  function abrirCalc() { $('calc').hidden = false; $('sh-form').classList.add('com-calc'); calcFaixa(); $('sh-form').querySelector('.sheet').style.paddingBottom = ($('calc').offsetHeight + 24) + 'px'; const sel = $('c-strip').querySelector('.on'); if (sel && sel.scrollIntoView) sel.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  function fecharCalc() { $('calc').hidden = true; $('sh-form').classList.remove('com-calc'); $('sh-form').querySelector('.sheet').style.paddingBottom = ''; }
  $('f-valor-btn').addEventListener('click', e => { e.stopPropagation(); C = F.valor && F.valor !== '0' ? F.valor : ''; abrirCalc(); fDesenha(); });
  $('sh-form').querySelector('.sheet').addEventListener('click', e => { if (!$('calc').hidden && !e.target.closest('#calc, #f-valor-btn, #f-tipo, #f-ok')) fecharCalc(); });

  $('f-ok').addEventListener('click', () => {
    if (!$('calc').hidden && C) F.valor = String(calcAvalia(C)).replace('.', ',');
    const v = F.valor ? parseFloat(F.valor.replace(',', '.')) : 0; const data = $('f-data').value;
    const erro = !(v > 0) ? 'Toque em Montante e escreva o valor.' : !/^\d{4}-\d{2}-\d{2}$/.test(data) ? 'Escolha a data.' : !F.conta ? 'Escolha a conta.' : !F.categoria ? 'Escolha o comerciante.' : '';
    if (erro) { $('f-msg').textContent = erro; return; }
    const mov = { data, hora: $('f-hora').value || '', tipo: F.tipo, montante: F.tipo === 'Receita' ? v : -v, conta: F.conta, categoria: F.categoria, etiquetas: F.etiquetas || '',
      repetir: F.repetir && F.repetir !== 'nunca' ? F.repetir : undefined, titulo: $('f-titulo').value.trim() || undefined, recebedor: $('f-receb').value.trim() || undefined, uso: $('f-uso').value.trim() || undefined };
    Object.keys(mov).forEach(k => mov[k] === undefined && delete mov[k]);
    if (fEdit) { const i = M.movimentos.findIndex(m => m.id === fEdit); if (i >= 0) M.movimentos[i] = { id: fEdit, ...mov }; }
    else adicionar(mov);
    fechar('sh-form'); saveManuais(fEdit ? 'Movimento atualizado' : 'Movimento adicionado');
  });
  $('f-del').addEventListener('click', () => {
    if (!fEdit || !window.confirm('Apagar este movimento' + (F.repetir && F.repetir !== 'nunca' ? ' e todas as repetições?' : '?'))) return;
    M.movimentos = M.movimentos.filter(m => m.id !== fEdit);
    fechar('sh-form'); saveManuais('Movimento apagado');
  });

  // 2. Botão + abre o formulário já com o teclado
  $('fab').addEventListener('click', () => { abrirForm(null); C = ''; abrirCalc(); fDesenha(); });


  // Acertar o saldo real de uma conta
  let acertoConta = null;
  function abrirAcerto(r) {
    acertoConta = r;
    $('a-titulo').textContent = r.conta;
    $('a-calc').textContent = eur(r.calc).replace(/\s*€/, '');
    $('a-valor').value = r.acerto ? L.format(',.2f')(r.saldo).replace(/\u00a0/g, '') : '';
    $('a-remover').hidden = !r.acerto; $('a-msg').textContent = '';
    $('a-limite').value = r.limite ? L.format(',.2f')(r.limite).replace(/\u00a0/g, '') : '';
    $('a-nome').textContent = r.conta;
    const ai = $('a-img-ico'); ai.className = 'a-foto'; ai.textContent = ico(r.conta); ai.style.background = COLORS[Math.max(0, contas().map(c => c.conta).indexOf(r.conta)) % COLORS.length]; aplicaCapa(ai, 'conta:' + r.conta);
    $('a-img-val').textContent = M.capas && M.capas['conta:' + r.conta] ? 'Mudar imagem' : 'Escolher imagem';
    abrir('sh-acerto');
    if (window.matchMedia('(pointer:fine)').matches) $('a-valor').focus();
  }
  $('a-img').addEventListener('click', () => { if (!acertoConta) return; const c = acertoConta.conta; fechar('sh-acerto'); const rc = acertoConta; abrirFotos('conta:' + c, 'Imagem de ' + c, () => abrirAcerto(rc)); });
  $('a-ok').addEventListener('click', () => {
    const txt = $('a-valor').value.replace(/\s/g, '').replace(/−/g, '-');
    const v = parseFloat(/,/.test(txt) ? txt.replace(/\.(?=\d{3})/g, '').replace(',', '.') : txt);
    const lt = $('a-limite').value.replace(/\s/g, '');
    const lim = lt ? parseFloat(/,/.test(lt) ? lt.replace(/\.(?=\d{3})/g, '').replace(',', '.') : lt) : 0;
    if (lt && !(lim >= 0)) { $('a-msg').textContent = 'O limite tem de ser um número, por exemplo 500.'; return; }
    M.limites = M.limites || {}; M.limites[acertoConta.conta] = Math.round(lim * 100) / 100;
    if (!txt) { fechar('sh-acerto'); saveManuais('Limite de ' + acertoConta.conta + ' guardado'); return; }
    if (!isFinite(v)) { $('a-msg').textContent = 'Escreva o saldo que a app do banco mostra, por exemplo 1234,56.'; return; }
    M.saldos[acertoConta.conta] = { real: Math.round(v * 100) / 100, calc: Math.round(acertoConta.calc * 100) / 100, em: new Date().toISOString() };
    if (!S.rows.some(r => r.conta === acertoConta.conta) && !M.contas.includes(acertoConta.conta)) M.contas.push(acertoConta.conta);
    fechar('sh-acerto'); saveManuais('Saldo de ' + acertoConta.conta + ' acertado');
  });
  $('a-remover').addEventListener('click', () => { delete M.saldos[acertoConta.conta]; fechar('sh-acerto'); saveManuais('Acerto removido'); });
  $('nova-conta').addEventListener('click', () => {
    const nome = (window.prompt('Nome da conta nova (por exemplo, Dinheiro):') || '').trim();
    if (!nome) return;
    if (contas().some(c => c.conta.toLowerCase() === nome.toLowerCase())) { toast('Essa conta já existe.', true); return; }
    abrirAcerto({ conta: nome, calc: 0, saldo: 0, acerto: null });
  });

  // ---------- Vista "Total disponível" (como o Saldo Positivo) ----------
  const TV = { revelados: new Set(), aberta: false };
  const TV_AVISO = 500, TV_PERIGO = 100, TV_DIAS = 14, TV_MASK = '•••••';
  const TV_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const TV_EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  const tvPct = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 0 });
  const tvEuro = (v, esc) => esc ? TV_MASK : eur(v);
  const tvDelta = (v, esc) => esc ? TV_MASK : (v > 0 ? '+' : '') + eur(v);
  const TV_ESTADO = { '': 'Saudável', warning: 'Atenção', danger: 'Baixo' };
  const tvEstado = v => v < TV_PERIGO ? 'danger' : v < TV_AVISO ? 'warning' : '';
  const TV_GENERICAS = new Set(['conta', 'contas', 'cc', 'c', 'cartao', 'corrente', 'ordem', 'poupanca', 'ordenado', 'de', 'do', 'da', 'e', 'a', 'o']);
  const tvNorm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tvInicial = nome => { const w = nome.split(/[\s./\\()\-–—,:;|]+/).filter(Boolean).find(x => x.length > 1 && !TV_GENERICAS.has(tvNorm(x))); return ((w || nome).match(/[\p{L}\p{N}]/u) || ['?'])[0].toUpperCase(); };
  const tvDiaFmt = new Intl.DateTimeFormat('pt-PT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const tvDia = d => tvDiaFmt.format(new Date(d + 'T12:00:00')).replace('.', '');
  const TV_EPS = 0.005, tvDir = d => d > TV_EPS ? 'up' : d < -TV_EPS ? 'down' : 'flat';
  const TV_DIR = { up: 'subiu', down: 'desceu', flat: 'sem alteração' };
  function tvDias() { const out = [], d = new Date(); for (let i = TV_DIAS - 1; i >= 0; i--) { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i, 12); out.push(isoDia(x)); } return out; }
  function tvVariacoes(conta) {
    const dias = tvDias(), m = new Map(dias.map(d => [d, 0]));
    for (const r of S.rows) if ((conta == null || r.conta === conta) && m.has(r.data)) m.set(r.data, m.get(r.data) + r.montante);
    return dias.map(d => ({ d, delta: Math.round(m.get(d) * 100) / 100 }));
  }
  function tvBarras(changes, nome, esc) {
    const n = changes.length, slot = 10, bw = 6, h = 32, mid = h / 2, room = mid - 2;
    const maxAbs = Math.max(...changes.map(c => Math.abs(c.delta)), TV_EPS), conta = { up: 0, down: 0, flat: 0 };
    const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'tv-spark'); svg.setAttribute('viewBox', `0 0 ${n * slot} ${h}`); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('role', 'img');
    const base = document.createElementNS(ns, 'line'); base.setAttribute('class', 'base'); base.setAttribute('x1', 0); base.setAttribute('x2', n * slot); base.setAttribute('y1', mid); base.setAttribute('y2', mid); svg.append(base);
    changes.forEach((c, i) => {
      const dir = tvDir(c.delta); conta[dir]++;
      const len = dir === 'flat' ? 2 : Math.max(3, Math.sqrt(Math.abs(c.delta) / maxAbs) * room);
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('class', dir); r.setAttribute('x', i * slot + (slot - bw) / 2); r.setAttribute('y', dir === 'flat' ? mid - 1 : dir === 'down' ? mid : mid - len);
      r.setAttribute('width', bw); r.setAttribute('height', len); r.setAttribute('rx', 1.5);
      r.dataset.tip = tvDia(c.d) + ': ' + (esc ? TV_DIR[dir] : dir === 'flat' ? 'sem alteração' : tvDelta(c.delta));
      svg.append(r);
    });
    svg.setAttribute('aria-label', `Evolução diária de ${nome}: ${conta.up} ${conta.up === 1 ? 'dia' : 'dias'} a subir, ${conta.down} a descer, ${conta.flat} sem alteração`);
    return svg;
  }
  function tvTendencia(changes, esc) {
    const delta = d3.sum(changes, c => c.delta), up = changes.filter(c => tvDir(c.delta) === 'up').length, down = changes.filter(c => tvDir(c.delta) === 'down').length;
    const s = el('span'); s.append(el('span', null, tvDelta(delta, esc)), ' em ' + changes.length + ' dias · ', el('span', 'tv-up', up + ' a subir'), ', ', el('span', 'tv-down', down + ' a descer'));
    return s;
  }
  const tvBotaoOlho = (chave, esc, nome) => { const b = el('button', 'tv-reveal'); b.type = 'button'; b.dataset.tvreveal = chave; b.setAttribute('aria-pressed', String(!esc)); const l = (esc ? 'Mostrar' : 'Esconder') + ' saldo ' + nome; b.setAttribute('aria-label', l); b.title = l; b.innerHTML = esc ? TV_EYE_OFF : TV_EYE; return b; };
  function tvDesenha() {
    if (!TV.aberta) return;
    tvEscondeDica();
    const itens = contas(), total = d3.sum(itens, i => i.saldo), chaves = ['__total', ...itens.map(i => i.conta)];
    const todos = chaves.every(k => TV.revelados.has(k));
    const ra = $('tv-reveal-all'), la = todos ? 'Esconder todos os saldos' : 'Mostrar todos os saldos';
    ra.setAttribute('aria-pressed', String(todos)); ra.setAttribute('aria-label', la); ra.title = la; ra.innerHTML = todos ? TV_EYE : TV_EYE_OFF;
    const hm = x => String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0');
    $('tv-updated').textContent = S.checked ? 'Atualizado às ' + hm(S.checked) : S.meta ? 'Dados de ' + (new Date(S.meta.modified)).toLocaleDateString('pt-PT') : 'Sem dados';
    const escT = !TV.revelados.has('__total');
    $('tv-total').classList.toggle('is-hidden', escT);
    const acertadas = itens.filter(i => i.acerto).length;
    const limTv = itens.filter(i => i.limite > 0);
    $('tv-limite').hidden = !limTv.length;
    if (limTv.length) $('tv-limite').textContent = limTv.map(i => 'Conta Ordenado ' + i.conta + ': ainda pode usar ' + tvEuro(Math.max(0, i.disponivel), escT) + ' de ' + tvEuro(i.limite, escT)).join(' · ');
    $('tv-acertos').textContent = acertadas === itens.length ? 'Todas as contas acertadas com o saldo real' : acertadas ? acertadas + ' de ' + itens.length + ' contas acertadas com o saldo real' : 'Saldos calculados: toque no lápis de cada conta para pôr o saldo real';
    const hh = $('tv-total').querySelector('.tv-hero-head'); hh.replaceChild(tvBotaoOlho('__total', escT, 'total'), hh.querySelector('.tv-reveal'));
    $('tv-total-amount').textContent = tvEuro(total, escT);
    const atencao = itens.filter(i => tvEstado(i.disponivel)).length, st = tvEstado(total);
    $('tv-total-meta').replaceChildren(el('span', 'tv-st ' + st, TV_ESTADO[st]), el('span', null, '· ' + itens.length + ' contas' + (atencao ? ' · ' + atencao + ' a precisar de atenção' : '')));
    const varT = tvVariacoes(null);
    $('tv-total-trend').replaceChildren(tvBarras(varT, 'o total', escT), tvTendencia(varT, escT));
    const positivos = d3.sum(itens, i => Math.max(i.saldo, 0)), cor = idx => `var(--s${(idx % 6) + 1})`;
    const quotas = itens.map(i => positivos > 0 ? Math.max(i.saldo, 0) / positivos : 0);
    $('tv-stack').replaceChildren(...itens.map((i, idx) => { if (!(quotas[idx] > 0)) return ''; const x = el('i'); x.style.flexGrow = quotas[idx]; x.style.background = cor(idx); x.title = i.conta; return x; }));
    $('tv-legend').replaceChildren(...itens.map((i, idx) => ({ i, idx, q: quotas[idx] })).sort((a, b) => b.q - a.q).map(({ i, idx, q }) => {
      const li = el('li'), sw = el('span', 'sw'); sw.style.background = cor(idx); li.append(sw, el('span', 'name', i.conta), el('span', 'val', tvPct.format(q))); return li; }));
    $('tv-cards').replaceChildren(...itens.map((i, idx) => {
      const esc = !TV.revelados.has(i.conta), st = tvEstado(i.disponivel);
      const li = el('li', 'tv-row' + (esc ? ' is-hidden' : '')); li.style.setProperty('--c', cor(idx));
      const tile = el('span', 'tv-tile', tvInicial(i.conta)); tile.setAttribute('aria-hidden', 'true'); aplicaCapa(tile, 'conta:' + i.conta);
      const txt = el('span', 'tv-text'), sub = el('span', 'tv-sub');
      sub.append(el('span', 'tv-st ' + st, TV_ESTADO[st]), el('span', null, '· ' + tvPct.format(quotas[idx])));
      if (i.limite > 0) sub.append(el('span', 'tv-disp', '· disponível ' + tvEuro(i.disponivel, esc)));
      let nota = 'Calculado'; if (i.acerto) { const d = new Date(i.acerto.em); nota = 'Acertado a ' + d.getDate() + ' ' + MES3[d.getMonth()]; }
      const notaEl = el('span', 'tv-nota' + (i.acerto ? ' ok' : ''), nota);
      txt.append(el('span', 'tv-name', i.conta), sub, notaEl);
      const dir = el('span', 'tv-right'); dir.append(el('span', 'tv-value', tvEuro(i.saldo, esc)), tvBarras(tvVariacoes(i.conta), i.conta, esc));
      const lapis = el('button', 'tv-reveal tv-edit'); lapis.type = 'button'; lapis.setAttribute('aria-label', 'Acertar saldo de ' + i.conta); lapis.title = 'Acertar saldo';
      lapis.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/></svg>';
      lapis.onclick = e => { e.stopPropagation(); abrirAcerto(i); };
      const acoes = el('span', 'tv-acoes'); acoes.append(tvBotaoOlho(i.conta, esc, 'de ' + i.conta), lapis);
      li.append(tile, txt, dir, acoes);
      li.classList.add('tv-click'); li.tabIndex = 0; li.setAttribute('aria-label', 'Ver movimentos de ' + i.conta);
      const ir = () => { fecharTotal(); verConta(i.conta); };
      li.addEventListener('click', e => { if (!e.target.closest('button, .tv-spark')) ir(); });
      li.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === li) { e.preventDefault(); ir(); } });
      return li;
    }));
    tvMarcaTab();
  }
  function abrirTotal() { TV.aberta = true; $('tv').hidden = false; $('tv').scrollTop = 0; tvDesenha(); }
  function fecharTotal() { TV.aberta = false; TV.revelados.clear(); $('tv').hidden = true; tvEscondeDica(); }
  $('abrir-total').addEventListener('click', abrirTotal);
  $('abrir-total-topo').addEventListener('click', abrirTotal);
  $('tv-fechar').addEventListener('click', fecharTotal);
  $('tv-nova-conta').addEventListener('click', () => $('nova-conta').click());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && TV.aberta) fecharTotal(); });
  $('tv-reveal-all').addEventListener('click', () => {
    const chaves = ['__total', ...contas().map(i => i.conta)];
    if (chaves.every(k => TV.revelados.has(k))) TV.revelados.clear(); else chaves.forEach(k => TV.revelados.add(k));
    tvDesenha();
  });
  $('tv').addEventListener('click', e => {
    const b = e.target.closest('[data-tvreveal]');
    if (b) { const k = b.dataset.tvreveal; TV.revelados.has(k) ? TV.revelados.delete(k) : TV.revelados.add(k); tvDesenha();
      const de = [...$('tv').querySelectorAll('[data-tvreveal]')].find(x => x.dataset.tvreveal === k); if (de) de.focus(); return; }
    const svg = e.target.closest('.tv-spark'); if (svg) tvMostraDica(svg, e.clientX, true); else tvEscondeDica();
  });
  let tvTimer = null, tvHover = false;
  function tvEscondeDica() { $('tv-tip').classList.remove('show'); $('tv').querySelectorAll('.tv-spark.has-active').forEach(s => { s.classList.remove('has-active'); s.querySelectorAll('rect.active').forEach(r => r.classList.remove('active')); }); }
  function tvMostraDica(svg, x, auto) {
    const bars = [...svg.querySelectorAll('rect[data-tip]')]; if (!bars.length) return;
    let best = bars[0], dist = Infinity;
    for (const b of bars) { const r = b.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - x); if (d < dist) { dist = d; best = b; } }
    tvEscondeDica(); svg.classList.add('has-active'); best.classList.add('active');
    const tip = $('tv-tip'); tip.textContent = best.dataset.tip; tip.classList.add('show');
    const br = best.getBoundingClientRect(), sr = svg.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
    tip.style.left = Math.min(Math.max(8, br.left + br.width / 2 - tw / 2), window.innerWidth - tw - 8) + 'px';
    tip.style.top = (sr.top - th - 8 > 8 ? sr.top - th - 8 : sr.bottom + 8) + 'px';
    clearTimeout(tvTimer); tvHover = !auto; if (auto) tvTimer = setTimeout(tvEscondeDica, 3000);
  }
  $('tv').addEventListener('pointermove', e => { if (e.pointerType !== 'mouse') return; const s = e.target.closest('.tv-spark'); if (s) tvMostraDica(s, e.clientX, false); else if (tvHover) tvEscondeDica(); });
  const tvTabs = [...document.querySelectorAll('.tv-tab')];
  function tvMarcaTab() {
    const tv = $('tv'), linha = window.innerHeight * 0.4; let atual = 'tv-total';
    for (const t of tvTabs) { const sec = $(t.dataset.section); if (sec && sec.getBoundingClientRect().top < linha) atual = t.dataset.section; }
    if (tv.scrollTop + tv.clientHeight >= tv.scrollHeight - 4) atual = tvTabs[tvTabs.length - 1].dataset.section;
    for (const t of tvTabs) t.setAttribute('aria-current', String(t.dataset.section === atual));
  }
  $('tv').addEventListener('scroll', () => { tvEscondeDica(); tvMarcaTab(); }, { passive: true });
  tvTabs.forEach(t => t.addEventListener('click', e => { e.preventDefault(); const sec = $(t.dataset.section); if (sec) $('tv').scrollTo({ top: sec.offsetTop - 12, behavior: reduce ? 'auto' : 'smooth' }); }));

  // ---------- Capas das categorias (imagens da pasta Photos no Dropbox) ----------
  const CAPA_KEY = 'saldo.capas.cache';
  const fotosPasta = () => folder() + '/Photos';
  let capaCache = (() => { try { return JSON.parse(store.get(CAPA_KEY) || '{}'); } catch (e) { return {}; } })();
  const guardaCapaCache = () => { try { store.set(CAPA_KEY, JSON.stringify(capaCache)); } catch (e) { capaCache = {}; } };
  const capaDe = cat => { const p = M.capas && M.capas[cat]; return p && capaCache[p.toLowerCase()] || null; };
  // Põe a capa (se houver) dentro de um ícone; senão deixa a inicial colorida
  function aplicaCapa(elIco, cat) {
    const url = capaDe(cat); if (!url) return elIco;
    const img = document.createElement('img'); img.src = url; img.alt = ''; img.className = 'capa-img';
    elIco.replaceChildren(img); elIco.classList.add('com-capa'); elIco.style.background = 'transparent';
    return elIco;
  }
  async function miniaturas(paths) {
    const out = {};
    for (let i = 0; i < paths.length; i += 25) {
      const lote = paths.slice(i, i + 25);
      const r = await dbx('https://content.dropboxapi.com/2/files/get_thumbnail_batch', { headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries: lote.map(path => ({ path, format: 'png', size: 'w128h128', mode: 'fitone_bestfit' })) }) });
      const j = await r.json();
      (j.entries || []).forEach((e, k) => { if (e['.tag'] === 'success' && e.thumbnail) out[lote[k].toLowerCase()] = 'data:image/png;base64,' + e.thumbnail; });
    }
    return out;
  }
  async function carregaCapas() {
    if (!ligado() || !M.capas) return;
    const falta = [...new Set(Object.values(M.capas))].filter(p => p && !capaCache[p.toLowerCase()]);
    if (!falta.length) return;
    try { Object.assign(capaCache, await miniaturas(falta)); guardaCapaCache(); render(); } catch (e) {}
  }
  let fotosLista = null, fotosThumbs = {};
  async function carregaFotos() {
    if (fotosLista) return fotosLista;
    let r = await listFolder(fotosPasta()); let j = await r.json(), entradas = j.entries;
    while (j.has_more) { r = await dbx('https://api.dropboxapi.com/2/files/list_folder/continue', { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor: j.cursor }) }); j = await r.json(); entradas = entradas.concat(j.entries); }
    fotosLista = entradas.filter(e => e['.tag'] === 'file' && /\.(png|jpe?g|heic|webp|gif)$/i.test(e.name)).sort((a, b) => String(b.client_modified).localeCompare(String(a.client_modified)));
    return fotosLista;
  }
  // Lista de categorias para escolher capa
  function abrirCapas() {
    const cont = new Map(); for (const r of S.rows) if (r.tipo !== 'Transferência') cont.set(r.categoria, (cont.get(r.categoria) || 0) + 1);
    const cats = [...cont].sort((a, b) => b[1] - a[1]).map(x => x[0]);
    const linhaConta = c => {
      const b = el('button', 'mf-row'), k = 'conta:' + c; b.type = 'button';
      const t = el('span', 'mf-ico', ico(c)); t.style.background = '#0A84FF'; t.style.color = '#fff'; t.style.fontWeight = '700'; aplicaCapa(t, k);
      b.append(t, el('span', 'mf-lab', c), el('span', 'mf-val', M.capas && M.capas[k] ? 'Com imagem' : 'Sem imagem'), el('span', 'mf-chev', '›'));
      b.onclick = () => abrirFotos(k, 'Imagem de ' + c); return b;
    };
    $('cp-contas').replaceChildren(...listaContas().map(linhaConta));
    $('cp-list').replaceChildren(...cats.map(c => {
      const b = el('button', 'mf-row'); b.type = 'button';
      const t = el('span', 'mf-ico', ico(c)); t.style.background = gcol(grupoDe(c, '', 'Despesa')); t.style.color = '#fff'; t.style.fontWeight = '700'; aplicaCapa(t, c);
      b.append(t, el('span', 'mf-lab', c), el('span', 'mf-val', M.capas && M.capas[c] ? 'Com capa' : 'Sem capa'), el('span', 'mf-chev', '›'));
      b.onclick = () => abrirFotos(c);
      return b;
    }));
    abrir('sh-capas');
  }
  async function abrirFotos(cat, titulo, depois) {
    const volta = depois || abrirCapas, nomeC = cat.replace(/^conta:/, '');
    $('fo-title').textContent = titulo || 'Capa de ' + cat; $('fo-msg').textContent = '';
    const grelha = $('fo-grid'); grelha.replaceChildren(); abrir('sh-fotos');
    const sem = el('button', 'fo-item fo-sem', cat.startsWith('conta:') ? 'Sem imagem' : 'Sem capa'); sem.type = 'button';
    sem.onclick = () => { if (M.capas) delete M.capas[cat]; fechar('sh-fotos'); volta(); saveManuais('Imagem removida'); };
    grelha.append(sem);
    if (!ligado()) { $('fo-msg').textContent = 'Ligue o Dropbox em Ajustes para ver as fotos.'; return; }
    let fotos;
    try { fotos = await carregaFotos(); } catch (e) { $('fo-msg').textContent = /not_found/.test(e.summary || '') ? 'Não encontrei a pasta ' + fotosPasta() + '. Crie-a no Dropbox e ponha lá as fotos.' : e.message; return; }
    if (!fotos.length) { $('fo-msg').textContent = 'A pasta ' + fotosPasta() + ' não tem imagens.'; return; }
    const atual = M.capas && M.capas[cat];
    const botoes = fotos.map(f => {
      const b = el('button', 'fo-item' + (atual && atual.toLowerCase() === f.path_lower ? ' on' : '')); b.type = 'button'; b.setAttribute('aria-label', f.name);
      const url = fotosThumbs[f.path_lower] || capaCache[f.path_lower];
      if (url) { const im = document.createElement('img'); im.src = url; im.alt = ''; b.append(im); } else b.classList.add('a-carregar');
      b.onclick = () => {
        M.capas = M.capas || {}; M.capas[cat] = f.path_display;
        const u = fotosThumbs[f.path_lower]; if (u) { capaCache[f.path_lower] = u; guardaCapaCache(); }
        fechar('sh-fotos'); volta(); saveManuais('Imagem de ' + nomeC + ' guardada'); carregaCapas();
      };
      b.dataset.p = f.path_lower; return b;
    });
    grelha.append(...botoes);
    const falta = fotos.filter(f => !fotosThumbs[f.path_lower]).map(f => f.path_display);
    for (let i = 0; i < falta.length; i += 25) {
      try {
        const t = await miniaturas(falta.slice(i, i + 25)); Object.assign(fotosThumbs, t);
        for (const [p, u] of Object.entries(t)) { const b = grelha.querySelector('[data-p="' + CSS.escape(p) + '"]'); if (b) { const im = document.createElement('img'); im.src = u; im.alt = ''; b.replaceChildren(im); b.classList.remove('a-carregar'); } }
      } catch (e) { $('fo-msg').textContent = 'Algumas fotos não carregaram: ' + e.message; break; }
    }
  }
  $('abrir-capas').addEventListener('click', abrirCapas);

  // ---------- Hashtags, regras por comerciante e listas (filtros guardados) ----------
  const limpaTag = t => String(t || '').replace(/^#+/, '').trim();
  function tagsDe(etq, cat) {
    const base = String(etq || '').split(',').map(limpaTag).filter(Boolean);
    const regra = (M.regras && M.regras[cat]) || [];
    return [...new Set(base.concat(regra.map(limpaTag).filter(Boolean)))];
  }
  const listaAtiva = () => (M.listas || []).find(l => l.id === S.lista) || null;
  function passaLista(r, l) {
    if (!l) return true;
    if (l.tipo === 'Despesa' && r.tipo !== 'Despesa') return false;
    if (l.tipo === 'Receita' && r.tipo !== 'Receita') return false;
    const temT = l.tags && l.tags.length, temC = l.cats && l.cats.length;
    if ((temT || temC) && !((temT && l.tags.some(t => r.tags.includes(t))) || (temC && l.cats.includes(r.categoria)))) return false;
    if (l.contas && l.contas.length && !l.contas.includes(r.conta)) return false;
    return true;
  }
  const passaFiltro = r => (!S.multi.length || (r.ftags || []).some(t => S.multi.includes(t))) && (!S.tag || (r.tags || []).includes(S.tag)) && passaLista(r, listaAtiva());
  function todasTags() {
    const cont = new Map();
    for (const r of S.rows) for (const t of r.tags || []) cont.set(t, (cont.get(t) || 0) + 1);
    for (const ts of Object.values(M.regras || {})) for (const t of ts) if (!cont.has(limpaTag(t))) cont.set(limpaTag(t), 0);
    return [...cont].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt')).map(x => x[0]);
  }

  function drawListas() {
    const box = $('listas-chips'); if (!box) return;
    const chip = (txt, on, fn, cls) => { const b = el('button', 'lchip' + (on ? ' on' : '') + (cls ? ' ' + cls : ''), txt); b.type = 'button'; b.setAttribute('aria-pressed', !!on); b.onclick = fn; return b; };
    const itens = [chip('Tudo', !S.tag && !S.lista, () => set({ tag: '', lista: '' }))];
    for (const l of M.listas || []) itens.push(chip('★ ' + l.nome, S.lista === l.id, () => set({ lista: S.lista === l.id ? '' : l.id, tag: '' }), 'lista'));
    if ((M.listas || []).length) itens.push(el('span', 'lsep'));
    for (const t of todasTags()) itens.push(chip('#' + t, S.tag === t, () => set({ tag: S.tag === t ? '' : t, lista: '' })));
    box.replaceChildren(...itens);
    const on = box.querySelector('.on'); if (on && box.scrollWidth > box.clientWidth) box.scrollLeft = on.offsetLeft - box.clientWidth / 2 + on.offsetWidth / 2;
    const res = $('listas-resumo'), l = listaAtiva();
    if (!S.tag && !l) { res.hidden = true; return; }
    const rows = S.rows.filter(r => r.tipo !== 'Transferência' && (!S.mes || r.mes === S.mes) && (!S.ano || r.mes.slice(0, 4) === S.ano) && (!S.conta || r.conta === S.conta) && passaFiltro(r));
    const desp = -d3.sum(rows.filter(r => r.montante < 0), r => r.montante), rec = d3.sum(rows.filter(r => r.montante > 0), r => r.montante);
    const partes = [el('b', null, S.tag ? '#' + S.tag : l.nome), ': '];
    if (desp) partes.push('despesas ', el('b', 'neg', eur(desp)));
    if (desp && rec) partes.push(' · ');
    if (rec) partes.push('receitas ', el('b', 'pos', eur(rec)));
    if (!desp && !rec) partes.push('sem movimentos neste período');
    partes.push(' · ' + rows.length + ' movimentos');
    if (l) { const e = el('button', 'link', 'Editar lista'); e.type = 'button'; e.onclick = () => abrirLista(l); partes.push(' ', e); }
    res.replaceChildren(...partes); res.hidden = false;
  }

  // Regras: comerciante (categoria) -> hashtags
  function abrirTags() {
    const cats = listaCats();
    $('tg-cat').replaceChildren(new Option('Escolha o comerciante', ''), ...cats.map(c => new Option(c, c)));
    $('dl-tags').replaceChildren(...todasTags().map(t => new Option('#' + t)));
    $('tg-tag').value = ''; $('tg-msg').textContent = '';
    desenhaRegras(); abrir('sh-tags');
  }
  function desenhaRegras() {
    const regras = Object.entries(M.regras || {}).filter(([, ts]) => ts && ts.length).sort((a, b) => a[0].localeCompare(b[0], 'pt'));
    if (!regras.length) { $('tg-list').replaceChildren(el('p', 'empty', 'Ainda não tem regras. Escolha um comerciante e escreva a hashtag.')); return; }
    $('tg-list').replaceChildren(...regras.flatMap(([cat, ts]) => ts.map(t => {
      const row = el('div', 'mf-row');
      const i = el('span', 'mf-ico', ico(cat)); i.style.background = gcol(grupoDe(cat, '', 'Despesa')); i.style.color = '#fff'; i.style.fontWeight = '700'; aplicaCapa(i, cat);
      const x = el('button', 'tg-del', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Apagar regra ' + cat + ' #' + t);
      x.onclick = () => { M.regras[cat] = M.regras[cat].filter(v => v !== t); if (!M.regras[cat].length) delete M.regras[cat]; desenhaRegras(); saveManuais('Regra apagada'); };
      row.append(i, el('span', 'mf-lab', cat), el('span', 'mf-val tg-tag', '#' + t), x);
      return row;
    })));
  }
  $('tg-add').addEventListener('click', () => {
    const cat = $('tg-cat').value, t = limpaTag($('tg-tag').value);
    if (!cat) { $('tg-msg').textContent = 'Escolha o comerciante.'; return; }
    if (!t) { $('tg-msg').textContent = 'Escreva a hashtag, por exemplo #Alimentação.'; return; }
    M.regras = M.regras || {}; M.regras[cat] = [...new Set((M.regras[cat] || []).concat(t))];
    $('tg-tag').value = ''; $('tg-msg').textContent = ''; desenhaRegras(); saveManuais('Todos os movimentos de ' + cat + ' passam a ter #' + t);
  });
  $('abrir-tags').addEventListener('click', abrirTags);

  // Listas: filtros guardados
  let LE = null;
  function chipsMulti(box, opcoes, sel, pref, aoMudar) {
    box.replaceChildren(...opcoes.map(o => { const b = el('button', 'lchip' + (sel.has(o) ? ' on' : ''), (pref || '') + o); b.type = 'button';
      b.onclick = () => { sel.has(o) ? sel.delete(o) : sel.add(o); b.classList.toggle('on'); if (aoMudar) aoMudar(); }; return b; }), el('p', 'chip-vazio', 'Nada encontrado.'));
    const q = document.querySelector('[data-filtra="' + box.id + '"]'); if (q) { q.value = ''; filtraChips(box, ''); }
    if (aoMudar) aoMudar();
  }
  // pesquisa nas listas de botões (ignora acentos e maiúsculas)
  const semAc = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^#/, '');
  function filtraChips(box, q) {
    const k = semAc(q.trim()); let n = 0;
    box.querySelectorAll('.lchip').forEach(b => { const ok = !k || semAc(b.textContent).includes(k); b.hidden = !ok; if (ok) n++; });
    const v = box.querySelector('.chip-vazio'); if (v) v.hidden = n > 0;
  }
  document.querySelectorAll('[data-filtra]').forEach(i => i.addEventListener('input', () => filtraChips($(i.dataset.filtra), i.value)));
  function abrirLista(l) {
    LE = { id: l ? l.id : null, tipo: l ? l.tipo || 'Tudo' : 'Tudo', tags: new Set(l ? l.tags : (S.tag ? [S.tag] : [])), cats: new Set(l ? l.cats : []), contas: new Set(l ? l.contas : []) };
    $('ls-title').textContent = l ? 'Editar lista' : 'Nova lista';
    $('ls-nome').value = l ? l.nome : (S.tag || '');
    $('ls-tipo').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === LE.tipo));
    chipsMulti($('ls-tags'), todasTags(), LE.tags, '#');
    chipsMulti($('ls-cats'), listaCats(), LE.cats);
    chipsMulti($('ls-contas'), listaContas(), LE.contas);
    $('ls-del').hidden = !l; $('ls-msg').textContent = '';
    abrir('sh-lista');
  }
  $('ls-tipo').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { LE.tipo = b.dataset.v; $('ls-tipo').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); }));
  $('ls-ok').addEventListener('click', () => {
    const nome = $('ls-nome').value.trim();
    if (!nome) { $('ls-msg').textContent = 'Dê um nome à lista, por exemplo Supermercado.'; return; }
    if (!LE.tags.size && !LE.cats.size && !LE.contas.size && LE.tipo === 'Tudo') { $('ls-msg').textContent = 'Escolha pelo menos uma hashtag, comerciante, conta ou tipo.'; return; }
    const l = { id: LE.id || novoId(), nome, tipo: LE.tipo, tags: [...LE.tags], cats: [...LE.cats], contas: [...LE.contas] };
    M.listas = (M.listas || []).filter(x => x.id !== l.id).concat(l);
    S.lista = l.id; S.tag = '';
    fechar('sh-lista'); saveManuais(LE.id ? 'Lista atualizada' : 'Lista «' + nome + '» criada');
  });
  $('ls-del').addEventListener('click', () => {
    if (!window.confirm('Apagar esta lista? Os movimentos não são apagados.')) return;
    M.listas = (M.listas || []).filter(x => x.id !== LE.id); if (S.lista === LE.id) S.lista = '';
    fechar('sh-lista'); saveManuais('Lista apagada');
  });
  $('nova-lista').addEventListener('click', () => abrirLista(null));
  $('so-ok').addEventListener('click', () => {
    const nome = $('so-nome').value.trim();
    if (!nome) { $('so-msg').textContent = 'Dê um nome a esta soma, por exemplo Comida.'; return; }
    if (!SE.tags.size) { $('so-msg').textContent = 'Escolha pelo menos uma hashtag.'; return; }
    const limTxt = $('so-lim').value.trim().replace(/\s|€/g, '').replace(/\./g, '').replace(',', '.');
    const limite = limTxt ? +limTxt : 0;
    if (limTxt && !(limite >= 0)) { $('so-msg').textContent = 'O limite tem de ser um número, por exemplo 350.'; return; }
    const sm = { id: SE.id || novoId(), nome, tags: [...SE.tags] }; if (limite > 0) sm.limite = Math.round(limite * 100) / 100;
    const lst = M.somas || [], i = lst.findIndex(x => x.id === sm.id);
    M.somas = i >= 0 ? lst.map(x => x.id === sm.id ? sm : x) : lst.concat(sm);
    if (!SE.id) { SOMA = []; guardaSel(); }
    fechar('sh-soma'); saveManuais(SE.id ? 'Soma atualizada' : 'Soma «' + nome + '» guardada');
  });
  $('so-del').addEventListener('click', () => {
    if (!window.confirm('Apagar esta soma guardada? As hashtags e os movimentos não são apagados.')) return;
    M.somas = (M.somas || []).filter(x => x.id !== SE.id);
    fechar('sh-soma'); saveManuais('Soma apagada');
  });
  $('nova-soma').addEventListener('click', () => abrirSoma(null, SOMA));

  // 5. Editor de grupos
  const NOMES_G = Object.keys(GRUPOS).filter(g => g !== 'Rendimentos' && g !== 'Dinheiro').concat(['Rendimentos', 'Dinheiro', 'Outros']);
  let gPend = {};
  function abrirGrupos() {
    gPend = { ...M.grupos };
    const cats = listaCats();
    const atual = c => gPend[c] || grupoBase(c);
    const porGrupo = new Map(NOMES_G.map(g => [g, []]));
    for (const c of cats) { const g = atual(c); if (!porGrupo.has(g)) porGrupo.set(g, []); porGrupo.get(g).push(c); }
    const out = [];
    for (const [g, cs] of porGrupo) {
      if (!cs.length) continue;
      const h = el('div', 'g-head'); const dot = el('span', 'g-dot'); dot.style.background = gcol(g); h.append(dot, el('span', null, g + ' · ' + cs.length));
      out.push(h);
      for (const c of cs) {
        const linha = el('label', 'g-row'); const sel = el('select', 'g-sel'); sel.setAttribute('aria-label', 'Grupo de ' + c);
        sel.replaceChildren(...NOMES_G.map(n => new Option(n, n))); sel.value = atual(c);
        sel.onchange = () => { if (sel.value === grupoBase(c)) delete gPend[c]; else gPend[c] = sel.value; linha.classList.add('mudou'); };
        linha.append(el('span', 'g-cat', c), sel); out.push(linha);
      }
    }
    $('g-list').replaceChildren(...out);
    abrir('sh-grupos');
  }
  $('edit-grupos').addEventListener('click', abrirGrupos);
  $('g-ok').addEventListener('click', () => { M.grupos = gPend; fechar('sh-grupos'); saveManuais('Grupos guardados'); });
  $('g-reset').addEventListener('click', () => { if (!window.confirm('Voltar aos grupos originais?')) return; M.grupos = {}; fechar('sh-grupos'); saveManuais('Grupos repostos'); });

  // ---------- Arranque ----------
  (async function start() {
    try { await finishLogin(); } catch (e) { openSheet(e.message); }
    const c = JSON.parse(store.get(CFG.cache) || 'null');
    if (c && c.text) { try { useData(c, false); } catch (e) { store.del(CFG.cache); } }
    else if (M.movimentos.length) { compose(); }
    render();
    if (appKey() && store.get(CFG.tok)) refresh(true);
  })();
})();
