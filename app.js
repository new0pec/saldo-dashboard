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
      rows.push({ data, mes: data.slice(0, 7), montante: v, conta: limpa(r[0]), grupo, categoria: cat, etiquetas: etq,
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
    if (r.status === 401) { store.del(CFG.tok); throw new Error('A sessão do Dropbox expirou. Liga outra vez.'); }
    if (!r.ok) {
      const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
      const err = new Error(j.error_summary ? 'Dropbox: ' + j.error_summary.replace(/\/\.*$/, '') : 'Erro do Dropbox (' + r.status + ')');
      err.summary = j.error_summary || ''; err.status = r.status;
      throw err;
    }
    return r;
  }

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
  const S = { rows: [], meta: null, mes: '', conta: '', grupo: '', categoria: '', q: '' };
  let drawnBars = false;

  function meses() {
    const m = new Map();
    for (const r of S.rows) {
      if (S.conta && r.conta !== S.conta) continue;
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
    return S.rows.filter(r => r.tipo === 'Despesa' && (!S.conta || r.conta === S.conta) && (!S.mes || r.mes === S.mes) && (!comGrupo || !S.grupo || r.grupo === S.grupo));
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
    return [...m].map(([conta, saldo]) => ({ conta, saldo })).sort((a, b) => b.saldo - a.saldo);
  }

  const set = patch => { Object.assign(S, patch); render(); };

  // ---------- Desenho ----------
  function render() {
    const has = S.rows.length > 0;
    $('app').hidden = !has; $('onboard').hidden = has;
    if (!has) return;
    const ms = meses(), r = resumo(ms);

    $('periodo').textContent = S.mes ? mesLongo(S.mes) : (ms.length ? mesLongo(ms[0].mes).replace(/ \d+$/, '') + ' – ' + mesLongo(ms[ms.length - 1].mes) : '—');

    // Frase de resumo
    if (r) {
      const parts = [(S.mes ? 'Em ' + mesLongo(S.mes).replace(/ \d+$/, '') + ' ' : 'Desde ' + mesLongo(ms[0].mes).replace(/ \d+$/, '') + ' ') + 'entraram ', el('b', null, eur0(r.receitas)), ' e saíram ', el('b', null, eur0(r.despesas)), (S.conta ? ' na conta ' + S.conta : '') + '. '];
      if (r.liquido >= 0) parts.push('Sobraram ', el('b', null, eur0(r.liquido)), '.');
      else parts.push('Gastou mais ', el('b', null, eur0(-r.liquido)), ' do que recebeu.');
      $('lede').replaceChildren(...parts);
    }

    // Meses
    const mk = (lab, val) => { const b = el('button', 'chip' + (S.mes === val ? ' on' : ''), lab); b.type = 'button'; b.setAttribute('aria-pressed', S.mes === val); b.onclick = () => set({ mes: val }); return b; };
    const chips = $('chips');
    chips.replaceChildren(mk('Ano', ''), ...ms.map(x => mk(mesCurto(x.mes), x.mes)));
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
    $('tiles').replaceChildren(...cs.map((r, i) => {
      const b = el('button', 'tile' + (S.conta === r.conta ? ' on' : '')); b.type = 'button';
      b.onclick = () => set({ conta: S.conta === r.conta ? '' : r.conta });
      const ic = el('div', 'tile-ico', ico(r.conta)); ic.style.background = COLORS[i % COLORS.length];
      const v = el('div', 'tile-val', eur(r.saldo)); if (r.saldo < 0) v.style.color = '#FF453A';
      b.append(ic, el('div', 'tile-name', r.conta), v); return b;
    }));
  }

  function drawList() {
    const fc = $('filtroCat');
    if (S.categoria) { const b = el('button', 'filter', S.categoria + '  ×'); b.type = 'button'; b.onclick = () => set({ categoria: '' }); fc.replaceChildren(b); }
    else fc.replaceChildren();
    const q = S.q.trim().toLowerCase();
    let rows = S.rows.filter(r => (!S.mes || r.mes === S.mes) && (!S.conta || r.conta === S.conta) && (!S.grupo || r.grupo === S.grupo) && (!S.categoria || r.categoria === S.categoria)
      && (!q || (r.categoria + ' ' + r.etiquetas + ' ' + r.conta + ' ' + r.grupo).toLowerCase().includes(q)));
    rows = rows.slice().sort((a, b) => a.data < b.data ? 1 : a.data > b.data ? -1 : 0);
    if (!rows.length) { $('lista').replaceChildren(el('li', 'empty', 'Nenhum movimento encontrado.')); return; }
    const N = 150, out = []; let last = '';
    const fmtD = s => { const [y, m, dd] = s.split('-'); return (+dd) + ' de ' + MES[+m - 1] + ' ' + y; };
    for (const r of rows.slice(0, N)) {
      if (r.data !== last) { out.push(el('li', 'txhead', fmtD(r.data))); last = r.data; }
      const li = el('li', 'tx'), mid = el('div'); mid.style.minWidth = '0';
      mid.append(el('div', 'tx-t', r.categoria), el('div', 'tx-s', [r.grupo, r.etiquetas, r.conta].filter(Boolean).join(' · ')));
      const ti = el('div', 'tx-ico', ico(r.categoria)); ti.style.background = gcol(r.grupo);
      li.append(ti, mid, el('div', 'tx-v' + (r.tipo === 'Transferência' ? ' mov' : r.montante > 0 ? ' pos' : ''), (r.montante > 0 ? '+' : '') + eur(r.montante)));
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
    const quando = isNaN(d) ? '' : d.getDate() + ' ' + MES3[d.getMonth()] + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    f.textContent = warn ? warn : quando;
  }

  function useData(res, cache) {
    const rows = parseExport(res.text);
    S.rows = rows; S.meta = { name: res.name, modified: res.modified, origem: res.origem };
    if (S.mes && !rows.some(r => r.mes === S.mes)) S.mes = '';
    if (cache) store.set(CFG.cache, JSON.stringify({ ...S.meta, text: res.text }));
    showSource(S.meta);
    render();
  }

  async function refresh() {
    const btn = $('refresh');
    if (!appKey() || !store.get(CFG.tok)) { openSheet(); return; }
    btn.classList.add('busy'); btn.setAttribute('aria-busy', 'true');
    try { useData(await latestFromDropbox(), true); }
    catch (e) { showSource(S.meta, e.message); if (!S.rows.length) render(); }
    finally { btn.classList.remove('busy'); btn.removeAttribute('aria-busy'); }
  }

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
  $('cfg-logout').onclick = () => { store.del(CFG.tok); store.del(CFG.cache); S.rows = []; S.meta = null; showSource(null); render(); $('cfg-msg').textContent = 'Desligado. Os dados guardados neste dispositivo foram apagados.'; };
  const pickFile = () => $('file').click();
  $('cfg-file').onclick = pickFile;
  $('onboard-file').onclick = pickFile;
  $('file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { useData({ text: await f.text(), name: f.name, modified: new Date(f.lastModified).toISOString(), origem: 'Ficheiro local' }, true); closeSheet(); }
    catch (err) { openSheet(err.message); }
    e.target.value = '';
  };
  $('refresh').onclick = refresh;
  $('conta').onchange = e => set({ conta: e.target.value });
  $('search').addEventListener('input', e => { S.q = e.target.value; drawList(); });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S.rows.length) drawBars(meses()); }, 150); });

  // ---------- Arranque ----------
  (async function start() {
    try { await finishLogin(); } catch (e) { openSheet(e.message); }
    const c = JSON.parse(store.get(CFG.cache) || 'null');
    if (c && c.text) { try { useData(c, false); } catch (e) { store.del(CFG.cache); } }
    render();
    if (appKey() && store.get(CFG.tok)) refresh();
  })();
})();
