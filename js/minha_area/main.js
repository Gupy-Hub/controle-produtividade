// js/minha_area/main.js

const MinhaArea = {
    usuario: null, // O usuário cujos dados estão sendo exibidos na tela
    abaAtual: 'geral', // Aba ativa no momento

    init: async function() {
        console.log("Inicializando Minha Área...");
        
        // 1. Identificar quem está logado
        const usuarioLogado = Sistema.usuario;
        
        if (!usuarioLogado) {
            window.location.href = 'index.html';
            return;
        }

        // 2. Definir regras de acesso (Personalize os nomes dos cargos conforme seu Banco de Dados)
        // Ex: Se o cargo for um desses, tem visão de gestão.
        const cargosGestao = ['Administrador', 'Gestor', 'Gestora', 'Auditor', 'Auditora', 'CEO', 'Diretor'];
        
        // Verifica se o cargo do usuário está na lista OU se o nível de acesso for alto (ex: > 1)
        const temAcessoGestao = cargosGestao.includes(usuarioLogado.cargo) || (usuarioLogado.nivel && usuarioLogado.nivel >= 2);

        // 3. Configurar Contexto Inicial
        if (temAcessoGestao) {
            // É Gestor: Mostra o seletor e carrega a lista
            document.getElementById('container-selecao-view').classList.remove('hidden');
            await this.carregarSeletorUsuarios(usuarioLogado.id);
        } else {
            // É Assistente: Esconde o seletor e trava no próprio ID
            document.getElementById('container-selecao-view').classList.add('hidden');
            this.usuario = usuarioLogado;
            this.iniciarAbas(); // Inicia direto
        }
    },

    carregarSeletorUsuarios: async function(idLogado) {
        const select = document.getElementById('sel-usuario-view');
        select.innerHTML = '<option value="">Carregando...</option>';

        try {
            // Busca apenas usuários ativos
            const { data: usuarios, error } = await window.supabase
                .from('usuarios')
                .select('id, nome, cargo')
                .eq('ativo', true)
                .order('nome');

            if (error) throw error;

            select.innerHTML = '';

            // Popula o Select
            usuarios.forEach(u => {
                const option = document.createElement('option');
                option.value = u.id;
                option.textContent = `${u.nome} (${u.cargo || 'Colaborador'})`;
                select.appendChild(option);
            });

            // Define o valor inicial como o usuário logado (se ele estiver na lista)
            // Ou o primeiro da lista se preferir
            select.value = idLogado;
            
            // Define o contexto global da MinhaArea
            this.usuario = usuarios.find(u => u.id === idLogado) || usuarios[0];

            // Evento de Troca (O Pulo do Gato 🐈)
            select.addEventListener('change', (e) => {
                const novoId = parseInt(e.target.value);
                const novoUsuario = usuarios.find(u => u.id === novoId);
                
                if (novoUsuario) {
                    console.log(`Alterando visão para: ${novoUsuario.nome}`);
                    this.usuario = novoUsuario; // Atualiza o contexto
                    this.carregarAbaAtual();    // Recarrega apenas a aba visível
                }
            });

            // Inicia as abas após carregar o seletor
            this.iniciarAbas();

        } catch (erro) {
            console.error("Erro ao carregar lista de usuários:", erro);
            alert("Erro ao carregar lista de equipe.");
        }
    },

    iniciarAbas: function() {
        // Inicializa os listeners dos botões de menu
        const botoes = document.querySelectorAll('.tab-btn'); // Certifique-se que seus botões têm essa classe
        botoes.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove ativo dos outros
                botoes.forEach(b => b.classList.remove('active', 'text-blue-600', 'border-b-2', 'border-blue-600'));
                
                // Ativa o atual
                e.target.classList.add('active', 'text-blue-600', 'border-b-2', 'border-blue-600');
                
                // Define aba atual e carrega
                const aba = e.target.getAttribute('data-aba'); // Ex: 'geral', 'metas'
                this.mudarAba(aba);
            });
        });

        // Carrega a aba padrão (Geral/Dia a Dia)
        this.mudarAba('geral');
    },

    mudarAba: function(nomeAba) {
        this.abaAtual = nomeAba;
        
        // Esconde todas as seções
        document.querySelectorAll('.aba-conteudo').forEach(div => div.classList.add('hidden'));
        
        // Mostra a seção selecionada
        const section = document.getElementById(`aba-${nomeAba}`);
        if(section) section.classList.remove('hidden');

        this.carregarAbaAtual();
    },

    carregarAbaAtual: function() {
        // Roteador simples para chamar a função de carregamento da aba correta
        console.log(`Carregando dados de ${this.usuario.nome} na aba ${this.abaAtual}`);

        switch(this.abaAtual) {
            case 'geral':
                if(MinhaArea.Geral) MinhaArea.Geral.carregar();
                break;
            case 'metas':
                if(MinhaArea.Metas) MinhaArea.Metas.carregar();
                break;
            case 'assertividade':
                if(MinhaArea.Assertividade) MinhaArea.Assertividade.carregar();
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

    // Funções utilitárias globais para as abas
    getDatasFiltro: function() {
        // Pega as datas dos inputs globais ou define padrão (Mês atual)
        const inicio = document.getElementById('data-inicio')?.value || new Date().toISOString().slice(0, 8) + '01';
        const fim = document.getElementById('data-fim')?.value || new Date().toISOString().slice(0, 10);
        return { inicio, fim };
    }
};

// Inicializa quando o documento estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que o Sistema.js já rodou a auth
    setTimeout(() => MinhaArea.init(), 500);
});