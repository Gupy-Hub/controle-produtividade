let _supabase = null;

const MA_Main = {
    sessao: null,
    isMgr: false,
    usersMap: {}, // Mapeia ID -> Nome
    userRoles: {}, // Mapeia ID -> Função

    init: async function() {
        // 1. Inicializa Conexão
        if (window.supabase && window.SUPABASE_URL && window.SUPABASE_KEY) {
            _supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY);
            window._supabase = _supabase; 
        } else {
            alert("Erro: Credenciais do banco de dados não encontradas.");
            return;
        }

        // 2. Validação Sessão
        this.sessao = JSON.parse(localStorage.getItem('usuario'));
        if(!this.sessao) { window.location.href='index.html'; return; }
        
        const f = this.sessao.funcao;
        this.isMgr = (f === 'Gestora' || f === 'Auditora');
        
        // 3. Inicializa Sistema Base
        if (typeof Sistema !== 'undefined' && Sistema.Dados) {
            await Sistema.Dados.inicializar();
        }

        // 4. Data Inicial
        const inputData = document.getElementById('global-date');
        if (inputData) {
            const dataSalva = localStorage.getItem('produtividade_data_ref') || new Date().toISOString().split('T')[0];
            inputData.value = dataSalva;
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
            // Removemos o listener antigo para evitar conflito, pois agora o select é recriado
            // Mas mantemos caso o elemento seja estável. A função atualizarSeletor vai cuidar das options.
            if(selUser) selUser.addEventListener('change', () => this.atualizarDashboard(true)); 
            // Passamos 'true' para indicar que foi uma troca manual de usuário, para não recarregar o seletor novamente
        }

        // 6. Carrega Mapeamento de Usuários (ID -> Nome)
        await this.carregarMapaUsuarios();
        
        // 7. Define valor padrão inicial
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

    // Nova Função: Apenas carrega os dados para memória, NÃO preenche o select ainda
    carregarMapaUsuarios: async function() {
        const { data } = await _supabase.from('usuarios').select('id, nome, funcao').order('nome');
        if(data) {
            // Preenche selects estáticos como o de Feedback
            const selectFeedback = document.getElementById('feedback-destinatario');
            
            data.forEach(u => {
                this.usersMap[u.id] = u.nome;
                this.userRoles[u.id] = u.funcao; 
                
                if(u.id !== this.sessao.id && selectFeedback) {
                    // Evita duplicatas se chamar mais de uma vez
                    const exists = Array.from(selectFeedback.options).some(o => o.value == u.id);
                    if (!exists) {
                        const optF = document.createElement('option'); 
                        optF.value = u.id; 
                        optF.text = `👤 ${u.nome}`; 
                        selectFeedback.appendChild(optF);
                    }
                }
            });
        }
    },

    // Nova Função: Reconstrói o Select baseado QUEM TRABALHOU no período
    atualizarSeletorDinamico: function(rawData) {
        if (!this.isMgr) return; // Só para gestores

        const selUser = document.getElementById('filtro-user');
        if (!selUser) return;

        // 1. Guarda o valor atual selecionado para tentar manter depois
        const valorAtual = selUser.value;

        // 2. Identifica usuários únicos presentes nos dados de produção
        const usuariosNoPeriodo = new Set();
        if (rawData) {
            rawData.forEach(r => {
                // Só adiciona se for Assistente
                if (this.userRoles[r.usuario_id] === 'Assistente') {
                    usuariosNoPeriodo.add(r.usuario_id);
                }
            });
        }

        // 3. Limpa e Reconstrói o Select
        selUser.innerHTML = '';

        // Opções Padrão
        const optMe = document.createElement('option'); optMe.value = 'me'; optMe.text = '👤 Minha Visão';
        const optTime = document.createElement('option'); optTime.value = 'time'; optTime.text = '👥 Time (Média)';
        const optSep = document.createElement('option'); optSep.disabled = true; optSep.text = '──────────';
        const optLabel = document.createElement('option'); optLabel.disabled = true; optLabel.text = 'Assistentes no Período:';
        optLabel.className = "bg-slate-100 font-bold text-slate-400 text-[10px] uppercase";

        selUser.appendChild(optMe);
        selUser.appendChild(optTime);
        selUser.appendChild(optSep);
        selUser.appendChild(optLabel);

        // 4. Adiciona os usuários que trabalharam
        const listaOrdenada = Array.from(usuariosNoPeriodo).map(id => ({
            id: id,
            nome: this.usersMap[id] || 'Desconhecido'
        })).sort((a, b) => a.nome.localeCompare(b.nome));

        if (listaOrdenada.length === 0) {
            const optVazio = document.createElement('option'); 
            optVazio.disabled = true; 
            optVazio.text = '(Ninguém produziu)';
            selUser.appendChild(optVazio);
        } else {
            listaOrdenada.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.text = u.nome;
                selUser.appendChild(opt);
            });
        }

        // 5. Tenta restaurar a seleção anterior
        // Se o usuário selecionado não está na lista nova (ex: mudou o mês e ele não trabalhou), volta para "Time"
        if (valorAtual === 'me' || valorAtual === 'time') {
            selUser.value = valorAtual;
        } else if (usuariosNoPeriodo.has(parseInt(valorAtual))) {
            selUser.value = valorAtual;
        } else {
            selUser.value = 'time'; // Fallback
        }
    },

    // flag `apenasTrocaDeUsuario`: se true, não recarrega o seletor para evitar loop ou UX ruim
    atualizarDashboard: async function(apenasTrocaDeUsuario = false) {
        const valData = document.getElementById('global-date').value;
        if (!valData) return;
        
        localStorage.setItem('produtividade_data_ref', valData);

        if(typeof MA_Checkin !== 'undefined') MA_Checkin.verificar(valData);

        const [y, m, d] = valData.split('-').map(Number);
        const ano = y;
        const mes = m;
        // O Dashboard sempre carrega o MÊS inteiro para cálculos de evolução e média
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

        // Lógica de Visão da Gestora (Painel x Admin)
        const elConteudo = document.getElementById('conteudo-principal');
        const elAviso = document.getElementById('aviso-gestora-view');

        if (isGestoraViewSelf) {
            elConteudo.classList.add('hidden');
            elAviso.classList.remove('hidden');
            if(typeof MA_Feedback !== 'undefined') MA_Feedback.carregar();
            return; 
        } else {
            elConteudo.classList.remove('hidden');
            elAviso.classList.add('hidden');
        }

        // Busca dados do MÊS inteiro
        const { data: rawData } = await _supabase.from('producao')
            .select('*')
            .gte('data_referencia', dataInicio)
            .lte('data_referencia', dataFim);

        // --- AQUI ACONTECE A MÁGICA DO SELETOR DINÂMICO ---
        // Se não for apenas uma troca de usuário (ou seja, mudou a DATA), atualiza a lista
        if (this.isMgr && !apenasTrocaDeUsuario) {
            this.atualizarSeletorDinamico(rawData);
            
            // Re-verifica as variáveis de visualização caso o seletor tenha mudado automaticamente para 'time'
            const novoVal = document.getElementById('filtro-user').value;
            if (novoVal === 'time') { viewingTime = true; }
            else if (novoVal !== 'me') { targetName = this.usersMap[novoVal]; viewingTime = false; }
        }

        const dadosNormalizados = MA_Diario.normalizarDados(rawData || []);
        let dadosFinais = [];

        if (viewingTime) {
            // Lógica Time: Média de quem trabalhou naquele dia
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const prods = Object.values(dadosNormalizados[dia]);
                const total = prods.reduce((a, b) => a + b.quantidade, 0);
                const headcount = prods.length;
                
                let sumFatores = 0;
                prods.forEach(p => { sumFatores += Sistema.Dados.obterFator(p.nome, dia); });
                const mediaFator = headcount ? sumFatores/headcount : 1;

                dadosFinais.push({
                    data_referencia: dia,
                    nome: 'Time',
                    quantidade: headcount ? Math.round(total / headcount) : 0,
                    meta_diaria: 650, 
                    meta_ajustada: Math.round(650 * mediaFator),
                    fator: mediaFator
                });
            });
        } else {
            // Lógica Individual
            Object.keys(dadosNormalizados).sort().forEach(dia => {
                const dPessoa = dadosNormalizados[dia][targetName];
                // Pega fator para meta correta
                const fator = Sistema.Dados.obterFator(targetName, dia);
                
                if (dPessoa) {
                    dadosFinais.push({
                        id: dPessoa.id_ref,
                        nome: targetName,
                        data_referencia: dia, 
                        quantidade: dPessoa.quantidade,
                        meta_diaria: 650,
                        meta_ajustada: Math.round(650 * fator),
                        fator: fator,
                        observacao: dPessoa.observacao, 
                        observacao_gestora: dPessoa.observacao_gestora
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