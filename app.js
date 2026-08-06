// ===== CONFIGURAÇÃO DO FIREBASE (mesmo projeto do app de Gerenciamento de Leitos) =====
var firebaseConfig = {
  apiKey: "AIzaSyAQ_slPq5EJU0uIjlLegtahV3RAana4VM0",
  authDomain: "ps-paulo-sacramento.firebaseapp.com",
  projectId: "ps-paulo-sacramento",
  storageBucket: "ps-paulo-sacramento.firebasestorage.app",
  messagingSenderId: "544012275784",
  appId: "1:544012275784:web:5820f1275310bd56e9887d"
};
if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
var auth = firebase.auth();
var db = firebase.firestore();

// ===== HELPERS GERAIS =====
function g(id) { return document.getElementById(id); }
function esc(s) { return (s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
function escHtml(s) { return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function getLocalISO(d) {
    d = d ? new Date(d) : new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().substring(0, 16);
}
function agoraISO() { return new Date().toISOString(); }
function fmtDataHora(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--'; }
function fmtData(iso) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '--'; }
function minutosEntre(inicioISO, fimISO) {
    if (!inicioISO) return null;
    var ini = new Date(inicioISO).getTime();
    var fim = fimISO ? new Date(fimISO).getTime() : Date.now();
    return Math.max(0, Math.round((fim - ini) / 60000));
}
function fmtMin(min) {
    if (min == null) return '--';
    var h = Math.floor(min / 60), m = min % 60;
    return (h > 0 ? h + 'h ' : '') + m + 'm';
}
function classeTempo(decorridoMin, metaMin) {
    if (metaMin == null || decorridoMin == null) return 't-ok';
    var pct = decorridoMin / metaMin;
    if (pct < 0.7) return 't-ok';
    if (pct < 1) return 't-warn';
    if (pct < 1.3) return 't-alert';
    return 't-critical';
}

// ===== ESTAÇÕES DE TRABALHO (por computador/terminal, salvo em localStorage) =====
var ESTACOES = [
    { val: 'porta', txt: 'Médico da Porta' },
    { val: 'emerg_medico', txt: 'Emergência · Médico' },
    { val: 'emerg_enf', txt: 'Emergência · Enfermagem' },
    { val: 'laboratorio', txt: 'Laboratório' },
    { val: 'imagem', txt: 'Imagem (TC/RX)' }
];
function estacaoTxt(val) { var e = ESTACOES.find(function(x){ return x.val === val; }); return e ? e.txt : (val || '--'); }
function getEstacaoAtual() { return localStorage.getItem('protocolos_estacao') || ''; }
function setEstacaoAtual(val) {
    localStorage.setItem('protocolos_estacao', val);
    g('estacao-label').innerText = estacaoTxt(val);
    fecharTodosModais();
    renderFiltrosEstacao();
    renderView();
}
function abrirSeletorEstacao() {
    var atual = getEstacaoAtual();
    var h = '<div class="modal-header"><h3>Selecionar Estação</h3><button class="modal-close" onclick="fecharTodosModais()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
    h += '<div class="modal-body"><p style="font-size:12.5px;color:var(--text-secondary);">Escolha a função deste computador. Isso define o que aparece em destaque no painel. Pode ser trocado a qualquer momento.</p>';
    h += '<div class="estacao-choice-grid">';
    ESTACOES.forEach(function(e) {
        h += '<div class="estacao-choice' + (e.val === atual ? ' sel' : '') + '" onclick="setEstacaoAtual(\'' + e.val + '\')">';
        h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
        h += '<span>' + esc(e.txt) + '</span></div>';
    });
    h += '</div></div>';
    g('modal-estacao').innerHTML = h;
    abrirModal('modal-estacao');
}

// ===== AUTENTICAÇÃO =====
var usuarioAtual = null;
function fazerLogin() {
    var e = g('email').value, s = g('senha').value;
    var erroEl = g('login-erro');
    if (erroEl) erroEl.style.display = 'none';
    auth.signInWithEmailAndPassword(e, s).catch(function(error) {
        if (erroEl) { erroEl.innerText = 'Erro no login: ' + error.message; erroEl.style.display = 'block'; }
        else { alert('Erro no login: ' + error.message); }
    });
}
function fazerLogout() { auth.signOut(); }

auth.onAuthStateChanged(function(user) {
    var loginScreen = g('login-screen'), appContent = g('app-content');
    if (user) {
        usuarioAtual = { uid: user.uid, email: user.email };
        if (loginScreen) loginScreen.style.display = 'none';
        if (appContent) appContent.style.display = 'flex';
        g('estacao-label').innerText = getEstacaoAtual() ? estacaoTxt(getEstacaoAtual()) : 'Selecionar estação';
        renderFiltrosEstacao();
        iniciarBancoDeDados();
        if (!getEstacaoAtual()) abrirSeletorEstacao();
    } else {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (appContent) appContent.style.display = 'none';
        if (typeof unsubscribeProtocolos !== 'undefined' && unsubscribeProtocolos) unsubscribeProtocolos();
        usuarioAtual = null; protocolos = []; primeiraCarga = true;
    }
});

// ===== TEMPLATES CLÍNICOS DOS PROTOCOLOS =====
// Campos, ordem e metas de tempo replicados dos formulários institucionais Hapvida/NotreDame
// Intermédica ("Gerenciamento do Protocolo de Sepse Adulto", "Ficha de Monitoramento de Dor
// Torácica" + "Protocolo de Dor Torácica", "Protocolo AVC"). Metas sem número explícito no
// formulário original seguem diretrizes consolidadas (AHA/ACC para dor torácica, Surviving
// Sepsis Campaign para sepse).
var TIPOS = {
    sepse: {
        label: 'Sepse',
        labelReferencia: 'Horário de identificação dos critérios de alerta (SIRS/disfunção orgânica)',
        motivosExclusao: ['Sem suspeita ou confirmação de infecção após avaliação médica', 'Sem disfunção orgânica após o resultado do pacote sepse', 'Diagnóstico alternativo confirmado', 'Outro'],
        etapas: [
            { key: 'criterios_sirs', label: 'Critérios de alerta SIRS identificados', estacao: 'porta', tipoCampo: 'multi', obrigatoria: true, opcoes: ['T.ax. > 37,8°C', 'T.ax. < 36,0°C', 'FC > 90 bpm', 'FR > 20 rpm', 'Leucocitose > 12.000/mm³', 'Leucopenia < 4.000/mm³', '> 10% de células jovens (bastões)'] },
            { key: 'criterios_disfuncao', label: 'Critérios de disfunção orgânica identificados', estacao: 'porta', tipoCampo: 'multi', obrigatoria: true, opcoes: ['Hipotensão (PAS<90, PAM<65 ou queda de PA>40mmHg)', 'Oligúria (≤0,5mL/kg/h) ou creatinina >2mg/dL', 'PaO2/FiO2 <300 ou necessidade de O2 para SpO2>90%', 'Plaquetas <100.000/mm³ ou queda de 50% em 3 dias', 'Acidose metabólica inexplicável (BE≤5,0 e lactato acima do valor de referência)', 'Rebaixamento do nível de consciência, agitação, delirium', 'Aumento significativo de bilirrubinas (>2x o valor de referência)'] },
            { key: 'avaliacao_medica', label: 'Avaliação médica realizada, protocolo comunicado ao médico', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: true },
            { key: 'suspeita_infeccao', label: 'Suspeita ou confirmação de infecção presente', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: true },
            { key: 'hemoculturas', label: 'Coleta de hemocultura (pacote sepse 1ª hora)', estacao: 'laboratorio', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 60 },
            { key: 'lactato', label: 'Coleta de lactato (pacote sepse 1ª hora)', estacao: 'laboratorio', tipoCampo: 'valor', unidade: 'mg/dL', obrigatoria: true, metaMinutos: 60 },
            { key: 'foco_infeccioso', label: 'Foco infeccioso definido (pulmonar / urinário / abdominal / cutâneo / neurológico / outro)', estacao: 'emerg_medico', tipoCampo: 'valor', obrigatoria: true },
            { key: 'atb', label: 'Antibioticoterapia administrada (pacote sepse 1ª hora)', estacao: 'emerg_enf', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 60 },
            { key: 'disfuncao_pos_pacote', label: 'Disfunção orgânica reavaliada após o pacote sepse', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: true },
            { key: 'reposicao_volemica', label: 'Reposição volêmica 30mL/kg de cristaloides (peso / volume / solução)', estacao: 'emerg_enf', tipoCampo: 'valor', obrigatoria: false },
            { key: 'segundo_lactato', label: 'Segunda coleta de lactato (pós-ressuscitação volêmica)', estacao: 'laboratorio', tipoCampo: 'valor', unidade: 'mg/dL', obrigatoria: false },
            { key: 'vasopressor', label: 'Noradrenalina iniciada (se PAM <65mmHg após volume) e acesso central providenciado', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: false },
            { key: 'destino', label: 'Destino definido (UTI / Internação) e hospital de destino', estacao: 'emerg_medico', tipoCampo: 'valor', obrigatoria: true }
        ]
    },
    dor_toracica: {
        label: 'Dor Torácica',
        labelReferencia: 'Horário de início da dor',
        motivosExclusao: ['Diagnóstico não cardiológico confirmado', 'Dor resolvida sem alterações de ECG/marcadores', 'Outro'],
        etapas: [
            { key: 'eva', label: 'Escala de dor (EVA) registrada', estacao: 'emerg_enf', tipoCampo: 'valor', obrigatoria: true, metaMinutos: 10 },
            { key: 'atendimento_medico', label: 'Atendimento médico inicial realizado', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 10 },
            { key: 'ecg', label: 'ECG de 12 derivações realizado', estacao: 'emerg_enf', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 10 },
            { key: 'avaliacao_ecg', label: 'Avaliação do ECG', estacao: 'emerg_medico', tipoCampo: 'multi', obrigatoria: true, opcoes: ['ECG normal', 'Supra de ST ou BRE novo/provavelmente novo', 'Infra de ST (>0,5mm)', 'Inversão ou simetria de onda T', 'Onda Q patológica', 'Alterações dinâmicas do ST', 'Arritmias ameaçadoras à vida (FV, TV)'] },
            { key: 'diagnostico', label: 'Diagnóstico definido (IAM com Supra ST / IAM sem Supra ST / Angina Instável / Outro)', estacao: 'emerg_medico', tipoCampo: 'valor', obrigatoria: true },
            { key: 'sinais_alerta', label: 'Sinais de alerta e gravidade', estacao: 'emerg_medico', tipoCampo: 'multi', obrigatoria: false, opcoes: ['PA sistólica ≤90 e/ou diastólica <60mmHg', 'Sonolência e/ou confusão mental', 'Má perfusão periférica (sudorese, extremidades frias)', 'FR>24irpm, taquidispneico, sintomas de congestão', 'Dor torácica intensa (EVA 9 ou 10)', 'Arritmia grave (FC<50 ou >150bpm)'] },
            { key: 'aas', label: 'AAS administrado (se sem contraindicação)', estacao: 'emerg_enf', tipoCampo: 'checkbox', obrigatoria: true, metaMinutos: 10 },
            { key: 'troponina', label: 'Coleta de marcadores de necrose miocárdica (troponina)', estacao: 'laboratorio', tipoCampo: 'valor', obrigatoria: true, metaMinutos: 30 },
            { key: 'rx_torax', label: 'RX de tórax realizado', estacao: 'imagem', tipoCampo: 'checkbox', obrigatoria: false, metaMinutos: 30 },
            { key: 'telecardio', label: 'Conduta do TeleCardio recebida', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: false },
            { key: 'porta_agulha', label: 'Fibrinólise — horário de administração de Alteplase (porta-agulha)', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: false, metaMinutos: 30 },
            { key: 'porta_balao', label: 'Hemodinâmica — horário de abertura da artéria (porta-balão)', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: false, metaMinutos: 90 },
            { key: 'destino', label: 'Destino definido', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: true }
        ]
    },
    avc: {
        label: 'AVC',
        labelReferencia: 'Hora do último normal (confirmar tempo dos sintomas)',
        motivosExclusao: ['Hipótese diagnóstica de AVC não confirmada — investigar outras patologias', 'TC com sangue — seguir Protocolo de AVC Hemorrágico', 'Outro'],
        etapas: [
            { key: 'sinais_avc', label: 'Sinais de AVC identificados', estacao: 'porta', tipoCampo: 'multi', obrigatoria: true, opcoes: ['Perda de força/sensibilidade', 'Dificuldade de fala/compreensão', 'Desequilíbrio/incoordenação motora', 'Dificuldade visual', 'Confusão mental', 'Cefaleia intensa'] },
            { key: 'enfermagem_inicial', label: 'Cuidados iniciais de enfermagem (cabeceira 0°, sinais vitais, dextro, acesso venoso periférico)', estacao: 'emerg_enf', tipoCampo: 'checkbox', obrigatoria: true },
            { key: 'avaliacao_medica', label: 'Avaliação médica (confirmar tempo dos sintomas, solicitar exames, aplicar NIHSS)', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 10 },
            { key: 'nihss', label: 'NIHSS registrado', estacao: 'emerg_medico', tipoCampo: 'valor', obrigatoria: true, metaMinutos: 10 },
            { key: 'tc_cranio', label: 'TC de crânio sem contraste realizada', estacao: 'imagem', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 25 },
            { key: 'hd_confirmada', label: 'Hipótese diagnóstica de AVC confirmada', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 45 },
            { key: 'tc_com_sangue', label: 'TC com sangue avaliada (define AVC hemorrágico x isquêmico)', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: true },
            { key: 'contraindicacao_trombolise', label: 'Contraindicações para trombólise avaliadas', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: true },
            { key: 'trombolise', label: 'tPA EV 0,9mg/Kg administrado (se <4,5h, sem contraindicação) — porta-agulha', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: false, metaMinutos: 60 },
            { key: 'hemodinamica', label: 'Hemodinâmica/trombectomia considerada (janela 4,5–8h)', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: false },
            { key: 'terapia_alternativa', label: 'AAS + Profilaxia TEV + Estatina prescritos (se não elegível para trombólise/trombectomia)', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: false },
            { key: 'destino', label: 'Destino definido (Alta do PS / Internação UTI / Internação UI / Óbito)', estacao: 'emerg_medico', tipoCampo: 'valor', obrigatoria: true }
        ]
    }
};
var DESFECHOS = ['Internação UTI', 'Internação (Enfermaria/Unidade de Internação)', 'Alta', 'Transferência externa', 'Óbito', 'Outro'];
var CV_OPTIONS = ['PROPRIO', 'EXTERNO', 'PARTICULAR'];

function iconeTipo(tipo) {
    if (tipo === 'sepse') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v6M12 22v-6M4.9 4.9l4.2 4.2M14.9 14.9l4.2 4.2M2 12h6M16 12h6M4.9 19.1l4.2-4.2M14.9 9.1l4.2-4.2"/></svg>';
    if (tipo === 'dor_toracica') return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/><path d="M3 12h4l2-4 3 8 2-5h7"/></svg>';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v2A2.5 2.5 0 0 1 9.5 9 2.5 2.5 0 0 1 7 6.5v-2A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 15A2.5 2.5 0 0 1 17 17.5v2A2.5 2.5 0 0 1 14.5 22 2.5 2.5 0 0 1 12 19.5v-2A2.5 2.5 0 0 1 14.5 15Z"/><path d="M9 9v3a4 4 0 0 0 4 4h4"/></svg>';
}

// ===== ESTADO E CARREGAMENTO DO FIRESTORE =====
var protocolos = [];
var primeiraCarga = true;
var unsubscribeProtocolos = null;
var filtroTipo = 'all';
var filtroEstacao = 'all';
var viewAtual = 'andamento';

function iniciarBancoDeDados() {
    if (unsubscribeProtocolos) unsubscribeProtocolos();
    unsubscribeProtocolos = db.collection('protocolos').orderBy('criadoEm', 'desc').limit(400)
        .onSnapshot(function(snapshot) {
            if (!primeiraCarga) {
                snapshot.docChanges().forEach(function(change) {
                    if (change.type === 'added') {
                        var novo = Object.assign({ id: change.doc.id }, change.doc.data());
                        if (novo.criadoPor && usuarioAtual && novo.criadoPor.uid === usuarioAtual.uid) return;
                        notificarNovoProtocolo(novo);
                    }
                });
            }
            protocolos = snapshot.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
            primeiraCarga = false;
            renderView();
            if (modalDetalheAbertoId) renderDetalheProtocolo(modalDetalheAbertoId);
        }, function(err) { console.error('Erro ao carregar protocolos:', err); });
}

// ===== NOTIFICAÇÃO DE NOVO PROTOCOLO (toast + som, só com a aba aberta) =====
var audioCtxCompartilhado = null;
document.addEventListener('click', function initAudioOnce() {
    if (!audioCtxCompartilhado) { try { audioCtxCompartilhado = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
}, { once: true });

function tocarBeep() {
    try {
        var ctx = audioCtxCompartilhado || new (window.AudioContext || window.webkitAudioContext)();
        var o = ctx.createOscillator(), gn = ctx.createGain();
        o.type = 'sine'; o.frequency.value = 880;
        gn.gain.setValueAtTime(0.0001, ctx.currentTime);
        gn.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
        gn.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
        o.connect(gn); gn.connect(ctx.destination);
        o.start(); o.stop(ctx.currentTime + 0.45);
    } catch (e) {}
}

function mostrarToast(titulo, sub, onClick) {
    var wrap = g('toast-wrap');
    var el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>' +
        '<div><div class="toast-title">' + escHtml(titulo) + '</div><div class="toast-sub">' + escHtml(sub) + '</div></div>';
    el.onclick = function() { if (onClick) onClick(); el.remove(); };
    wrap.appendChild(el);
    setTimeout(function() { if (el.parentNode) el.remove(); }, 9000);
}

function notificarNovoProtocolo(p) {
    tocarBeep();
    var tipoInfo = TIPOS[p.tipo];
    var nomePac = (p.paciente && p.paciente.nome) ? p.paciente.nome : 'Paciente';
    var autor = p.criadoPor ? (p.criadoPor.email + (p.criadoPor.estacao ? ' — ' + estacaoTxt(p.criadoPor.estacao) : '')) : '';
    mostrarToast('Novo protocolo: ' + (tipoInfo ? tipoInfo.label : p.tipo), nomePac + (autor ? ' · aberto por ' + autor : ''), function() {
        mudarView('andamento'); abrirDetalheProtocolo(p.id);
    });
}

// ===== NAVEGAÇÃO ENTRE VIEWS =====
function mudarView(view) {
    viewAtual = view;
    document.querySelectorAll('.tab-btn').forEach(function(b) { b.classList.remove('active'); });
    g('tab-' + view).classList.add('active');
    g('view-andamento').style.display = view === 'andamento' ? 'flex' : 'none';
    g('view-andamento-cards').style.display = view === 'andamento' ? 'block' : 'none';
    g('view-relatorios').style.display = view === 'relatorios' ? 'flex' : 'none';
    g('btn-novo-protocolo').style.display = view === 'andamento' ? 'flex' : 'none';
    if (view === 'relatorios') renderRelatorios();
}

function renderView() {
    if (viewAtual === 'andamento') renderProtocolos();
    else renderRelatorios();
    atualizarContadores();
}

function atualizarContadores() {
    var ativos = protocolos.filter(function(p) { return p.status === 'ativo'; });
    g('tab-count-andamento').innerText = ativos.length;
    var porTipo = { sepse: 0, dor_toracica: 0, avc: 0 };
    ativos.forEach(function(p) { if (porTipo[p.tipo] != null) porTipo[p.tipo]++; });
    var h = '';
    h += '<span class="mc mc-sepse"><b>' + porTipo.sepse + '</b>Sepse</span>';
    h += '<span class="mc mc-dor_toracica"><b>' + porTipo.dor_toracica + '</b>Dor Torácica</span>';
    h += '<span class="mc mc-avc"><b>' + porTipo.avc + '</b>AVC</span>';
    g('mini-counters').innerHTML = h;
}

function renderFiltrosEstacao() {
    var h = '<button class="fb' + (filtroEstacao === 'all' ? ' on' : '') + '" onclick="filEstacao(this,\'all\')">Todas Estações</button>';
    ESTACOES.forEach(function(e) {
        h += '<button class="fb' + (filtroEstacao === e.val ? ' on' : '') + '" onclick="filEstacao(this,\'' + e.val + '\')">' + esc(e.txt) + '</button>';
    });
    g('filtros-estacao').innerHTML = h;
}
function filProtocolo(btn, tipo) {
    filtroTipo = tipo;
    document.querySelectorAll('#filtros-protocolo .fb').forEach(function(b) { b.classList.remove('on'); });
    btn.classList.add('on');
    renderProtocolos();
}
function filEstacao(btn, val) {
    filtroEstacao = val;
    document.querySelectorAll('#filtros-estacao .fb').forEach(function(b) { b.classList.remove('on'); });
    btn.classList.add('on');
    renderProtocolos();
}

// ===== DERIVAÇÃO DE ESTADO DE UM PROTOCOLO =====
function proximaEtapaPendente(p) {
    var lista = p.etapas || [];
    for (var i = 0; i < lista.length; i++) { if (!lista[i].feita) return lista[i]; }
    return null;
}
function localAtual(p) {
    var etapa = proximaEtapaPendente(p);
    if (!etapa) return 'Aguardando definição de destino';
    return estacaoTxt(etapa.estacao);
}
function progressoObrigatorias(p) {
    var lista = (p.etapas || []).filter(function(e) { return e.obrigatoria; });
    if (!lista.length) return 100;
    var feitas = lista.filter(function(e) { return e.feita; }).length;
    return Math.round((feitas / lista.length) * 100);
}
function urgenciaProtocolo(p) {
    var lista = p.etapas || [];
    for (var i = 0; i < lista.length; i++) {
        var e = lista[i];
        if (!e.feita && e.obrigatoria && e.metaMinutos != null) {
            return classeTempo(minutosEntre(p.criadoEm), e.metaMinutos);
        }
    }
    return 't-ok';
}

// ===== RENDERIZAÇÃO DO PAINEL "EM ANDAMENTO" =====
function renderProtocolos() {
    var lista = protocolos.filter(function(p) { return p.status === 'ativo'; });
    if (filtroTipo !== 'all') lista = lista.filter(function(p) { return p.tipo === filtroTipo; });
    if (filtroEstacao !== 'all') lista = lista.filter(function(p) { var e = proximaEtapaPendente(p); return e && e.estacao === filtroEstacao; });
    lista.sort(function(a, b) { return new Date(a.criadoEm) - new Date(b.criadoEm); });

    var wrap = g('lista-protocolos'), vazio = g('estado-vazio');
    if (!lista.length) { wrap.innerHTML = ''; vazio.style.display = 'flex'; return; }
    vazio.style.display = 'none';

    var h = '';
    lista.forEach(function(p) {
        var tipoInfo = TIPOS[p.tipo] || { label: p.tipo };
        var urg = urgenciaProtocolo(p);
        var decorrido = minutosEntre(p.criadoEm);
        var etapaPend = proximaEtapaPendente(p);
        var nome = (p.paciente && p.paciente.nome) ? p.paciente.nome.toUpperCase() : '(sem nome)';
        var idade = (p.paciente && p.paciente.idade) ? p.paciente.idade + ' anos' : '';
        var conv = (p.paciente && p.paciente.convenio) ? p.paciente.convenio : '';
        h += '<div class="protocolo-card tipo-' + p.tipo + '" onclick="abrirDetalheProtocolo(\'' + p.id + '\')">';
        h += '<div class="pc-head"><span class="pc-tipo-badge tipo-' + p.tipo + '">' + esc(tipoInfo.label) + '</span>';
        h += '<span class="pc-tempo ' + urg + '"><span class="dot"></span>' + fmtMin(decorrido) + '</span></div>';
        h += '<div class="pc-body">';
        h += '<div class="pc-nome">' + escHtml(nome) + '</div>';
        h += '<div class="pc-sub">' + escHtml([idade, conv].filter(Boolean).join(' · ') || '—') + '</div>';
        h += '<div class="pc-local"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>' + esc(localAtual(p)) + '</div>';
        h += '<div class="pc-proxima">Próxima ação: <b>' + esc(etapaPend ? etapaPend.label : 'Concluído') + '</b></div>';
        h += '<div class="pc-progress-wrap"><div class="pc-progress-fill" style="width:' + progressoObrigatorias(p) + '%;"></div></div>';
        h += '</div></div>';
    });
    wrap.innerHTML = h;
}

// ===== MODAL: ABRIR NOVO PROTOCOLO =====
function abrirModalNovoProtocolo() {
    var h = '<div class="modal-header"><h3>Abrir Novo Protocolo</h3><button class="modal-close" onclick="fecharTodosModais()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
    h += '<div class="modal-body" id="novo-protocolo-body">';
    h += '<div class="tipo-choice-grid">';
    ['sepse', 'dor_toracica', 'avc'].forEach(function(t) {
        h += '<div class="tipo-choice tipo-' + t + '" onclick="selecionarTipoNovoProtocolo(\'' + t + '\')">' + iconeTipo(t) + '<span>' + esc(TIPOS[t].label) + '</span></div>';
    });
    h += '</div></div>';
    g('modal-novo-protocolo').innerHTML = h;
    abrirModal('modal-novo-protocolo');
}

function selecionarTipoNovoProtocolo(tipo) {
    var tipoInfo = TIPOS[tipo];
    var h = '<div class="field"><label>Nome completo do paciente</label><input type="text" id="np-nome" placeholder="Nome do paciente"></div>';
    h += '<div class="field-row">';
    h += '<div class="field"><label>Idade</label><input type="number" id="np-idade" min="0" max="130"></div>';
    h += '<div class="field"><label>Sexo</label><select id="np-sexo"><option value="M">Masculino</option><option value="F">Feminino</option></select></div>';
    h += '</div><div class="field-row">';
    h += '<div class="field"><label>Prontuário</label><input type="text" id="np-prontuario"></div>';
    h += '<div class="field"><label>Convênio</label><select id="np-convenio">' + CV_OPTIONS.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('') + '</select></div>';
    h += '</div>';
    h += '<div class="field"><label>Leito/Sala atual (opcional)</label><input type="text" id="np-leito"></div>';
    h += '<div class="field"><label>' + esc(tipoInfo.labelReferencia) + '</label><input type="datetime-local" id="np-referencia" value="' + getLocalISO() + '"></div>';
    var body = g('novo-protocolo-body');
    body.innerHTML = h;
    body.dataset.tipo = tipo;
    var footer = document.createElement('div');
    footer.className = 'modal-footer';
    footer.innerHTML = '<button class="btn-padrao" onclick="abrirModalNovoProtocolo()">Voltar</button><button class="btn-padrao btn-primary" onclick="salvarNovoProtocolo()">Abrir Protocolo</button>';
    var existente = g('modal-novo-protocolo').querySelector('.modal-footer');
    if (existente) existente.remove();
    g('modal-novo-protocolo').appendChild(footer);
}

function salvarNovoProtocolo() {
    var tipo = g('novo-protocolo-body').dataset.tipo;
    var nome = g('np-nome').value.trim();
    if (!nome) { alert('Informe o nome do paciente.'); return; }
    if (!getEstacaoAtual()) { alert('Selecione a estação de trabalho antes de continuar.'); abrirSeletorEstacao(); return; }
    var tipoInfo = TIPOS[tipo];
    var etapas = tipoInfo.etapas.map(function(e) {
        return { key: e.key, label: e.label, estacao: e.estacao, tipoCampo: e.tipoCampo, unidade: e.unidade || null, opcoes: e.opcoes || null, obrigatoria: e.obrigatoria, metaMinutos: e.metaMinutos != null ? e.metaMinutos : null, feita: false, valor: null, horario: null, feitaPor: null, feitaEm: null };
    });
    var agora = agoraISO();
    var doc = {
        tipo: tipo,
        paciente: {
            nome: nome,
            idade: g('np-idade').value || '',
            sexo: g('np-sexo').value,
            prontuario: g('np-prontuario').value || '',
            convenio: g('np-convenio').value,
            leito: g('np-leito').value || ''
        },
        status: 'ativo',
        horaReferencia: g('np-referencia').value ? new Date(g('np-referencia').value).toISOString() : agora,
        criadoEm: agora,
        criadoPor: { uid: usuarioAtual.uid, email: usuarioAtual.email, estacao: getEstacaoAtual() },
        etapas: etapas,
        timeline: [{ ts: agora, autor: usuarioAtual.email, estacao: getEstacaoAtual(), texto: 'Protocolo de ' + tipoInfo.label + ' aberto.' }],
        finalizadoEm: null, finalizadoPor: null, desfecho: null, canceladoMotivo: null, pdfGeradoEm: null
    };
    db.collection('protocolos').add(doc).then(function(ref) {
        fecharTodosModais();
        mostrarToast('Protocolo aberto', tipoInfo.label + ' — ' + nome);
        setTimeout(function() { abrirDetalheProtocolo(ref.id); }, 200);
    }).catch(function(err) { alert('Erro ao criar protocolo: ' + err.message); });
}

// ===== MODAL: DETALHE DO PROTOCOLO =====
var modalDetalheAbertoId = null;
function abrirDetalheProtocolo(id) {
    modalDetalheAbertoId = id;
    renderDetalheProtocolo(id);
    abrirModal('modal-detalhe');
}
function protocoloPorId(id) { return protocolos.find(function(p) { return p.id === id; }); }

function renderDetalheProtocolo(id) {
    var p = protocoloPorId(id);
    if (!p) return;
    var tipoInfo = TIPOS[p.tipo] || { label: p.tipo, etapas: [] };
    var nome = (p.paciente && p.paciente.nome) ? p.paciente.nome.toUpperCase() : '(sem nome)';
    var sub = [(p.paciente && p.paciente.idade ? p.paciente.idade + ' anos' : ''), (p.paciente && p.paciente.sexo), (p.paciente && p.paciente.convenio), (p.paciente && p.paciente.prontuario ? 'Pront. ' + p.paciente.prontuario : '')].filter(Boolean).join(' · ');

    var h = '<div class="modal-header"><h3>' + esc(tipoInfo.label) + '</h3><button class="modal-close" onclick="fecharTodosModais()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
    h += '<div class="modal-body">';
    h += '<div class="detalhe-head"><div><div class="detalhe-nome">' + escHtml(nome) + '</div><div class="detalhe-sub">' + escHtml(sub || '—') + '</div>';
    h += '<div class="detalhe-sub">Aberto em ' + fmtDataHora(p.criadoEm) + ' por ' + escHtml(p.criadoPor ? p.criadoPor.email : '--') + (p.criadoPor && p.criadoPor.estacao ? ' (' + esc(estacaoTxt(p.criadoPor.estacao)) + ')' : '') + '</div>';
    h += '<div class="detalhe-sub">' + esc(tipoInfo.labelReferencia) + ': ' + fmtDataHora(p.horaReferencia) + '</div></div>';
    var decorrido = minutosEntre(p.criadoEm);
    h += '<div class="timer-chip ' + urgenciaProtocolo(p) + '"><span>Tempo de porta</span><b>' + fmtMin(decorrido) + '</b></div>';
    h += '</div>';

    if (p.status === 'ativo') {
        h += '<div class="checklist">';
        (p.etapas || []).forEach(function(e, idx) { h += renderEtapaItem(p, e, idx); });
        h += '</div>';

        h += '<div class="field"><label>Adicionar observação</label><div style="display:flex;gap:8px;">';
        h += '<textarea id="obs-texto" placeholder="Anotação livre sobre a evolução do caso..." style="flex:1;"></textarea>';
        h += '</div><button class="btn-padrao" style="align-self:flex-start;" onclick="adicionarObservacao(\'' + p.id + '\')">Adicionar à linha do tempo</button></div>';
    } else {
        h += '<div class="field"><label>Desfecho</label><input type="text" value="' + esc(p.desfecho || p.canceladoMotivo || '--') + '" disabled></div>';
    }

    h += '<div class="field"><label>Linha do tempo</label><div class="timeline-list">';
    var tl = (p.timeline || []).slice().reverse();
    if (!tl.length) h += '<div class="timeline-item">Sem eventos registrados.</div>';
    tl.forEach(function(t) {
        h += '<div class="timeline-item"><span class="tl-ts">' + fmtDataHora(t.ts) + '</span> — <b>' + escHtml(t.autor || '') + '</b>' + (t.estacao ? ' (' + esc(estacaoTxt(t.estacao)) + ')' : '') + ': ' + escHtml(t.texto) + '</div>';
    });
    h += '</div></div>';
    h += '</div>';

    if (p.status === 'ativo') {
        h += '<div class="modal-footer" style="justify-content:space-between;">';
        h += '<button class="btn-padrao btn-danger" onclick="abrirModalCancelar(\'' + p.id + '\')">Cancelar protocolo</button>';
        h += '<button class="btn-padrao btn-primary" onclick="abrirModalFinalizar(\'' + p.id + '\')">Finalizar protocolo</button>';
        h += '</div>';
    } else {
        h += '<div class="modal-footer" style="justify-content:space-between;">';
        h += '<span class="detalhe-sub">Status: ' + (p.status === 'finalizado' ? 'Finalizado' : 'Cancelado') + (p.finalizadoEm ? ' em ' + fmtDataHora(p.finalizadoEm) : '') + '</span>';
        h += '<button class="btn-padrao" onclick="reimprimirPDF(\'' + p.id + '\')">Ver / Imprimir PDF</button>';
        h += '</div>';
    }

    g('modal-detalhe').innerHTML = h;
}

function renderEtapaItem(p, e, idx) {
    var decorrido = minutosEntre(p.criadoEm);
    var cls = classeTempo(decorrido, e.metaMinutos);
    var h = '<div class="etapa-item' + (e.feita ? ' feita' : '') + '">';
    h += '<div class="etapa-check" onclick="' + (e.feita ? 'desfazerEtapa' : 'marcarEtapaRapida') + '(\'' + p.id + '\',' + idx + ')">';
    h += e.feita ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' : '';
    h += '</div><div class="etapa-main">';
    h += '<div class="etapa-label">' + escHtml(e.label) + (e.obrigatoria ? '' : ' <span class="etapa-tag">opcional</span>') + '</div>';
    h += '<div class="etapa-meta"><span class="etapa-tag">' + esc(estacaoTxt(e.estacao)) + '</span>';
    if (e.metaMinutos != null && !e.feita) h += '<span class="etapa-meta-time timer-chip ' + cls + '" style="padding:1px 8px;border:none;background:transparent;">meta ' + fmtMin(e.metaMinutos) + '</span>';
    h += '</div>';

    if (!e.feita) {
        if (e.tipoCampo === 'multi') {
            h += '<div class="etapa-multi-list">';
            (e.opcoes || []).forEach(function(op, opIdx) {
                h += '<label class="etapa-multi-opt"><input type="checkbox" id="multi-' + idx + '-' + opIdx + '" value="' + esc(op) + '"> ' + escHtml(op) + '</label>';
            });
            h += '</div><div class="etapa-valor-row"><button class="etapa-btn-mini primary" onclick="salvarEtapaMulti(\'' + p.id + '\',' + idx + ')">Confirmar seleção</button></div>';
        } else if (e.tipoCampo === 'valor') {
            h += '<div class="etapa-valor-row"><input type="text" id="valor-' + idx + '" placeholder="' + (e.unidade ? 'Valor (' + esc(e.unidade) + ')' : 'Valor') + '">';
            h += '<button class="etapa-btn-mini primary" onclick="salvarEtapaValor(\'' + p.id + '\',' + idx + ')">Salvar</button></div>';
        } else if (e.tipoCampo === 'horario') {
            h += '<div class="etapa-valor-row"><input type="datetime-local" id="horario-' + idx + '" value="' + getLocalISO() + '">';
            h += '<button class="etapa-btn-mini primary" onclick="salvarEtapaHorario(\'' + p.id + '\',' + idx + ')">Registrar</button></div>';
        } else {
            h += '<div class="etapa-valor-row"><button class="etapa-btn-mini primary" onclick="marcarEtapaRapida(\'' + p.id + '\',' + idx + ')">Marcar feito agora</button></div>';
        }
    } else {
        var infoValor = e.valor ? (e.valor + (e.unidade ? ' ' + e.unidade : '')) : (e.horario ? fmtDataHora(e.horario) : 'Concluído');
        h += '<div class="etapa-feita-info">' + escHtml(infoValor) + ' — registrado por ' + escHtml(e.feitaPor || '--') + ' às ' + fmtDataHora(e.feitaEm) +
            '<span class="etapa-desfazer" onclick="desfazerEtapa(\'' + p.id + '\',' + idx + ')">desfazer</span></div>';
    }
    h += '</div></div>';
    return h;
}

function atualizarEtapa(protocoloId, idx, mudancas, textoTimeline) {
    var p = protocoloPorId(protocoloId);
    if (!p) return;
    var etapas = p.etapas.slice();
    etapas[idx] = Object.assign({}, etapas[idx], mudancas);
    var agora = agoraISO();
    var timeline = (p.timeline || []).concat([{ ts: agora, autor: usuarioAtual.email, estacao: getEstacaoAtual(), texto: textoTimeline }]);
    db.collection('protocolos').doc(protocoloId).update({ etapas: etapas, timeline: timeline }).catch(function(err) { alert('Erro ao atualizar: ' + err.message); });
}

function marcarEtapaRapida(protocoloId, idx) {
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, feitaEm: agoraISO(), feitaPor: usuarioAtual.email }, 'Concluiu: ' + e.label);
}
function salvarEtapaValor(protocoloId, idx) {
    var input = g('valor-' + idx); var valor = input.value.trim();
    if (!valor) { input.focus(); return; }
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, valor: valor, feitaEm: agoraISO(), feitaPor: usuarioAtual.email }, e.label + ': ' + valor + (e.unidade ? ' ' + e.unidade : ''));
}
function salvarEtapaMulti(protocoloId, idx) {
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    var selecionados = [];
    (e.opcoes || []).forEach(function(op, opIdx) {
        var chk = g('multi-' + idx + '-' + opIdx);
        if (chk && chk.checked) selecionados.push(op);
    });
    var valor = selecionados.length ? selecionados.join('; ') : 'Nenhum critério presente';
    atualizarEtapa(protocoloId, idx, { feita: true, valor: valor, feitaEm: agoraISO(), feitaPor: usuarioAtual.email }, e.label + ': ' + valor);
}
function salvarEtapaHorario(protocoloId, idx) {
    var input = g('horario-' + idx); if (!input.value) { input.focus(); return; }
    var horarioISO = new Date(input.value).toISOString();
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, horario: horarioISO, feitaEm: agoraISO(), feitaPor: usuarioAtual.email }, e.label + ' registrado às ' + fmtDataHora(horarioISO));
}
function desfazerEtapa(protocoloId, idx) {
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    if (!confirm('Desfazer o registro de "' + e.label + '"?')) return;
    atualizarEtapa(protocoloId, idx, { feita: false, valor: null, horario: null, feitaEm: null, feitaPor: null }, 'Desfez o registro de: ' + e.label);
}

