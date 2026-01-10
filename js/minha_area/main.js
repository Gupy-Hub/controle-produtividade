const MinhaArea = {
    usuario: null, // Guarda os dados do usuário logado

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // 1. Verificar Login (Simulação de Segurança)
        const storedUser = localStorage.getItem('usuario_ativo'); // Assumindo que o Login salva isso
        // SE NÃO TIVER LOGIN, REDIRECIONA (Comentado para dev, descomentar em prod)
        // if (!storedUser) { window.location.href = 'index.html'; return; }
        
        // Simulando usuário se não tiver (apenas para teste, remover em prod)
        this.usuario = storedUser ? JSON.parse(storedUser) : { id: 1, nome: "Usuário Teste" }; 
        
        // Atualiza UI
        const nomeDisplay = document.getElementById('user-name-display');
        if(nomeDisplay) nomeDisplay.innerText = this.usuario.nome;

        // Inicia a aba padrão
        this.mudarAba('diario');
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

        // Carrega dados específicos
        if (abaId === 'diario' && this.Diario) this.Diario.init();
        if (abaId === 'evolucao' && this.Evolucao) this.Evolucao.init();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.init();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if(typeof MinhaArea !== 'undefined') MinhaArea.init();
    }, 100);
});