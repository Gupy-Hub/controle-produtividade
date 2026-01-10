const MinhaArea = {
    usuario: null,

    init: async function() {
        console.log("Módulo Minha Área Iniciado");
        
        // 1. Simulação de Login (Substituir por lógica real de Auth)
        // Tenta pegar do localStorage ou usa um mock para dev
        const storedUser = localStorage.getItem('usuario_ativo');
        
        if (storedUser) {
            this.usuario = JSON.parse(storedUser);
        } else {
            // Mock de Fallback (Apenas para desenvolvimento)
            // Em produção, redirecionar para login.html
            // window.location.href = 'login.html'; 
            this.usuario = { id: 1, nome: "Colaborador Teste" }; // Mock ID 1
            console.warn("Usando usuário Mock ID 1");
        }

        // Atualiza UI
        const nomeEl = document.getElementById('user-name-display');
        if(nomeEl) nomeEl.innerText = this.usuario.nome;

        // Inicia na aba Diário
        this.mudarAba('diario');
    },

    mudarAba: function(abaId) {
        // Esconde todas as abas
        document.querySelectorAll('.view-section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        // Mostra aba selecionada
        const abaAlvo = document.getElementById(`ma-tab-${abaId}`);
        const btnAlvo = document.getElementById(`btn-ma-${abaId}`);
        
        if (abaAlvo) abaAlvo.classList.remove('hidden');
        if (btnAlvo) btnAlvo.classList.add('active');

        // Carrega submódulos sob demanda
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