function adicionarObservacao(protocoloId) {
    var texto = g('obs-texto').value.trim();
    if (!texto) return;
    var p = protocoloPorId(protocoloId);
    var agora = agoraISO();
    var timeline = (p.timeline || []).concat([{ ts: agora, autor: usuarioAtual.email, estacao: getEstacaoAtual(), texto: texto }]);
    db.collection('protocolos').doc(protocoloId).update({ timeline: timeline }).then(function() { g('obs-texto').value = ''; });
}

function abrirModalCancelar(protocoloId) {
    var p = protocoloPorId(protocoloId);
    var tipoInfo = TIPOS[p.tipo] || { motivosExclusao: ['Outro'] };
    var h = '<div class="modal-header"><h3>Cancelar / Excluir Protocolo</h3><button class="modal-close" onclick="fecharTodosModais()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
    h += '<div class="modal-body">';
    h += '<div class="field"><label>Motivo da exclusão do protocolo</label><select id="canc-motivo" onchange="document.getElementById(\'canc-outro-wrap\').style.display = this.value===\'Outro\'?\'flex\':\'none\';">';
    h += tipoInfo.motivosExclusao.map(function(m) { return '<option value="' + esc(m) + '">' + escHtml(m) + '</option>'; }).join('');
    h += '</select></div>';
    h += '<div class="field" id="canc-outro-wrap" style="display:none;"><label>Descreva o motivo</label><textarea id="canc-outro-texto" placeholder="Motivo do cancelamento..."></textarea></div>';
    h += '</div><div class="modal-footer"><button class="btn-padrao" onclick="fecharTodosModais()">Voltar</button><button class="btn-padrao btn-danger" onclick="confirmarCancelamento(\'' + protocoloId + '\')">Excluir Protocolo</button></div>';
    g('modal-finalizar').innerHTML = h;
    abrirModal('modal-finalizar');
}
function confirmarCancelamento(protocoloId) {
    var selecionado = g('canc-motivo').value;
    var motivo = selecionado === 'Outro' ? g('canc-outro-texto').value.trim() : selecionado;
    if (!motivo) { g('canc-outro-texto').focus(); return; }
    var p = protocoloPorId(protocoloId);
    var agora = agoraISO();
    var timeline = (p.timeline || []).concat([{ ts: agora, autor: usuarioAtual.email, estacao: getEstacaoAtual(), texto: 'Protocolo cancelado: ' + motivo }]);
    db.collection('protocolos').doc(protocoloId).update({ status: 'cancelado', canceladoMotivo: motivo, finalizadoEm: agora, finalizadoPor: usuarioAtual.email, timeline: timeline })
        .then(function() { fecharTodosModais(); mostrarToast('Protocolo cancelado', motivo); });
}

