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
            
            const elAviso = document.getElementById('aviso-edicao');
            if(elAviso) {
                elAviso.classList.remove('hidden');
                if(f === 'Auditora') elAviso.innerHTML = '<i class="fas fa-search"></i> Modo Auditoria';
            }
            
            const selUser = document.getElementById('filtro-user');
            if(selUser) selUser.addEventListener('change', () => this.atualizarDashboard());
        }

        await this.carregarUsuarios();
        
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

    carregarUsuarios: async function() {
        const { data } = await _supabase.from('usuarios').select('id, nome, funcao').order('nome');
        if(data) {
            const selectFiltro = document.getElementById('filtro-user');
            const selectFeedback = document.getElementById('feedback-destinatario');
            
            if (this.isMgr && selectFiltro) {
                selectFiltro.innerHTML = '';
                const optTime = document.createElement('option'); optTime.value = 'time'; optTime.text = '👥 Time (Média)'; selectFiltro.appendChild(optTime);
                const optSep = document.createElement('option'); optSep.disabled = true; optSep.text = '──────────'; selectFiltro.appendChild(optSep);
            }

            data.forEach(u => {
                this.usersMap[u.id] = u.nome;
                this.userRoles[u.id] = u.funcao; 
                if(u.funcao === 'Assistente' && selectFiltro && this.isMgr) {
                    const opt = document.createElement('option'); opt.value = u.id; opt.text = u.nome; selectFiltro.appendChild(opt);
                }
                if(u.id !== this.sessao.id && selectFeedback) {
                    const optF = document.createElement('option'); optF.value = u.id; optF.text = `👤 ${u.nome}`; selectFeedback.appendChild(optF);
                }
            });
        }
    },

    atualizarDashboard: async function() {
        const valData = document.getElementById('global-date').value;
        if (!valData) return;
        
        localStorage.setItem('produtividade_data_ref', valData);

        // Atualiza Check-in
        if(typeof MA_Checkin !== 'undefined') MA_Checkin.verificar(valData);

        const [y, m, d] = valData.split('-').map(Number);
        
        // CORREÇÃO DE LÓGICA DE DUPLICIDADE
        let isGestoraViewSelf = false;
        let viewingTime = false;
        let targetName = this.usersMap[this.sessao.id];

        if (this.isMgr) {
            const val = document.getElementById('filtro-user').value;
            if (val === 'time') viewingTime = true;
            else if (val === 'me') isGestoraViewSelf = true;
            else targetName = this.usersMap[val];
        }

        const elConteudo = document.getElementById('conteudo-principal');
        const elAviso = document.getElementById('aviso-gestora-view');

        if (isGestoraViewSelf) {
            // Se for gestora vendo a si mesma, esconde TUDO do painel e mostra aviso
            elConteudo.classList.add('hidden');
            elAviso.classList.remove('hidden');
            if(typeof MA_Feedback !== 'undefined') MA_Feedback.carregar();
            return; // Sai da função para não carregar dados desnecessários
        } else {
            // Se for assistente ou gestora vendo time/assistente
            elConteudo.classList.remove('hidden');
            elAviso.classList.add('hidden');
        }

        const ano = y;
        const mes = m;
        const dataInicio = new Date(ano, mes-1, 1).toISOString().split('T')[0];
        const dataFim = new Date(ano, mes, 0).toISOString().split('T')[0];

        const { data: rawData } = await _supabase.from('producao')
            .select('*')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        const dadosNormalizados = MA_Diario.normalizarDados(rawData || []);
        let dadosFinais = [];

        if (viewingTime) {
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const prods = Object.values(dadosNormalizados[dia]);
                const total = prods.reduce((a, b) => a + b.quantidade, 0);
                const headcount = prods.length;
                
                let sumFatores = 0;
                prods.forEach(p => { sumFatores += Sistema.Dados.obterFator(p.nome, dia); });
                const mediaFator = headcount ? sumFatores/headcount : 1;

                dadosFinais.push({
                    data_referencia: dia, 
                    quantidade: headcount ? Math.round(total / headcount) : 0,
                    meta_diaria: 650, 
                    meta_ajustada: Math.round(650 * mediaFator),
                    observacao: `Média de ${headcount} assistentes`
                });
            });
        } else {
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const dPessoa = dadosNormalizados[dia][targetName];
                if (dPessoa) {
                    const fator = Sistema.Dados.obterFator(targetName, dia);
                    dadosFinais.push({
                        id: dPessoa.id_ref, 
                        data_referencia: dia, 
                        quantidade: dPessoa.quantidade,
                        meta_diaria: dPessoa.meta_diaria,
                        meta_ajustada: Math.round(dPessoa.meta_diaria * fator),
                        observacao: dPessoa.observacao, 
                        observacao_gestora: dPessoa.observacao_gestora
                    });
                }
            });
        }

        if(typeof MA_Diario !== 'undefined') {
            MA_Diario.atualizarKPIs(dadosFinais);
            MA_Diario.atualizarTabela(dadosFinais, viewingTime);
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