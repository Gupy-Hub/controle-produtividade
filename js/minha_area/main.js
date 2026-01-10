const MinhaArea = {
    usuario: null,

    init: async function() {
        console.log("Minha Área Iniciada");
        
        // Simulação de Login (Substitua por Auth real)
        const storedUser = localStorage.getItem('usuario_ativo');
        this.usuario = storedUser ? JSON.parse(storedUser) : { id: 1, nome: "Usuário Teste" };

        const nomeEl = document.getElementById('user-name-display');
        if(nomeEl) nomeEl.innerText = this.usuario.nome;

        this.mudarAba('diario');
    },

    mudarAba: function(abaId) {
        document.querySelectorAll('.ma-view').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        const aba = document.getElementById(`ma-tab-${abaId}`);
        const btn = document.getElementById(`btn-ma-${abaId}`);
        
        if(aba) aba.classList.remove('hidden');
        if(btn) btn.classList.add('active');

        if (abaId === 'diario' && this.Diario) this.Diario.init();
        if (abaId === 'metas' && this.Metas) this.Metas.init();
        if (abaId === 'comparativo' && this.Comparativo) this.Comparativo.init();
        if (abaId === 'auditoria' && this.Auditoria) this.Auditoria.init();
        if (abaId === 'feedback' && this.Feedback) this.Feedback.init();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => { if(typeof MinhaArea !== 'undefined') MinhaArea.init(); }, 100);
});