// ===== MODAL: FINALIZAR PROTOCOLO =====
function abrirModalFinalizar(protocoloId) {
    var h = '<div class="modal-header"><h3>Finalizar Protocolo</h3><button class="modal-close" onclick="fecharTodosModais()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
    h += '<div class="modal-body">';
    h += '<div class="field"><label>Desfecho</label><select id="fin-desfecho">' + DESFECHOS.map(function(d) { return '<option value="' + d + '">' + d + '</option>'; }).join('') + '</select></div>';
    h += '<div class="field"><label>Observação final (opcional)</label><textarea id="fin-obs" placeholder="Resumo final do caso..."></textarea></div>';
    h += '<p style="font-size:11.5px;color:var(--text-tertiary);">Ao confirmar, o protocolo será encerrado, um PDF será gerado com todos os dados registrados e uma janela de impressão será aberta. Se uma pasta de arquivamento estiver configurada, o PDF também será salvo automaticamente nela.</p>';
    h += '</div><div class="modal-footer"><button class="btn-padrao" onclick="fecharTodosModais()">Voltar</button><button class="btn-padrao btn-primary" onclick="finalizarProtocolo(\'' + protocoloId + '\')">Concluir e Gerar PDF</button></div>';
    g('modal-finalizar').innerHTML = h;
    abrirModal('modal-finalizar');
}

