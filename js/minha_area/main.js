/* ARQUIVO: js/minha_area/main.js
   DESCRIÇÃO: Controlador Principal da Minha Área
   ATUALIZAÇÃO: Habilita o seletor de equipe (Admin/Gestor)
*/

const MinhaArea = {
    abaAtual: 'diario', // diario, metas, auditoria, comparativo, feedback
    usuarioAlvo: null, // ID do usuário sendo visualizado (null = eu mesmo)
    
    // Cache de datas para evitar releituras desnecessárias
    periodo: {
        tipo: 'mes', // mes, semana, ano
        ano: new Date().getFullYear(),
        mes: new Date().getMonth(),
        semana: 1,
        sub: 'full' // S1, S2, T1...
    },

    init: async function() {
        console.log("🚀 Minha Área: Iniciando...");
        
        // 1. Verifica Login
        if (!Sistema || !Sistema.usuario) {
            window.location.href = 'index.html';
            return;
        }

        // 2. Define o alvo inicial como o próprio usuário logado
        this.usuarioAlvo = Sistema.usuario.id;

        // 3. Inicializa os seletores de data
        this.renderizarSeletoresData();

        // 4. Tenta carregar o seletor de equipe (Para Gestores/Admins)
        // DICA: Se quiser restringir, envolva em um if (Sistema.usuario.admin)
        await this.carregarSeletorEquipe();

        // 5. Carrega a aba padrão
        this.mudarAba('diario');
    },

    carregarSeletorEquipe: async function() {
        try {
            // Busca todos os usuários ativos para o seletor
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
                    // Limpa e popula
                    selector.innerHTML = '';
                    
                    // Opção "Eu mesmo" (ou o primeiro da lista se for admin estrito)
                    const optionMe = document.createElement('option');
                    optionMe.value = Sistema.usuario.id;
                    optionMe.text = "Minha Visão (Eu)";
                    selector.appendChild(optionMe);

                    // Adiciona os outros
                    usuarios.forEach(u => {
                        if (u.id !== Sistema.usuario.id) {
                            const opt = document.createElement('option');
                            opt.value = u.id;
                            opt.text = u.nome || u.email;
                            selector.appendChild(opt);
                        }
                    });

                    // Remove a classe 'hidden' para mostrar o filtro
                    container.classList.remove('hidden');
                    container.classList.add('flex');
                    
                    console.log("👥 Seletor de Equipe Ativado!");
                }
            }
        } catch (err) {
            console.error("Erro ao carregar equipe:", err);
            // Falha silenciosa: apenas não mostra o seletor
        }
    },

    mudarUsuarioAlvo: function(novoId) {
        console.log("🔄 Trocando usuário alvo para:", novoId);
        this.usuarioAlvo = novoId;
        // Recarrega a aba atual com o novo contexto
        this.carregarAbaAtual();
    },

    getUsuarioAlvo: function() {
        return this.usuarioAlvo || Sistema.usuario.id;
    },

    getDatasFiltro: function() {
        // Lógica centralizada de datas (usada por todas as abas)
        const ano = parseInt(this.periodo.ano);
        const mes = parseInt(this.periodo.mes);
        
        let inicio, fim;

        if (this.periodo.tipo === 'mes') {
            const dateIni = new Date(ano, mes, 1);
            const dateFim = new Date(ano, mes + 1, 0);
            inicio = dateIni.toISOString().split('T')[0];
            fim = dateFim.toISOString().split('T')[0];
        } 
        else if (this.periodo.tipo === 'semana') {
            // Lógica simplificada de semana (pode ser refinada)
            // Assumindo semana do mês (1 a 5)
            const weekNum = parseInt(this.periodo.semana);
            const dateIni = new Date(ano, mes, (weekNum - 1) * 7 + 1);
            const dateFim = new Date(ano, mes, (weekNum - 1) * 7 + 7);
            
            // Ajuste para não estourar o mês
            const ultimoDiaMes = new Date(ano, mes + 1, 0).getDate();
            if (dateFim.getDate() < dateIni.getDate()) dateFim.setDate(ultimoDiaMes); // Virada de mês
            
            inicio = dateIni.toISOString().split('T')[0];
            fim = dateFim.toISOString().split('T')[0];
        }
        else if (this.periodo.tipo === 'ano') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        }

        return { inicio, fim };
    },

    mudarAba: function(abaId) {
        // Atualiza visual dos botões
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const btnAtivo = document.getElementById(`btn-ma-${abaId}`);
        if (btnAtivo) btnAtivo.classList.add('active');

        // Esconde todas as views e mostra a selecionada
        document.querySelectorAll('.ma-view').forEach(view => view.classList.add('hidden'));
        const viewAtiva = document.getElementById(`ma-tab-${abaId}`);
        if (viewAtiva) viewAtiva.classList.remove('hidden');

        this.abaAtual = abaId;
        this.carregarAbaAtual();
    },

    carregarAbaAtual: function() {
        // Roteador de carregamento
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
        this.periodo.ano = document.getElementById('sel-ano').value;
        this.periodo.mes = document.getElementById('sel-mes').value;
        // Outros seletores se necessário
        
        this.carregarAbaAtual();
    },

    renderizarSeletoresData: function() {
        // Atualiza visibilidade dos combos (Ano, Mes, Semana...)
        // Simples toggle de classes hidden
        const selMes = document.getElementById('sel-mes');
        const selSemana = document.getElementById('sel-semana');
        const selSub = document.getElementById('sel-subperiodo-ano');
        const btnMes = document.getElementById('btn-periodo-mes');
        const btnSemana = document.getElementById('btn-periodo-semana');
        const btnAno = document.getElementById('btn-periodo-ano');

        // Reset visual botões
        [btnMes, btnSemana, btnAno].forEach(b => {
            b.className = "px-3 py-1 text-xs font-bold rounded text-slate-500 hover:bg-white hover:shadow-sm transition";
        });

        // Esconde todos selects secundários
        selMes.classList.add('hidden');
        selSemana.classList.add('hidden');
        selSub.classList.add('hidden');

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

        // Popula Ano se vazio
        const selAno = document.getElementById('sel-ano');
        if (selAno.options.length === 0) {
            const anoAtual = new Date().getFullYear();
            for(let i = anoAtual; i >= 2024; i--) {
                const opt = document.createElement('option');
                opt.value = i;
                opt.text = i;
                selAno.appendChild(opt);
            }
            selAno.value = this.periodo.ano;
        }
        
        document.getElementById('sel-mes').value = this.periodo.mes;
    }
};

// Auto-start
document.addEventListener('DOMContentLoaded', () => {
    MinhaArea.init();
});