// =====================================================
// 0. TEMA CLARO / ESCURO
// =====================================================
function aplicarTema(tema){
  const isDark = tema === 'dark';
  document.body.classList.toggle('dark-mode', isDark);
  const iconeLua = document.getElementById('icone-tema-lua');
  const iconeSol = document.getElementById('icone-tema-sol');
  const textoTema = document.getElementById('texto-tema');
  if(iconeLua && iconeSol && textoTema){
    iconeLua.style.display = isDark ? 'none' : 'inline-block';
    iconeSol.style.display = isDark ? 'inline-block' : 'none';
    textoTema.textContent = isDark ? 'Modo Claro' : 'Modo Escuro';
  }
}

function alternarTema(){
  const isDark = document.body.classList.contains('dark-mode');
  const novoTema = isDark ? 'light' : 'dark';
  localStorage.setItem('tryp_tema', novoTema);
  aplicarTema(novoTema);
}

aplicarTema(localStorage.getItem('tryp_tema') || 'light');

// =====================================================
// 1. CONFIGURAÇÃO DO FIREBASE
// =====================================================
const firebaseConfig = {
  apiKey: "AIzaSyDKUoiJ87ZFrhG0u6vRzpmtBxNuVHTocbo",
  authDomain: "tryp-congonhas.firebaseapp.com",
  databaseURL: "https://tryp-congonhas-default-rtdb.firebaseio.com",
  projectId: "tryp-congonhas",
  storageBucket: "tryp-congonhas.firebasestorage.app",
  messagingSenderId: "680207644260",
  appId: "1:680207644260:web:23fbc785e6ea83bc409171",
  measurementId: "G-X19D3GGC35"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.database();
const unidadesRef = db.ref('unidades');

// =====================================================
// 2. RESTRIÇÃO DE ACESSO AO DASHBOARD POR E-MAIL
// =====================================================
const USUARIOS_SEM_DASHBOARD = [
  'marcos@amplaincorporadora.com.br'
];

function usuarioPodeVerDashboard(email){
  if(!email) return false;
  const alvo = email.toLowerCase().trim();
  return !USUARIOS_SEM_DASHBOARD.map(e => e.toLowerCase().trim()).includes(alvo);
}

// =====================================================
// 3. TABELA DE ÁREAS POR POSIÇÃO (1 A 30) - DEFINITIVA
// =====================================================
const AREAS = [
  21.98, 21.28, 21.28, 21.28, 21.28, 21.28, 21.28, 21.35, 28.63, 28.63,
  21.35, 21.28, 21.28, 21.28, 21.28, 21.28, 21.28, 21.28, 21.28, 22.00,
  22.00, 21.35, 21.28, 21.28, 21.28, 21.35, 22.97, 22.97, 21.35, 21.28
];
// Adicionado o final 1 (01) como Planta Diferenciada
const POSICOES_DIFERENCIADAS = [1, 9, 10, 20, 21, 27, 28];

const STATUS_LABEL_CURTO = {
  disponivel: 'DISPONÍVEL',
  reservada: 'RESERVADA',
  vendida: 'VENDIDA',
  permuta: 'PERMUTA',
  bloqueada: 'BLOQUEADA'
};

let unidadesGlobais = {};
let unidadeAtualId = null;
let andaresRecolhidos = {};

// =====================================================
// 4. AUTENTICAÇÃO E INICIALIZAÇÃO
// =====================================================
auth.onAuthStateChanged(user => {
  if(user){
    document.getElementById('tela-login').style.display = 'none';
    document.getElementById('tela-app').style.display = 'block';
    document.getElementById('usuario-email').textContent = user.email;

    try {
      const podeVerDashboard = usuarioPodeVerDashboard(user.email);
      document.getElementById('btn-aba-dashboard').style.display = podeVerDashboard ? 'block' : 'none';
    } catch(e){
      console.error('Erro ao checar permissão de dashboard:', e);
      document.getElementById('btn-aba-dashboard').style.display = 'block';
    }

    trocarAba('mapa');
    carregarDados();
  } else {
    document.getElementById('tela-login').style.display = 'flex';
    document.getElementById('tela-app').style.display = 'none';
  }
});

function fazerLogin(){
  const email = document.getElementById('login-email').value.trim();
  const senha = document.getElementById('login-senha').value;
  const erroEl = document.getElementById('login-erro');
  erroEl.style.display = 'none';

  if(!email || !senha){
    erroEl.textContent = 'Preencha seu e-mail e senha para entrar.';
    erroEl.style.display = 'block';
    return;
  }

  auth.signInWithEmailAndPassword(email, senha).catch(err => {
    erroEl.textContent = 'E-mail ou senha inválidos. Verifique suas credenciais.';
    erroEl.style.display = 'block';
  });
}

function fazerLogout(){
  if(confirm('Deseja realmente sair do sistema?')){
    auth.signOut();
  }
}

document.addEventListener('keydown', e => {
  if(e.key === 'Enter' && document.getElementById('tela-login').style.display !== 'none'){
    fazerLogin();
  }
});

// =====================================================
// 5. GERAR E SINCRONIZAR UNIDADES NO FIREBASE
// =====================================================
function gerarUnidadesPadrao(){
  const obj = {};
  for(let andar = 1; andar <= 8; andar++){
    for(let pos = 1; pos <= 30; pos++){
      const id = andar * 100 + pos;
      obj[id] = {
        id: id,
        andar: andar,
        pos: pos,
        area: AREAS[pos - 1],
        status: 'disponivel',
        bloqueado: false,
        motivoBloqueio: 'outro',
        assinado: 'nao',
        comprador: '',
        corretor: '',
        empresa: '',
        condicao: '',
        valor: 0,
        data: '',
        obs: '',
        atualizadoPor: '',
        atualizadoEm: ''
      };
    }
  }
  return obj;
}

function corrigirAreasExistentes(dados){
  const atualizacoes = {};
  let precisaCorrigir = false;
  Object.values(dados).forEach(u => {
    const areaCorreta = AREAS[u.pos - 1];
    if(Number(u.area) !== Number(areaCorreta)){
      atualizacoes[u.id + '/area'] = areaCorreta;
      precisaCorrigir = true;
    }
  });
  if(precisaCorrigir){
    unidadesRef.update(atualizacoes);
  }
}

function mostrarErroCarregamento(msg){
  const el = document.getElementById('erro-carregamento');
  el.textContent = msg;
  el.style.display = 'block';
}

function esconderErroCarregamento(){
  document.getElementById('erro-carregamento').style.display = 'none';
}

function carregarDados(){
  unidadesRef.on('value', snapshot => {
    esconderErroCarregamento();
    const data = snapshot.val();
    if(!data){
      const padrao = gerarUnidadesPadrao();
      unidadesRef.set(padrao);
    } else {
      corrigirAreasExistentes(data);
      unidadesGlobais = data;
      preencherSelectAndarDash();
      renderizarTudo();
    }
  }, erro => {
    mostrarErroCarregamento(
      'Não foi possível carregar as unidades. Motivo: ' + erro.message +
      ' — Peça ao administrador para verificar as regras do banco de dados (Firebase).'
    );
    console.error('Erro ao ler unidades do Firebase:', erro);
  });
}

function renderizarTudo(){
  renderizarResumo();
  renderizarAndares();
  renderizarDashboard();
  renderizarPlanta();
}

// =====================================================
// 6. FORMATAÇÃO DE MOEDA E ÍCONES SVG
// =====================================================
function formatarMoeda(valor){
  valor = Number(valor) || 0;
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarMoedaCompacta(valor){
  valor = Number(valor) || 0;
  const abs = Math.abs(valor);
  const sinal = valor < 0 ? '-' : '';
  if(abs >= 1e9){
    return sinal + 'R$ ' + (abs / 1e9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' bi';
  }
  if(abs >= 1e6){
    return sinal + 'R$ ' + (abs / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi';
  }
  return formatarMoeda(valor);
}

function formatarArea(area){
  return Number(area).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
}

const SVG_CADEADO = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
const SVG_ESTRELA = `<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
const SVG_CHECK = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
const SVG_PENDENTE = `<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;

// =====================================================
// 7. CARDS DE RESUMO E MAPA DE UNIDADES
// =====================================================
function renderizarResumo(){
  const lista = Object.values(unidadesGlobais);
  const total = lista.length;
  const disp = lista.filter(u => !u.bloqueado && u.status === 'disponivel').length;
  const res = lista.filter(u => !u.bloqueado && u.status === 'reservada').length;
  const vend = lista.filter(u => !u.bloqueado && u.status === 'vendida').length;
  const perm = lista.filter(u => !u.bloqueado && u.status === 'permuta').length;
  const bloq = lista.filter(u => u.bloqueado).length;

  const vgvTotal = lista.reduce((acc, u) => acc + (Number(u.valor) || 0), 0);
  const vgvVendido = lista
    .filter(u => !u.bloqueado && u.status === 'vendida')
    .reduce((acc, u) => acc + (Number(u.valor) || 0), 0);

  const percVend = total ? ((vend / total) * 100).toFixed(1) : '0.0';

  document.getElementById('resumo-cards').innerHTML = `
    <div class="resumo-card">
      <span class="resumo-label">Total de Unidades</span>
      <strong class="resumo-valor">${total}</strong>
      <small class="resumo-sub">8 pavimentos • 30 por andar</small>
    </div>
    <div class="resumo-card verde">
      <span class="resumo-label">Disponíveis</span>
      <strong class="resumo-valor">${disp}</strong>
      <small class="resumo-sub">${total ? ((disp/total)*100).toFixed(1) : 0}% do total</small>
    </div>
    <div class="resumo-card amarelo">
      <span class="resumo-label">Reservadas</span>
      <strong class="resumo-valor">${res}</strong>
      <small class="resumo-sub">Em negociação ativa</small>
    </div>
    <div class="resumo-card vermelho">
      <span class="resumo-label">Vendidas</span>
      <strong class="resumo-valor">${vend}</strong>
      <small class="resumo-sub">${percVend}% comercializado</small>
    </div>
    <div class="resumo-card roxo">
      <span class="resumo-label">Permutas / Bloq.</span>
      <strong class="resumo-valor">${perm} / ${bloq}</strong>
      <small class="resumo-sub">Permutas e bloqueios</small>
    </div>
    <div class="resumo-card destaque">
      <span class="resumo-label">VGV Vendido</span>
      <strong class="resumo-valor resumo-valor-money" title="${formatarMoeda(vgvVendido)}">${formatarMoedaCompacta(vgvVendido)}</strong>
      <small class="resumo-sub" title="VGV Total Cadastrado: ${formatarMoeda(vgvTotal)}">Total: ${formatarMoedaCompacta(vgvTotal)}</small>
    </div>
  `;
}

function ehDiferenciada(pos){
  return POSICOES_DIFERENCIADAS.includes(Number(pos));
}

function filtrarUnidadeMapa(u){
  const busca = document.getElementById('filtro-busca').value.toLowerCase().trim();
  const fAndar = document.getElementById('filtro-andar').value;
  const fStatus = document.getElementById('filtro-status').value;
  const fAssinado = document.getElementById('filtro-assinado').value;
  const fTipoArea = document.getElementById('filtro-tipo-area').value;

  if(fAndar !== 'todos' && String(u.andar) !== fAndar) return false;

  if(fStatus !== 'todos'){
    if(fStatus === 'bloqueada'){
      if(!u.bloqueado) return false;
    } else {
      if(u.bloqueado || u.status !== fStatus) return false;
    }
  }

  if(fAssinado !== 'todos' && (u.assinado || 'nao') !== fAssinado) return false;

  if(fTipoArea === 'diferenciada' && !ehDiferenciada(u.pos)) return false;
  if(fTipoArea === 'padrao' && ehDiferenciada(u.pos)) return false;

  if(busca){
    const texto = `${u.id} ${u.comprador || ''} ${u.corretor || ''} ${u.empresa || ''} ${u.obs || ''}`.toLowerCase();
    if(!texto.includes(busca)) return false;
  }

  return true;
}

function limparFiltrosMapa(){
  document.getElementById('filtro-busca').value = '';
  document.getElementById('filtro-andar').value = 'todos';
  document.getElementById('filtro-status').value = 'todos';
  document.getElementById('filtro-assinado').value = 'todos';
  document.getElementById('filtro-tipo-area').value = 'todos';
  renderizarAndares();
}

function toggleAndar(andar){
  andaresRecolhidos[andar] = !andaresRecolhidos[andar];
  renderizarAndares();
}

function renderizarAndares(){
  const container = document.getElementById('lista-andares');
  let html = '';
  let totalVisiveis = 0;

  for(let andar = 8; andar >= 1; andar--){
    const unidadesDoAndar = [];
    for(let pos = 1; pos <= 30; pos++){
      const id = andar * 100 + pos;
      const u = unidadesGlobais[id];
      if(u && filtrarUnidadeMapa(u)){
        unidadesDoAndar.push(u);
      }
    }

    if(unidadesDoAndar.length === 0) continue;
    totalVisiveis += unidadesDoAndar.length;

    const todasAndar = [];
    for(let pos = 1; pos <= 30; pos++){
      if(unidadesGlobais[andar * 100 + pos]) todasAndar.push(unidadesGlobais[andar * 100 + pos]);
    }
    const dispA = todasAndar.filter(x => !x.bloqueado && x.status === 'disponivel').length;
    const resA = todasAndar.filter(x => !x.bloqueado && x.status === 'reservada').length;
    const vendA = todasAndar.filter(x => !x.bloqueado && x.status === 'vendida').length;

    const recolhido = !!andaresRecolhidos[andar];

    html += `
      <section class="andar-section">
        <div class="andar-header" onclick="toggleAndar(${andar})">
          <div class="andar-titulo">
            <span class="andar-seta">${recolhido ? '▸' : '▾'}</span>
            <h2>${andar}º Pavimento</h2>
            <span class="andar-faixa">Unidades ${andar}01 a ${andar}30</span>
          </div>
          <div class="andar-stats">
            <span class="mini-pill disp">${dispA} disp.</span>
            <span class="mini-pill res">${resA} res.</span>
            <span class="mini-pill vend">${vendA} vend.</span>
          </div>
        </div>
        <div class="andar-grid" style="display:${recolhido ? 'none' : 'grid'};">
          ${unidadesDoAndar.map(u => criarCardUnidadeHTML(u)).join('')}
        </div>
      </section>
    `;
  }

  container.innerHTML = html || `<div class="vazio-msg">Nenhuma unidade encontrada para os filtros selecionados.</div>`;
  document.getElementById('contador-resultados').textContent = `Exibindo ${totalVisiveis} de 240 unidades`;
}

function criarCardUnidadeHTML(u){
  const dif = ehDiferenciada(u.pos);
  const chaveStatus = u.bloqueado ? 'bloqueada' : (u.status || 'disponivel');
  const classeStatus = u.bloqueado ? 'status-bloqueada' : `status-${u.status}`;
  const classeDif = dif ? 'diferenciada' : '';
  const labelStatus = STATUS_LABEL_CURTO[chaveStatus] || 'DISPONÍVEL';

  let badgeAssinatura = '';
  if(u.assinado === 'sim'){
    badgeAssinatura = `<span class="icon-badge assinado" title="Contrato Assinado">${SVG_CHECK}</span>`;
  } else if(u.assinado === 'pendente'){
    badgeAssinatura = `<span class="icon-badge pendente" title="Assinatura Pendente">${SVG_PENDENTE}</span>`;
  }

  const badgeBloq = u.bloqueado
    ? `<span class="icon-badge bloqueado" title="Unidade Bloqueada">${SVG_CADEADO}</span>`
    : '';

  const badgeDif = dif
    ? `<span class="icon-badge dif-star" title="Planta Diferenciada (${formatarArea(u.area)})">${SVG_ESTRELA} DIF</span>`
    : '';

  const valorFormatado = Number(u.valor) > 0
    ? `<div class="unidade-vgv" title="${formatarMoeda(u.valor)}">${formatarMoedaCompacta(u.valor)}</div>`
    : '';

  const autorCurto = u.atualizadoPor ? u.atualizadoPor.split('@')[0] : '';
  const infoAuditoria = autorCurto ? `<div class="unidade-auditoria" title="Atualizado por ${u.atualizadoPor}">por ${autorCurto}</div>` : '';

  return `
    <div class="unidade ${classeStatus} ${classeDif}" onclick="abrirModal(${u.id})">
      <div class="unidade-top-icons">
        <span class="icons-left">${badgeDif}</span>
        <span class="icons-right">${badgeBloq}${badgeAssinatura}</span>
      </div>
      <div class="unidade-num">${u.id}</div>
      <div class="unidade-area">${formatarArea(u.area)}</div>
      <div class="unidade-status-pill ${chaveStatus}">${labelStatus}</div>
      ${valorFormatado}
      ${infoAuditoria}
    </div>
  `;
}

// =====================================================
// 8. MODAL DE EDIÇÃO E GRAVAÇÃO E CORREÇÃO DO CURSOR
// =====================================================
function abrirModal(id){
  const u = unidadesGlobais[id];
  if(!u) return;
  unidadeAtualId = id;

  const difTexto = ehDiferenciada(u.pos) ? ' • Planta Diferenciada' : '';
  document.getElementById('modal-titulo').textContent = `Unidade ${u.id}`;
  document.getElementById('modal-subtitulo').textContent = `${u.andar}º Pavimento • Final ${String(u.pos).padStart(2,'0')} • ${formatarArea(u.area)}${difTexto}`;

  document.getElementById('mod-status').value = u.status || 'disponivel';
  document.getElementById('mod-assinado').value = u.assinado || 'nao';
  document.getElementById('mod-bloqueado').checked = !!u.bloqueado;
  document.getElementById('mod-motivo-bloqueio').value = u.motivoBloqueio || 'outro';
  toggleMotivoBloqueio();

  document.getElementById('mod-comprador').value = u.comprador || '';
  document.getElementById('mod-data').value = u.data || '';
  document.getElementById('mod-corretor').value = u.corretor || '';
  document.getElementById('mod-empresa').value = u.empresa || '';
  document.getElementById('mod-condicao').value = u.condicao || '';

  const valNum = Number(u.valor) || 0;
  document.getElementById('mod-valor').value = valNum > 0 ? formatarMoeda(valNum) : '';
  atualizarValorM2Modal(valNum, u.area);

  document.getElementById('mod-obs').value = u.obs || '';

  const audEl = document.getElementById('modal-auditoria');
  if(u.atualizadoPor && u.atualizadoEm){
    const dt = new Date(u.atualizadoEm).toLocaleString('pt-BR');
    audEl.textContent = `Última alteração realizada por ${u.atualizadoPor} em ${dt}`;
    audEl.style.display = 'block';
  } else {
    audEl.style.display = 'none';
  }

  document.getElementById('modal-unidade').classList.add('open');
}

function toggleMotivoBloqueio(){
  const chk = document.getElementById('mod-bloqueado').checked;
  document.getElementById('wrap-motivo-bloqueio').style.display = chk ? 'block' : 'none';
}

// MÁSCARA DE MOEDA
function mascaraMoedaInput(input){
  let start = input.selectionStart;
  let lengthAnterior = input.value.length;

  let limpo = input.value.replace(/\D/g, '');
  if(!limpo){
    input.value = '';
    const u = unidadesGlobais[unidadeAtualId];
    atualizarValorM2Modal(0, u ? u.area : 1);
    return;
  }

  const num = parseInt(limpo, 10) / 100;
  input.value = formatarMoeda(num);

  let diff = input.value.length - lengthAnterior;
  input.setSelectionRange(start + diff, start + diff);

  const u = unidadesGlobais[unidadeAtualId];
  atualizarValorM2Modal(num, u ? u.area : 1);
}

function extrairNumeroMoeda(str){
  if(!str) return 0;
  const limpo = String(str).replace(/\D/g, '');
  return limpo ? parseInt(limpo, 10) / 100 : 0;
}

function atualizarValorM2Modal(valor, area){
  const m2El = document.getElementById('mod-valor-m2');
  if(!valor || !area){
    m2El.value = 'R$ 0,00 / m²';
  } else {
    m2El.value = formatarMoeda(valor / Number(area)) + ' / m²';
  }
}

function fecharModal(){
  document.getElementById('modal-unidade').classList.remove('open');
  unidadeAtualId = null;
}

function fecharModalFora(e){
  if(e.target.id === 'modal-unidade') fecharModal();
}

function salvarUnidade(){
  if(!unidadeAtualId) return;
  const u = unidadesGlobais[unidadeAtualId];

  const status = document.getElementById('mod-status').value;
  const bloqueado = document.getElementById('mod-bloqueado').checked;

  if(bloqueado && (status === 'vendida' || status === 'reservada')){
    alert('Atenção: Uma unidade bloqueada não pode ser marcada como Vendida ou Reservada. Desmarque o bloqueio antes de continuar.');
    return;
  }

  const user = auth.currentUser;
  const emailAutor = user ? user.email : 'desconhecido';

  const atualizado = {
    ...u,
    status: status,
    assinado: document.getElementById('mod-assinado').value,
    bloqueado: bloqueado,
    motivoBloqueio: document.getElementById('mod-motivo-bloqueio').value,
    comprador: document.getElementById('mod-comprador').value.trim(),
    data: document.getElementById('mod-data').value,
    corretor: document.getElementById('mod-corretor').value.trim(),
    empresa: document.getElementById('mod-empresa').value.trim(),
    condicao: document.getElementById('mod-condicao').value,
    valor: extrairNumeroMoeda(document.getElementById('mod-valor').value),
    obs: document.getElementById('mod-obs').value.trim(),
    atualizadoPor: emailAutor,
    atualizadoEm: new Date().toISOString()
  };

  unidadesRef.child(unidadeAtualId).set(atualizado).then(() => {
    fecharModal();
  }).catch(err => {
    alert('Erro ao salvar alterações: ' + err.message);
  });
}

// =====================================================
// 9. NAVEGAÇÃO DE ABAS E DASHBOARD ANALÍTICO (TICKET MÉDIO APENAS VENDIDAS)
// =====================================================
function trocarAba(aba){
  const user = auth.currentUser;
  if(aba === 'dashboard' && user && !usuarioPodeVerDashboard(user.email)){
    aba = 'mapa';
  }

  const ABAS_VALIDAS = ['mapa', 'dashboard', 'planta'];
  if(!ABAS_VALIDAS.includes(aba)) aba = 'mapa';

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.aba-content').forEach(c => c.classList.remove('active'));

  document.getElementById('btn-aba-' + aba).classList.add('active');
  document.getElementById('aba-' + aba).classList.add('active');

  if(aba === 'dashboard'){
    renderizarDashboard();
  } else if(aba === 'planta'){
    renderizarPlanta();
  }
}

function preencherSelectAndarDash(){
  const sel = document.getElementById('dash-andar');
  if(sel.options.length > 1) return;
  for(let a = 8; a >= 1; a--){
    const opt = document.createElement('option');
    opt.value = String(a);
    opt.textContent = `${a}º Pavimento`;
    sel.appendChild(opt);
  }
}

function limparFiltrosDash(){
  document.getElementById('dash-data-ini').value = '';
  document.getElementById('dash-data-fim').value = '';
  document.getElementById('dash-andar').value = 'todos';
  document.getElementById('dash-status').value = 'vendida_reservada';
  renderizarDashboard();
}

function renderizarDashboard(){
  const lista = Object.values(unidadesGlobais);
  if(!lista.length) return;

  const dIni = document.getElementById('dash-data-ini').value;
  const dFim = document.getElementById('dash-data-fim').value;
  const fAndar = document.getElementById('dash-andar').value;
  const fStatus = document.getElementById('dash-status').value;

  const filtradas = lista.filter(u => {
    if(u.bloqueado) return false;
    if(fAndar !== 'todos' && String(u.andar) !== fAndar) return false;

    if(fStatus === 'vendida_reservada'){
      if(u.status !== 'vendida' && u.status !== 'reservada') return false;
    } else if(fStatus !== 'todos'){
      if(u.status !== fStatus) return false;
    }

    if(dIni && (!u.data || u.data < dIni)) return false;
    if(dFim && (!u.data || u.data > dFim)) return false;

    return true;
  });

  // Quantidade exibida no primeiro card de resumo (com base no filtro)
  const qtdGeral = filtradas.length;

  // VGV Geral = Soma de Tudo que estiver no Filtro Atual
  const vgvPeriodo = filtradas.reduce((acc, u) => acc + (Number(u.valor) || 0), 0);

  // CÁLCULO RESTRITO AO TICKET MÉDIO (APENAS STATUS = VENDIDA E SEM BLOQUEIO)
  const filtradasVendidas = filtradas.filter(u => u.status === 'vendida' && Number(u.valor) > 0);
  const qtdVendida = filtradasVendidas.length;

  const vgvVendido = filtradasVendidas.reduce((acc, u) => acc + (Number(u.valor) || 0), 0);
  const areaTotalVendida = filtradasVendidas.reduce((acc, u) => acc + (Number(u.area) || 0), 0);

  const ticketMedio = qtdVendida > 0 ? vgvVendido / qtdVendida : 0;
  const valorM2Medio = areaTotalVendida > 0 ? vgvVendido / areaTotalVendida : 0;

  document.getElementById('dash-metricas').innerHTML = `
    <div class="resumo-card">
      <span class="resumo-label">Unidades no Filtro</span>
      <strong class="resumo-valor">${qtdGeral}</strong>
      <small class="resumo-sub">Exibindo resultados gerais</small>
    </div>
    <div class="resumo-card destaque">
      <span class="resumo-label">VGV no Período</span>
      <strong class="resumo-valor resumo-valor-money" title="${formatarMoeda(vgvPeriodo)}">${formatarMoedaCompacta(vgvPeriodo)}</strong>
      <small class="resumo-sub">Soma das unidades no filtro</small>
    </div>
    <div class="resumo-card verde">
      <span class="resumo-label">Ticket Médio</span>
      <strong class="resumo-valor resumo-valor-money" title="${formatarMoeda(ticketMedio)}">${formatarMoedaCompacta(ticketMedio)}</strong>
      <small class="resumo-sub">Apenas un. VENDIDAS</small>
    </div>
    <div class="resumo-card amarelo">
      <span class="resumo-label">R$ / m² Médio</span>
      <strong class="resumo-valor resumo-valor-money" title="${formatarMoeda(valorM2Medio)}">${formatarMoedaCompacta(valorM2Medio)}</strong>
      <small class="resumo-sub">Apenas un. VENDIDAS</small>
    </div>
  `;

  // Gráfico 1: Por Pavimento
  let htmlAndares = '';
  for(let a = 8; a >= 1; a--){
    const count = filtradas.filter(u => u.andar === a).length;
    const perc = Math.min(100, Math.round((count / 30) * 100));
    htmlAndares += `
      <div class="bar-row">
        <span class="bar-label">${a}º Andar</span>
        <div class="bar-track"><div class="bar-fill" style="width:${perc}%"></div></div>
        <span class="bar-val">${count} un.</span>
      </div>
    `;
  }
  document.getElementById('chart-andares').innerHTML = htmlAndares;

  // Gráfico 2: Condição de Pagamento
  const mapCond = {
    a_vista: 'À vista',
    financiamento_bancario: 'Financiamento bancário',
    parcelado_construtora: 'Parcelado construtora',
    '': 'Não informado'
  };
  const contCond = { a_vista: 0, financiamento_bancario: 0, parcelado_construtora: 0, '': 0 };
  filtradas.forEach(u => {
    const c = u.condicao || '';
    contCond[c] = (contCond[c] || 0) + 1;
  });
  document.getElementById('chart-condicao').innerHTML = Object.keys(mapCond).map(k => {
    const c = contCond[k] || 0;
    const p = qtdGeral > 0 ? Math.round((c / qtdGeral) * 100) : 0;
    return `
      <div class="bar-row">
        <span class="bar-label">${mapCond[k]}</span>
        <div class="bar-track"><div class="bar-fill sec" style="width:${p}%"></div></div>
        <span class="bar-val">${c} (${p}%)</span>
      </div>
    `;
  }).join('');

  // Gráfico 3: Evolução últimos 6 meses
  const hoje = new Date();
  const meses = [];
  for(let i = 5; i >= 0; i--){
    const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rotulo = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }).replace('.', '');
    meses.push({ chave, rotulo, qtd: 0 });
  }
  filtradas.forEach(u => {
    if(u.data && u.data.length >= 7){
      const m = u.data.substring(0, 7);
      const item = meses.find(x => x.chave === m);
      if(item) item.qtd++;
    }
  });
  const maxMes = Math.max(1, ...meses.map(m => m.qtd));
  document.getElementById('chart-evolucao').innerHTML = meses.map(m => {
    const p = Math.round((m.qtd / maxMes) * 100);
    return `
      <div class="bar-row">
        <span class="bar-label">${m.rotulo}</span>
        <div class="bar-track"><div class="bar-fill verde" style="width:${p}%"></div></div>
        <span class="bar-val">${m.qtd} un.</span>
      </div>
    `;
  }).join('');

  // Rankings Top 5 Corretores e Empresas
  const rankCorretor = {};
  const rankEmpresa = {};
  filtradas.forEach(u => {
    const v = Number(u.valor) || 0;
    if(u.corretor){
      rankCorretor[u.corretor] = (rankCorretor[u.corretor] || 0) + v;
    }
    if(u.empresa){
      rankEmpresa[u.empresa] = (rankEmpresa[u.empresa] || 0) + v;
    }
  });

  const topCorretores = Object.entries(rankCorretor).sort((a,b) => b[1] - a[1]).slice(0, 5);
  const topEmpresas = Object.entries(rankEmpresa).sort((a,b) => b[1] - a[1]).slice(0, 5);

  document.getElementById('dash-rankings').innerHTML = `
    <div class="ranking-col">
      <h4>Top Corretores</h4>
      ${topCorretores.length ? topCorretores.map(([nome, val], idx) => `
        <div class="rank-item">
          <span><strong>#${idx+1}</strong> ${nome}</span>
          <strong title="${formatarMoeda(val)}">${formatarMoedaCompacta(val)}</strong>
        </div>
      `).join('') : '<p class="rank-vazio">Sem dados no filtro</p>'}
    </div>
    <div class="ranking-col">
      <h4>Top Imobiliárias / Empresas</h4>
      ${topEmpresas.length ? topEmpresas.map(([nome, val], idx) => `
        <div class="rank-item">
          <span><strong>#${idx+1}</strong> ${nome}</span>
          <strong title="${formatarMoeda(val)}">${formatarMoedaCompacta(val)}</strong>
        </div>
      `).join('') : '<p class="rank-vazio">Sem dados no filtro</p>'}
    </div>
  `;

  // Tabela Últimas 10 Movimentações
  const movs = lista
    .filter(u => u.atualizadoEm)
    .sort((a, b) => new Date(b.atualizadoEm) - new Date(a.atualizadoEm))
    .slice(0, 10);

  const mapStatusNome = {
    disponivel: 'Disponível',
    reservada: 'Reservada',
    vendida: 'Vendida',
    permuta: 'Permuta'
  };

  document.getElementById('dash-ultimas-tbody').innerHTML = movs.length ? movs.map(u => `
    <tr>
      <td><strong>${u.id}</strong> (${u.andar}º)</td>
      <td>${u.bloqueado ? 'Bloqueada' : (mapStatusNome[u.status] || u.status)}</td>
      <td>${u.comprador || '—'}</td>
      <td>${[u.corretor, u.empresa].filter(Boolean).join(' / ') || '—'}</td>
      <td>${Number(u.valor) > 0 ? formatarMoeda(u.valor) : '—'}</td>
      <td>${u.atualizadoPor || '—'}</td>
      <td>${new Date(u.atualizadoEm).toLocaleString('pt-BR')}</td>
    </tr>
  `).join('') : `<tr><td colspan="7" style="text-align:center;">Nenhuma movimentação registrada até o momento.</td></tr>`;
}

// =====================================================
// 10. EXPORTAR CSV
// =====================================================
function exportarCSV(){
  const colunas = [
    'Unidade','Andar','Final','Area (m2)','Diferenciada','Status','Bloqueada','Motivo Bloqueio',
    'Assinatura','Comprador','Corretor','Empresa','Condicao','Valor (R$)','Data','Observacoes',
    'Atualizado Por','Atualizado Em'
  ];

  const linhas = [colunas.join(';')];
  Object.values(unidadesGlobais).sort((a,b) => a.id - b.id).forEach(u => {
    const vals = [
      u.id,
      u.andar,
      u.pos,
      String(u.area).replace('.', ','),
      ehDiferenciada(u.pos) ? 'Sim' : 'Não',
      u.status,
      u.bloqueado ? 'Sim' : 'Não',
      u.bloqueado ? (u.motivoBloqueio || '') : '',
      u.assinado || 'nao',
      `"${(u.comprador || '').replace(/"/g, '""')}"`,
      `"${(u.corretor || '').replace(/"/g, '""')}"`,
      `"${(u.empresa || '').replace(/"/g, '""')}"`,
      u.condicao || '',
      String(u.valor || 0).replace('.', ','),
      u.data || '',
      `"${(u.obs || '').replace(/"/g, '""')}"`,
      u.atualizadoPor || '',
      u.atualizadoEm ? new Date(u.atualizadoEm).toLocaleString('pt-BR') : ''
    ];
    linhas.push(vals.join(';'));
  });

  const blob = new Blob(['\uFEFF' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tryp-congonhas-unidades-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================
// 11. IMPORTAÇÃO DE PLANILHA (.XLSX / .CSV)
// =====================================================
let resultadosImportacao = [];

const MAPA_CABECALHO_IMPORT = {
  'id': 'id', 'unidade': 'id', 'numero': 'id', 'nº': 'id', 'apto': 'id',
  'status': 'status', 'situacao': 'status',
  'bloqueada': 'bloqueado', 'bloqueado': 'bloqueado', 'bloqueio': 'bloqueado',
  'motivobloqueio': 'motivoBloqueio', 'motivo': 'motivoBloqueio',
  'assinatura': 'assinado', 'assinado': 'assinado', 'contrato': 'assinado',
  'comprador': 'comprador', 'cliente': 'comprador', 'investidor': 'comprador',
  'corretor': 'corretor',
  'empresa': 'empresa', 'imobiliaria': 'empresa',
  'condicao': 'condicao', 'condicaodecompra': 'condicao', 'pagamento': 'condicao',
  'valor': 'valor', 'vgv': 'valor', 'preco': 'valor',
  'data': 'data', 'datavenda': 'data',
  'observacoes': 'obs', 'observacao': 'obs', 'obs': 'obs'
};

function normalizarChave(str){
  return String(str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function valorTexto(val){
  return val === undefined || val === null ? '' : String(val).trim();
}

function converterStatusImport(txt){
  const n = normalizarChave(txt);
  if(['disponivel','disp','livre'].includes(n)) return 'disponivel';
  if(['reservada','reservado','res'].includes(n)) return 'reservada';
  if(['vendida','vendido','vend'].includes(n)) return 'vendida';
  if(['permuta','perm'].includes(n)) return 'permuta';
  return null;
}

function converterBooleano(txt){
  const n = normalizarChave(txt);
  if(['sim','s','true','1','bloqueada','bloqueado'].includes(n)) return true;
  if(['nao','n','false','0','livre'].includes(n)) return false;
  return null;
}

function converterMotivoImport(txt){
  const n = normalizarChave(txt);
  if(n.includes('permuta')) return 'permuta';
  if(n.includes('reserva') || n.includes('tecnica')) return 'reserva_tecnica';
  if(n.includes('outro')) return 'outro';
  return null;
}

function converterAssinaturaImport(txt){
  const n = normalizarChave(txt);
  if(['sim','assinado','assinada','ok'].includes(n)) return 'sim';
  if(['pendente','aguardando'].includes(n)) return 'pendente';
  if(['nao','naoassinado','semassinatura'].includes(n)) return 'nao';
  return null;
}

function converterCondicaoImport(txt){
  const n = normalizarChave(txt);
  if(n.includes('vista')) return 'a_vista';
  if(n.includes('financ') || n.includes('banco') || n.includes('bancario')) return 'financiamento_bancario';
  if(n.includes('parcelado') || n.includes('construtora') || n.includes('direto')) return 'parcelado_construtora';
  return null;
}

function converterValorMonetario(val){
  if(typeof val === 'number') return val >= 0 ? val : null;
  let s = String(val || '').replace(/[R$\s]/gi, '').trim();
  if(!s) return null;
  if(s.includes(',') && s.includes('.')){
    s = s.replace(/\./g, '').replace(',', '.');
  } else if(s.includes(',')){
    s = s.replace(',', '.');
  }
  const num = Number(s);
  return isNaN(num) || num < 0 ? null : num;
}

function converterDataImport(val){
  if(typeof val === 'number'){
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    if(!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  const s = String(val || '').trim();
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if(m){
    const dia = m[1].padStart(2, '0');
    const mes = m[2].padStart(2, '0');
    const ano = m[3];
    return `${ano}-${mes}-${dia}`;
  }
  return null;
}

function processarLinha(linhaObj, numeroLinha){
  const camposMapeados = {};
  Object.keys(linhaObj).forEach(col => {
    const chavePadrao = MAPA_CABECALHO_IMPORT[normalizarChave(col)];
    if(chavePadrao){
      camposMapeados[chavePadrao] = linhaObj[col];
    }
  });

  const idBruto = valorTexto(camposMapeados.id);
  if(!idBruto){
    return { numeroLinha, idTexto: '—', ok: false, erro: 'Coluna ID em branco.' };
  }

  const idNum = parseInt(idBruto, 10);
  const uExistente = unidadesGlobais[idNum];
  if(!uExistente){
    return { numeroLinha, idTexto: idBruto, ok: false, erro: `Unidade ${idBruto} não existe no sistema.` };
  }

  const atualizacao = {};
  const resumoPartes = [];

  if(valorTexto(camposMapeados.status) !== ''){
    const st = converterStatusImport(camposMapeados.status);
    if(!st) return { numeroLinha, idTexto: idNum, ok: false, erro: `Status inválido: "${camposMapeados.status}"` };
    atualizacao.status = st;
    resumoPartes.push(`Status: ${st}`);
  }

  if(valorTexto(camposMapeados.bloqueado) !== ''){
    const bl = converterBooleano(camposMapeados.bloqueado);
    if(bl === null) return { numeroLinha, idTexto: idNum, ok: false, erro: `Valor de Bloqueada inválido: "${camposMapeados.bloqueado}"` };
    atualizacao.bloqueado = bl;
    resumoPartes.push(`Bloqueada: ${bl ? 'Sim' : 'Não'}`);
  }

  if(valorTexto(camposMapeados.motivoBloqueio) !== ''){
    const mt = converterMotivoImport(camposMapeados.motivoBloqueio);
    if(!mt) return { numeroLinha, idTexto: idNum, ok: false, erro: `Motivo de bloqueio inválido: "${camposMapeados.motivoBloqueio}"` };
    atualizacao.motivoBloqueio = mt;
  }

  if(valorTexto(camposMapeados.assinado) !== ''){
    const as = converterAssinaturaImport(camposMapeados.assinado);
    if(!as) return { numeroLinha, idTexto: idNum, ok: false, erro: `Assinatura inválida: "${camposMapeados.assinado}"` };
    atualizacao.assinado = as;
    resumoPartes.push(`Assinatura: ${as}`);
  }

  if(valorTexto(camposMapeados.comprador) !== ''){
    atualizacao.comprador = valorTexto(camposMapeados.comprador);
    resumoPartes.push(`Comprador: ${atualizacao.comprador}`);
  }

  if(valorTexto(camposMapeados.corretor) !== ''){
    atualizacao.corretor = valorTexto(camposMapeados.corretor);
    resumoPartes.push(`Corretor: ${atualizacao.corretor}`);
  }

  if(valorTexto(camposMapeados.empresa) !== ''){
    atualizacao.empresa = valorTexto(camposMapeados.empresa);
    resumoPartes.push(`Empresa: ${atualizacao.empresa}`);
  }

  if(valorTexto(camposMapeados.condicao) !== ''){
    const cd = converterCondicaoImport(camposMapeados.condicao);
    if(!cd) return { numeroLinha, idTexto: idNum, ok: false, erro: `Condição inválida: "${camposMapeados.condicao}"` };
    atualizacao.condicao = cd;
    resumoPartes.push(`Condição: ${cd}`);
  }

  if(valorTexto(camposMapeados.valor) !== ''){
    const vl = converterValorMonetario(camposMapeados.valor);
    if(vl === null) return { numeroLinha, idTexto: idNum, ok: false, erro: `Valor inválido: "${camposMapeados.valor}"` };
    atualizacao.valor = vl;
    resumoPartes.push(`Valor: ${formatarMoeda(vl)}`);
  }

  if(valorTexto(camposMapeados.data) !== ''){
    const dt = converterDataImport(camposMapeados.data);
    if(!dt) return { numeroLinha, idTexto: idNum, ok: false, erro: `Data inválida: "${camposMapeados.data}" (use dd/mm/aaaa)` };
    atualizacao.data = dt;
    resumoPartes.push(`Data: ${dt}`);
  }

  if(valorTexto(camposMapeados.obs) !== ''){
    atualizacao.obs = valorTexto(camposMapeados.obs);
    resumoPartes.push(`Obs atualizada`);
  }

  const statusFinal = atualizacao.status !== undefined ? atualizacao.status : uExistente.status;
  const bloqFinal = atualizacao.bloqueado !== undefined ? atualizacao.bloqueado : uExistente.bloqueado;
  if(bloqFinal && (statusFinal === 'vendida' || statusFinal === 'reservada')){
    return {
      numeroLinha,
      idTexto: idNum,
      ok: false,
      erro: 'Conflito: unidade bloqueada não pode ter status Vendida ou Reservada.'
    };
  }

  if(Object.keys(atualizacao).length === 0){
    return { numeroLinha, idTexto: idNum, ok: false, erro: 'Nenhum campo preenchido para atualizar nesta linha.' };
  }

  return {
    numeroLinha,
    idTexto: idNum,
    id: idNum,
    ok: true,
    atualizacao,
    resumo: resumoPartes.join(' • ')
  };
}

function abrirModalImportar(){
  resultadosImportacao = [];
  document.getElementById('input-arquivo-import').value = '';
  document.getElementById('import-preview-wrap').style.display = 'none';
  document.getElementById('btn-confirmar-importacao').disabled = true;
  document.getElementById('modal-importar').classList.add('open');
}

function fecharModalImportar(){
  document.getElementById('modal-importar').classList.remove('open');
}

function processarArquivoImportado(event){
  const file = event.target.files[0];
  if(!file) return;

  const reader = new FileReader();
  reader.onload = function(e){
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const primeiraAba = workbook.SheetNames[0];
      const sheet = workbook.Sheets[primeiraAba];
      const linhas = XLSX.utils.sheet_to_json(sheet, { defval: '' });

      resultadosImportacao = linhas.map((linha, idx) => processarLinha(linha, idx + 2));
      renderizarPreviewImportacao();
    } catch(err){
      alert('Não foi possível ler o arquivo selecionado. Verifique se é uma planilha válida (.xlsx ou .csv).');
    }
  };
  reader.readAsArrayBuffer(file);
}

function renderizarPreviewImportacao(){
  const wrap = document.getElementById('import-preview-wrap');
  const resumoEl = document.getElementById('import-resumo-texto');
  const corpoEl = document.getElementById('import-preview-corpo');
  const btnConfirmar = document.getElementById('btn-confirmar-importacao');

  const validas = resultadosImportacao.filter(r => r.ok);
  const erros = resultadosImportacao.filter(r => !r.ok);

  resumoEl.textContent = `${validas.length} linha(s) pronta(s) para importar • ${erros.length} linha(s) com observação/erro`;

  corpoEl.innerHTML = resultadosImportacao.map(r => `
    <tr>
      <td>#${r.numeroLinha}</td>
      <td><strong>${r.idTexto}</strong></td>
      <td style="font-weight:700;color:${r.ok ? 'var(--verde)' : 'var(--vermelho)'};">${r.ok ? 'OK' : 'Ignorada'}</td>
      <td>${r.ok ? r.resumo : r.erro}</td>
    </tr>
  `).join('');

  wrap.style.display = 'block';
  btnConfirmar.disabled = validas.length === 0;
}

function confirmarImportacao(){
  const validas = resultadosImportacao.filter(r => r.ok);
  if(!validas.length) return;

  if(!confirm(`Confirmar a atualização de ${validas.length} unidade(s) no sistema?`)){
    return;
  }

  const user = auth.currentUser;
  const emailAutor = user ? user.email : 'importacao';
  const agoraISO = new Date().toISOString();

  const multiUpdate = {};
  validas.forEach(item => {
    Object.entries(item.atualizacao).forEach(([campo, valor]) => {
      multiUpdate[`${item.id}/${campo}`] = valor;
    });
    multiUpdate[`${item.id}/atualizadoPor`] = emailAutor;
    multiUpdate[`${item.id}/atualizadoEm`] = agoraISO;
  });

  unidadesRef.update(multiUpdate).then(() => {
    alert(`${validas.length} unidade(s) atualizada(s) com sucesso!`);
    fecharModalImportar();
  }).catch(err => {
    alert('Erro ao gravar importação: ' + err.message);
  });
}

function baixarModeloPlanilha(){
  const colunas = ['ID','Status','Bloqueada','Motivo Bloqueio','Assinatura','Comprador','Corretor','Empresa','Condição','Valor','Data','Observações'];
  const exemplo1 = ['801','Vendida','Não','','Assinado','João da Silva','Maria Souza','Imobiliária XPTO','À vista','450000','15/03/2025','Pagamento à vista'];
  const exemplo2 = ['205','Reservada','Não','','Pendente','Carlos Lima','','','Financiamento bancário','380000','','Aguardando documentação'];
  const linhas = [colunas.join(';'), exemplo1.join(';'), exemplo2.join(';')];
  const csv = '\uFEFF' + linhas.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-importacao-tryp-congonhas.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// =====================================================
// 12. PLANTA DO PAVIMENTO — GRADE UNIFORME
// =====================================================
// Todas as unidades têm o mesmo tamanho e ficam alinhadas em colunas:
//   alas Norte e Sul ....... 64 x 128 px, passo 84 px (09 embaixo da 10, 08 embaixo da 11, ...)
//   coluna Oeste/Central ... 132 x 64 px, passo vertical 82 px
// Coordenadas em % da área de desenho (1150 x 637): [left, top, width, height].

// rótulos das áreas comuns, posicionados nas coordenadas medidas na prancha
const PLANTA_ROTULOS = [
  { classe: 'rot-circulacao', texto: 'Circulação residencial', left: 19.65, top: 30.46, w: 78.61, h: 4.4 },
  { classe: 'rot-circular-v', texto: 'Circulação',             left: 15.3,  top: 10.36, w: 3.65,  h: 87.29, vertical: true },
  { classe: 'rot-nucleo',     texto: 'Elevadores · escada',    left: 19.3,  top: 31.4,  w: 11.48, h: 14.13 },
  { classe: 'rot-tecnica',    texto: 'Área técnica',           left: 19.3,  top: 47.1,  w: 11.48, h: 7.85 }
];

const PLANTA_POSICOES = {"1": [34.26, 34.85, 5.57, 20.09], "2": [41.57, 34.85, 5.57, 20.09], "3": [48.87, 34.85, 5.57, 20.09], "4": [56.17, 34.85, 5.57, 20.09], "5": [63.48, 34.85, 5.57, 20.09], "6": [70.78, 34.85, 5.57, 20.09], "7": [78.09, 34.85, 5.57, 20.09], "8": [85.39, 34.85, 5.57, 20.09], "9": [92.7, 34.85, 5.57, 20.09], "10": [92.7, 10.36, 5.57, 20.09], "11": [85.39, 10.36, 5.57, 20.09], "12": [78.09, 10.36, 5.57, 20.09], "13": [70.78, 10.36, 5.57, 20.09], "14": [63.48, 10.36, 5.57, 20.09], "15": [56.17, 10.36, 5.57, 20.09], "16": [48.87, 10.36, 5.57, 20.09], "17": [41.57, 10.36, 5.57, 20.09], "18": [34.26, 10.36, 5.57, 20.09], "19": [26.96, 10.36, 5.57, 20.09], "20": [19.65, 10.36, 5.57, 20.09], "21": [3.48, 10.36, 11.48, 10.05], "22": [3.48, 23.23, 11.48, 10.05], "23": [3.48, 36.11, 11.48, 10.05], "24": [3.48, 48.98, 11.48, 10.05], "25": [3.48, 61.85, 11.48, 10.05], "26": [3.48, 74.73, 11.48, 10.05], "27": [3.48, 87.6, 11.48, 10.05], "28": [19.3, 87.6, 11.48, 10.05], "29": [19.3, 74.73, 11.48, 10.05], "30": [19.3, 61.85, 11.48, 10.05]};

// ala e posição de cada final dentro da ala (usado em tooltips)
const PLANTA_ALAS = {"21": ["Norte", 1, 12], "20": ["Norte", 2, 12], "19": ["Norte", 3, 12], "18": ["Norte", 4, 12], "17": ["Norte", 5, 12], "16": ["Norte", 6, 12], "15": ["Norte", 7, 12], "14": ["Norte", 8, 12], "13": ["Norte", 9, 12], "12": ["Norte", 10, 12], "11": ["Norte", 11, 12], "10": ["Norte", 12, 12], "22": ["Oeste", 1, 6], "23": ["Oeste", 2, 6], "24": ["Oeste", 3, 6], "25": ["Oeste", 4, 6], "26": ["Oeste", 5, 6], "27": ["Oeste", 6, 6], "30": ["Central", 1, 3], "29": ["Central", 2, 3], "28": ["Central", 3, 3], "1": ["Sul", 1, 9], "2": ["Sul", 2, 9], "3": ["Sul", 3, 9], "4": ["Sul", 4, 9], "5": ["Sul", 5, 9], "6": ["Sul", 6, 9], "7": ["Sul", 7, 9], "8": ["Sul", 8, 9], "9": ["Sul", 9, 9]};

const LABEL_STATUS_TABELA = {
  disponivel: 'Disponível',
  reservada: 'Reservada',
  vendida: 'Vendida',
  permuta: 'Permuta',
  bloqueada: 'Bloqueada'
};

const ORDINAL = ['1ª','2ª','3ª','4ª','5ª','6ª','7ª','8ª','9ª','10ª','11ª','12ª'];

const NOTAS_PLANTA = {
  21: 'canto noroeste, acima da 22',
  10: 'canto nordeste, junto ao Terraço 10',
  1: 'primeira unidade da ala sul',
  9: 'última unidade da ala sul, junto ao Terraço 09',
  27: 'canto sudoeste',
  30: 'encostada no núcleo (elevadores / escada / área técnica)'
};

function descreverPosicaoPlanta(pos){
  const ala = PLANTA_ALAS[Number(pos)];
  if(!ala) return { textoCurto: '—', textoCompleto: 'Posição não mapeada' };
  const ordinal = ORDINAL[ala[1]-1] || (ala[1] + 'ª');
  const nota = NOTAS_PLANTA[Number(pos)];
  return {
    textoCurto: ala[0] + ' • ' + ordinal,
    textoCompleto: 'Ala ' + ala[0] + ', ' + ordinal + ' de ' + ala[2] + (nota ? ' — ' + nota : '')
  };
}

function escaparHTML(valor){
  return String(valor === undefined || valor === null ? '' : valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function limparFiltrosPlanta(){
  document.getElementById('planta-andar').value = '8';
  document.getElementById('planta-status').value = 'todos';
  renderizarPlanta();
}

function renderizarPlanta(){
  const wrapper = document.getElementById('planta-wrapper');
  if(!wrapper) return;

  const andar = Number(document.getElementById('planta-andar').value) || 8;
  const fStatus = document.getElementById('planta-status').value;

  document.getElementById('planta-titulo-andar').textContent = andar + 'º Pavimento';

  const doAndar = [];
  for(let pos = 1; pos <= 30; pos++){
    const u = unidadesGlobais[andar * 100 + pos];
    if(u) doAndar.push(u);
  }

  if(!doAndar.length){
    wrapper.innerHTML = '<p class="tabela-vazia">Unidades do pavimento ainda não carregadas.</p>';
    return;
  }

  const passaFiltro = (u) => {
    if(fStatus === 'todos') return true;
    if(fStatus === 'bloqueada') return !!u.bloqueado;
    return !u.bloqueado && u.status === fStatus;
  };

  const hots = doAndar.map(u => {
    const caixa = PLANTA_POSICOES[u.pos];
    if(!caixa) return '';
    const chave = u.bloqueado ? 'bloqueada' : (u.status || 'disponivel');
    const dif = ehDiferenciada(u.pos);
    const visivel = passaFiltro(u);
    const posicao = descreverPosicaoPlanta(u.pos);
    const titulo = 'Unidade ' + u.id + ' (final ' + String(u.pos).padStart(2,'0') + ')\n' +
                   posicao.textoCompleto + '\n' + formatarArea(u.area) + ' — ' +
                   LABEL_STATUS_TABELA[chave] +
                   (u.comprador ? '\nComprador: ' + u.comprador : '') +
                   (Number(u.valor) > 0 ? '\nVGV: ' + formatarMoeda(u.valor) +
                     '  (R$ ' + formatarMoeda(Number(u.valor) / Number(u.area)).replace('R$ ', '') + '/m²)' : '');

    const compacto = caixa[2] < 4.4 || caixa[3] < 5.8 ? ' compacto' : '';
    return '<button type="button" class="planta-hot status-' + chave + (dif ? ' diferenciada' : '') + compacto +
      (visivel ? '' : ' fora-do-filtro') + '"' +
      ' style="left:' + caixa[0] + '%;top:' + caixa[1] + '%;width:' + caixa[2] + '%;height:' + caixa[3] + '%;"' +
      ' onclick="abrirModal(' + u.id + ')" title="' + escaparHTML(titulo) + '">' +
      '<span class="hot-num">' + String(u.pos).padStart(2,'0') + '</span>' +
      '<span class="hot-area">' + (Number(u.area) > 0 ? formatarArea(u.area) : '—') + '</span>' +
      '<span class="hot-id">' + u.id + '</span>' +
      '</button>';
  }).join('');

  const rotulos = PLANTA_ROTULOS.map(r =>
    '<span class="planta-rotulo ' + r.classe + (r.vertical ? ' vertical' : '') + '" style="left:' + r.left +
    '%;top:' + r.top + '%;width:' + r.w + '%;height:' + r.h + '%;">' + r.texto + '</span>'
  ).join('');

  wrapper.innerHTML =
    '<div class="planta-canvas">' + rotulos + hots + '</div>';

  const contagem = { disponivel: 0, reservada: 0, vendida: 0, permuta: 0, bloqueada: 0 };
  doAndar.forEach(u => {
    const chave = u.bloqueado ? 'bloqueada' : (u.status || 'disponivel');
    contagem[chave] = (contagem[chave] || 0) + 1;
  });
  const areaAndar = doAndar.reduce((acc, u) => acc + (Number(u.area) || 0), 0);
  const vgvAndar = doAndar.reduce((acc, u) => acc + (Number(u.valor) || 0), 0);

  document.getElementById('planta-resumo').innerHTML =
    '<span class="chip-resumo">' + andar + 'º pavimento: <strong>' + doAndar.length + '</strong> unidades</span>' +
    '<span class="chip-resumo">Área total: <strong>' + formatarArea(areaAndar) + '</strong></span>' +
    '<span class="chip-resumo">Metragem média: <strong>' + formatarArea(areaAndar / doAndar.length) + '</strong></span>' +
    '<span class="chip-resumo">Disponíveis: <strong>' + contagem.disponivel + '</strong></span>' +
    '<span class="chip-resumo">Reservadas: <strong>' + contagem.reservada + '</strong></span>' +
    '<span class="chip-resumo">Vendidas: <strong>' + contagem.vendida + '</strong></span>' +
    '<span class="chip-resumo">Permuta: <strong>' + contagem.permuta + '</strong> · Bloqueadas: <strong>' + contagem.bloqueada + '</strong></span>' +
    '<span class="chip-resumo">VGV no pavimento: <strong>' + formatarMoedaCompacta(vgvAndar) + '</strong></span>';
}