function finalizarProtocolo(protocoloId) {
    var p = protocoloPorId(protocoloId);
    var desfecho = g('fin-desfecho').value;
    var obsFinal = g('fin-obs').value.trim();
    var agora = agoraISO();
    var pFinal = JSON.parse(JSON.stringify(p));
    pFinal.status = 'finalizado'; pFinal.finalizadoEm = agora; pFinal.finalizadoPor = usuarioAtual.email; pFinal.desfecho = desfecho;
    if (obsFinal) pFinal.timeline = (pFinal.timeline || []).concat([{ ts: agora, autor: usuarioAtual.email, estacao: getEstacaoAtual(), texto: 'Observação final: ' + obsFinal }]);
    pFinal.timeline = (pFinal.timeline || []).concat([{ ts: agora, autor: usuarioAtual.email, estacao: getEstacaoAtual(), texto: 'Protocolo finalizado. Desfecho: ' + desfecho }]);

    gerarPDFProtocolo(pFinal).then(function(doc) {
        try { window.open(doc.output('bloburl'), '_blank'); } catch (e) { console.warn('Não foi possível abrir o PDF automaticamente.', e); }
        db.collection('protocolos').doc(protocoloId).update({ status: 'finalizado', finalizadoEm: agora, finalizadoPor: usuarioAtual.email, desfecho: desfecho, timeline: pFinal.timeline, pdfGeradoEm: agora })
            .then(function() { fecharTodosModais(); mostrarToast('Protocolo finalizado', 'PDF gerado e ' + (getPastaArquivoNome() ? 'salvo na pasta configurada' : 'baixado') + '.'); });
        salvarPDF(doc, nomeArquivoPDF(pFinal));
    });
}

