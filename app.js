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

// Identifica esta aba/terminal (várias estações podem compartilhar o mesmo login) para não notificar quem acabou de abrir o protocolo, mas notificar todas as outras abas.
var SESSAO_ID = 's_' + Math.random().toString(36).slice(2) + '_' + Date.now();

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
    { val: 'emerg_medico', txt: 'Médico' },
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
function nomeDe(pessoa) {
    if (!pessoa) return '--';
    return pessoa.nome ? (pessoa.nome + (pessoa.cargo ? ' (' + pessoa.cargo + ')' : '')) : (pessoa.email || '--');
}
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

function mostrarCadastro() { g('login-box-login').style.display = 'none'; g('login-box-cadastro').style.display = 'block'; }
function mostrarLogin() { g('login-box-cadastro').style.display = 'none'; g('login-box-login').style.display = 'block'; }

function cadastrarProfissional() {
    var nome = g('cad-nome').value.trim();
    var cargo = g('cad-cargo').value.trim();
    var email = g('cad-email').value.trim();
    var senha = g('cad-senha').value;
    var erroEl = g('cadastro-erro');
    if (erroEl) erroEl.style.display = 'none';
    if (!nome || !cargo || !email || !senha) {
        if (erroEl) { erroEl.innerText = 'Preencha todos os campos.'; erroEl.style.display = 'block'; }
        return;
    }
    auth.createUserWithEmailAndPassword(email, senha).then(function(cred) {
        var uid = cred.user.uid;
        return db.collection('profissionais').doc(uid).set({ nome: nome, cargo: cargo, email: email, criadoEm: agoraISO() })
            .then(function() { return cred.user.updateProfile({ displayName: nome }).catch(function() {}); })
            .then(function() { return carregarPerfilProfissional(uid); });
    }).catch(function(error) {
        if (erroEl) { erroEl.innerText = 'Erro no cadastro: ' + error.message; erroEl.style.display = 'block'; }
        else { alert('Erro no cadastro: ' + error.message); }
    });
}

function carregarPerfilProfissional(uid) {
    return db.collection('profissionais').doc(uid).get().then(function(doc) {
        if (!doc.exists) return;
        var d = doc.data();
        if (!usuarioAtual || usuarioAtual.uid !== uid) usuarioAtual = { uid: uid, email: d.email };
        usuarioAtual.nome = d.nome;
        usuarioAtual.cargo = d.cargo;
        atualizarBadgeUsuario();
    }).catch(function(err) { console.error('Erro ao carregar perfil do profissional:', err); });
}

function atualizarBadgeUsuario() {
    var el = g('usuario-badge');
    if (!el || !usuarioAtual) return;
    var nome = usuarioAtual.nome || usuarioAtual.email;
    var sub = [usuarioAtual.cargo, usuarioAtual.email].filter(Boolean).join(' · ');
    el.innerHTML = '<div class="usuario-badge-nome">' + escHtml(nome) + '</div><div class="usuario-badge-sub">' + escHtml(sub) + '</div>';
}

