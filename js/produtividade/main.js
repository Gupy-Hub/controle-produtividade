Produtividade.Main = {
    init: function() {
        this.setupTabs();
        // Inicia na aba padrão (Geral/Validação)
        if(Produtividade.Geral && Produtividade.Geral.init) {
            Produtividade.Geral.init();
        }
    },

    setupTabs: function() {
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove active de todos
                btns.forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                
                // Ativa o clicado
                const targetId = btn.id.replace('btn-', 'tab-');
                const targetEl = document.getElementById(targetId);
                const sectionName = btn.id.replace('btn-', '');

                btn.classList.add('active');
                if(targetEl) targetEl.classList.remove('hidden');

                // Gerencia a barra de ferramentas superior
                this.toggleTopBarControls(sectionName);

                // Inicializa o módulo correspondente se necessário
                this.loadModule(sectionName);
            });
        });
    },

    toggleTopBarControls: function(section) {
        const controls = ['geral', 'consolidado', 'performance'];
        controls.forEach(c => {
            const el = document.getElementById(`ctrl-${c}`);
            if(el) {
                if(c === section) el.classList.remove('hidden');
                else el.classList.add('hidden');
            }
        });
    },

    loadModule: function(section) {
        switch(section) {
            case 'geral':
                if(Produtividade.Geral) Produtividade.Geral.init();
                break;
            case 'consolidado':
                if(Produtividade.Consolidado) Produtividade.Consolidado.init();
                break;
            case 'performance':
                if(Produtividade.Performance) Produtividade.Performance.carregarRanking();
                break;
            case 'matriz':
                if(Produtividade.Matriz) Produtividade.Matriz.carregarMatriz();
                break;
        }
    }
};

// Inicializa o Main quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    Produtividade.Main.init();
});

// Funções globais de apoio (Atalhos)
Produtividade.mudarAba = function(aba) {
    const btn = document.getElementById(`btn-${aba}`);
    if(btn) btn.click();
};

Produtividade.atualizarDataGlobal = function(valor) {
    // Recarrega o módulo ativo
    const activeBtn = document.querySelector('.tab-btn.active');
    if(activeBtn) {
        const section = activeBtn.id.replace('btn-', '');
        Produtividade.Main.loadModule(section);
    }
};