function reimprimirPDF(protocoloId) {
    var p = protocoloPorId(protocoloId);
    gerarPDFProtocolo(p).then(function(doc) { window.open(doc.output('bloburl'), '_blank'); });
}

// ===== GERAÇÃO DE PDF (jsPDF) =====
var logoBase64Cache = null;
function carregarLogoBase64() {
    if (logoBase64Cache) return Promise.resolve(logoBase64Cache);
    return new Promise(function(resolve) {
        var img = new Image();
        img.onload = function() {
            try {
                var canvas = document.createElement('canvas');
                canvas.width = img.width; canvas.height = img.height;
                canvas.getContext('2d').drawImage(img, 0, 0);
                logoBase64Cache = canvas.toDataURL('image/png');
            } catch (e) { logoBase64Cache = null; }
            resolve(logoBase64Cache);
        };
        img.onerror = function() { resolve(null); };
        img.src = 'logo.png';
    });
}
function nomeArquivoPDF(p) {
    var tipoInfo = TIPOS[p.tipo] || { label: p.tipo };
    var nome = ((p.paciente && p.paciente.nome) || 'paciente').replace(/[^a-zA-Z0-9]+/g, '_');
    var data = (p.finalizadoEm || p.criadoEm || agoraISO()).substring(0, 10);
    return 'Protocolo_' + tipoInfo.label.replace(/\s+/g, '') + '_' + nome + '_' + data + '.pdf';
}

