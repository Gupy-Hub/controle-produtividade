let _supabase = null;

const MA_Main = {
    sessao: null,
    isMgr: false,
    usersMap: {},
    userRoles: {},

    init: async function() {
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            _supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = _supabase; 
        } else {
            alert("Erro: Credenciais do banco de dados não encontradas.");
            return;
        }

        this.sessao = JSON.parse(localStorage.getItem('usuario'));
        if(!this.sessao) { window.location.href='index.html'; return; }
        
        const f = this.sessao.funcao;
        this.isMgr = (f === 'Gestora' || f === 'Auditora');
        
        if (typeof Sistema !== 'undefined' && Sistema.Dados) {
            await Sistema.Dados.inicializar();
        }

        const inputData = document.getElementById('global-date');
        if (inputData) {
            const dataSalva = localStorage.getItem('produtividade_data_ref') || new Date().toISOString().split('T')[0];
            inputData.value = dataSalva;
        }

        if (this.isMgr) {
            const elFiltro = document.getElementById('container-filtro-user');
            if(elFiltro) elFiltro.classList.remove('hidden');
            const selUser = document.getElementById('filtro-user');
            if(selUser) selUser.addEventListener('change', () => this.atualizarDashboard(true));
        }

        await this.carregarMapaUsuarios();
        
        if (this.isMgr) {
             const selUser = document.getElementById('filtro-user');
             if(selUser && (!selUser.value || selUser.value === 'me')) selUser.value = 'time';
        }

        this.mudarAba('diario');
        this.atualizarDashboard();
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.view-tab').forEach(el => el.classList.add('hidden')); 
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        document.getElementById(`tab-${aba}`).classList.remove('hidden'); 
        document.getElementById(`btn-${aba}`).classList.add('active');
        
        const ctrlEvo = document.getElementById('ctrl-evolucao');
        if (ctrlEvo) {
            if (aba === 'evolucao') {
                ctrlEvo.classList.remove('hidden');
                if(typeof MA_Evolucao !== 'undefined') MA_Evolucao.renderizarGraficos('mes');
            } else {
                ctrlEvo.classList.add('hidden');
            }
        }
        if (aba === 'comparativo') this.atualizarDashboard();
    },

    carregarMapaUsuarios: async function() {
        const { data } = await _supabase.from('usuarios').select('id, nome, funcao').order('nome');
        if(data) {
            const selectFeedback = document.getElementById('feedback-destinatario');
            data.forEach(u => {
                this.usersMap[u.id] = u.nome;
                this.userRoles[u.id] = u.funcao; 
                if(u.id !== this.sessao.id && selectFeedback) {
                    const exists = Array.from(selectFeedback.options).some(o => o.value == u.id);
                    if (!exists) {
                        const optF = document.createElement('option'); optF.value = u.id; optF.text = `👤 ${u.nome}`; selectFeedback.appendChild(optF);
                    }
                }
            });
        }
    },

    atualizarSeletorDinamico: function(rawData) {
        if (!this.isMgr) return;
        const selUser = document.getElementById('filtro-user');
        if (!selUser) return;
        const valorAtual = selUser.value;
        const usuariosNoPeriodo = new Set();
        if (rawData) {
            rawData.forEach(r => { if (this.userRoles[r.usuario_id] === 'Assistente') { usuariosNoPeriodo.add(r.usuario_id); } });
        }
        selUser.innerHTML = '';
        const optMe = document.createElement('option'); optMe.value = 'me'; optMe.text = '👤 Minha Visão';
        const optTime = document.createElement('option'); optTime.value = 'time'; optTime.text = '👥 Time (Média)';
        const optSep = document.createElement('option'); optSep.disabled = true; optSep.text = '──────────';
        selUser.appendChild(optMe); selUser.appendChild(optTime); selUser.appendChild(optSep);

        const listaOrdenada = Array.from(usuariosNoPeriodo).map(id => ({ id: id, nome: this.usersMap[id] || 'Desconhecido' })).sort((a, b) => a.nome.localeCompare(b.nome));
        listaOrdenada.forEach(u => { const opt = document.createElement('option'); opt.value = u.id; opt.text = u.nome; selUser.appendChild(opt); });

        if (valorAtual === 'me' || valorAtual === 'time' || usuariosNoPeriodo.has(parseInt(valorAtual))) { selUser.value = valorAtual; } else { selUser.value = 'time'; }
    },

    atualizarDashboard: async function(apenasTrocaDeUsuario = false) {
        const valData = document.getElementById('global-date').value;
        if (!valData) return;
        localStorage.setItem('produtividade_data_ref', valData);
        if(typeof MA_Checkin !== 'undefined') MA_Checkin.verificar(valData);

        const [y, m, d] = valData.split('-').map(Number);
        const ano = y; const mes = m;
        const dataInicio = new Date(ano, mes-1, 1).toISOString().split('T')[0];
        const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];

        let targetName = this.usersMap[this.sessao.id];
        let viewingTime = false;
        let isGestoraViewSelf = false;

        if (this.isMgr) {
            const val = document.getElementById('filtro-user').value;
            if (val === 'time') viewingTime = true;
            else if (val === 'me') isGestoraViewSelf = true;
            else targetName = this.usersMap[val];
        }

        const elConteudo = document.getElementById('conteudo-principal');
        const elAviso = document.getElementById('aviso-gestora-view');

        if (isGestoraViewSelf) {
            elConteudo.classList.add('hidden'); elAviso.classList.remove('hidden');
            if(typeof MA_Feedback !== 'undefined') MA_Feedback.carregar();
            return; 
        } else {
            elConteudo.classList.remove('hidden'); elAviso.classList.add('hidden');
        }

        const { data: rawData } = await _supabase.from('producao').select('*').gte('data_referencia', dataInicio).lte('data_referencia', dataFim);

        if (this.isMgr && !apenasTrocaDeUsuario) {
            this.atualizarSeletorDinamico(rawData);
            const novoVal = document.getElementById('filtro-user').value;
            if (novoVal === 'time') { viewingTime = true; }
            else if (novoVal !== 'me') { targetName = this.usersMap[novoVal]; viewingTime = false; }
        }

        const dadosNormalizados = MA_Diario.normalizarDados(rawData || []);
        let dadosFinais = [];

        if (viewingTime) {
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const prods = Object.values(dadosNormalizados[dia]);
                const total = prods.reduce((a, b) => a + b.quantidade, 0);
                const headcount = prods.length;
                let sumFatores = 0; prods.forEach(p => { sumFatores += Sistema.Dados.obterFator(p.nome, dia); });
                const mediaFator = headcount ? sumFatores/headcount : 1;
                dadosFinais.push({
                    data_referencia: dia, nome: 'Time',
                    quantidade: headcount ? Math.round(total / headcount) : 0,
                    meta_diaria: 650, meta_ajustada: Math.round(650 * mediaFator), fator: mediaFator
                });
            });
        } else {
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const dPessoa = dadosNormalizados[dia][targetName];
                const fator = Sistema.Dados.obterFator(targetName, dia);
                if (dPessoa) {
                    dadosFinais.push({
                        id: dPessoa.id_ref, nome: targetName,
                        data_referencia: dia, quantidade: dPessoa.quantidade,
                        meta_diaria: 650, meta_ajustada: Math.round(650 * fator), fator: fator,
                        observacao: dPessoa.observacao, observacao_gestora: dPessoa.observacao_gestora
                    });
                }
            });
        }

        if(typeof MA_Diario !== 'undefined') {
            MA_Diario.atualizarKPIs(dadosFinais);
            MA_Diario.atualizarTabela(dadosFinais, viewingTime, rawData);
        }
        
        if (!document.getElementById('tab-evolucao').classList.contains('hidden')) {
            const btnAtivo = document.querySelector('.chart-selector-btn.active');
            const periodo = btnAtivo ? (btnAtivo.id.replace('chart-btn-', '')) : 'mes';
            if(typeof MA_Evolucao !== 'undefined') MA_Evolucao.renderizarGraficos(periodo);
        }
        
        if(typeof MA_Comparativo !== 'undefined') MA_Comparativo.atualizar(dadosFinais, viewingTime, targetName, dataInicio, dataFim);
        if(typeof MA_Feedback !== 'undefined') MA_Feedback.carregar();
    }
};

document.addEventListener('DOMContentLoaded', () => MA_Main.init());