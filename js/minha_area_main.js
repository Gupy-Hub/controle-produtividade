let _supabase = null;

const MA_Main = {
    sessao: null,
    isMgr: false,
    usersMap: {},
    userRoles: {},
    nameToIdsMap: {},

    init: async function() {
        // 1. Inicialização do Supabase
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            _supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = _supabase; 
        } else {
            alert("Erro: Credenciais do banco de dados não encontradas.");
            return;
        }

        // 2. Validação de Sessão
        this.sessao = JSON.parse(localStorage.getItem('usuario'));
        if(!this.sessao) { window.location.href='index.html'; return; }
        
        const f = this.sessao.funcao;
        this.isMgr = (f === 'Gestora' || f === 'Auditora');
        
        // 3. Inicializa Sistema Base (Fatores, Datas)
        if (typeof Sistema !== 'undefined' && Sistema.Dados) {
            await Sistema.Dados.inicializar();
        }

        // 4. Configura Input de Data
        const inputData = document.getElementById('filtro-data-manual');
        if (inputData) {
            const dataSalva = localStorage.getItem('produtividade_data_ref') || new Date().toISOString().split('T')[0];
            const parts = dataSalva.split('-');
            inputData.value = `${parts[2]}/${parts[1]}/${parts[0]}`;
        }

        // 5. Configurações de Gestora
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

        this.atualizarDashboard();
    },

    // --- MÉTODOS AUXILIARES ---
    getDateFromInput: function() {
        const val = document.getElementById('filtro-data-manual').value;
        if(!val || val.length < 10) return new Date();
        const parts = val.split('/');
        return new Date(parts[2], parts[1]-1, parts[0]);
    },

    mascaraData: function(input) {
        let v = input.value.replace(/\D/g, "");
        if (v.length > 8) v = v.substring(0, 8);
        if (v.length >= 5) input.value = v.substring(0, 2) + "/" + v.substring(2, 4) + "/" + v.substring(4);
        else if (v.length >= 3) input.value = v.substring(0, 2) + "/" + v.substring(2);
        else input.value = v;
    },

    verificarEnter: function(e) { if(e.key === 'Enter') this.aplicarDataManual(); },

    aplicarDataManual: function() {
        const val = document.getElementById('filtro-data-manual').value;
        if(val.length === 10) {
            const parts = val.split('/');
            localStorage.setItem('produtividade_data_ref', `${parts[2]}-${parts[1]}-${parts[0]}`);
            this.atualizarDashboard();
        }
    },

    mudarAba: function(aba) {
        document.querySelectorAll('.view-tab').forEach(el => el.classList.add('hidden')); 
        document.querySelectorAll('.btn-tab').forEach(el => el.classList.remove('active'));
        
        document.getElementById(`tab-${aba}`).classList.remove('hidden'); 
        document.getElementById(`btn-${aba}`).classList.add('active');
        
        if(aba === 'evolucao' && typeof MA_Evolucao !== 'undefined') MA_Evolucao.renderizarGraficos('mes');
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
        const refDate = this.getDateFromInput();
        if (isNaN(refDate.getTime())) return;

        const ano = refDate.getFullYear();
        const mes = refDate.getMonth();
        const dataInicio = new Date(ano, mes, 1).toISOString().split('T')[0];
        const dataFim = new Date(ano, mes + 1, 0).toISOString().split('T')[0];

        let targetName = this.usersMap[this.sessao.id];
        let viewingTime = false;
        let isGestoraViewSelf = false;

        if (this.isMgr) {
            const val = document.getElementById('filtro-user').value;
            if (val === 'time') viewingTime = true;
            else if (val === 'me') isGestoraViewSelf = true;
            else targetName = this.usersMap[val];
        }

        if (isGestoraViewSelf) {
            document.getElementById('conteudo-principal').classList.add('hidden');
            document.getElementById('aviso-gestora-view').classList.remove('hidden');
            if(typeof MA_Feedback !== 'undefined') MA_Feedback.carregar();
            return;
        } else {
            document.getElementById('conteudo-principal').classList.remove('hidden');
            document.getElementById('aviso-gestora-view').classList.add('hidden');
        }

        const { data: rawData } = await _supabase.from('producao')
            .select('*')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        // Usa MA_Diario para normalizar (garante que existe no arquivo Geral)
        const dadosNormalizados = MA_Diario.normalizarDados(rawData || []);
        let dadosFinais = [];

        // Lógica de preparação de dados (Time vs Individual)
        if (viewingTime) {
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const prods = Object.values(dadosNormalizados[dia]);
                const total = prods.reduce((a, b) => a + b.quantidade, 0);
                const headcount = prods.length;
                
                // Média de fatores
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

        // Chamadas seguras aos módulos
        if(typeof MA_Diario !== 'undefined') {
            MA_Diario.atualizarKPIs(dadosFinais);
            MA_Diario.atualizarTabela(dadosFinais, viewingTime);
        }
        
        if (!document.getElementById('tab-evolucao').classList.contains('hidden')) {
            const btnAtivo = document.querySelector('.btn-chart.active');
            const periodo = btnAtivo ? (btnAtivo.id.replace('chart-btn-', '')) : 'mes';
            if(typeof MA_Evolucao !== 'undefined') MA_Evolucao.renderizarGraficos(periodo);
        }
        
        if(typeof MA_Comparativo !== 'undefined') MA_Comparativo.atualizar(dadosFinais, viewingTime, targetName, dataInicio, dataFim);
        if(typeof MA_Feedback !== 'undefined') MA_Feedback.carregar();
    }
};

document.addEventListener('DOMContentLoaded', () => MA_Main.init());