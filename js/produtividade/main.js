// Garante que o objeto global exista
window.Produtividade = window.Produtividade || {};

Produtividade.Main = {
    init: function() {
        // 1. Recupera e aplica a DATA salva
        const lastDate = localStorage.getItem('lastGlobalDate');
        if (lastDate) {
            document.getElementById('global-date').value = lastDate;
        } else {
            document.getElementById('global-date').value = new Date().toISOString().split('T')[0];
        }

        this.setupTabs();
        
        // 2. Recupera a última ABA salva
        const lastTab = localStorage.getItem('lastActiveTab');
        if (lastTab) {
            setTimeout(() => this.mudarAba(lastTab), 50);
        } else {
            // Padrão: Geral
            if(Produtividade.Geral && typeof Produtividade.Geral.init === 'function') {
                Produtividade.Geral.init();
            }
        }
    },

    setupTabs: function() {
        const btns = document.querySelectorAll('.tab-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                btns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                document.querySelectorAll('.view-section').forEach(s => s.classList.add('hidden'));
                const targetId = btn.id.replace('btn-', 'tab-');
                const targetEl = document.getElementById(targetId);
                if(targetEl) targetEl.classList.remove('hidden');

                const sectionName = btn.id.replace('btn-', '');
                this.toggleTopBarControls(sectionName);

                // Salva a aba
                localStorage.setItem('lastActiveTab', sectionName);

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
                if(Produtividade.Performance) {
                    // Inicializa garantindo que o seletor esteja correto
                    Produtividade.Performance.togglePeriodo();
                }
                break;
            case 'matriz':
                if(Produtividade.Matriz) Produtividade.Matriz.carregarMatriz();
                break;
        }
    },

    mudarAba: function(aba) {
        const btn = document.getElementById(`btn-${aba}`);
        if(btn) btn.click();
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Produtividade.Main.init();
});

// Atalhos Globais
Produtividade.mudarAba = (aba) => Produtividade.Main.mudarAba(aba);

Produtividade.atualizarDataGlobal = function(valor) {
    // SALVA A DATA NO NAVEGADOR
    localStorage.setItem('lastGlobalDate', valor);

    const activeBtn = document.querySelector('.tab-btn.active');
    if(activeBtn) {
        const section = activeBtn.id.replace('btn-', '');
        Produtividade.Main.loadModule(section);
    }
};