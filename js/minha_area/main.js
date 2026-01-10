const MinhaArea = {
    usuario: null,

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Identificar Usuário
        // Em produção, isso vem do Login. Aqui simulamos ou pegamos do cache.
        const storedUser = localStorage.getItem('usuario_ativo');
        this.usuario = storedUser ? JSON.parse(storedUser) : { id: 1, nome: "Usuário Teste" }; // Fallback para dev

        // Atualiza UI
        const nomeEl = document.getElementById('user-name-display');
        if(nomeEl) nomeEl.innerText = this.usuario.nome;

        // Data Inicial (Hoje)
        const dateInput = document.getElementById('global-date');
        if (dateInput) {
            dateInput.value = new Date().toISOString().split('T')[0];
        }

        // Inicia na aba padrão
        this.mudarAba('diario');
    },

    atualizarDataGlobal: function() {
        // Quando muda a data lá em cima, recarrega a aba ativa
        const abaAtiva = document.querySelector('.tab-btn.active');
        if (abaAtiva) {
            const id = abaAtiva.id.replace('btn-', '');
            if (id === 'diario' && this.Diario) this.Diario.carregarDadosDoDia();
            // Outras abas podem não depender do dia específico, mas sim do mês da data selecionada
            if (id === 'metas' && this.Metas) this.Metas.carregar();
            if (id === 'comparativo' && this.Comparativo) this.Comparativo.carregar();
        }
    },

    mudarAba: function(abaId) {
        // Esconde todas
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        // Mostra alvo
        const abaAlvo = document.getElementById(`tab-${abaId}`);
        const btnAlvo = document.getElementById(`btn-${abaId}`);
        
        if (abaAlvo) abaAlvo.classList.remove('hidden');
        if (btnAlvo) btnAlvo.classList.add('active');

        // Carrega submódulos
        if (abaId === 'diario' && this.Diario) this.Diario.init();
        if (abaId === 'metas' && this.Metas) this.Metas.init();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.init();
        // Auditoria e Feedback ainda são placeholders
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if(typeof MinhaArea !== 'undefined') MinhaArea.init();
    }, 100);
});