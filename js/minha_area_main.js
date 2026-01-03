const MA_Main = {
    sessao: null,
    isMgr: false,
    usersMap: {},
    userRoles: {},
    nameToIdsMap: {},

    init: async function() {
        this.sessao = JSON.parse(localStorage.getItem('usuario'));
        if(!this.sessao) { window.location.href='index.html'; return; }
        
        const f = this.sessao.funcao;
        this.isMgr = (f === 'Gestora' || f === 'Auditora');
        
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
            if(elAviso) {
                elAviso.classList.remove('hidden');
                if(f === 'Auditora') elAviso.innerHTML = '<i class="fas fa-search"></i> Modo Auditoria';
            }
            
            const selUser = document.getElementById('filtro-user');
            if(selUser) {
                const optMe = selUser.querySelector('option[value="me"]');
                if(optMe) optMe.remove();
                selUser.value = 'time';
                selUser.addEventListener('change', () => this.atualizarDashboard());
            }
        }

        await this.carregarUsuarios();
        
        if (this.isMgr) {
             const selUser = document.getElementById('filtro-user');
             if(selUser && (!selUser.value || selUser.value === 'me')) selUser.value = 'time';
        }

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
        // A lógica do seletor só se aplica se ele existir na tela
        const elType = document.getElementById('diario-period-type');
        const type = elType ? elType.value : 'mes';
        
        let dataInicio, dataFim;

        if (type === 'mes') {
            const mes = refDate.getMonth();
            dataInicio = new Date(ano, mes, 1).toISOString().split('T')[0];
            dataFim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];
        } else if (type === 'trimestre') {
            const elQ = document.getElementById('diario-select-quarter');
            const q = elQ ? parseInt(elQ.value) : 1;
            const mStart = (q - 1) * 3;
            dataInicio = new Date(ano, mStart, 1).toISOString().split('T')[0];
            dataFim = new Date(ano, mStart + 3, 0).toISOString().split('T')[0];
        } else if (type === 'semestre') {
            const elS = document.getElementById('diario-select-semester');
            const s = elS ? parseInt(elS.value) : 1;
            const mStart = (s - 1) * 6;
            dataInicio = new Date(ano, mStart, 1).toISOString().split('T')[0];
            dataFim = new Date(ano, mStart + 6, 0).toISOString().split('T')[0];
        } else if (type === 'ano') {
            dataInicio = `${ano}-01-01`;
            dataFim = `${ano}-12-31`;
        } else {
             // Fallback
             const mes = refDate.getMonth();
             dataInicio = new Date(ano, mes, 1).toISOString().split('T')[0];
             dataFim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];
        }

        let targetName = this.usersMap[this.sessao.id];
        let viewingTime = false;
        
        if (this.isMgr) {
            const val = document.getElementById('filtro-user').value;
            if (val === 'time') {
                viewingTime = true;
            } else if (val && val !== 'me') {
                targetName = this.usersMap[val];
            }
        }

        const { data: rawData } = await _supabase
            .from('producao')
            .select('*')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        const dadosNormalizados = MA_Diario.normalizarDadosPorNome(rawData || []);
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

        MA_Diario.atualizarKPIs(dadosFinais);
        MA_Diario.atualizarTabelaDiaria(dadosFinais, viewingTime);
        
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