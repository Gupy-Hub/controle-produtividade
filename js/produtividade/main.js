// Garante que o objeto global exista
window.Produtividade = window.Produtividade || {};

Produtividade.Main = {
    init: function() {
        this.setupTabs();
        
        // --- LÓGICA DE PERSISTÊNCIA ---
        // 1. Verifica se existe uma aba salva no navegador
        const lastTab = localStorage.getItem('lastActiveTab');
        
        if (lastTab) {
            // Se existir, abre ela (com um pequeno delay para garantir que o HTML carregou)
            setTimeout(() => this.mudarAba(lastTab), 50);
        } else {
            // Se não tiver histórico, abre a aba padrão 'geral'
            if(Produtividade.Geral && typeof Produtividade.Geral.init === 'function') {
                Produtividade.Geral.init();
            }
        }
    },

    setupTabs: function() {
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Remove classe ativa de todos
                btns.forEach(b => b.classList.remove('active'));
                // Adiciona classe ativa no clicado
                btn.classList.add('active');

                // Esconde todas as seções
                document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                
                // Mostra a seção correspondente
                const targetId = btn.id.replace('btn-', 'tab-');
                const targetEl = document.getElementById(targetId);
                if(targetEl) targetEl.classList.remove('hidden');

                // Pega o nome da aba (ex: 'geral', 'consolidado')
                const sectionName = btn.id.replace('btn-', '');
                
                // Gerencia os botões do topo (filtros específicos)
                this.toggleTopBarControls(sectionName);

                // --- SALVA A ESCOLHA NO NAVEGADOR ---
                localStorage.setItem('lastActiveTab', sectionName);

                // Carrega o módulo específico
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

    // Função auxiliar pública para trocar de aba
    mudarAba: function(aba) {
        const btn = document.getElementById(`btn-${aba}`);
        if(btn) btn.click();
    }
};

// Inicializa quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    Produtividade.Main.init();
});

// Atalhos globais
Produtividade.mudarAba = (aba) => Produtividade.Main.mudarAba(aba);

Produtividade.atualizarDataGlobal = function(valor) {
    // Recarrega o módulo atual quando muda a data
    const activeBtn = document.querySelector('.tab-btn.active');
    if(activeBtn) {
        const section = activeBtn.id.replace('btn-', '');
        Produtividade.Main.loadModule(section);
    }
};