auth.onAuthStateChanged(function(user) {
    var loginScreen = g('login-screen'), appContent = g('app-content');
    if (user) {
        if (!usuarioAtual || usuarioAtual.uid !== user.uid) usuarioAtual = { uid: user.uid, email: user.email };
        atualizarBadgeUsuario();
        carregarPerfilProfissional(user.uid);
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
            { key: 'criterios_sirs', label: 'Critérios de alerta SIRS identificados', estacao: 'emerg_medico', tipoCampo: 'multi', obrigatoria: true, opcoes: ['T.ax. > 37,8°C', 'T.ax. < 36,0°C', 'FC > 90 bpm', 'FR > 20 rpm', 'Leucocitose > 12.000/mm³', 'Leucopenia < 4.000/mm³', '> 10% de células jovens (bastões)'] },
            { key: 'criterios_disfuncao', label: 'Critérios de disfunção orgânica identificados', estacao: 'emerg_medico', tipoCampo: 'multi', obrigatoria: true, opcoes: ['Hipotensão (PAS<90, PAM<65 ou queda de PA>40mmHg)', 'Oligúria (<=0,5mL/kg/h) ou creatinina >2mg/dL', 'PaO2/FiO2 <300 ou necessidade de O2 para SpO2>90%', 'Plaquetas <100.000/mm³ ou queda de 50% em 3 dias', 'Acidose metabólica inexplicável (BE<=5,0, lactato elevado)', 'Rebaixamento do nível de consciência, agitação, delirium', 'Aumento significativo de bilirrubinas (>2x o valor de referência)'] },
            { key: 'avaliacao_medica', label: 'Avaliação médica realizada, protocolo comunicado ao médico', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: true },
            { key: 'suspeita_infeccao', label: 'Suspeita ou confirmação de infecção presente', estacao: 'emerg_medico', tipoCampo: 'decisao', obrigatoria: true, motivoDescarte: 'Sem suspeita ou confirmação de infecção após avaliação médica' },
            { key: 'foco_infeccioso', label: 'Foco infeccioso presumido', estacao: 'emerg_medico', tipoCampo: 'select', obrigatoria: true, opcoes: ['Pulmonar', 'Urinário', 'Abdominal', 'Cutâneo', 'Neurológico', 'Outro'] },
            { key: 'atb_prescrito', label: 'Antibiótico prescrito', estacao: 'emerg_medico', tipoCampo: 'valor_horario', obrigatoria: true, placeholder: 'Nome do antibiótico' },
            { key: 'hemoculturas', label: 'Coleta de hemocultura (pacote sepse 1ª hora)', estacao: 'laboratorio', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 60 },
            { key: 'lactato', label: 'Coleta de lactato (pacote sepse 1ª hora)', estacao: 'laboratorio', tipoCampo: 'valor', unidade: 'mg/dL', obrigatoria: true, metaMinutos: 60 },
            { key: 'atb', label: 'Antibioticoterapia administrada (pacote sepse 1ª hora)', estacao: 'emerg_enf', tipoCampo: 'horario', obrigatoria: true, metaMinutos: 60 },
            { key: 'disfuncao_pos_pacote', label: 'Há disfunção orgânica após o resultado do pacote sepse?', estacao: 'emerg_medico', tipoCampo: 'decisao', obrigatoria: true, rotuloPositivo: 'Sim', rotuloNegativo: 'Não', motivoDescarte: 'Sem disfunção orgânica após o resultado do pacote sepse' },
            { key: 'reposicao_volemica', label: 'Reposição volêmica 30mL/kg de cristaloides (peso / volume / solução)', estacao: 'emerg_enf', tipoCampo: 'valor', obrigatoria: false, metaMinutos: 180 },
            { key: 'segundo_lactato', label: 'Segunda coleta de lactato (pós-ressuscitação volêmica)', estacao: 'laboratorio', tipoCampo: 'valor', unidade: 'mg/dL', obrigatoria: false },
            { key: 'vasopressor', label: 'Noradrenalina iniciada (se PAM <65mmHg após volume) e acesso central providenciado', estacao: 'emerg_medico', tipoCampo: 'checkbox', obrigatoria: false },
            { key: 'destino', label: 'Destino definido', estacao: 'emerg_medico', tipoCampo: 'select_horario', obrigatoria: true, opcoes: ['UTI', 'Internação'] }
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
            { key: 'avaliacao_ecg', label: 'Avaliação do ECG', estacao: 'emerg_medico', tipoCampo: 'multi', obrigatoria: true, metaMinutos: 15, opcoes: ['ECG normal', 'Supra de ST ou BRE novo/provavelmente novo', 'Infra de ST (>0,5mm)', 'Inversão ou simetria de onda T', 'Onda Q patológica', 'Alterações dinâmicas do ST', 'Arritmias ameaçadoras à vida (FV, TV)'] },
            { key: 'diagnostico', label: 'Diagnóstico definido (IAM com Supra ST / IAM sem Supra ST / Angina Instável / Outro)', estacao: 'emerg_medico', tipoCampo: 'valor', obrigatoria: true },
            { key: 'sinais_alerta', label: 'Sinais de alerta e gravidade', estacao: 'emerg_medico', tipoCampo: 'multi', obrigatoria: false, opcoes: ['PA sistólica <=90 e/ou diastólica <60mmHg', 'Sonolência e/ou confusão mental', 'Má perfusão periférica (sudorese, extremidades frias)', 'FR>24irpm, taquidispneico, sintomas de congestão', 'Dor torácica intensa (EVA 9 ou 10)', 'Arritmia grave (FC<50 ou >150bpm)'] },
            { key: 'aas', label: 'AAS administrado (se sem contraindicação)', estacao: 'emerg_enf', tipoCampo: 'checkbox', obrigatoria: true, metaMinutos: 10 },
            { key: 'troponina', label: 'Coleta de marcadores de necrose miocárdica (troponina)', estacao: 'laboratorio', tipoCampo: 'valor', obrigatoria: true, metaMinutos: 30 },
            { key: 'rx_torax', label: 'RX de tórax realizado', estacao: 'imagem', tipoCampo: 'checkbox', obrigatoria: false, metaMinutos: 30 },
            { key: 'telecardio', label: 'Conduta do TeleCardio recebida', estacao: 'emerg_medico', tipoCampo: 'horario', obrigatoria: false, metaMinutos: 30 },
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
            { key: 'sinais_avc', label: 'Sinais de AVC identificados', estacao: 'emerg_medico', tipoCampo: 'multi', obrigatoria: true, opcoes: ['Perda de força/sensibilidade', 'Dificuldade de fala/compreensão', 'Desequilíbrio/incoordenação motora', 'Dificuldade visual', 'Confusão mental', 'Cefaleia intensa'] },
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
                        if (novo.criadoPor && novo.criadoPor.sessaoId === SESSAO_ID) return;
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
    var autor = p.criadoPor ? (nomeDe(p.criadoPor) + (p.criadoPor.estacao ? ' — ' + estacaoTxt(p.criadoPor.estacao) : '')) : '';
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
        criadoPor: { uid: usuarioAtual.uid, email: usuarioAtual.email, nome: usuarioAtual.nome || null, cargo: usuarioAtual.cargo || null, estacao: getEstacaoAtual(), sessaoId: SESSAO_ID },
        etapas: etapas,
        timeline: [{ ts: agora, autor: nomeDe(usuarioAtual), estacao: getEstacaoAtual(), texto: 'Protocolo de ' + tipoInfo.label + ' aberto.' }],
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
    h += '<div class="detalhe-sub">Aberto em ' + fmtDataHora(p.criadoEm) + ' por ' + escHtml(p.criadoPor ? nomeDe(p.criadoPor) : '--') + (p.criadoPor && p.criadoPor.estacao ? ' (' + esc(estacaoTxt(p.criadoPor.estacao)) + ')' : '') + '</div>';
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
        } else if (e.tipoCampo === 'decisao') {
            h += '<div class="etapa-valor-row"><button class="etapa-btn-mini success" onclick="confirmarEtapaDecisao(\'' + p.id + '\',' + idx + ')">' + escHtml(e.rotuloPositivo || 'Confirmada') + '</button>';
            h += '<button class="etapa-btn-mini danger" onclick="descartarEtapaDecisao(\'' + p.id + '\',' + idx + ')">' + escHtml(e.rotuloNegativo || 'Descartada') + '</button></div>';
        } else if (e.tipoCampo === 'select') {
            h += '<div class="etapa-valor-row"><select id="select-' + idx + '" onchange="document.getElementById(\'outro-wrap-' + idx + '\').style.display = this.value===\'Outro\'?\'flex\':\'none\';">';
            h += '<option value="" selected disabled>Selecione...</option>';
            (e.opcoes || []).forEach(function(op) { h += '<option value="' + esc(op) + '">' + escHtml(op) + '</option>'; });
            h += '</select><button class="etapa-btn-mini primary" onclick="salvarEtapaSelect(\'' + p.id + '\',' + idx + ')">Salvar</button></div>';
            h += '<div class="etapa-valor-row" id="outro-wrap-' + idx + '" style="display:none;"><input type="text" id="outro-' + idx + '" placeholder="Especifique"></div>';
        } else if (e.tipoCampo === 'select_horario') {
            h += '<div class="etapa-valor-row"><select id="select-' + idx + '">';
            h += '<option value="" selected disabled>Selecione...</option>';
            (e.opcoes || []).forEach(function(op) { h += '<option value="' + esc(op) + '">' + escHtml(op) + '</option>'; });
            h += '</select></div>';
            h += '<div class="etapa-valor-row"><input type="datetime-local" id="horario-' + idx + '" value="' + getLocalISO() + '">';
            h += '<button class="etapa-btn-mini primary" onclick="salvarEtapaSelectHorario(\'' + p.id + '\',' + idx + ')">Registrar</button></div>';
        } else if (e.tipoCampo === 'valor_horario') {
            h += '<div class="etapa-valor-row"><input type="text" id="valor-' + idx + '" placeholder="' + esc(e.placeholder || 'Valor') + '"></div>';
            h += '<div class="etapa-valor-row"><input type="datetime-local" id="horario-' + idx + '" value="' + getLocalISO() + '">';
            h += '<button class="etapa-btn-mini primary" onclick="salvarEtapaValorHorario(\'' + p.id + '\',' + idx + ')">Registrar</button></div>';
        } else {
            h += '<div class="etapa-valor-row"><button class="etapa-btn-mini primary" onclick="marcarEtapaRapida(\'' + p.id + '\',' + idx + ')">Marcar feito agora</button></div>';
        }
    } else {
        var infoValor = e.valor && e.horario ? (e.valor + ' — ' + fmtDataHora(e.horario)) : e.valor ? (e.valor + (e.unidade ? ' ' + e.unidade : '')) : (e.horario ? fmtDataHora(e.horario) : 'Concluído');
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
    var timeline = (p.timeline || []).concat([{ ts: agora, autor: nomeDe(usuarioAtual), estacao: getEstacaoAtual(), texto: textoTimeline }]);
    db.collection('protocolos').doc(protocoloId).update({ etapas: etapas, timeline: timeline }).catch(function(err) { alert('Erro ao atualizar: ' + err.message); });
}

function marcarEtapaRapida(protocoloId, idx) {
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, feitaEm: agoraISO(), feitaPor: nomeDe(usuarioAtual) }, 'Concluiu: ' + e.label);
}
function salvarEtapaValor(protocoloId, idx) {
    var input = g('valor-' + idx); var valor = input.value.trim();
    if (!valor) { input.focus(); return; }
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, valor: valor, feitaEm: agoraISO(), feitaPor: nomeDe(usuarioAtual) }, e.label + ': ' + valor + (e.unidade ? ' ' + e.unidade : ''));
}
function salvarEtapaMulti(protocoloId, idx) {
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    var selecionados = [];
    (e.opcoes || []).forEach(function(op, opIdx) {
        var chk = g('multi-' + idx + '-' + opIdx);
        if (chk && chk.checked) selecionados.push(op);
    });
    var valor = selecionados.length ? selecionados.join('; ') : 'Nenhum critério presente';
    atualizarEtapa(protocoloId, idx, { feita: true, valor: valor, feitaEm: agoraISO(), feitaPor: nomeDe(usuarioAtual) }, e.label + ': ' + valor);
}
function salvarEtapaHorario(protocoloId, idx) {
    var input = g('horario-' + idx); if (!input.value) { input.focus(); return; }
    var horarioISO = new Date(input.value).toISOString();
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, horario: horarioISO, feitaEm: agoraISO(), feitaPor: nomeDe(usuarioAtual) }, e.label + ' registrado às ' + fmtDataHora(horarioISO));
}
function confirmarEtapaDecisao(protocoloId, idx) {
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    var rotulo = e.rotuloPositivo || 'Confirmada';
    atualizarEtapa(protocoloId, idx, { feita: true, valor: rotulo, feitaEm: agoraISO(), feitaPor: nomeDe(usuarioAtual) }, e.label + ': ' + rotulo + ' — protocolo segue em andamento');
}
function descartarEtapaDecisao(protocoloId, idx) {
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    var rotulo = e.rotuloNegativo || 'Descartada';
    if (!confirm('Confirma "' + rotulo + '" para "' + e.label + '"? O protocolo será encerrado automaticamente.')) return;
    var agora = agoraISO();
    var etapas = p.etapas.slice();
    etapas[idx] = Object.assign({}, etapas[idx], { feita: true, valor: rotulo, feitaEm: agora, feitaPor: nomeDe(usuarioAtual) });
    var motivo = e.motivoDescarte || (e.label + ': ' + rotulo);
    var timeline = (p.timeline || []).concat([
        { ts: agora, autor: nomeDe(usuarioAtual), estacao: getEstacaoAtual(), texto: e.label + ': ' + rotulo },
        { ts: agora, autor: nomeDe(usuarioAtual), estacao: getEstacaoAtual(), texto: 'Protocolo cancelado: ' + motivo }
    ]);
    db.collection('protocolos').doc(protocoloId).update({ etapas: etapas, status: 'cancelado', canceladoMotivo: motivo, finalizadoEm: agora, finalizadoPor: nomeDe(usuarioAtual), timeline: timeline })
        .then(function() { mostrarToast('Protocolo encerrado', e.label + ': ' + rotulo); })
        .catch(function(err) { alert('Erro ao atualizar: ' + err.message); });
}
function salvarEtapaSelect(protocoloId, idx) {
    var select = g('select-' + idx); var valor = select.value;
    if (!valor) { select.focus(); return; }
    if (valor === 'Outro') {
        var outroInput = g('outro-' + idx); var texto = outroInput.value.trim();
        if (!texto) { outroInput.focus(); return; }
        valor = texto;
    }
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, valor: valor, feitaEm: agoraISO(), feitaPor: nomeDe(usuarioAtual) }, e.label + ': ' + valor);
}
function salvarEtapaSelectHorario(protocoloId, idx) {
    var select = g('select-' + idx); var valor = select.value;
    if (!valor) { select.focus(); return; }
    var input = g('horario-' + idx); if (!input.value) { input.focus(); return; }
    var horarioISO = new Date(input.value).toISOString();
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, valor: valor, horario: horarioISO, feitaEm: agoraISO(), feitaPor: nomeDe(usuarioAtual) }, e.label + ': ' + valor + ' registrado às ' + fmtDataHora(horarioISO));
}
function salvarEtapaValorHorario(protocoloId, idx) {
    var valorInput = g('valor-' + idx); var valor = valorInput.value.trim();
    if (!valor) { valorInput.focus(); return; }
    var horarioInput = g('horario-' + idx); if (!horarioInput.value) { horarioInput.focus(); return; }
    var horarioISO = new Date(horarioInput.value).toISOString();
    var p = protocoloPorId(protocoloId); var e = p.etapas[idx];
    atualizarEtapa(protocoloId, idx, { feita: true, valor: valor, horario: horarioISO, feitaEm: agoraISO(), feitaPor: nomeDe(usuarioAtual) }, e.label + ': ' + valor + ' — registrado às ' + fmtDataHora(horarioISO));
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
    var timeline = (p.timeline || []).concat([{ ts: agora, autor: nomeDe(usuarioAtual), estacao: getEstacaoAtual(), texto: texto }]);
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
    var timeline = (p.timeline || []).concat([{ ts: agora, autor: nomeDe(usuarioAtual), estacao: getEstacaoAtual(), texto: 'Protocolo cancelado: ' + motivo }]);
    db.collection('protocolos').doc(protocoloId).update({ status: 'cancelado', canceladoMotivo: motivo, finalizadoEm: agora, finalizadoPor: nomeDe(usuarioAtual), timeline: timeline })
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
    pFinal.status = 'finalizado'; pFinal.finalizadoEm = agora; pFinal.finalizadoPor = nomeDe(usuarioAtual); pFinal.desfecho = desfecho;
    if (obsFinal) pFinal.timeline = (pFinal.timeline || []).concat([{ ts: agora, autor: nomeDe(usuarioAtual), estacao: getEstacaoAtual(), texto: 'Observação final: ' + obsFinal }]);
    pFinal.timeline = (pFinal.timeline || []).concat([{ ts: agora, autor: nomeDe(usuarioAtual), estacao: getEstacaoAtual(), texto: 'Protocolo finalizado. Desfecho: ' + desfecho }]);

    gerarPDFProtocolo(pFinal).then(function(doc) {
        try { window.open(doc.output('bloburl'), '_blank'); } catch (e) { console.warn('Não foi possível abrir o PDF automaticamente.', e); }
        db.collection('protocolos').doc(protocoloId).update({ status: 'finalizado', finalizadoEm: agora, finalizadoPor: nomeDe(usuarioAtual), desfecho: desfecho, timeline: pFinal.timeline, pdfGeradoEm: agora })
            .then(function() { fecharTodosModais(); mostrarToast('Protocolo finalizado', 'PDF gerado e ' + (getPastaArquivoNome() ? 'salvo na pasta configurada' : 'baixado') + '.'); });
        salvarPDF(doc, nomeArquivoPDF(pFinal));
    });
}

function reimprimirPDF(protocoloId) {
    var p = protocoloPorId(protocoloId);
    gerarPDFProtocolo(p).then(function(doc) { window.open(doc.output('bloburl'), '_blank'); });
}

// ===== GERAÇÃO DE PDF — RECRIAÇÃO NATIVA DOS FORMULÁRIOS INSTITUCIONAIS =====
// Cada página dos formulários físicos da Hapvida/NotreDame Intermédica é redesenhada do
// zero em vetor (linhas, caixas, textos) — não é usada nenhuma imagem escaneada como fundo.
// Os dados do protocolo são preenchidos nos mesmos campos/posições do formulário original,
// em tinta azul, para se distinguir do texto impresso do formulário (preto). Uma página
// final com a linha do tempo digital completa é anexada como auditoria complementar.
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
function fmtDataCurta(iso) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : ''; }
function fmtHoraCurta(iso) { return iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; }
function etapaPorChave(p, key) { return (p.etapas || []).find(function(x) { return x.key === key; }); }
function textoEtapaHora(e) { if (!e || !e.feita) return ''; return fmtHoraCurta(e.horario || e.feitaEm); }
function opcoesDaEtapa(tipo, key) { var d = TIPOS[tipo].etapas.find(function(x) { return x.key === key; }); return (d && d.opcoes) || []; }

