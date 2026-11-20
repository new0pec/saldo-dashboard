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
    sessionStorage.setItem(CFG.ver, verifier);
    const u = new URL('https://www.dropbox.com/oauth2/authorize');
    u.search = new URLSearchParams({ client_id: key, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', redirect_uri: redirectUri(), token_access_type: 'offline' });
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
    const verifier = sessionStorage.getItem(CFG.ver);
    sessionStorage.removeItem(CFG.ver);
    if (!verifier) throw new Error('A ligação expirou. Tenta outra vez.');
    const j = await tokenRequest({ code: p.get('code'), grant_type: 'authorization_code', code_verifier: verifier, client_id: appKey(), redirect_uri: redirectUri() });
    store.set(CFG.tok, JSON.stringify({ access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (j.expires_in - 60) * 1000 }));
  }

  async function accessToken() {
    const t = JSON.parse(store.get(CFG.tok) || 'null');
    if (!t) return null;
    if (t.access && t.exp > Date.now()) return t.access;
    if (!t.refresh) return null;
    const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: appKey() });
    t.access = j.access_token; t.exp = Date.now() + (j.expires_in - 60) * 1000;
    store.set(CFG.tok, JSON.stringify(t));
    return t.access;
  }

  async function dbx(url, opts) {
    const tok = await accessToken();
    if (!tok) throw new Error('Liga o Dropbox nas definições.');
    const r = await fetch(url, { method: 'POST', ...opts, headers: { Authorization: 'Bearer ' + tok, ...(opts && opts.headers) } });
    if (r.status === 401) {
      let j = {}; try { j = JSON.parse(await r.text()); } catch (e) {}
      const sum = j.error_summary || '';
      if (/missing_scope|insufficient_scope/.test(sum)) { const err = new Error('Falta a permissão files.content.write na app do Dropbox. Ativa-a e liga de novo.'); err.summary = sum; throw err; }
      store.del(CFG.tok); throw new Error('A sessão do Dropbox expirou. Liga outra vez.');
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

  async function latestFromDropbox() {
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
    const files = entries.filter(e => e['.tag'] === 'file' && /\.(txt|csv)$/i.test(e.name))
      .sort((a, b) => String(b.client_modified || b.server_modified).localeCompare(String(a.client_modified || a.server_modified)));
    if (!files.length) throw new Error('Não encontrei ficheiros .txt ou .csv em ' + folder() + '.');
    const f = files[0];
    const d = await dbx('https://content.dropboxapi.com/2/files/download', { headers: { 'Dropbox-API-Arg': JSON.stringify({ path: f.id }) } });
    return { text: await d.text(), name: f.name, modified: f.client_modified || f.server_modified, origem: 'Dropbox' };
  }

  // ---------- Estado e cálculos ----------
  const S = { rows: [], meta: null, ano: '', mes: '', conta: '', grupo: '', categoria: '', q: '' };
  let drawnBars = false;

  // ---------- Movimentos manuais e grupos personalizados (manuais.json no Dropbox) ----------
  const MAN_KEY = 'saldo.manuais';
  const normaliza = o => {
    o = o && typeof o === 'object' ? o : {};
    return { versao: 1, movimentos: Array.isArray(o.movimentos) ? o.movimentos : [], grupos: o.grupos && typeof o.grupos === 'object' ? o.grupos : {}, contas: Array.isArray(o.contas) ? o.contas : [], saldos: o.saldos && typeof o.saldos === 'object' ? o.saldos : {} };
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
    const base = (S.base || []).map(r => r.tipo === 'Transferência' || !M.grupos[r.categoria] ? r : { ...r, grupo: M.grupos[r.categoria] });
    const man = M.movimentos.filter(m => m && /^\d{4}-\d{2}-\d{2}$/.test(m.data)).flatMap(m => ocorrencias(m).map((data, k) => ({
      id: m.id, data, mes: data.slice(0, 7), montante: +m.montante, conta: m.conta, categoria: m.categoria, etiquetas: m.etiquetas || '',
      tipo: m.tipo, grupo: grupoDe(m.categoria, m.etiquetas, m.tipo), manual: true, serie: !!m.repetir && m.repetir !== 'nunca' })));
    S.rows = base.concat(man);
  }
  async function loadManuais() {
    if (!ligado()) return false;
    try {
      const r = await dbx('https://content.dropboxapi.com/2/files/download', { headers: { 'Dropbox-API-Arg': argHeader({ path: manFile() }) } });
      const novo = migraNomes(normaliza(JSON.parse(await r.text())));
      const mudou = JSON.stringify(novo) !== JSON.stringify(M);
      M = novo; store.set(MAN_KEY, JSON.stringify(M));
      return mudou;
    } catch (e) { if (/not_found/.test(e.summary || '')) return false; throw e; }
  }
  async function saveManuais(okMsg) {
    store.set(MAN_KEY, JSON.stringify(M));
    compose(); render();
    if (!ligado()) { toast('Guardado só neste dispositivo. Liga o Dropbox para sincronizar.'); return; }
    try {
      await dbx('https://content.dropboxapi.com/2/files/upload', { headers: { 'Dropbox-API-Arg': argHeader({ path: manFile(), mode: 'overwrite', mute: true }), 'Content-Type': 'application/octet-stream' }, body: JSON.stringify(M, null, 1) });
      toast(okMsg || 'Guardado no Dropbox');
    } catch (e) { toast(/scope/.test(e.summary || '') ? e.message : 'Ficou guardado neste dispositivo, mas não no Dropbox: ' + e.message, true); }
  }

  function meses() {
    const m = new Map();
    for (const r of S.rows) {
      if (S.conta && r.conta !== S.conta) continue;
      if (S.ano && r.mes.slice(0, 4) !== S.ano) continue;
      if (r.tipo === 'Transferência') continue;
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
    return S.rows.filter(r => r.tipo === 'Despesa' && (!S.conta || r.conta === S.conta) && (!S.mes || r.mes === S.mes) && (!S.ano || r.mes.slice(0, 4) === S.ano) && (!comGrupo || !S.grupo || r.grupo === S.grupo));
  }

  function agrupa(rows, key) {
    const m = new Map();
    for (const r of rows) { const o = m.get(r[key]) || { nome: r[key], grupo: r.grupo, total: 0 }; o.total -= r.montante; m.set(r[key], o); }
    const out = [...m.values()].filter(x => x.total > 0).sort((a, b) => b.total - a.total);
    const tot = d3.sum(out, x => x.total);
    return out.map(x => ({ ...x, quota: tot ? Math.round(x.total / tot * 100) : 0 }));
  }

  function contas() {
    const m = d3.rollup(S.rows, v => d3.sum(v, r => r.montante), r => r.conta);
    for (const c of M.contas.concat(Object.keys(M.saldos))) if (!m.has(c)) m.set(c, 0);
    const ORDEM = [/^activobank$/i, /^revolut/i, /^c\.?\s*c\.?\s*activobank|activobank\s*c\.?\s*c/i, /wizink/i, /^dinheiro/i, /alimenta/i];
    const pos = c => { const i = ORDEM.findIndex(re => re.test(c)); return i < 0 ? 99 : i; };
    return [...m].map(([conta, calc]) => {
      const a = M.saldos[conta];
      return { conta, calc, saldo: a ? calc + (+a.real - +a.calc) : calc, acerto: a || null };
    }).sort((a, b) => pos(a.conta) - pos(b.conta) || a.conta.localeCompare(b.conta, 'pt'));
  }

  const set = patch => { Object.assign(S, patch); render(); };

  // ---------- Desenho ----------
  function render() {
    const has = S.rows.length > 0;
    $('app').hidden = !has; $('onboard').hidden = has;
    $('lede').hidden = !has; $('ano').hidden = !has; $('fab').hidden = !has;
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
    drawCats();
    drawTiles(cs);
    drawList();
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

  const setGrupo = g => set({ grupo: S.grupo === g ? '' : g, categoria: '' });

  function drawGroups() {
    const gs = agrupa(despesasFiltradas(false), 'grupo');
    $('gbar').replaceChildren(...gs.map(r => { const s = el('span'); s.style.flex = String(r.total); s.style.background = gcol(r.nome); s.style.opacity = S.grupo && S.grupo !== r.nome ? '.3' : '1'; s.onclick = () => setGrupo(r.nome); return s; }));
    $('gbar').setAttribute('aria-label', 'Despesas por grupo: ' + gs.map(r => r.nome + ' ' + r.quota + '%').join(', '));
    if (!gs.length) { $('gtiles').replaceChildren(el('p', 'empty', 'Sem despesas neste período.')); return; }
    $('gtiles').replaceChildren(...gs.map(r => {
      const b = el('button', 'gtile' + (S.grupo === r.nome ? ' on' : S.grupo ? ' off' : '')); b.type = 'button'; b.onclick = () => setGrupo(r.nome);
      const top = el('div', 'g-top'), ic = el('div', 'g-ico', ico(r.nome)); ic.style.background = gcol(r.nome);
      top.append(ic, el('div', 'g-name', r.nome));
      b.append(top, el('div', 'g-val', eur(r.total)), el('div', 'g-pct', r.quota + '% das despesas'));
      return b;
    }));
    const fg = $('filtroGrupo');
    if (!S.grupo) fg.replaceChildren(el('span', 'hint', 'Todos os grupos'));
    else { const b = el('button', 'filter', S.grupo + '  ×'); b.type = 'button'; b.style.background = gcol(S.grupo); b.onclick = () => set({ grupo: '', categoria: '' }); fg.replaceChildren(b); }
  }

  function drawCats() {
    const c = agrupa(despesasFiltradas(true), 'categoria');
    if (!c.length) { $('cats').replaceChildren(el('p', 'empty', 'Sem despesas neste período.')); return; }
    const top = c.slice(0, 12), max = top[0].total;
    $('cats').replaceChildren(...top.map(r => {
      const b = el('button', 'cat' + (S.categoria === r.nome ? ' on' : '')); b.type = 'button';
      b.onclick = () => { const novo = S.categoria === r.nome ? '' : r.nome; set({ categoria: novo }); if (novo) $('movimentos').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); };
      const mid = el('div'); mid.style.minWidth = '0';
      const tr = el('div', 'cat-track'), fl = el('div', 'cat-fill'); fl.style.width = (r.total / max * 100) + '%'; fl.style.background = gcol(r.grupo); tr.append(fl);
      mid.append(el('div', 'cat-name', r.nome), tr);
      const val = el('div', 'cat-val'); val.append(el('span', null, eur(r.total)), el('small', null, r.quota + '% das despesas'));
      const ci = el('div', 'cat-ico', ico(r.nome)); ci.style.background = gcol(r.grupo);
      b.append(ci, mid, val); return b;
    }));
  }

  function drawTiles(cs) {
    const total = d3.sum(cs, r => r.saldo), acertadas = cs.filter(r => r.acerto).length;
    $('total-contas').textContent = eur(total);
    $('total-contas').style.color = total < 0 ? '#FF453A' : '';
    $('total-nota').textContent = acertadas === cs.length ? 'Todas as contas acertadas com o saldo real' : acertadas ? acertadas + ' de ' + cs.length + ' contas acertadas com o saldo real' : 'Saldos calculados: toca no lápis de cada conta para pores o saldo real';
    $('tiles').replaceChildren(...cs.map((r, i) => {
      const t = el('div', 'tile' + (S.conta === r.conta ? ' on' : ''));
      const b = el('button', 'tile-main'); b.type = 'button'; b.setAttribute('aria-pressed', S.conta === r.conta);
      b.onclick = () => verConta(S.conta === r.conta ? '' : r.conta);
      const ic = el('div', 'tile-ico', ico(r.conta)); ic.style.background = COLORS[i % COLORS.length];
      const v = el('div', 'tile-val', eur(r.saldo)); if (r.saldo < 0) v.style.color = '#FF453A';
      let nota = 'Calculado';
      if (r.acerto) { const d = new Date(r.acerto.em); nota = 'Acertado a ' + d.getDate() + ' ' + MES3[d.getMonth()]; }
      b.append(ic, el('div', 'tile-name', r.conta), v, el('div', 'tile-nota' + (r.acerto ? ' ok' : ''), nota));
      const e = el('button', 'tile-edit'); e.type = 'button'; e.setAttribute('aria-label', 'Acertar saldo de ' + r.conta);
      e.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      e.onclick = () => abrirAcerto(r);
      t.append(b, e); return t;
    }));
  }

  // Tocar numa conta: a lista de movimentos mostra só essa conta
  function verConta(conta) {
    set({ conta, categoria: '', grupo: '' });
    if (conta) { fecharLinhas(); const lst = $('lista'); if (lst) lst.scrollTop = 0; $('movimentos').scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); }
  }
  function drawList() {
    const fc = $('filtroCat'), chips = [];
    if (S.conta) { const b = el('button', 'filter', S.conta + '  ×'); b.type = 'button'; b.setAttribute('aria-label', 'Mostrar movimentos de todas as contas'); b.onclick = () => set({ conta: '' }); chips.push(b); }
    if (S.categoria) { const b = el('button', 'filter', S.categoria + '  ×'); b.type = 'button'; b.onclick = () => set({ categoria: '' }); chips.push(b); }
    fc.replaceChildren(...chips);
    const q = S.q.trim().toLowerCase();
    let rows = S.rows.filter(r => (!S.mes || r.mes === S.mes) && (!S.ano || r.mes.slice(0, 4) === S.ano) && (!S.conta || r.conta === S.conta) && (!S.grupo || r.grupo === S.grupo) && (!S.categoria || r.categoria === S.categoria)
      && (!q || (r.categoria + ' ' + r.etiquetas + ' ' + r.conta + ' ' + r.grupo).toLowerCase().includes(q)));
    rows = rows.slice().sort((a, b) => a.data < b.data ? 1 : a.data > b.data ? -1 : 0);
    if (!rows.length) { $('lista').replaceChildren(el('li', 'empty', 'Nenhum movimento encontrado.')); return; }
    const N = 150, out = []; let last = '';
    const fmtD = s => { const [y, m, dd] = s.split('-'); return (+dd) + ' de ' + MES[+m - 1] + ' ' + y; };
    for (const r of rows.slice(0, N)) {
      if (r.data !== last) { out.push(el('li', 'txhead', fmtD(r.data))); last = r.data; }
      const li = el('li', 'tx-wrap'), row = el('div', 'tx'), mid = el('div'); mid.style.minWidth = '0';
      mid.append(el('div', 'tx-t', r.categoria), el('div', 'tx-s', [r.manual ? (r.serie ? 'Manual · repete' : 'Manual') : '', r.grupo, r.etiquetas, r.conta].filter(Boolean).join(' · ')));
      const ti = el('div', 'tx-ico', ico(r.categoria)); ti.style.background = gcol(r.grupo);
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
    const rows = S.rows; S.meta = { name: res.name, modified: res.modified, origem: res.origem };
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
      const res = await latestFromDropbox();
      let manMudou = false; try { manMudou = await loadManuais(); } catch (e) {}
      S.checked = new Date();
      const mudou = !S.meta || S.meta.name !== res.name || S.meta.modified !== res.modified || S.rows.length === 0 || !auto;
      if (mudou) useData(res, true); else { if (manMudou) { compose(); render(); } showSource(S.meta); }
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
  const fmtValor = v => L.format(',.2f')(v);

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
  const fmtMontante = s => (s ? s.replace(/^(\d+)/, d => L.format(',')(+d)) : '0') + (s && s.includes(',') ? '' : ',00');
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
    if (F.categoria) { ic.textContent = ico(F.categoria); ic.style.background = gcol(grupoDe(F.categoria, F.etiquetas, F.tipo)); ic.classList.add('cheio'); }
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
      const i = el('span', 'mf-ico', o.ini || ico(o.label)); i.style.background = o.cor || '#8E8E93';
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
    const todas = [...new Set(S.rows.flatMap(r => String(r.etiquetas || '').split(',').map(x => x.trim()).filter(Boolean)))].sort((a, b) => a.localeCompare(b, 'pt'));
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
      const t = el('span', 'c-tile', abrev(c)); t.style.background = gcol(grupoDe(c, '', F.tipo));
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
    const erro = !(v > 0) ? 'Toca em Montante e escreve o valor.' : !/^\d{4}-\d{2}-\d{2}$/.test(data) ? 'Escolhe a data.' : !F.conta ? 'Escolhe a conta.' : !F.categoria ? 'Escolhe a categoria.' : '';
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
    $('a-calc').textContent = eur(r.calc);
    $('a-valor').value = r.acerto ? L.format(',.2f')(r.saldo).replace(/\u00a0/g, '') : '';
    $('a-remover').hidden = !r.acerto; $('a-msg').textContent = '';
    abrir('sh-acerto');
    if (window.matchMedia('(pointer:fine)').matches) $('a-valor').focus();
  }
  $('a-ok').addEventListener('click', () => {
    const txt = $('a-valor').value.replace(/\s/g, '').replace(/−/g, '-');
    const v = parseFloat(/,/.test(txt) ? txt.replace(/\.(?=\d{3})/g, '').replace(',', '.') : txt);
    if (!isFinite(v)) { $('a-msg').textContent = 'Escreve o saldo que a app do banco mostra, por exemplo 1234,56.'; return; }
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
    $('tv-acertos').textContent = acertadas === itens.length ? 'Todas as contas acertadas com o saldo real' : acertadas ? acertadas + ' de ' + itens.length + ' contas acertadas com o saldo real' : 'Saldos calculados: toca no lápis de cada conta para pores o saldo real';
    const hh = $('tv-total').querySelector('.tv-hero-head'); hh.replaceChild(tvBotaoOlho('__total', escT, 'total'), hh.querySelector('.tv-reveal'));
    $('tv-total-amount').textContent = tvEuro(total, escT);
    const atencao = itens.filter(i => tvEstado(i.saldo)).length, st = tvEstado(total);
    $('tv-total-meta').replaceChildren(el('span', 'tv-st ' + st, TV_ESTADO[st]), el('span', null, '· ' + itens.length + ' contas' + (atencao ? ' · ' + atencao + ' a precisar de atenção' : '')));
    const varT = tvVariacoes(null);
    $('tv-total-trend').replaceChildren(tvBarras(varT, 'o total', escT), tvTendencia(varT, escT));
    const positivos = d3.sum(itens, i => Math.max(i.saldo, 0)), cor = idx => `var(--s${(idx % 6) + 1})`;
    const quotas = itens.map(i => positivos > 0 ? Math.max(i.saldo, 0) / positivos : 0);
    $('tv-stack').replaceChildren(...itens.map((i, idx) => { if (!(quotas[idx] > 0)) return ''; const x = el('i'); x.style.flexGrow = quotas[idx]; x.style.background = cor(idx); x.title = i.conta; return x; }));
    $('tv-legend').replaceChildren(...itens.map((i, idx) => ({ i, idx, q: quotas[idx] })).sort((a, b) => b.q - a.q).map(({ i, idx, q }) => {
      const li = el('li'), sw = el('span', 'sw'); sw.style.background = cor(idx); li.append(sw, el('span', 'name', i.conta), el('span', 'val', tvPct.format(q))); return li; }));
    $('tv-cards').replaceChildren(...itens.map((i, idx) => {
      const esc = !TV.revelados.has(i.conta), st = tvEstado(i.saldo);
      const li = el('li', 'tv-row' + (esc ? ' is-hidden' : '')); li.style.setProperty('--c', cor(idx));
      const tile = el('span', 'tv-tile', tvInicial(i.conta)); tile.setAttribute('aria-hidden', 'true');
      const txt = el('span', 'tv-text'), sub = el('span', 'tv-sub');
      sub.append(el('span', 'tv-st ' + st, TV_ESTADO[st]), el('span', null, '· ' + tvPct.format(quotas[idx])));
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