function gerarPDFProtocolo(p) {
    return carregarLogoBase64().then(function(logo) {
        var tipoInfo = TIPOS[p.tipo] || { label: p.tipo, etapas: [] };
        var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
        var pageW = doc.internal.pageSize.getWidth();
        var margin = 40, y = margin;

        if (logo) { try { doc.addImage(logo, 'PNG', margin, y, 90, 32); } catch (e) {} }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text('HOSPITAL PAULO SACRAMENTO', pageW - margin, y + 10, { align: 'right' });
        doc.setFontSize(10); doc.setFont('helvetica', 'normal');
        doc.text('Pronto Socorro — Protocolo Gerenciado de ' + tipoInfo.label, pageW - margin, y + 24, { align: 'right' });
        y += 48;
        doc.setDrawColor(0); doc.setLineWidth(1); doc.line(margin, y, pageW - margin, y);
        y += 20;

        var nome = (p.paciente && p.paciente.nome) ? p.paciente.nome.toUpperCase() : '--';
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(nome, margin, y); y += 16;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
        var infoPac = [
            'Idade: ' + ((p.paciente && p.paciente.idade) || '--'),
            'Sexo: ' + ((p.paciente && p.paciente.sexo) || '--'),
            'Convênio: ' + ((p.paciente && p.paciente.convenio) || '--'),
            'Prontuário: ' + ((p.paciente && p.paciente.prontuario) || '--'),
            'Leito/Sala: ' + ((p.paciente && p.paciente.leito) || '--')
        ];
        doc.text(infoPac.join('    '), margin, y); y += 14;
        doc.text(tipoInfo.labelReferencia + ': ' + fmtDataHora(p.horaReferencia), margin, y); y += 12;
        doc.text('Abertura do protocolo (porta): ' + fmtDataHora(p.criadoEm) + ' por ' + (p.criadoPor ? p.criadoPor.email : '--'), margin, y); y += 12;
        if (p.status !== 'ativo') { doc.text('Encerramento: ' + fmtDataHora(p.finalizadoEm) + ' — Desfecho: ' + (p.desfecho || p.canceladoMotivo || '--'), margin, y); y += 12; }
        y += 8;

        y = desenharTabela(doc, margin, y, pageW - margin * 2,
            ['Etapa', 'Responsável', 'Meta', 'Registrado', 'Dentro da meta'],
            [0.4, 0.16, 0.1, 0.2, 0.14],
            (p.etapas || []).map(function(e) {
                var registrado = e.feita ? (e.valor ? (e.valor + (e.unidade ? ' ' + e.unidade : '')) : fmtDataHora(e.horario || e.feitaEm)) : (e.obrigatoria ? 'Pendente' : 'Não se aplicou');
                var dentroMeta = '--';
                if (e.feita && e.metaMinutos != null) {
                    var min = minutosEntre(p.criadoEm, e.horario || e.feitaEm);
                    dentroMeta = min <= e.metaMinutos ? 'Sim (' + min + 'min)' : 'Não (' + min + 'min)';
                }
                return [e.label, estacaoTxt(e.estacao), e.metaMinutos != null ? fmtMin(e.metaMinutos) : '--', registrado, dentroMeta];
            }), 'CHECKLIST DO PROTOCOLO');

        y = desenharTabela(doc, margin, y, pageW - margin * 2, ['Data/Hora', 'Autor', 'Registro'], [0.2, 0.25, 0.55],
            (p.timeline || []).map(function(t) { return [fmtDataHora(t.ts), t.autor + (t.estacao ? ' (' + estacaoTxt(t.estacao) + ')' : ''), t.texto]; }), 'LINHA DO TEMPO');

        if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = margin; }
        y += 30;
        doc.setDrawColor(0); doc.line(margin, y, margin + 200, y); doc.line(pageW - margin - 200, y, pageW - margin, y);
        doc.setFontSize(9);
        doc.text('Assinatura do médico responsável', margin, y + 12);
        doc.text('Assinatura do enfermeiro responsável', pageW - margin - 200, y + 12);

        return doc;
    });
}

