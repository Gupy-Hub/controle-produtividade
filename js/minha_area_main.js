const MA_Main = {
    sessao: null,
    isMgr: false,
    usersMap: {},
    userRoles: {},
    nameToIdsMap: {},

    init: async function() {
        this.sessao = JSON.parse(localStorage.getItem('usuario'));
        if(!this.sessao) { window.location.href='index.html'; return; }
        
        this.isMgr = this.sessao.funcao === 'Gestora';
        
        // Setup Inicial de Datas
        if (typeof Sistema !== 'undefined' && Sistema.Datas) {
            Sistema.Datas.criarInputInteligente('filtro-data-manual', 'produtividade_data_ref', () => this.atualizarDashboard());
        } else {
            document.getElementById('filtro-data-manual').value = new Date().toISOString().split('T')[0];
            document.getElementById('filtro-data-manual').addEventListener('change', () => this.atualizarDashboard());
        }

        if (this.isMgr) {
            const elFiltro = document.getElementById('container-filtro-user');
            if(elFiltro) elFiltro.classList.remove('hidden');
            const elAviso = document.getElementById('aviso-edicao');
            if(elAviso) elAviso.classList.remove('hidden');
            
            const selUser = document.getElementById('filtro-user');
            if(selUser) selUser.addEventListener('change', () => this.atualizarDashboard());
        }

        await this.carregarUsuarios();
        this.atualizarDashboard();
    },

    carregarUsuarios: async function() {
        const { data } = await _supabase.from('usuarios').select('id, nome, funcao').order('nome');
        if(data) {
            const selectFiltro = document.getElementById('filtro-user');
            const selectFeedback = document.getElementById('feedback-destinatario');
            
            data.forEach(u => {
                this.usersMap[u.id] = u.nome;
                this.userRoles[u.id] = u.funcao; 

                if(!this.nameToIdsMap[u.nome]) this.nameToIdsMap[u.nome] = [];
                this.nameToIdsMap[u.nome].push(u.id);

                if(this.nameToIdsMap[u.nome][0] === u.id) {
                    if(u.funcao === 'Assistente' && selectFiltro) {
                        const opt = document.createElement('option');
                        opt.value = u.id; opt.text = u.nome;
                        selectFiltro.appendChild(opt);
                    }
                    if(u.id !== this.sessao.id && selectFeedback) {
                        const optF = document.createElement('option');
                        optF.value = u.id; optF.text = `👤 ${u.nome}`;
                        selectFeedback.appendChild(optF);
                    }
                }
            });
        }
    },

    getDateFromInput: function() {
        const val = document.getElementById('filtro-data-manual').value;
        if(!val) return new Date();
        const parts = val.split('-');
        return new Date(parts[0], parts[1]-1, parts[2]);
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden')); 
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        const elAba = document.getElementById(`tab-${aba}`);
        const elBtn = document.getElementById(`btn-${aba}`);
        if(elAba) elAba.classList.remove('hidden');
        if(elBtn) elBtn.classList.add('active');
        
        if(aba === 'evolucao') MA_Evolucao.renderizarGraficos('mes');
        if(aba === 'comparativo') this.atualizarDashboard(); 
    },

    atualizarDashboard: async function() {
        const refDate = this.getDateFromInput();
        if (isNaN(refDate.getTime())) return;

        const ano = refDate.getFullYear();
        const mes = refDate.getMonth();
        const dataInicio = new Date(ano, mes, 1).toISOString().split('T')[0];
        const dataFim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];

        let targetName = this.usersMap[this.sessao.id];
        let viewingTime = false;
        
        if (this.isMgr) {
            const val = document.getElementById('filtro-user').value;
            if (val === 'time') viewingTime = true;
            else if (val !== 'me') targetName = this.usersMap[val];
        }

        // Buscar dados principais
        const { data: rawData } = await _supabase
            .from('producao')
            .select('*')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        // Processamento centralizado para Geral e Comparativo
        const dadosNormalizados = MA_Geral.normalizarDadosPorNome(rawData || []);
        let dadosFinais = [];

        if (viewingTime) {
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const prods = Object.values(dadosNormalizados[dia]);
                const total = prods.reduce((a, b) => a + b.quantidade, 0);
                const headcount = prods.length;
                dadosFinais.push({
                    data_referencia: dia, quantidade: headcount ? Math.round(total / headcount) : 0,
                    meta_diaria: 650, observacao: `Média de ${headcount} assistentes`
                });
            });
        } else {
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const dPessoa = dadosNormalizados[dia][targetName];
                if (dPessoa) {
                    dadosFinais.push({
                        id: dPessoa.id_ref, data_referencia: dia, quantidade: dPessoa.quantidade,
                        meta_diaria: dPessoa.meta_diaria, observacao: dPessoa.observacao, observacao_gestora: dPessoa.observacao_gestora
                    });
                }
            });
        }

        // Atualizar Módulos
        MA_Geral.atualizarKPIs(dadosFinais);
        MA_Geral.atualizarTabelaDiaria(dadosFinais, viewingTime);
        
        if (!document.getElementById('tab-evolucao').classList.contains('hidden')) {
            const btnAtivo = document.querySelector('.btn-chart.active');
            const periodo = btnAtivo ? (btnAtivo.id.replace('chart-btn-', '')) : 'mes';
            MA_Evolucao.renderizarGraficos(periodo);
        }
        
        MA_Comparativo.atualizar(dadosFinais, viewingTime, targetName, dataInicio, dataFim);
        MA_Feedback.carregar();
    }
};

document.addEventListener('DOMContentLoaded', () => MA_Main.init());