// ----- Primitivas de desenho (coordenadas em fração 0..1 da página) -----
var COR_TINTA = [15, 55, 145];
function _fx(w, f) { return f * w; }
function _fy(h, f) { return f * h; }
function txt(doc, w, h, xf, yf, s, o) {
    if (s == null || s === '') return;
    o = o || {};
    doc.setFont('helvetica', o.negrito ? 'bold' : 'normal');
    doc.setFontSize(o.tam || 8);
    var cor = o.cor || [0, 0, 0];
    doc.setTextColor(cor[0], cor[1], cor[2]);
    var opts = {};
    if (o.align) opts.align = o.align;
    if (o.maxW) opts.maxWidth = _fx(w, o.maxW);
    doc.text(String(s), _fx(w, xf), _fy(h, yf), opts);
}
function ret(doc, w, h, x0, y0, x1, y1, o) {
    o = o || {};
    var cb = o.corBorda || [0, 0, 0];
    doc.setDrawColor(cb[0], cb[1], cb[2]);
    doc.setLineWidth(o.esp || 1);
    if (o.preench) doc.setFillColor(o.preench[0], o.preench[1], o.preench[2]);
    var rx = _fx(w, x0), ry = _fy(h, y0), rw = _fx(w, x1 - x0), rh = _fy(h, y1 - y0);
    if (o.raio) doc.roundedRect(rx, ry, rw, rh, o.raio, o.raio, o.preench ? 'FD' : 'S');
    else doc.rect(rx, ry, rw, rh, o.preench ? 'FD' : 'S');
}
function lin(doc, w, h, x0, y0, x1, y1, o) {
    o = o || {};
    var c = o.cor || [0, 0, 0];
    doc.setDrawColor(c[0], c[1], c[2]);
    doc.setLineWidth(o.esp || 0.8);
    if (o.tracejado) doc.setLineDashPattern([2.2, 1.8], 0); else doc.setLineDashPattern([], 0);
    doc.line(_fx(w, x0), _fy(h, y0), _fx(w, x1), _fy(h, y1));
    doc.setLineDashPattern([], 0);
}
function circ(doc, w, h, cxf, cyf, rf, o) {
    o = o || {};
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(1);
    if (o.preench) doc.setFillColor(o.preench[0], o.preench[1], o.preench[2]);
    doc.circle(_fx(w, cxf), _fy(h, cyf), _fx(w, rf), o.preench ? 'FD' : 'S');
}
function diam(doc, w, h, cxf, cyf, hwf, hhf, o) {
    o = o || {};
    var cx = _fx(w, cxf), cy = _fy(h, cyf), hw = _fx(w, hwf), hh = _fy(h, hhf);
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(1);
    if (o.preench) doc.setFillColor(o.preench[0], o.preench[1], o.preench[2]);
    doc.lines([[hw, -hh], [hw, hh], [-hw, hh], [-hw, -hh]], cx - hw, cy, [1, 1], o.preench ? 'FD' : 'S', true);
}
function seta(doc, w, h, x0, y0, x1, y1) {
    lin(doc, w, h, x0, y0, x1, y1, { esp: 1.1 });
    var ex = _fx(w, x1), ey = _fy(h, y1);
    var ang = Math.atan2(_fy(h, y1) - _fy(h, y0), _fx(w, x1) - _fx(w, x0));
    doc.setLineWidth(1.1);
    doc.line(ex, ey, ex - 6 * Math.cos(ang - 0.5), ey - 6 * Math.sin(ang - 0.5));
    doc.line(ex, ey, ex - 6 * Math.cos(ang + 0.5), ey - 6 * Math.sin(ang + 0.5));
}
function caixaFluxo(doc, w, h, x0, y0, x1, y1, linhas, o) {
    o = o || {};
    ret(doc, w, h, x0, y0, x1, y1, { esp: o.esp || 1.1, preench: o.preench || [232, 232, 248], raio: o.raio != null ? o.raio : 6 });
    var n = linhas.length, lh = (y1 - y0) / (n + 0.7);
    var yStart = y0 + (y1 - y0) / 2 - (n - 1) * lh / 2;
    linhas.forEach(function(l, i) {
        txt(doc, w, h, (x0 + x1) / 2, yStart + i * lh + lh * 0.18, l, { tam: o.tam || 7.6, negrito: o.negrito !== false, align: 'center', maxW: (x1 - x0) * 0.94 });
    });
}
function caixaAnotacao(doc, w, h, x0, y0, x1, y1, titulo) {
    ret(doc, w, h, x0, y0, x1, y1, { esp: 0.8 });
    if (titulo) txt(doc, w, h, x0 + (x1 - x0) * 0.03, y0 + 16 / h, titulo, { tam: 7.6, negrito: true });
}
// Linha "rótulo: ____" com valor preenchido em tinta, opcional
function campoLinha(doc, w, h, xf, yf, largF, rotulo, valor, o) {
    o = o || {};
    var tam = o.tam || 7.2;
    txt(doc, w, h, xf, yf, rotulo, { tam: tam });
    var lw = doc.getTextWidth(rotulo) / w + 0.008;
    var yLinha = yf + (tam * 0.32) / h;
    var xFim = Math.max(xf + largF, xf + lw + 0.03);
    lin(doc, w, h, xf + lw, yLinha, xFim, yLinha, { esp: 0.6 });
    if (valor) txt(doc, w, h, xf + lw + 0.004, yf, String(valor), { tam: tam, cor: COR_TINTA });
}
// Tabela de critérios (checkbox + rótulo), com grupos opcionais com cabeçalho de subseção
function tabelaCriterios(doc, w, h, x0, y0, x1, y1, titulo, grupos, xdiv) {
    ret(doc, w, h, x0, y0, x1, y1, { esp: 1 });
    var FS = 7.3, LH = FS * 1.22;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(FS);
    var largTextoPt = _fx(w, xdiv ? (x1 - xdiv) * 0.92 : (x1 - x0) * 0.9);
    grupos.forEach(function(g) { g.itens.forEach(function(item) {
        item._linhas = doc.splitTextToSize(item.label, largTextoPt);
        item._peso = Math.max(1, item._linhas.length);
    }); });
    var totalUnid = 0;
    grupos.forEach(function(g) { totalUnid += (g.header ? 1 : 0); g.itens.forEach(function(it) { totalUnid += it._peso; }); });
    var yCursor = y0, alturaTitulo = 0;
    if (titulo) {
        alturaTitulo = (y1 - y0) * 0.115;
        txt(doc, w, h, (x0 + x1) / 2, y0 + alturaTitulo * 0.62, titulo, { tam: 7.6, negrito: true, align: 'center' });
        lin(doc, w, h, x0, y0 + alturaTitulo, x1, y0 + alturaTitulo);
        yCursor = y0 + alturaTitulo;
    }
    var unidade = (y1 - yCursor) / totalUnid;
    grupos.forEach(function(grupo) {
        if (grupo.header) {
            var yTop = yCursor, yBot = yCursor + unidade;
            txt(doc, w, h, (x0 + x1) / 2, (yTop + yBot) / 2 + 0.004, grupo.header, { tam: 7.3, negrito: true, align: 'center' });
            lin(doc, w, h, x0, yBot, x1, yBot);
            yCursor = yBot;
        }
        grupo.itens.forEach(function(item) {
            var altura = unidade * item._peso;
            var yTop = yCursor, yBot = yCursor + altura, yMid = (yTop + yBot) / 2;
            if (xdiv) lin(doc, w, h, xdiv, yTop, xdiv, yBot);
            var xTexto = xdiv ? xdiv + (x1 - xdiv) * 0.035 : x0 + (x1 - x0) * 0.035;
            doc.setFont('helvetica', 'normal'); doc.setFontSize(FS); doc.setTextColor(0, 0, 0);
            var blocoAlturaPt = item._linhas.length * LH;
            var yStartPt = _fy(h, yMid) - blocoAlturaPt / 2 + FS * 0.85;
            item._linhas.forEach(function(linha, li) { doc.text(linha, _fx(w, xTexto), yStartPt + li * LH); });
            if (item.marcado) txt(doc, w, h, xdiv ? (x0 + xdiv) / 2 : x0 + (x1 - x0) * 0.018, yMid + 0.006, 'X', { tam: 9.5, negrito: true, align: xdiv ? 'center' : 'left', cor: COR_TINTA });
            if (yBot < y1 - 0.001) lin(doc, w, h, x0, yBot, x1, yBot);
            yCursor = yBot;
        });
    });
}
function textoMarcado(itens, valorEtapa) { return function(op) { return valorEtapa && valorEtapa.indexOf(op) !== -1; }; }

// ===== PÁGINAS — SEPSE =====
function desenharSepseP1(doc, w, h, p, logo) {
    var pac = p.paciente || {};
    if (logo) { try { doc.addImage(logo, 'PNG', _fx(w, 0.80), _fy(h, 0.025), _fx(w, 0.16), _fy(h, 0.06)); } catch (e) {} }
    ret(doc, w, h, 0.035, 0.095, 0.965, 0.172, { esp: 1.1 });
    campoLinha(doc, w, h, 0.050, 0.113, 0.900, 'Nome completo do paciente:', pac.nome, { tam: 8.2 });
    campoLinha(doc, w, h, 0.050, 0.136, 0.270, 'Data de nascimento:', '', { tam: 8 });
    campoLinha(doc, w, h, 0.360, 0.136, 0.230, 'Atendimento:', pac.prontuario, { tam: 8 });
    campoLinha(doc, w, h, 0.660, 0.136, 0.280, 'Hospital:', 'Hospital Paulo Sacramento', { tam: 8 });
    campoLinha(doc, w, h, 0.050, 0.159, 0.400, 'Responsável pela abertura da ficha:', p.criadoPor ? nomeDe(p.criadoPor) : '', { tam: 8 });
    campoLinha(doc, w, h, 0.580, 0.159, 0.155, 'Data:', fmtDataCurta(p.criadoEm), { tam: 8 });
    campoLinha(doc, w, h, 0.780, 0.159, 0.170, 'Hora:', fmtHoraCurta(p.criadoEm), { tam: 8 });

    txt(doc, w, h, 0.5, 0.196, 'GERENCIAMENTO DO PROTOCOLO DE SEPSE ADULTO', { tam: 12.5, negrito: true, align: 'center' });
    txt(doc, w, h, 0.5, 0.214, 'Marque com um X as opções dos critérios de alerta para SIRS.', { tam: 8.5, align: 'center' });

    var sirs = etapaPorChave(p, 'criterios_sirs'), sirsOp = opcoesDaEtapa('sepse', 'criterios_sirs');
    var mSirs = textoMarcado(null, sirs && sirs.valor);
    tabelaCriterios(doc, w, h, 0.035, 0.255, 0.415, 0.430, 'Critérios sinais de SIRS', [
        { itens: [{ label: sirsOp[0], marcado: mSirs(sirsOp[0]) }, { label: sirsOp[1], marcado: mSirs(sirsOp[1]) }, { label: sirsOp[2], marcado: mSirs(sirsOp[2]) }, { label: sirsOp[3], marcado: mSirs(sirsOp[3]) }] },
        { header: 'Se exames disponíveis', itens: [{ label: sirsOp[4], marcado: mSirs(sirsOp[4]) }, { label: sirsOp[5], marcado: mSirs(sirsOp[5]) }, { label: sirsOp[6], marcado: mSirs(sirsOp[6]) }] }
    ], 0.205);

    var disf = etapaPorChave(p, 'criterios_disfuncao'), disfOp = opcoesDaEtapa('sepse', 'criterios_disfuncao');
    var mDisf = textoMarcado(null, disf && disf.valor);
    tabelaCriterios(doc, w, h, 0.440, 0.255, 0.965, 0.430, 'Critérios de disfunção orgânica', [
        { itens: disfOp.map(function(op) { return { label: op, marcado: mDisf(op) }; }) }
    ], 0.500);

    var paragrafos = [
        'Diante da suspeita clínica de sepse, cada segundo é crucial. Para garantir uma resposta mais',
        'eficaz, siga os passos listados a seguir.', '',
        'Sua participação é fundamental no combate a essa doença. Contamos com seu comprometimento',
        'e cuidado para juntos fazermos a diferença na vida dos nossos pacientes.'
    ];
    paragrafos.forEach(function(l, i) { txt(doc, w, h, 0.5, 0.475 + i * 0.021, l, { tam: 9, align: 'center' }); });
    txt(doc, w, h, 0.5, 0.605, 'Pense, pode ser sepse, pois tempo é vida!', { tam: 11.5, negrito: true, align: 'center' });
}

