const Produtividade = {
    supabase: null, 
    usuario: null,

    init: async function() {
        console.log("Módulo Produtividade Iniciado");
        
        // 1. Verificação de Segurança (App Único)
        const storedUser = localStorage.getItem('usuario_logado');
        if (!storedUser) {
            window.location.href = 'index.html';
            return;
        }
        this.usuario = JSON.parse(storedUser);

        // 2. Data Global
        this.configurarDataGlobal();

        // 3. Inicia na aba padrão
        this.mudarAba('geral');
    },

    configurarDataGlobal: function() {
        const dateInput = document.getElementById('global-date');
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }
    },

    atualizarDataGlobal: function(novaData) {
        this.atualizarTodasAbas();
    },

    mudarAba: function(abaId) {
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        const abaAlvo = document.getElementById(`tab-${abaId}`);
        const btnAlvo = document.getElementById(`btn-${abaId}`);
        
        if (abaAlvo) abaAlvo.classList.remove('hidden');
        if (btnAlvo) btnAlvo.classList.add('active');

        document.getElementById('ctrl-geral').classList.add('hidden');
        document.getElementById('ctrl-consolidado').classList.add('hidden');
        document.getElementById('ctrl-performance').classList.add('hidden');
        
        const ctrlAlvo = document.getElementById(`ctrl-${abaId}`);
        if(ctrlAlvo) ctrlAlvo.classList.remove('hidden');

        if (abaId === 'geral' && this.Geral) this.Geral.init();
        if (abaId === 'consolidado' && this.Consolidado) this.Consolidado.init();
        if (abaId === 'performance' && this.Performance) this.Performance.init();
        if (abaId === 'matriz' && this.Matriz) this.Matriz.init();
    },
    
    atualizarTodasAbas: function() {
        if(this.Geral && !document.getElementById('tab-geral').classList.contains('hidden')) this.Geral.carregarTela();
        if(this.Consolidado && !document.getElementById('tab-consolidado').classList.contains('hidden')) this.Consolidado.carregar();
        if(this.Performance && !document.getElementById('tab-performance').classList.contains('hidden')) this.Performance.carregar();
        if(this.Matriz && !document.getElementById('tab-matriz').classList.contains('hidden')) this.Matriz.carregar();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    // Timeout para garantir que o sistema base carregou
    setTimeout(() => {
        if(typeof Produtividade !== 'undefined') Produtividade.init();
    }, 100);
});