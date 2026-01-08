// Garante que o objeto global exista
window.Produtividade = window.Produtividade || {};

Produtividade.Main = {
    init: function() {
        this.setupTabs();
        
        // Define o comportamento inicial (Carrega a aba Geral/Validação)
        if(Produtividade.Geral && typeof Produtividade.Geral.init === 'function') {
            Produtividade.Geral.init();
        }
    },

    setupTabs: function() {
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // 1. Gerencia estilo dos botões (Active/Inactive)
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                // 2. Gerencia visibilidade das seções (Conteúdo)
                document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                const targetId = btn.id.replace('btn-', 'tab-');
                const targetEl = document.getElementById(targetId);
                if(targetEl) targetEl.classList.remove('hidden');

                // 3. Gerencia barra de ferramentas superior (Controles específicos)
                const sectionName = btn.id.replace('btn-', '');
                this.toggleTopBarControls(sectionName);

                // 4. Carrega os dados do módulo selecionado
                this.loadModule(sectionName);
            });
        });
    },

    toggleTopBarControls: function(section) {
        // Lista de IDs de controles na barra superior
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
        // Chama a função de inicialização específica de cada módulo
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

// Inicializa o sistema quando o navegador terminar de carregar o HTML
document.addEventListener('DOMContentLoaded', () => {
    Produtividade.Main.init();
});

// --- FUNÇÕES GLOBAIS DE APOIO (Chamadas pelo HTML) ---

// Permite trocar de aba via código (ex: botões de link)
Produtividade.mudarAba = function(aba) {
    const btn = document.getElementById(`btn-${aba}`);
    if(btn) btn.click();
};

// Quando o usuário muda a data no topo, recarrega o módulo que está aberto
Produtividade.atualizarDataGlobal = function(valor) {
    const activeBtn = document.querySelector('.tab-btn.active');
    if(activeBtn) {
        const section = activeBtn.id.replace('btn-', '');
        Produtividade.Main.loadModule(section);
    }
};