function desenharSepseP2(doc, w, h, p) {
    var e = function(k) { return etapaPorChave(p, k); };
    var CX0 = 0.375, CX1 = 0.700, CXM = (CX0 + CX1) / 2;
    var AX0 = 0.715, AX1 = 0.975;

    circ(doc, w, h, 0.130, 0.045, 0.018, { preench: [0, 0, 0] });
    seta(doc, w, h, 0.150, 0.045, CX0, 0.045);
    caixaFluxo(doc, w, h, CX0, 0.028, CX1, 0.098, ['Pelo menos dois critérios de SIRS', 'e/ou critério de disfunção orgânica.']);
    seta(doc, w, h, CXM, 0.098, CXM, 0.128);
    caixaFluxo(doc, w, h, CX0, 0.128, CX1, 0.198, ['Realizar a abertura do protocolo de sepse', 'e comunicar ao médico imediatamente.']);
    lin(doc, w, h, CX1, 0.163, AX0, 0.163, { tracejado: true });
    caixaAnotacao(doc, w, h, AX0, 0.128, AX1, 0.212, 'Avaliação médica:');
    campoLinha(doc, w, h, AX0 + 0.012, 0.171, 0.220, 'Horário:', textoEtapaHora(e('avaliacao_medica')), { tam: 7.2 });
    txt(doc, w, h, AX0 + 0.012, 0.194, 'Carimbo Médico: ____________', { tam: 6.8 });

    txt(doc, w, h, CXM, 0.216, 'Há suspeita ou confirmação da presença', { tam: 7.6, align: 'center' });
    txt(doc, w, h, CXM, 0.228, 'de infecção?', { tam: 7.6, align: 'center' });
    seta(doc, w, h, CXM, 0.198, CXM, 0.235);
    diam(doc, w, h, CXM, 0.268, 0.085, 0.033, { preench: [222, 232, 248] });
    txt(doc, w, h, CXM + 0.010, 0.253, 'Não', { tam: 7.4, negrito: true });
    seta(doc, w, h, CX1, 0.268, AX0, 0.268);
    caixaFluxo(doc, w, h, AX0, 0.250, 0.800, 0.288, ['Excluir do protocolo'], { preench: [222, 222, 222], tam: 7 });
    seta(doc, w, h, 0.800, 0.268, 0.850, 0.268);
    caixaFluxo(doc, w, h, 0.850, 0.244, 0.968, 0.293, ['Seguir com atendimento', 'fora do protocolo'], { preench: [222, 222, 222], tam: 6.4 });
    circ(doc, w, h, 0.977, 0.268, 0.013, { preench: [0, 0, 0] });
    caixaAnotacao(doc, w, h, AX0, 0.300, AX1, 0.390, 'Exclusão:');
    campoLinha(doc, w, h, AX0 + 0.012, 0.343, 0.220, 'Data/Hora:', p.status === 'cancelado' ? fmtDataHora(p.finalizadoEm) : '', { tam: 6.8 });
    txt(doc, w, h, AX0 + 0.012, 0.366, 'Carimbo Médico: ____________', { tam: 6.6 });

    txt(doc, w, h, CXM + 0.010, 0.308, 'Sim', { tam: 7.4, negrito: true });
    seta(doc, w, h, CXM, 0.301, CXM, 0.335);
    caixaFluxo(doc, w, h, CX0, 0.335, CX1, 0.380, ['Solicitar e coletar pacote sepse 1 hora']);
    lin(doc, w, h, CX0, 0.358, 0.345, 0.358, { tracejado: true });
    caixaAnotacao(doc, w, h, 0.025, 0.335, 0.345, 0.470, 'Coleta de exames:');
    campoLinha(doc, w, h, 0.037, 0.383, 0.290, 'Hemocultura:', textoEtapaHora(e('hemoculturas')), { tam: 7 });
    campoLinha(doc, w, h, 0.037, 0.408, 0.290, 'Lactato — horário:', textoEtapaHora(e('lactato')), { tam: 7 });
    campoLinha(doc, w, h, 0.037, 0.433, 0.290, 'Lactato — resultado:', (function() { var l = e('lactato'); return l && l.feita ? l.valor + (l.unidade ? ' ' + l.unidade : '') : ''; })(), { tam: 7 });

    seta(doc, w, h, CXM, 0.380, CXM, 0.412);
    caixaFluxo(doc, w, h, CX0, 0.412, CX1, 0.470, ['Definir foco infeccioso e', 'prescrever antibioticoterapia']);
    lin(doc, w, h, CX1, 0.441, AX0, 0.441, { tracejado: true });
    caixaAnotacao(doc, w, h, AX0, 0.412, AX1, 0.520, 'Antibioticoterapia / Foco:');
    campoLinha(doc, w, h, AX0 + 0.012, 0.455, 0.230, 'Foco:', (function() { var f = e('foco_infeccioso'); return f && f.feita ? f.valor : ''; })(), { tam: 6.8 });
    campoLinha(doc, w, h, AX0 + 0.012, 0.480, 0.230, 'ATB — horário:', textoEtapaHora(e('atb')), { tam: 6.8 });
    campoLinha(doc, w, h, AX0 + 0.012, 0.503, 0.230, 'ATB — nome:', '', { tam: 6.8 });

    txt(doc, w, h, CXM, 0.500, 'Há disfunção orgânica após o resultado', { tam: 7.6, align: 'center' });
    txt(doc, w, h, CXM, 0.512, 'do pacote sepse?', { tam: 7.6, align: 'center' });
    seta(doc, w, h, CXM, 0.470, CXM, 0.520);
    diam(doc, w, h, CXM, 0.553, 0.085, 0.032, { preench: [222, 232, 248] });
    txt(doc, w, h, CXM + 0.010, 0.539, 'Não', { tam: 7.4, negrito: true });
    seta(doc, w, h, CX1, 0.553, AX0, 0.553);
    caixaFluxo(doc, w, h, AX0, 0.535, 0.800, 0.572, ['Excluir protocolo'], { preench: [222, 222, 222], tam: 7 });
    seta(doc, w, h, 0.800, 0.553, 0.850, 0.553);
    caixaFluxo(doc, w, h, 0.850, 0.529, 0.968, 0.577, ['Seguir com atendimento', 'fora do protocolo'], { preench: [222, 222, 222], tam: 6.4 });
    circ(doc, w, h, 0.977, 0.553, 0.013, { preench: [0, 0, 0] });
    caixaAnotacao(doc, w, h, AX0, 0.584, AX1, 0.674, 'Exclusão:');
    campoLinha(doc, w, h, AX0 + 0.012, 0.627, 0.220, 'Data/Hora:', (p.status === 'cancelado' && (TIPOS.sepse.motivosExclusao || []).indexOf(p.canceladoMotivo) === 1) ? fmtDataHora(p.finalizadoEm) : '', { tam: 6.8 });
    txt(doc, w, h, AX0 + 0.012, 0.650, 'Carimbo Médico: ____________', { tam: 6.6 });

    txt(doc, w, h, CXM + 0.010, 0.593, 'Sim', { tam: 7.4, negrito: true });
    seta(doc, w, h, CXM, 0.585, CXM, 0.618);
    caixaFluxo(doc, w, h, 0.360, 0.618, 0.700, 0.778, [
        '• Reposição volêmica: 30 mL/kg de',
        'cristaloides, ajustando conforme janelas',
        'de perfusão (diurese, débito urinário,',
        'enchimento capilar).',
        '• Monitorar o paciente de 1/1h; débito',
        'urinário de 2/2h.',
        '• Se PAM < 65 mmHg, iniciar noradrenalina',
        'e providenciar acesso central.',
        '• Coleta de segunda amostra de lactato.'
    ], { raio: 8, esp: 1.3, tam: 7 });
    lin(doc, w, h, 0.360, 0.680, 0.345, 0.680, { tracejado: true });
    caixaAnotacao(doc, w, h, 0.025, 0.640, 0.345, 0.820, 'Reposição volêmica / 2ª coleta:');
    campoLinha(doc, w, h, 0.037, 0.688, 0.290, 'Volêmica — horário:', textoEtapaHora(e('reposicao_volemica')), { tam: 6.8 });
    campoLinha(doc, w, h, 0.037, 0.721, 0.290, 'Peso/Volume/Solução:', (function() { var v = e('reposicao_volemica'); return v && v.feita ? v.valor : ''; })(), { tam: 6.6 });
    campoLinha(doc, w, h, 0.037, 0.754, 0.290, '2º lactato — resultado:', (function() { var v = e('segundo_lactato'); return v && v.feita ? v.valor + (v.unidade ? ' ' + v.unidade : '') : ''; })(), { tam: 6.6 });
    campoLinha(doc, w, h, 0.037, 0.787, 0.290, 'Noradrenalina/acesso:', e('vasopressor') && e('vasopressor').feita ? 'Sim' : '', { tam: 6.6 });

    seta(doc, w, h, CXM, 0.778, CXM, 0.788);
    caixaFluxo(doc, w, h, CX0, 0.788, CX1, 0.838, ['Definir o destino do paciente para', 'UTI ou Unidade de Internação.']);
    lin(doc, w, h, CX1, 0.813, AX0, 0.813, { tracejado: true });
    caixaAnotacao(doc, w, h, AX0, 0.788, AX1, 0.900, 'Destino / Desfecho:');
    campoLinha(doc, w, h, AX0 + 0.012, 0.831, 0.230, 'Destino:', (function() { var d = e('destino'); return d && d.feita ? d.valor : ''; })(), { tam: 6.8 });
    campoLinha(doc, w, h, AX0 + 0.012, 0.860, 0.230, 'Desfecho:', p.status === 'finalizado' ? (p.desfecho || '') : '', { tam: 6.8 });

    seta(doc, w, h, CXM, 0.838, CXM, 0.868);
    circ(doc, w, h, CXM, 0.882, 0.018, { preench: [0, 0, 0] });
}