function desenharTabela(doc, x, y, larguraTotal, headers, proporcoes, linhas, titulo) {
    var pageH = doc.internal.pageSize.getHeight(), margin = x;
    if (titulo) {
        if (y > pageH - 80) { doc.addPage(); y = margin; }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5);
        doc.text(titulo, x, y); y += 6;
        doc.setDrawColor(0); doc.line(x, y, x + larguraTotal, y); y += 12;
    }
    var colWidths = proporcoes.map(function(p) { return larguraTotal * p; });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5);
    var colX = x;
    headers.forEach(function(hTxt, i) { doc.text(hTxt.toUpperCase(), colX, y); colX += colWidths[i]; });
    y += 4; doc.setDrawColor(150); doc.line(x, y, x + larguraTotal, y); y += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);

    if (!linhas.length) { doc.text('Sem registros.', x, y); return y + 16; }

    linhas.forEach(function(linha) {
        var celTexts = linha.map(function(txt, i) { return doc.splitTextToSize(String(txt || '--'), colWidths[i] - 6); });
        var maxLinhas = Math.max.apply(null, celTexts.map(function(c) { return c.length; }));
        var alturaLinha = maxLinhas * 10 + 4;
        if (y + alturaLinha > pageH - 60) { doc.addPage(); y = margin; }
        var cx = x;
        celTexts.forEach(function(c, i) { doc.text(c, cx, y); cx += colWidths[i]; });
        y += alturaLinha;
        doc.setDrawColor(225); doc.line(x, y - 3, x + larguraTotal, y - 3);
    });
    return y + 14;
}

