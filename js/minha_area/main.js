/* ARQUIVO: js/minha_area/main.js
   DESCRIÇÃO: Controlador Principal da Minha Área
   ATUALIZAÇÃO: Correção de Loop de Login + Seletor de Equipe Ativo
*/

const MinhaArea = {
    abaAtual: 'diario', // diario, metas, auditoria, comparativo, feedback
    usuarioAlvo: null, // ID do usuário sendo visualizado (null = eu mesmo)
    
    // Configuração inicial de datas
    periodo: {
        tipo: 'mes', // mes, semana, ano
        ano: new Date().getFullYear(),
        mes: new Date().getMonth(),
        semana: 1,
        sub: 'full' // S1, S2, T1...
    },

    init: async function() {
        console.log("🚀 Minha Área: Iniciando...");
        
        // --- LÓGICA DE ESPERA (ANTI-LOOP DE LOGIN) ---
        // O Sistema.js pode demorar alguns milissegundos para carregar o usuário.
        // Esperamos até 3 segundos (30 tentativas de 100ms) antes de desistir.
        let tentativas = 0;
        while (!Sistema.usuario && tentativas < 30) {
            await new Promise(r => setTimeout(r, 100)); // Espera 100ms
            tentativas++;
        }

        // Se após esperar, o Sistema.usuario ainda for nulo, tentamos buscar a sessão manualmente no Supabase
        if (!Sistema.usuario) {
            console.warn("⚠️ Usuário não detectado automaticamente. Tentando recuperação forçada...");
            const { data } = await Sistema.supabase.auth.getUser();
            
            if (!data || !data.user) {
                console.error("⛔ Sem sessão válida. Redirecionando para login.");
                window.location.href = 'index.html';
                return;
            }
            
            // Reconstrói o objeto usuário se achou a sessão
            Sistema.usuario = data.user;
            
            // Tenta buscar dados extras do perfil (nome, admin, etc)
            const { data: perfil } = await Sistema.supabase
                .from('usuarios')
                .select('*')
                .eq('id', data.user.id)
                .single();
                
            if (perfil) {
                Sistema.usuario = perfil;
            }
        }
        // -----------------------------------------------------

        console.log("✅ Usuário Identificado na Minha Área:", Sistema.usuario.email);

        // Define o alvo inicial como o próprio usuário logado
        this.usuarioAlvo = Sistema.usuario.id;

        // Inicializa os seletores visuais de data
        this.renderizarSeletoresData();

        // Carrega o seletor de equipe (caso o usuário seja gestor ou admin)
        await this.carregarSeletorEquipe();

        // Carrega a aba padrão (Dia a Dia)
        this.mudarAba('diario');
    },

    carregarSeletorEquipe: async function() {
        try {
            // Busca todos os usuários ativos para popular o dropdown
            const { data: usuarios, error } = await Sistema.supabase
                .from('usuarios')
                .select('id, nome, email')
                .eq('ativo', true)
                .order('nome', { ascending: true });

            if (error) throw error;

            if (usuarios && usuarios.length > 0) {
                const selector = document.getElementById('admin-user-selector');
                const container = document.getElementById('admin-selector-container');
                
                if (selector && container) {
                    // Limpa opções anteriores
                    selector.innerHTML = '';
                    
                    // Adiciona a opção "Eu mesmo" (Minha Visão)
                    const optionMe = document.createElement('option');
                    optionMe.value = Sistema.usuario.id;
                    optionMe.text = "Minha Visão (Eu)";
                    selector.appendChild(optionMe);

                    // Adiciona os outros membros da equipe
                    usuarios.forEach(u => {
                        if (u.id !== Sistema.usuario.id) {
                            const opt = document.createElement('option');
                            opt.value = u.id;
                            opt.text = u.nome || u.email;
                            selector.appendChild(opt);
                        }
                    });

                    // Remove a classe 'hidden' para mostrar o filtro na tela
                    container.classList.remove('hidden');
                    container.classList.add('flex');
                    
                    console.log("👥 Seletor de Equipe Ativado.");
                }
            }
        } catch (err) {
            console.error("Erro ao carregar seletor de equipe:", err);
            // Falha silenciosa: apenas não mostra o seletor se der erro
        }
    },

    mudarUsuarioAlvo: function(novoId) {
        console.log("🔄 Trocando visualização para o usuário:", novoId);
        this.usuarioAlvo = novoId;
        // Recarrega a aba atual com os dados do novo usuário selecionado
        this.carregarAbaAtual();
    },

    getUsuarioAlvo: function() {
        // Retorna o ID do usuário selecionado no filtro, ou o ID do usuário logado se não houver filtro
        return this.usuarioAlvo || (Sistema.usuario ? Sistema.usuario.id : null);
    },

    getDatasFiltro: function() {
        // Lógica centralizada de datas para todas as abas
        const ano = parseInt(this.periodo.ano);
        const mes = parseInt(this.periodo.mes);
        
        let inicio, fim;

        if (this.periodo.tipo === 'mes') {
            // Do dia 1 até o último dia do mês selecionado
            const dateIni = new Date(ano, mes, 1);
            const dateFim = new Date(ano, mes + 1, 0);
            inicio = dateIni.toISOString().split('T')[0];
            fim = dateFim.toISOString().split('T')[0];
        } 
        else if (this.periodo.tipo === 'semana') {
            // Lógica de semanas (1 a 5) dentro do mês
            const weekNum = parseInt(this.periodo.semana);
            const dateIni = new Date(ano, mes, (weekNum - 1) * 7 + 1);
            const dateFim = new Date(ano, mes, (weekNum - 1) * 7 + 7);
            
            // Ajuste para não pegar dias do mês seguinte
            const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
            if (dateFim.getDate() < dateIni.getDate()) dateFim.setDate(ultimoDiaMes); 
            
            inicio = dateIni.toISOString().split('T')[0];
            fim = dateFim.toISOString().split('T')[0];
        }
        else if (this.periodo.tipo === 'ano') {
            // Ano completo
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        }

        return { inicio, fim };
    },

    mudarAba: function(abaId) {
        // Atualiza visual dos botões (abas)
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const btnAtivo = document.getElementById(`btn-ma-${abaId}`);
        if (btnAtivo) btnAtivo.classList.add('active');

        // Esconde todas as telas e mostra a selecionada
        document.querySelectorAll('.ma-view').forEach(view => view.classList.add('hidden'));
        const viewAtiva = document.getElementById(`ma-tab-${abaId}`);
        if (viewAtiva) viewAtiva.classList.remove('hidden');

        // Atualiza o estado e carrega os dados
        this.abaAtual = abaId;
        this.carregarAbaAtual();
    },

    carregarAbaAtual: function() {
        // Garante que temos um alvo antes de carregar
        if (!MinhaArea.getUsuarioAlvo()) return;

        // Roteador para chamar o módulo correto
        switch(this.abaAtual) {
            case 'diario':
                if(MinhaArea.Geral) MinhaArea.Geral.carregar();
                break;
            case 'metas':
                if(MinhaArea.Metas) MinhaArea.Metas.carregar();
                break;
            case 'auditoria':
                if(MinhaArea.Auditoria) MinhaArea.Auditoria.carregar();
                break;
            case 'comparativo':
                if(MinhaArea.Comparativo) MinhaArea.Comparativo.carregar();
                break;
            case 'feedback':
                if(MinhaArea.Feedback) MinhaArea.Feedback.carregar();
                break;
        }
    },

    mudarPeriodo: function(tipo) {
        this.periodo.tipo = tipo;
        this.renderizarSeletoresData();
        this.salvarEAtualizar();
    },

    salvarEAtualizar: function() {
        // Atualiza o objeto de estado com os valores dos inputs
        this.periodo.ano = document.getElementById('sel-ano').value;
        this.periodo.mes = document.getElementById('sel-mes').value;
        // Recarrega a tela
        this.carregarAbaAtual();
    },

    renderizarSeletoresData: function() {
        // Gerencia a visibilidade dos dropdowns (Ano, Mês, Semana)
        const selMes = document.getElementById('sel-mes');
        const selSemana = document.getElementById('sel-semana');
        const selSub = document.getElementById('sel-subperiodo-ano');
        const btnMes = document.getElementById('btn-periodo-mes');
        const btnSemana = document.getElementById('btn-periodo-semana');
        const btnAno = document.getElementById('btn-periodo-ano');

        // Reseta estilo dos botões
        [btnMes, btnSemana, btnAno].forEach(b => {
            b.className = "px-3 py-1 text-xs font-bold rounded text-slate-500 hover:bg-white hover:shadow-sm transition";
        });

        // Esconde selects secundários por padrão
        selMes.classList.add('hidden');
        selSemana.classList.add('hidden');
        selSub.classList.add('hidden');

        // Lógica de exibição baseada no tipo selecionado
        if (this.periodo.tipo === 'mes') {
            selMes.classList.remove('hidden');
            btnMes.className = "px-3 py-1 text-xs font-bold rounded shadow-sm text-blue-600 bg-white transition";
        } else if (this.periodo.tipo === 'semana') {
            selMes.classList.remove('hidden');
            selSemana.classList.remove('hidden');
            btnSemana.className = "px-3 py-1 text-xs font-bold rounded shadow-sm text-blue-600 bg-white transition";
        } else {
            selSub.classList.remove('hidden');
            btnAno.className = "px-3 py-1 text-xs font-bold rounded shadow-sm text-blue-600 bg-white transition";
        }

        // Popula o select de Ano se estiver vazio
        const selAno = document.getElementById('sel-ano');
        if (selAno.options.length === 0) {
            const anoAtual = new Date().getFullYear();
            // Gera anos de 2024 até o atual
            for(let i = anoAtual; i >= 2024; i--) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.text = i;
                selAno.appendChild(opt);
            }
            selAno.value = this.periodo.ano;
        }
        
        // Garante que o mês visual está sincronizado com o estado
        document.getElementById('sel-mes').value = this.periodo.mes;
    }
};

// Inicia o controlador quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    MinhaArea.init();
});