// ===== PÁGINAS — DOR TORÁCICA =====
function desenharDorP1(doc, w, h, p, logo) {
    var pac = p.paciente || {};
    if (logo) { try { doc.addImage(logo, 'PNG', _fx(w, 0.06), _fy(h, 0.018), _fx(w, 0.20), _fy(h, 0.045)); } catch (e) {} }
    txt(doc, w, h, 0.5, 0.070, 'Ficha de Monitoramento de Dor Torácica', { tam: 15, negrito: true, align: 'center' });

    ret(doc, w, h, 0.06, 0.098, 0.94, 0.170, { esp: 1 });
    campoLinha(doc, w, h, 0.075, 0.118, 0.470, 'Nome Completo:', pac.nome, { tam: 8 });
    campoLinha(doc, w, h, 0.580, 0.118, 0.340, 'Data Nascimento:', '', { tam: 8 });
    lin(doc, w, h, 0.06, 0.135, 0.94, 0.135, { esp: 0.6 });
    campoLinha(doc, w, h, 0.075, 0.155, 0.230, 'Atendimento:', pac.prontuario, { tam: 8 });

    ret(doc, w, h, 0.06, 0.178, 0.94, 0.250, { esp: 1 });
    campoLinha(doc, w, h, 0.075, 0.198, 0.230, 'Data do atendimento:', fmtDataCurta(p.criadoEm), { tam: 7.6 });
    campoLinha(doc, w, h, 0.365, 0.198, 0.230, 'Horário da abertura:', fmtHoraCurta(p.criadoEm), { tam: 7.6 });
    txt(doc, w, h, 0.660, 0.198, 'Profissional responsável pela abertura:', { tam: 7.2 });
    txt(doc, w, h, 0.660, 0.225, (p.criadoPor ? nomeDe(p.criadoPor) : ''), { tam: 7.6, cor: COR_TINTA });

    ret(doc, w, h, 0.06, 0.258, 0.94, 0.322, { esp: 1 });
    campoLinha(doc, w, h, 0.075, 0.278, 0.860, 'Queixa:', '', { tam: 7.6 });
    var eva = etapaPorChave(p, 'eva');
    campoLinha(doc, w, h, 0.075, 0.305, 0.400, 'Horário de INÍCIO da DOR:', fmtHoraCurta(p.horaReferencia), { tam: 7.6 });
    campoLinha(doc, w, h, 0.580, 0.305, 0.340, 'Escala de dor (EVA):', eva && eva.feita ? eva.valor : '', { tam: 7.6 });

    ret(doc, w, h, 0.06, 0.330, 0.94, 0.400, { esp: 1 });
    campoLinha(doc, w, h, 0.075, 0.350, 0.860, 'Procedência do paciente:', '', { tam: 7.6 });
    campoLinha(doc, w, h, 0.075, 0.378, 0.260, 'Horário atendimento médico:', textoEtapaHora(etapaPorChave(p, 'atendimento_medico')), { tam: 7.2 });
    campoLinha(doc, w, h, 0.400, 0.378, 0.260, 'Horário solicitação ECG:', '', { tam: 7.2 });
    campoLinha(doc, w, h, 0.700, 0.378, 0.240, 'Horário realização ECG:', textoEtapaHora(etapaPorChave(p, 'ecg')), { tam: 7.2 });

    var avEcg = etapaPorChave(p, 'avaliacao_ecg');
    var mEcg = textoMarcado(null, avEcg && avEcg.valor);
    var ecgOp = { normal: 'ECG normal', supra: 'Supra de ST ou BRE novo/provavelmente novo', infra: 'Infra de ST (>0,5mm)', invT: 'Inversão ou simetria de onda T', ondaQ: 'Onda Q patológica', altST: 'Alterações dinâmicas do ST', arrit: 'Arritmias ameaçadoras à vida (FV, TV)' };
    tabelaCriterios(doc, w, h, 0.06, 0.408, 0.94, 0.545, 'Avaliação do ECG', [
        { itens: [{ label: 'ECG normal', marcado: mEcg(ecgOp.normal) }, { label: 'Supra de ST ou BRE novo/provavelmente novo', marcado: mEcg(ecgOp.supra) }, { label: 'Inversão ou simetria de onda T', marcado: mEcg(ecgOp.invT) }, { label: 'Infra de ST (>0,5mm)', marcado: mEcg(ecgOp.infra) }] },
        { itens: [{ label: 'Arritmias ameaçadoras à vida (FV, TV)', marcado: mEcg(ecgOp.arrit) }, { label: 'Alterações dinâmicas do ST', marcado: mEcg(ecgOp.altST) }, { label: 'Onda Q patológica', marcado: mEcg(ecgOp.ondaQ) }] }
    ], null);

    ret(doc, w, h, 0.06, 0.553, 0.94, 0.610, { esp: 1 });
    campoLinha(doc, w, h, 0.075, 0.573, 0.300, 'Horário do Laudo TeleECG:', '', { tam: 7.2 });
    campoLinha(doc, w, h, 0.390, 0.573, 0.280, 'Solicitação TeleCardio:', '', { tam: 7.2 });
    campoLinha(doc, w, h, 0.685, 0.573, 0.245, 'Resposta TeleCardio:', textoEtapaHora(etapaPorChave(p, 'telecardio')), { tam: 7 });

    var diag = etapaPorChave(p, 'diagnostico');
    var vdiag = (diag && diag.feita ? diag.valor : '').toLowerCase();
    ret(doc, w, h, 0.06, 0.618, 0.94, 0.670, { esp: 1 });
    txt(doc, w, h, 0.075, 0.635, 'Diagnóstico:', { tam: 8, negrito: true });
    var diagChecks = [{ x: 0.185, label: 'IAM com Supra ST', hit: vdiag.indexOf('supra') !== -1 && vdiag.indexOf('sem') === -1 },
        { x: 0.430, label: 'IAM sem Supra ST', hit: vdiag.indexOf('sem supra') !== -1 },
        { x: 0.680, label: 'Angina Instável', hit: vdiag.indexOf('angina') !== -1 }];
    diagChecks.forEach(function(c) {
        ret(doc, w, h, c.x, 0.628, c.x + 0.016, 0.628 + 0.016 * (w / h), { esp: 0.8 });
        if (c.hit) txt(doc, w, h, c.x + 0.002, 0.628 + 0.016 * (w / h) * 0.82, 'X', { tam: 7.5, negrito: true, cor: COR_TINTA });
        txt(doc, w, h, c.x + 0.022, 0.640, c.label, { tam: 7.4 });
    });
    var diagOutros = diag && diag.feita && !diagChecks.some(function(c) { return c.hit; });
    ret(doc, w, h, 0.185, 0.652, 0.201, 0.652 + 0.016 * (w / h), { esp: 0.8 });
    if (diagOutros) txt(doc, w, h, 0.187, 0.652 + 0.016 * (w / h) * 0.82, 'X', { tam: 7.5, negrito: true, cor: COR_TINTA });
    campoLinha(doc, w, h, 0.222, 0.664, 0.500, 'Outros:', diagOutros ? diag.valor : '', { tam: 7.4 });

    var alerta = etapaPorChave(p, 'sinais_alerta'), alertaOp = opcoesDaEtapa('dor_toracica', 'sinais_alerta');
    var mAlerta = textoMarcado(null, alerta && alerta.valor);
    tabelaCriterios(doc, w, h, 0.06, 0.678, 0.94, 0.790, 'Sinais de Alerta e Gravidade', [
        { itens: alertaOp.map(function(op) { return { label: op, marcado: mAlerta(op) }; }) }
    ], null);

    ret(doc, w, h, 0.06, 0.798, 0.94, 0.900, { esp: 1 });
    txt(doc, w, h, 0.5, 0.813, 'Desfecho', { tam: 9, negrito: true, align: 'center' });
    txt(doc, w, h, 0.075, 0.828, 'Hemodinâmica', { tam: 8, negrito: true });
    campoLinha(doc, w, h, 0.075, 0.850, 0.400, 'Horário abertura da artéria (porta-balão):', textoEtapaHora(etapaPorChave(p, 'porta_balao')), { tam: 7 });
    txt(doc, w, h, 0.560, 0.828, 'Fibrinólise', { tam: 8, negrito: true });
    campoLinha(doc, w, h, 0.560, 0.850, 0.370, 'Horário administração Alteplase:', textoEtapaHora(etapaPorChave(p, 'porta_agulha')), { tam: 7 });

    txt(doc, w, h, 0.06, 0.930, 'Profissionais médicos: ________________________', { tam: 7.6 });
    txt(doc, w, h, 0.06, 0.955, 'Profissional Enfermeiro: ________________________', { tam: 7.6 });
}
function desenharDorP2(doc, w, h, p, logo) {
    if (logo) { try { doc.addImage(logo, 'PNG', _fx(w, 0.38), _fy(h, 0.06), _fx(w, 0.24), _fy(h, 0.052)); } catch (e) {} }
    ret(doc, w, h, 0.62, 0.145, 0.94, 0.230, { esp: 1 });
    txt(doc, w, h, 0.78, 0.192, 'ETIQUETA DO PACIENTE', { tam: 9, align: 'center' });
    txt(doc, w, h, 0.5, 0.290, 'PROTOCOLO DE DOR TORÁCICA', { tam: 14, negrito: true, align: 'center' });
    txt(doc, w, h, 0.5, 0.312, '1º CONTROLE', { tam: 12, negrito: true, align: 'center' });
    txt(doc, w, h, 0.14, 0.375, '•  TROPONINA', { tam: 11, negrito: true });

    var trop = etapaPorChave(p, 'troponina');
    campoLinha(doc, w, h, 0.135, 0.435, 0.330, 'Horário da Abertura do Protocolo:', fmtHoraCurta(p.criadoEm), { tam: 8.2 });
    campoLinha(doc, w, h, 0.560, 0.435, 0.360, 'Responsável:', p.criadoPor ? nomeDe(p.criadoPor) : '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.135, 0.470, 0.330, 'Horário da Coleta:', textoEtapaHora(trop), { tam: 8.2 });
    campoLinha(doc, w, h, 0.560, 0.470, 0.360, 'Responsável:', trop && trop.feita ? trop.feitaPor : '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.135, 0.505, 0.330, 'Horário Recebimento no Laboratório:', '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.560, 0.505, 0.360, 'Responsável:', '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.135, 0.540, 0.330, 'Horário de Liberação do Resultado:', trop && trop.feita ? trop.valor + ' (troponina)' : '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.560, 0.540, 0.360, 'Responsável:', '', { tam: 8.2 });

    ret(doc, w, h, 0.12, 0.615, 0.88, 0.700, { esp: 1 });
    txt(doc, w, h, 0.135, 0.632, 'Observação:', { tam: 8, negrito: true });
    txt(doc, w, h, 0.62, 0.712, 'Este formulário não dispensa o pedido médico integrado ou manual', { tam: 8.6, negrito: true, align: 'center' });
}

// ===== PÁGINAS — AVC =====
function desenharAvcP1(doc, w, h, p, logo) {
    var e = function(k) { return etapaPorChave(p, k); };
    txt(doc, w, h, 0.5, 0.030, 'PROTOCOLO AVC', { tam: 15, negrito: true, align: 'center' });
    if (logo) { try { doc.addImage(logo, 'PNG', _fx(w, 0.80), _fy(h, 0.02), _fx(w, 0.16), _fy(h, 0.045)); } catch (e) {} }
    ret(doc, w, h, 0.03, 0.050, 0.485, 0.130, { esp: 1 });
    txt(doc, w, h, 0.257, 0.078, 'Identificação', { tam: 11, negrito: true, align: 'center' });
    txt(doc, w, h, 0.257, 0.102, 'ETIQUETA', { tam: 10, align: 'center' });
    ret(doc, w, h, 0.500, 0.050, 0.735, 0.100, { esp: 1 });
    txt(doc, w, h, 0.617, 0.072, 'Chegada ao Serviço de', { tam: 8.6, negrito: true, align: 'center' });
    txt(doc, w, h, 0.617, 0.088, 'Emergência', { tam: 8.6, negrito: true, align: 'center' });
    ret(doc, w, h, 0.500, 0.105, 0.735, 0.145, { esp: 1, preench: [222, 240, 240] });
    campoLinha(doc, w, h, 0.512, 0.120, 0.210, 'Data:', fmtDataCurta(p.criadoEm), { tam: 7.6 });
    campoLinha(doc, w, h, 0.512, 0.138, 0.210, 'Horário:', fmtHoraCurta(p.criadoEm), { tam: 7.6 });

    var sinais = e('sinais_avc'), sinaisOp = opcoesDaEtapa('avc', 'sinais_avc');
    var mSinais = textoMarcado(null, sinais && sinais.valor);
    ret(doc, w, h, 0.03, 0.160, 0.965, 0.245, { esp: 1 });
    txt(doc, w, h, 0.5, 0.175, 'SINAIS DE AVC', { tam: 9.5, negrito: true, align: 'center' });
    var sinaisPos = [[0.10, 0.190], [0.10, 0.205], [0.10, 0.221], [0.62, 0.190], [0.62, 0.205], [0.62, 0.221]];
    sinaisOp.forEach(function(op, i) {
        var yTopo = sinaisPos[i][1] - 0.009, altura = 0.014 * (w / h);
        ret(doc, w, h, sinaisPos[i][0], yTopo, sinaisPos[i][0] + 0.014, yTopo + altura, { esp: 0.8 });
        if (mSinais(op)) txt(doc, w, h, sinaisPos[i][0] + 0.002, yTopo + altura * 0.82, 'X', { tam: 7, negrito: true, cor: COR_TINTA });
        txt(doc, w, h, sinaisPos[i][0] + 0.020, sinaisPos[i][1] + 0.001, op, { tam: 7.6 });
    });

    seta(doc, w, h, 0.257, 0.245, 0.257, 0.267);
    ret(doc, w, h, 0.03, 0.267, 0.435, 0.375, { esp: 1 });
    txt(doc, w, h, 0.232, 0.281, 'ENFERMEIRO', { tam: 8.6, negrito: true, align: 'center' });
    ['Coletar exames de sangue', 'Cabeceira 0°, sinais vitais, dextro,', 'acesso venoso periférico (AVCP)', 'Comunicar médico se alteração de SSVV', 'Realizar ECG de 12 derivações após TC'].forEach(function(l, i) {
        txt(doc, w, h, 0.045, 0.298 + i * 0.0155, '•  ' + l, { tam: 6.8 });
    });
    ret(doc, w, h, 0.465, 0.267, 0.760, 0.375, { esp: 1.3, preench: [206, 232, 232] });
    txt(doc, w, h, 0.612, 0.281, 'AVALIAÇÃO MÉDICA', { tam: 8.6, negrito: true, align: 'center' });
    ['Confirmar tempo dos sintomas', 'Solicitar TC crânio s/ contraste,', 'hemograma, plaquetas, TP, TTPA,', 'glicemia, Na, K, creatina', 'Aplicar escala de AVC do NIHSS'].forEach(function(l, i) {
        txt(doc, w, h, 0.478, 0.298 + i * 0.0155, '•  ' + l, { tam: 6.8 });
    });
    ret(doc, w, h, 0.800, 0.267, 0.965, 0.312, { esp: 1 });
    campoLinha(doc, w, h, 0.812, 0.293, 0.140, 'Horário:', textoEtapaHora(e('avaliacao_medica')), { tam: 7.4 });
    ret(doc, w, h, 0.800, 0.316, 0.965, 0.338, { esp: 0, preench: [110, 110, 110] });
    txt(doc, w, h, 0.882, 0.331, 'Meta: 10 min', { tam: 7, align: 'center', cor: [255, 255, 255] });
    campoLinha(doc, w, h, 0.812, 0.358, 0.150, 'NIHSS:', (function() { var n = e('nihss'); return n && n.feita ? n.valor : ''; })(), { tam: 8 });

    seta(doc, w, h, 0.257, 0.375, 0.257, 0.410);
    seta(doc, w, h, 0.612, 0.375, 0.612, 0.410);
    ret(doc, w, h, 0.300, 0.410, 0.615, 0.450, { esp: 1.3, preench: [206, 232, 232] });
    txt(doc, w, h, 0.457, 0.434, 'TC SEM CONTRASTE', { tam: 9.5, negrito: true, align: 'center' });
    ret(doc, w, h, 0.640, 0.410, 0.740, 0.442, { esp: 1 });
    campoLinha(doc, w, h, 0.650, 0.430, 0.080, '', textoEtapaHora(e('tc_cranio')), { tam: 7.4 });
    txt(doc, w, h, 0.690, 0.421, 'Horário:', { tam: 7, align: 'center' });
    ret(doc, w, h, 0.640, 0.446, 0.740, 0.462, { esp: 0, preench: [110, 110, 110] });
    txt(doc, w, h, 0.690, 0.4565, 'Meta: 25 min', { tam: 6.6, align: 'center', cor: [255, 255, 255] });

    seta(doc, w, h, 0.457, 0.450, 0.457, 0.478);
    diam(doc, w, h, 0.457, 0.505, 0.105, 0.033, { preench: [222, 240, 248] });
    txt(doc, w, h, 0.457, 0.507, 'HD confirmada?', { tam: 7.6, align: 'center' });
    txt(doc, w, h, 0.322, 0.487, 'NÃO', { tam: 8, negrito: true });
    seta(doc, w, h, 0.352, 0.505, 0.300, 0.505);
    ret(doc, w, h, 0.040, 0.485, 0.300, 0.522, { esp: 1 });
    txt(doc, w, h, 0.048, 0.500, 'Exclusão do protocolo', { tam: 7.4 });
    txt(doc, w, h, 0.048, 0.514, 'Investigar outras patologias', { tam: 7.4 });
    if (p.status === 'cancelado') txt(doc, w, h, 0.190, 0.514, '— ' + fmtDataHora(p.finalizadoEm), { tam: 6.6, cor: COR_TINTA });
    ret(doc, w, h, 0.640, 0.487, 0.740, 0.519, { esp: 1 });
    campoLinha(doc, w, h, 0.650, 0.505, 0.080, '', textoEtapaHora(e('hd_confirmada')), { tam: 7.4 });
    txt(doc, w, h, 0.690, 0.498, 'Horário:', { tam: 7, align: 'center' });
    ret(doc, w, h, 0.615, 0.524, 0.765, 0.540, { esp: 0, preench: [110, 110, 110] });
    txt(doc, w, h, 0.690, 0.5345, 'Meta: 45 min', { tam: 6.6, align: 'center', cor: [255, 255, 255] });

    txt(doc, w, h, 0.410, 0.538, 'SIM', { tam: 8, negrito: true });
    seta(doc, w, h, 0.457, 0.538, 0.457, 0.562);
    diam(doc, w, h, 0.457, 0.592, 0.105, 0.032, { preench: [222, 240, 248] });
    txt(doc, w, h, 0.457, 0.590, 'TC com', { tam: 7.4, align: 'center' });
    txt(doc, w, h, 0.457, 0.599, 'sangue?', { tam: 7.4, align: 'center' });
    txt(doc, w, h, 0.322, 0.575, 'NÃO', { tam: 8, negrito: true });
    seta(doc, w, h, 0.352, 0.592, 0.300, 0.592);
    ret(doc, w, h, 0.065, 0.578, 0.300, 0.606, { esp: 1.3, preench: [206, 232, 232] });
    txt(doc, w, h, 0.182, 0.596, 'PROTOCOLO AVCi', { tam: 8.5, negrito: true, align: 'center' });
    txt(doc, w, h, 0.585, 0.578, 'SIM', { tam: 8, negrito: true });
    seta(doc, w, h, 0.562, 0.592, 0.615, 0.592);
    ret(doc, w, h, 0.615, 0.578, 0.720, 0.606, { esp: 1 });
    txt(doc, w, h, 0.667, 0.596, 'AVCH', { tam: 8.5, negrito: true, align: 'center' });

    seta(doc, w, h, 0.182, 0.606, 0.182, 0.628);
    diam(doc, w, h, 0.182, 0.665, 0.100, 0.040, { preench: [255, 255, 255] });
    txt(doc, w, h, 0.182, 0.660, 'Contra-indicação', { tam: 7.2, align: 'center' });
    txt(doc, w, h, 0.182, 0.669, 'para trombólise', { tam: 7.2, align: 'center' });
    txt(doc, w, h, 0.305, 0.650, 'NÃO', { tam: 8, negrito: true });
    seta(doc, w, h, 0.282, 0.665, 0.350, 0.665);
    txt(doc, w, h, 0.130, 0.725, 'SIM', { tam: 8, negrito: true });
    seta(doc, w, h, 0.182, 0.705, 0.182, 0.740);
    ret(doc, w, h, 0.055, 0.760, 0.270, 0.828, { esp: 1 });
    ['AAS 100-300mg/d', 'Profilaxia TEV', 'Estatina'].forEach(function(l, i) { txt(doc, w, h, 0.065, 0.782 + i * 0.021, l, { tam: 8 }); });

    var faixas = [{ y: 0.660, label: '< 4,5h', box: ['tPA EV 0,9mg/Kg'], destaque: true }, { y: 0.710, label: '4,5 a 8h', box: ['Considerar', 'Hemodinâmica'] }, { y: 0.762, label: '> 8h', box: ['AAS 100-300mg/d', 'Profilaxia TEV', 'Estatina'] }];
    lin(doc, w, h, 0.350, 0.650, 0.350, 0.770);
    faixas.forEach(function(f) {
        seta(doc, w, h, 0.350, f.y, 0.462, f.y);
        ret(doc, w, h, 0.462, f.y - 0.014, 0.575, f.y + 0.014, { esp: 1 });
        txt(doc, w, h, 0.5185, f.y + 0.003, f.label, { tam: 8.4, negrito: true, align: 'center' });
        seta(doc, w, h, 0.575, f.y, 0.618, f.y);
    });
    ret(doc, w, h, 0.618, 0.646, 0.750, 0.674, { esp: 1, preench: [206, 232, 232] });
    txt(doc, w, h, 0.684, 0.663, 'tPA EV 0,9mg/Kg', { tam: 7.6, negrito: true, align: 'center' });
    ret(doc, w, h, 0.800, 0.638, 0.965, 0.682, { esp: 1 });
    campoLinha(doc, w, h, 0.810, 0.658, 0.145, 'Horário:', textoEtapaHora(e('trombolise')), { tam: 7.2 });
    ret(doc, w, h, 0.800, 0.685, 0.965, 0.700, { esp: 0, preench: [110, 110, 110] });
    txt(doc, w, h, 0.882, 0.6955, 'Meta: 1h', { tam: 7, align: 'center', cor: [255, 255, 255] });
    ret(doc, w, h, 0.618, 0.696, 0.750, 0.726, { esp: 1 });
    txt(doc, w, h, 0.684, 0.708, 'Considerar', { tam: 7.6, align: 'center' });
    txt(doc, w, h, 0.684, 0.720, 'Hemodinâmica', { tam: 7.6, align: 'center' });
    ret(doc, w, h, 0.618, 0.740, 0.750, 0.786, { esp: 1 });
    ['AAS 100-300mg/d', 'Profilaxia TEV', 'Estatina'].forEach(function(l, i) { txt(doc, w, h, 0.628, 0.755 + i * 0.014, l, { tam: 7.2 }); });

    var dest = e('destino'), vdest = (dest && dest.feita ? dest.valor : '').toLowerCase();
    ret(doc, w, h, 0.055, 0.838, 0.270, 0.918, { esp: 1 });
    txt(doc, w, h, 0.065, 0.852, 'Destino:', { tam: 8, negrito: true });
    var destinos = [['Alta do PS', 'alta'], ['Internação UTI', 'uti'], ['Internação UI', 'ui'], ['Óbito', 'bito']];
    destinos.forEach(function(d, i) {
        var yy = 0.862 + i * 0.0135;
        var hit = vdest.indexOf(d[1]) !== -1;
        ret(doc, w, h, 0.135, yy - 0.007, 0.147, yy - 0.007 + 0.012 * (w / h), { esp: 0.7 });
        if (hit) txt(doc, w, h, 0.1355, yy + 0.0025, 'X', { tam: 6.4, negrito: true, cor: COR_TINTA });
        txt(doc, w, h, 0.155, yy + 0.003, d[0], { tam: 7.2, negrito: true });
    });
    txt(doc, w, h, 0.478, 0.928, 'Médico Responsável', { tam: 8, align: 'center' });
    lin(doc, w, h, 0.355, 0.958, 0.610, 0.958);
    txt(doc, w, h, 0.790, 0.928, 'Enfermeira Responsável', { tam: 8, align: 'center' });
    lin(doc, w, h, 0.665, 0.958, 0.925, 0.958);
}
function desenharAvcP2(doc, w, h) {
    txt(doc, w, h, 0.5, 0.035, 'PROTOCOLO AVC — Escala NIHSS e Critérios de Trombólise', { tam: 11.5, negrito: true, align: 'center' });
    txt(doc, w, h, 0.5, 0.055, '(referência clínica — sem preenchimento automático)', { tam: 8, align: 'center', cor: [120, 120, 120] });
    ret(doc, w, h, 0.03, 0.075, 0.485, 0.093, { esp: 0, preench: [235, 235, 235] });
    txt(doc, w, h, 0.257, 0.088, 'Contraindicações Absolutas', { tam: 8.5, negrito: true, align: 'center' });
    var absolutas = ['1. Sangramento ativo', '2. Plaquetas < 100.000', '3. Glicose < 50 ou > 400mg/dl', '4. TTPa alargado, TP>15s ou INR>1,7', '5. Cirurgia intracraniana/espinhal recente', '6. Punção lombar nos últimos 7 dias', '7. Suspeita de HSA apesar de TC normal', '8. Hemorragia intracraniana prévia/MAV', '9. PAS>185 ou PAD>110mmHg sustentada', '10. TCE importante/AVC extenso <3 meses', '11. Punção arterial/venosa não compressível <7d', '12. Uso de anticoagulante direto <2 dias'];
    absolutas.forEach(function(l, i) { txt(doc, w, h, 0.035, 0.108 + i * 0.0165, l, { tam: 7 }); });

    ret(doc, w, h, 0.03, 0.385, 0.485, 0.403, { esp: 0, preench: [235, 235, 235] });
    txt(doc, w, h, 0.257, 0.398, 'Contraindicações Relativas', { tam: 8.5, negrito: true, align: 'center' });
    var relativas = ['1. Idade < 18 anos', '2. Déficit clínico leve ou em resolução', '3. Cirurgia de grande porte/trauma <14 dias', '4. Hemorragia GI/GU <21 dias, varizes esôfago', '5. TC com sinais precoces extensos (>1/3 ACM)', '6. Crise epiléptica precedendo o AVC', '7. Pericardite ativa, aborto recente, gravidez', '8. IAM nos últimos 3 meses'];
    relativas.forEach(function(l, i) { txt(doc, w, h, 0.035, 0.418 + i * 0.0165, l, { tam: 7 }); });

    ret(doc, w, h, 0.515, 0.075, 0.965, 0.093, { esp: 0, preench: [235, 235, 235] });
    txt(doc, w, h, 0.740, 0.088, 'Escala NIHSS — Categorias', { tam: 8.5, negrito: true, align: 'center' });
    var nihss = ['1A. Nível de consciência (0-3)', '1B. Perguntar mês/idade (0-2)', '1C. Piscar/apertar mãos (0-2)', '2. Movimento ocular horizontal (0-2)', '3. Campo visual (0-3)', '4. Paralisia facial (0-3)', '5A/5B. Força muscular MSE/MSD (0-5 cada)', '6A/6B. Força muscular MID/MIE (0-5 cada)', '7. Ataxia (0-2)', '8. Sensibilidade (0-2)', '9. Afasia/linguagem (0-3)', '10. Disartria (0-2)', '11. Extinção/desatenção (0-2)'];
    nihss.forEach(function(l, i) { txt(doc, w, h, 0.520, 0.108 + i * 0.0175, l, { tam: 7 }); });
    txt(doc, w, h, 0.740, 0.500, 'Pontuação total: soma de todas as categorias (0 a 42)', { tam: 7.4, align: 'center', cor: [90, 90, 90] });
}
function desenharAvcP3(doc, w, h, p, logo) {
    if (logo) { try { doc.addImage(logo, 'PNG', _fx(w, 0.38), _fy(h, 0.06), _fx(w, 0.24), _fy(h, 0.052)); } catch (e) {} }
    ret(doc, w, h, 0.62, 0.145, 0.94, 0.230, { esp: 1 });
    txt(doc, w, h, 0.78, 0.192, 'ETIQUETA DO PACIENTE', { tam: 9, align: 'center' });
    txt(doc, w, h, 0.5, 0.290, 'PROTOCOLO DE AVC', { tam: 14, negrito: true, align: 'center' });
    txt(doc, w, h, 0.14, 0.345, '•  Hemograma', { tam: 9.5 });
    txt(doc, w, h, 0.14, 0.365, '•  TP', { tam: 9.5 });
    txt(doc, w, h, 0.14, 0.385, '•  TTPA', { tam: 9.5 });

    campoLinha(doc, w, h, 0.135, 0.435, 0.330, 'Horário da Abertura do Protocolo:', fmtHoraCurta(p.criadoEm), { tam: 8.2 });
    campoLinha(doc, w, h, 0.560, 0.435, 0.360, 'Responsável:', p.criadoPor ? nomeDe(p.criadoPor) : '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.135, 0.470, 0.330, 'Horário da Coleta:', '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.560, 0.470, 0.360, 'Responsável:', '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.135, 0.505, 0.330, 'Horário Recebimento no Laboratório:', '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.560, 0.505, 0.360, 'Responsável:', '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.135, 0.540, 0.330, 'Horário de Liberação do Resultado:', '', { tam: 8.2 });
    campoLinha(doc, w, h, 0.560, 0.540, 0.360, 'Responsável:', '', { tam: 8.2 });

    ret(doc, w, h, 0.12, 0.615, 0.88, 0.700, { esp: 1 });
    txt(doc, w, h, 0.135, 0.632, 'Observação:', { tam: 8, negrito: true });
    txt(doc, w, h, 0.62, 0.712, 'Este formulário não dispensa o pedido médico integrado ou manual', { tam: 8.6, negrito: true, align: 'center' });
}

var FORMULARIOS_PDF = {
    sepse: { paginas: [{ w: 575, h: 842, desenhar: desenharSepseP1 }, { w: 595, h: 782, desenhar: desenharSepseP2 }] },
    dor_toracica: { paginas: [{ w: 595, h: 830, desenhar: desenharDorP1 }, { w: 587, h: 842, desenhar: desenharDorP2 }] },
    avc: { paginas: [{ w: 571, h: 843, desenhar: desenharAvcP1 }, { w: 595, h: 834, desenhar: desenharAvcP2 }, { w: 575, h: 842, desenhar: desenharAvcP3 }] }
};

function gerarPDFProtocolo(p) {
    var form = FORMULARIOS_PDF[p.tipo];
    if (!form) return gerarPDFGenerico(p);
    return carregarLogoBase64().then(function(logo) {
        var primeira = form.paginas[0];
        var doc = new window.jspdf.jsPDF({ unit: 'pt', format: [primeira.w, primeira.h] });
        form.paginas.forEach(function(pg, idx) {
            if (idx > 0) doc.addPage([pg.w, pg.h]);
            doc.setPage(idx + 1);
            try { pg.desenhar(doc, pg.w, pg.h, p, logo); } catch (e) { console.error('Erro ao desenhar página ' + (idx + 1) + ':', e); }
        });

        // Página final — linha do tempo digital completa (auditoria complementar ao formulário)
        doc.addPage('a4', 'portrait');
        doc.setPage(form.paginas.length + 1);
        var pageW = doc.internal.pageSize.getWidth();
        var margin = 40, y = margin;
        var tipoInfo = TIPOS[p.tipo] || { label: p.tipo };
        if (logo) { try { doc.addImage(logo, 'PNG', margin, y, 90, 32); } catch (e) {} }
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
        doc.text('LINHA DO TEMPO DIGITAL — Protocolo de ' + tipoInfo.label, pageW - margin, y + 16, { align: 'right' });
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text('Auditoria completa do sistema — complementar às páginas do formulário institucional acima', pageW - margin, y + 30, { align: 'right' });
        y += 56;
        doc.setDrawColor(0); doc.line(margin, y, pageW - margin, y); y += 16;
        var nome = (p.paciente && p.paciente.nome) ? p.paciente.nome.toUpperCase() : '--';
        doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text(nome, margin, y); y += 16;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        doc.text('Prontuário: ' + ((p.paciente && p.paciente.prontuario) || '--') + '    Abertura: ' + fmtDataHora(p.criadoEm) + '    Status: ' + p.status, margin, y); y += 16;

        y = desenharTabela(doc, margin, y, pageW - margin * 2, ['Data/Hora', 'Autor', 'Registro'], [0.2, 0.25, 0.55],
            (p.timeline || []).map(function(t) { return [fmtDataHora(t.ts), t.autor + (t.estacao ? ' (' + estacaoTxt(t.estacao) + ')' : ''), t.texto]; }), 'REGISTRO CRONOLÓGICO');

        return Promise.resolve(doc);
    });
}

function gerarPDFGenerico(p) {
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
        doc.text((tipoInfo.labelReferencia || '') + ': ' + fmtDataHora(p.horaReferencia), margin, y); y += 12;
        doc.text('Abertura do protocolo (porta): ' + fmtDataHora(p.criadoEm) + ' por ' + (p.criadoPor ? nomeDe(p.criadoPor) : '--'), margin, y); y += 12;
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

// ===== RELATÓRIOS — DASHBOARD =====
// Indicadores de tempo-resposta calculados a partir dos próprios dados do sistema
// (sem interpretação/plano de ação — apenas os números). "obrigatoria:false" restringe
// o denominador aos casos em que a conduta foi de fato realizada (ex.: trombólise),
// espelhando como o indicador é lido na prática clínica.
// Indicadores nomeados e parametrizados para espelhar os reports de referência de cada
// protocolo (mesmos IND.01, 02... título e meta). "obrigatoria:true" usa como denominador
// todos os casos finalizados do período (falha quem não registrou); "obrigatoria:false"
// restringe aos casos em que a conduta condicional foi de fato realizada (ex.: trombólise).
var REL_INDICADORES = {
    sepse: [
        { chave: 'lactato', tipo: 'tempo', titulo: 'Resultado do lactato', meta: 60, obrigatoria: true },
        { chave: 'hemoculturas', chaveComparar: 'atb', tipo: 'ordem', titulo: 'Coletada hemocultura antes da administração do antibiótico', obrigatoria: true },
        { chave: 'atb', tipo: 'tempo', titulo: 'Administrado antibiótico', meta: 60, obrigatoria: true },
        { chave: 'reposicao_volemica', tipo: 'binario', titulo: 'Prescrita hidratação EV pelo médico' },
        { chave: 'reposicao_volemica', tipo: 'tempo', titulo: 'Hidratação checada pela enfermagem', meta: 60, obrigatoria: true },
        { tipo: 'cancelamento', titulo: 'Protocolos encerrados por não haver disfunção orgânica', motivo: 'Sem disfunção orgânica após o resultado do pacote sepse', neutro: true }
    ],
    dor_toracica: [
        { chave: 'ecg', tipo: 'tempo', titulo: 'ECG realizado e interpretado pelo médico', meta: 10, obrigatoria: true },
        { chave: 'avaliacao_ecg', tipo: 'tempo', titulo: 'Laudo do ECG', meta: 15, obrigatoria: true },
        { chave: 'telecardio', tipo: 'tempo', titulo: 'Resposta da TeleCárdio', meta: 30, obrigatoria: false },
        { chave: 'porta_balao', tipo: 'tempo', titulo: 'Porta-Balão', meta: 90, obrigatoria: false }
    ],
    avc: [
        { chave: 'tc_cranio', tipo: 'tempo', titulo: 'Porta → TC', meta: 25, obrigatoria: true },
        { chave: 'hd_confirmada', tipo: 'tempo', titulo: 'Porta → laudo da TC', meta: 45, obrigatoria: true },
        { chave: 'trombolise', tipo: 'tempo', titulo: 'Porta → agulha', meta: 60, obrigatoria: false },
        { chave: 'trombolise', tipo: 'janela', titulo: 'Trombólise com déficit', limiteMin: 270, limiteTxt: '4,5h', obrigatoria: false }
    ]
};

var relTipoAtual = 'sepse';
var relDe = null, relAte = null;

function protocolosNoPeriodo(tipo) {
    return protocolos.filter(function(p) {
        if (p.tipo !== tipo) return false;
        if (p.status === 'ativo') return false;
        var d = (p.criadoEm || '').substring(0, 10);
        return (!relDe || d >= relDe) && (!relAte || d <= relAte);
    });
}

function computarIndicador(lista, ind) {
    if (ind.tipo === 'binario') {
        var feitas = lista.filter(function(p) { var e = etapaPorChave(p, ind.chave); return e && e.feita; }).length;
        return { registros: lista.length, dentro: feitas, pct: lista.length ? (feitas / lista.length * 100) : null, media: null };
    }
    if (ind.tipo === 'ordem') {
        var dentroO = lista.filter(function(p) {
            var e1 = etapaPorChave(p, ind.chave), e2 = etapaPorChave(p, ind.chaveComparar);
            if (!e1 || !e1.feita || !e2 || !e2.feita) return false;
            return new Date(e1.horario || e1.feitaEm).getTime() <= new Date(e2.horario || e2.feitaEm).getTime();
        }).length;
        return { registros: lista.length, dentro: dentroO, pct: lista.length ? (dentroO / lista.length * 100) : null, media: null };
    }
    if (ind.tipo === 'cancelamento') {
        var nCanc = lista.filter(function(p) { return p.status === 'cancelado' && p.canceladoMotivo === ind.motivo; }).length;
        return { registros: lista.length, dentro: nCanc, pct: lista.length ? (nCanc / lista.length * 100) : null, media: null };
    }
    if (ind.tipo === 'janela') {
        var elegiveisJ = lista.filter(function(p) { var e = etapaPorChave(p, ind.chave); return e && e.feita; });
        var minutosJ = [], dentroJ = 0;
        elegiveisJ.forEach(function(p) {
            var e = etapaPorChave(p, ind.chave);
            var min = minutosEntre(p.horaReferencia, e.horario || e.feitaEm);
            minutosJ.push(min);
            if (min <= ind.limiteMin) dentroJ++;
        });
        var mediaJ = minutosJ.length ? Math.round(minutosJ.reduce(function(a, b) { return a + b; }, 0) / minutosJ.length) : null;
        return { registros: elegiveisJ.length, dentro: dentroJ, pct: elegiveisJ.length ? (dentroJ / elegiveisJ.length * 100) : null, media: mediaJ };
    }
    var elegiveis = ind.obrigatoria ? lista : lista.filter(function(p) { var e = etapaPorChave(p, ind.chave); return e && e.feita; });
    var minutos = [], dentroCount = 0;
    elegiveis.forEach(function(p) {
        var e = etapaPorChave(p, ind.chave);
        if (e && e.feita) {
            var min = minutosEntre(p.criadoEm, e.horario || e.feitaEm);
            minutos.push(min);
            if (min <= ind.meta) dentroCount++;
        }
    });
    var media = minutos.length ? Math.round(minutos.reduce(function(a, b) { return a + b; }, 0) / minutos.length) : null;
    return { registros: elegiveis.length, dentro: dentroCount, pct: elegiveis.length ? (dentroCount / elegiveis.length * 100) : null, media: media };
}
function corBarraIndicador(pct) { if (pct == null) return 'var(--text-tertiary)'; if (pct >= 90) return 'var(--success)'; if (pct >= 80) return 'var(--time-warn)'; return 'var(--danger)'; }

function renderRelatorios() {
    var hoje = getLocalISO().substring(0, 10);
    if (!relAte) relAte = hoje;
    if (!relDe) relDe = getLocalISO(new Date(Date.now() - 180 * 86400000)).substring(0, 10);
    var h = '<div class="rel-toolbar"><div class="rel-tipos">';
    ['sepse', 'dor_toracica', 'avc'].forEach(function(t) {
        h += '<button class="rel-tipo-btn' + (relTipoAtual === t ? ' on' : '') + '" onclick="mudarTipoRelatorio(\'' + t + '\')">' + esc(TIPOS[t].label) + '</button>';
    });
    h += '</div>';
    h += '<div class="rel-filter-field"><label>De</label><input type="date" id="rel-de" value="' + relDe + '" onchange="atualizarPeriodoRelatorio()"></div>';
    h += '<div class="rel-filter-field"><label>Até</label><input type="date" id="rel-ate" value="' + relAte + '" onchange="atualizarPeriodoRelatorio()"></div>';
    h += '<div class="rel-spacer"></div>';
    h += '<button class="btn-padrao" onclick="exportarExcelRelatorio()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>Exportar Excel</button>';
    h += '<button class="btn-padrao" onclick="imprimirRelatorio()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Imprimir</button>';
    h += '</div><div class="rel-page" id="rel-page"></div>';
    g('view-relatorios').innerHTML = h;
    renderizarPaginaRelatorio();
}
function mudarTipoRelatorio(t) { relTipoAtual = t; renderRelatorios(); }
function atualizarPeriodoRelatorio() { relDe = g('rel-de').value; relAte = g('rel-ate').value; renderizarPaginaRelatorio(); }

function renderizarPaginaRelatorio() {
    var tipo = relTipoAtual, tipoInfo = TIPOS[tipo], indicadores = REL_INDICADORES[tipo];
    var lista = protocolosNoPeriodo(tipo);
    var el = g('rel-page');
    var finalizados = lista.filter(function(p) { return p.status === 'finalizado'; }).length;
    var cancelados = lista.filter(function(p) { return p.status === 'cancelado'; }).length;

    var h = '<div class="rel-header"><h2>Protocolo de ' + esc(tipoInfo.label) + '</h2>';
    h += '<span>' + fmtData(relDe + 'T00:00') + ' a ' + fmtData(relAte + 'T00:00') + ' &middot; ' + lista.length + ' protocolos (' + finalizados + ' finalizados, ' + cancelados + ' cancelados)</span></div>';

    if (!lista.length) {
        h += '<div class="rel-empty">Nenhum protocolo de ' + esc(tipoInfo.label) + ' concluído neste período.</div>';
        el.innerHTML = h;
        return;
    }

    h += '<div class="rel-list">';
    indicadores.forEach(function(ind) {
        var r = computarIndicador(lista, ind);
        var cor = ind.neutro ? 'var(--accent)' : corBarraIndicador(r.pct);
        var pctTxt = r.pct == null ? 'N/A' : Math.round(r.pct) + '%';
        var metaTxt = metaTextoIndicador(ind).replace('&le; ', '≤ ');
        var subTxt = metaTxt + (r.registros ? (' · ' + r.dentro + ' de ' + r.registros + ' casos' + (r.media != null ? ' · média ' + fmtMin(r.media) : '')) : ' · sem casos elegíveis');
        h += '<div class="rel-list-row"><div class="rel-list-main"><div class="rel-list-label">' + esc(ind.titulo) + '</div><div class="rel-list-sub">' + subTxt + '</div></div>';
        h += '<div class="rel-list-bar-wrap"><div class="rel-list-track"><div class="rel-list-fill" style="width:' + (r.pct == null ? 0 : r.pct) + '%;background:' + cor + ';"></div></div><div class="rel-list-pct" style="color:' + cor + ';">' + pctTxt + '</div></div></div>';
    });
    h += '</div>';

    h += '<div class="rel-footer">Dados extraídos do sistema de Protocolos Clínicos em ' + fmtDataHora(agoraISO()) + '. Indicadores contados a partir da abertura do protocolo (tempo-porta), exceto o indicador de janela terapêutica, contado a partir da hora de referência informada na abertura do protocolo. Indicadores não obrigatórios consideram apenas os casos em que a conduta foi realizada.</div>';

    el.innerHTML = h;
}

function metaTextoIndicador(ind) {
    if (ind.tipo === 'binario') return 'registrada';
    if (ind.tipo === 'ordem') return 'ordem de coleta';
    if (ind.tipo === 'janela') return '&le; ' + ind.limiteTxt;
    if (ind.tipo === 'cancelamento') return 'do total de protocolos';
    return '&le; ' + ind.meta + 'min';
}

function imprimirRelatorio() {
    document.body.classList.add('imprimindo-relatorio');
    window.print();
    setTimeout(function() { document.body.classList.remove('imprimindo-relatorio'); }, 500);
}

function exportarExcelRelatorio() {
    var tipo = relTipoAtual, tipoInfo = TIPOS[tipo], indicadores = REL_INDICADORES[tipo];
    var lista = protocolosNoPeriodo(tipo);

    var indLinhas = [['Indicador', 'Meta', '% Atingido', 'Casos dentro da meta', 'Total de casos elegíveis']];
    indicadores.forEach(function(ind) {
        var r = computarIndicador(lista, ind);
        indLinhas.push([ind.titulo, metaTextoIndicador(ind).replace('&le; ', '<= '), r.pct == null ? null : Math.round(r.pct * 10) / 10, r.dentro, r.registros]);
    });

    var protocolosLinhas = [['Tipo', 'Paciente', 'Prontuário', 'Convênio', 'Abertura', 'Status', 'Desfecho'].concat(indicadores.map(function(i) { return i.titulo + (i.tipo === 'tempo' || i.tipo === 'janela' ? ' (min)' : ''); }))];
    lista.forEach(function(p) {
        var linha = [tipoInfo.label, (p.paciente && p.paciente.nome) || '', (p.paciente && p.paciente.prontuario) || '', (p.paciente && p.paciente.convenio) || '', fmtDataHora(p.criadoEm), p.status, p.desfecho || p.canceladoMotivo || ''];
        indicadores.forEach(function(ind) {
            var e = etapaPorChave(p, ind.chave);
            if (ind.tipo === 'binario') { linha.push(e && e.feita ? 'Sim' : 'Não'); return; }
            if (ind.tipo === 'ordem') {
                var e2 = etapaPorChave(p, ind.chaveComparar);
                var ok = e && e.feita && e2 && e2.feita && new Date(e.horario || e.feitaEm).getTime() <= new Date(e2.horario || e2.feitaEm).getTime();
                linha.push(e && e.feita && e2 && e2.feita ? (ok ? 'Sim' : 'Não') : ''); return;
            }
            if (ind.tipo === 'janela') {
                linha.push(e && e.feita ? minutosEntre(p.horaReferencia, e.horario || e.feitaEm) : null); return;
            }
            if (ind.tipo === 'cancelamento') {
                linha.push(p.status === 'cancelado' && p.canceladoMotivo === ind.motivo ? 'Sim' : 'Não'); return;
            }
            linha.push(e && e.feita ? minutosEntre(p.criadoEm, e.horario || e.feitaEm) : null);
        });
        protocolosLinhas.push(linha);
    });

    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(indLinhas), 'Indicadores');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(protocolosLinhas), 'Protocolos');
    XLSX.writeFile(wb, 'Relatorio_' + tipoInfo.label.replace(/\s+/g, '_') + '_' + relDe + '_a_' + relAte + '.xlsx');
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
