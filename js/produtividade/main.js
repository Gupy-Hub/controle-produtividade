// Garante que o objeto global exista
window.Produtividade = window.Produtividade || {};

Produtividade.Main = {
    init: function() {
        this.setupTabs();
        
        // --- RECUPERA A ÚLTIMA ABA SALVA OU ABRE A PADRÃO ---
        const lastTab = localStorage.getItem('lastActiveTab');
        if (lastTab) {
            // Pequeno delay para garantir que o DOM esteja pronto
            setTimeout(() => this.mudarAba(lastTab), 50);
        } else {
            // Se não tiver histórico, abre a padrão (Geral)
            if(Produtividade.Geral && typeof Produtividade.Geral.init === 'function') {
                Produtividade.Geral.init();
            }
        }
    },

    setupTabs: function() {
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // 1. Gerencia estilo dos botões
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // 2. Gerencia visibilidade das seções
                document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                const targetId = btn.id.replace('btn-', 'tab-');
                const targetEl = document.getElementById(targetId);
                if(targetEl) targetEl.classList.remove('hidden');

                // 3. Gerencia barra de ferramentas superior
                const sectionName = btn.id.replace('btn-', '');
                this.toggleTopBarControls(sectionName);

                // --- SALVA A ABA ATUAL NO NAVEGADOR ---
                localStorage.setItem('lastActiveTab', sectionName);

                // 4. Carrega os dados do módulo
                this.loadModule(sectionName);
            });
        });
    },

    toggleTopBarControls: function(section) {
        const controls = ['geral', 'consolidado', 'performance', 'matriz'];
        
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
    },

    // Função auxiliar para simular o clique e mudar a aba
    mudarAba: function(aba) {
        const btn = document.getElementById(`btn-${aba}`);
        if(btn) btn.click();
    }
};

// Inicializa
document.addEventListener('DOMContentLoaded', () => {
    Produtividade.Main.init();
});

// Expondo globalmente para chamadas HTML e outros scripts
Produtividade.mudarAba = (aba) => Produtividade.Main.mudarAba(aba);

Produtividade.atualizarDataGlobal = function(valor) {
    const activeBtn = document.querySelector('.tab-btn.active');
    if(activeBtn) {
        const section = activeBtn.id.replace('btn-', '');
        Produtividade.Main.loadModule(section);
    }
};