// ===== ARQUIVAMENTO EM PASTA (File System Access API + IndexedDB) =====
function idbAbrir() {
    return new Promise(function(resolve, reject) {
        var req = indexedDB.open('protocolos_fs_db', 1);
        req.onupgradeneeded = function() { req.result.createObjectStore('handles'); };
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}
function idbGet(key) {
    return idbAbrir().then(function(dbi) { return new Promise(function(resolve, reject) {
        var req = dbi.transaction('handles', 'readonly').objectStore('handles').get(key);
        req.onsuccess = function() { resolve(req.result); }; req.onerror = function() { reject(req.error); };
    }); });
}
function idbSet(key, value) {
    return idbAbrir().then(function(dbi) { return new Promise(function(resolve, reject) {
        var tx = dbi.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(value, key);
        tx.oncomplete = function() { resolve(); }; tx.onerror = function() { reject(tx.error); };
    }); });
}
var pastaArquivoNomeCache = localStorage.getItem('protocolos_pasta_nome') || '';
function getPastaArquivoNome() { return pastaArquivoNomeCache; }

function configurarPastaArquivo() {
    if (!window.showDirectoryPicker) { alert('Este navegador não suporta salvar diretamente em uma pasta. Os PDFs serão baixados normalmente e podem ser movidos manualmente para a pasta de arquivamento.'); return; }
    window.showDirectoryPicker({ mode: 'readwrite' }).then(function(handle) {
        return idbSet('pastaArquivo', handle).then(function() {
            pastaArquivoNomeCache = handle.name;
            localStorage.setItem('protocolos_pasta_nome', handle.name);
            alert('Pasta de arquivamento configurada: ' + handle.name);
        });
    }).catch(function(err) { if (err && err.name !== 'AbortError') console.error(err); });
}

function salvarPDF(doc, nomeArquivo) {
    if (!window.showDirectoryPicker) { doc.save(nomeArquivo); return; }
    idbGet('pastaArquivo').then(function(handle) {
        if (!handle) { doc.save(nomeArquivo); return; }
        return handle.queryPermission({ mode: 'readwrite' }).then(function(perm) {
            if (perm === 'granted') return true;
            return handle.requestPermission({ mode: 'readwrite' }).then(function(p2) { return p2 === 'granted'; });
        }).then(function(ok) {
            if (!ok) { doc.save(nomeArquivo); return; }
            return handle.getFileHandle(nomeArquivo, { create: true })
                .then(function(fileHandle) { return fileHandle.createWritable(); })
                .then(function(writable) { return writable.write(doc.output('blob')).then(function() { return writable.close(); }); });
        });
    }).catch(function(err) { console.error('Erro ao salvar na pasta configurada, baixando normalmente:', err); doc.save(nomeArquivo); });
}

// ===== RELATÓRIOS =====
function renderRelatorios() {
    var wrap = g('view-relatorios');
    var hoje = getLocalISO().substring(0, 10);
    var mesPassado = getLocalISO(new Date(Date.now() - 30 * 86400000)).substring(0, 10);
    var h = '<div class="rel-filters">';
    h += '<div class="rel-filter-field"><label>De</label><input type="date" id="rel-de" value="' + mesPassado + '"></div>';
    h += '<div class="rel-filter-field"><label>Até</label><input type="date" id="rel-ate" value="' + hoje + '"></div>';
    h += '<div class="rel-filter-field"><label>Tipo</label><select id="rel-tipo"><option value="all">Todos</option><option value="sepse">Sepse</option><option value="dor_toracica">Dor Torácica</option><option value="avc">AVC</option></select></div>';
    h += '<button class="btn-padrao btn-primary" onclick="aplicarFiltroRelatorio()">Filtrar</button>';
    h += '<button class="btn-padrao" onclick="exportarCSVRelatorio()">Exportar CSV</button>';
    h += '<button class="btn-padrao" onclick="window.print()">Imprimir</button>';
    h += '</div><div id="rel-resultado"></div>';
    wrap.innerHTML = h;
    aplicarFiltroRelatorio();
}

function protocolosFiltradosRelatorio() {
    var de = g('rel-de') ? g('rel-de').value : null;
    var ate = g('rel-ate') ? g('rel-ate').value : null;
    var tipo = g('rel-tipo') ? g('rel-tipo').value : 'all';
    return protocolos.filter(function(p) {
        if (p.status === 'ativo') return false;
        var dataP = (p.criadoEm || '').substring(0, 10);
        if (de && dataP < de) return false;
        if (ate && dataP > ate) return false;
        if (tipo !== 'all' && p.tipo !== tipo) return false;
        return true;
    });
}

function aplicarFiltroRelatorio() {
    var lista = protocolosFiltradosRelatorio();
    var porTipo = { sepse: [], dor_toracica: [], avc: [] };
    lista.forEach(function(p) { if (porTipo[p.tipo]) porTipo[p.tipo].push(p); });
    var obitos = lista.filter(function(p) { return p.desfecho === 'Óbito'; }).length;
    var altas = lista.filter(function(p) { return p.desfecho === 'Alta'; }).length;

    var h = '<div class="rel-stats-grid">';
    h += '<div class="rel-stat-card"><span>Total no período</span><b>' + lista.length + '</b></div>';
    h += '<div class="rel-stat-card"><span>Sepse</span><b>' + porTipo.sepse.length + '</b></div>';
    h += '<div class="rel-stat-card"><span>Dor Torácica</span><b>' + porTipo.dor_toracica.length + '</b></div>';
    h += '<div class="rel-stat-card"><span>AVC</span><b>' + porTipo.avc.length + '</b></div>';
    h += '<div class="rel-stat-card"><span>Altas</span><b>' + altas + '</b></div>';
    h += '<div class="rel-stat-card"><span>Óbitos</span><b>' + obitos + '</b></div>';
    h += '</div>';

    ['sepse', 'dor_toracica', 'avc'].forEach(function(tipo) {
        var grupo = porTipo[tipo];
        if (!grupo.length) return;
        h += '<div class="rel-section"><h4>' + TIPOS[tipo].label + ' — adesão às metas e tempos médios</h4>';
        TIPOS[tipo].etapas.filter(function(e) { return e.metaMinutos != null; }).forEach(function(etapaDef) {
            var registros = [];
            grupo.forEach(function(p) {
                var e = (p.etapas || []).find(function(x) { return x.key === etapaDef.key; });
                if (e && e.feita) registros.push(minutosEntre(p.criadoEm, e.horario || e.feitaEm));
            });
            var dentro = registros.filter(function(min) { return min <= etapaDef.metaMinutos; }).length;
            var pct = registros.length ? Math.round((dentro / registros.length) * 100) : 0;
            var media = registros.length ? Math.round(registros.reduce(function(a, b) { return a + b; }, 0) / registros.length) : null;
            h += '<div class="rel-bar-row"><span class="rel-bar-label">' + esc(etapaDef.label) + '</span>';
            h += '<div class="rel-bar-track"><div class="rel-bar-fill" style="width:' + pct + '%;"></div></div>';
            h += '<span class="rel-bar-val">' + pct + '%</span>';
            h += '<span class="rel-bar-val" title="tempo médio">' + (media != null ? fmtMin(media) : '--') + '</span></div>';
        });
        h += '</div>';
    });

    h += '<div class="rel-section"><h4>Protocolos no período</h4><div class="rel-table-wrap"><table class="rel-table"><thead><tr><th>Tipo</th><th>Paciente</th><th>Abertura</th><th>Encerramento</th><th>Desfecho</th></tr></thead><tbody>';
    lista.sort(function(a, b) { return new Date(b.criadoEm) - new Date(a.criadoEm); }).forEach(function(p) {
        h += '<tr><td>' + TIPOS[p.tipo].label + '</td><td>' + escHtml((p.paciente && p.paciente.nome) || '--') + '</td><td>' + fmtDataHora(p.criadoEm) + '</td><td>' + fmtDataHora(p.finalizadoEm) + '</td><td>' + escHtml(p.desfecho || p.canceladoMotivo || '--') + '</td></tr>';
    });
    h += '</tbody></table></div></div>';

    g('rel-resultado').innerHTML = h;
}

function exportarCSVRelatorio() {
    var lista = protocolosFiltradosRelatorio();
    var linhas = [['Tipo', 'Paciente', 'Idade', 'Convenio', 'Abertura', 'Encerramento', 'Desfecho']];
    lista.forEach(function(p) {
        linhas.push([TIPOS[p.tipo].label, (p.paciente && p.paciente.nome) || '', (p.paciente && p.paciente.idade) || '', (p.paciente && p.paciente.convenio) || '', fmtDataHora(p.criadoEm), fmtDataHora(p.finalizadoEm), p.desfecho || p.canceladoMotivo || '']);
    });
    var csv = linhas.map(function(l) { return l.map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(';'); }).join('\n');
    var blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'relatorio_protocolos_' + getLocalISO().substring(0, 10) + '.csv';
    a.click();
}

// ===== SISTEMA DE MODAIS (genérico) =====
function abrirModal(id) {
    g('modal-backdrop').classList.add('open');
    document.querySelectorAll('.modal-box').forEach(function(m) { m.classList.remove('open'); });
    g(id).classList.add('open');
}
function fecharTodosModais() {
    g('modal-backdrop').classList.remove('open');
    document.querySelectorAll('.modal-box').forEach(function(m) { m.classList.remove('open'); });
    modalDetalheAbertoId = null;
}

// ===== RELÓGIO DO CABEÇALHO E ATUALIZAÇÃO PERIÓDICA DOS TIMERS =====
function atualizarRelogio() {
    var now = new Date();
    if (g('HD')) g('HD').innerText = now.toLocaleDateString('pt-BR');
    if (g('HT')) g('HT').innerText = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
setInterval(function() {
    atualizarRelogio();
    if (usuarioAtual && viewAtual === 'andamento') renderProtocolos();
    if (usuarioAtual && modalDetalheAbertoId) renderDetalheProtocolo(modalDetalheAbertoId);
}, 30000);
atualizarRelogio();
