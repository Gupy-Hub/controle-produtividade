// js/produtividade/main.js
const Produtividade = {
    supabase: null, // Será injetado pelo sistema principal se necessário, mas aqui usamos Sistema.supabase globalmente

    init: async function() {
        console.log("Módulo Produtividade Iniciado");
        this.configurarDataGlobal();
        
        // Carrega a aba padrão (Geral)
        this.mudarAba('geral');
    },

    configurarDataGlobal: function() {
        const dateInput = document.getElementById('global-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    },

    atualizarDataGlobal: function(novaData) {
        // Quando a data global muda, recarrega a aba ativa
        this.atualizarTodasAbas();
    },

    mudarAba: function(abaId) {
        // 1. Esconde todas as abas
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        // 2. Mostra a aba selecionada
        const abaAlvo = document.getElementById(`tab-${abaId}`);
        const btnAlvo = document.getElementById(`btn-${abaId}`);
        
        if (abaAlvo) abaAlvo.classList.remove('hidden');
        if (btnAlvo) btnAlvo.classList.add('active');

        // 3. Atualiza controles superiores (Filtros contextuais)
        document.getElementById('ctrl-geral').classList.add('hidden');
        document.getElementById('ctrl-consolidado').classList.add('hidden');
        document.getElementById('ctrl-performance').classList.add('hidden');
        
        const ctrlAlvo = document.getElementById(`ctrl-${abaId}`);
        if(ctrlAlvo) ctrlAlvo.classList.remove('hidden');

        // 4. Carrega os dados da aba específica
        if (abaId === 'geral' && this.Geral) this.Geral.init();
        if (abaId === 'consolidado' && this.Consolidado) this.Consolidado.init();
        if (abaId === 'performance' && this.Performance) this.Performance.init();
        if (abaId === 'matriz' && this.Matriz) this.Matriz.init();
    },
    
    // Função auxiliar chamada pelos listeners globais
    atualizarTodasAbas: function() {
        if(this.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) this.Geral.carregarTela();
        if(this.Consolidado && !document.getElementById('tab-consolidado').classList.contains('hidden')) this.Consolidado.carregar();
        if(this.Performance && !document.getElementById('tab-performance').classList.contains('hidden')) this.Performance.carregar();
        if(this.Matriz && !document.getElementById('tab-matriz').classList.contains('hidden')) this.Matriz.carregar();
    }
};

// Inicialização automática ao carregar o script
document.addEventListener('DOMContentLoaded', () => {
    // Pequeno delay para garantir que o Sistema.supabase esteja pronto
    setTimeout(() => {
        if(typeof Produtividade !== 'undefined') Produtividade.init();
    }, 100);
});