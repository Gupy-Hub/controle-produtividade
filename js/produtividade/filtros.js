/**
 * ARQUIVO: js/produtividade/filtros.js
 * FUNÇÃO: Orquestrador de Filtros Contextuais (HUD)
 * VERSÃO: 3.0 - Visibilidade Dinâmica
 */
window.Produtividade = window.Produtividade || {};

Produtividade.Filtros = {
    abaAtiva: 'geral',
    estado: { nome: '', funcao: 'todos', contrato: 'todos' },

    // CONFIGURAÇÃO: Define quais filtros aparecem em cada aba
    // Opções: 'nome', 'funcao', 'contrato'
    configVisibilidade: {
        'geral':       ['nome', 'funcao', 'contrato'], // Validação precisa de tudo
        'consolidado': ['nome', 'funcao', 'contrato'], // Análise financeira precisa de contrato
        'performance': ['nome', 'funcao'],             // Gráficos: contrato é menos relevante
        'matriz':      ['nome', 'funcao']              // Grade: prioriza espaço horizontal
    },

    init: function() {
        console.log("🔍 [NEXUS] Engine de Filtros Dinâmicos Iniciada");
        this.configurarInterceptadorDeAbas();
        
        // Ajuste inicial
        setTimeout(() => {
            this.abaAtiva = this.detectarAbaInicial();
            this.ajustarVisibilidade(this.abaAtiva);
            this.aplicar();
        }, 500);
    },

    detectarAbaInicial: function() {
        // Tenta descobrir qual aba está aberta olhando as classes 'hidden'
        if (!document.getElementById('tab-geral').classList.contains('hidden')) return 'geral';
        if (!document.getElementById('tab-consolidado').classList.contains('hidden')) return 'consolidado';
        if (!document.getElementById('tab-performance').classList.contains('hidden')) return 'performance';
        if (!document.getElementById('tab-matriz').classList.contains('hidden')) return 'matriz';
        return 'geral';
    },

    configurarInterceptadorDeAbas: function() {
        const funcaoOriginal = Produtividade.mudarAba;
        
        Produtividade.mudarAba = function(abaId) {
            // 1. Executa a troca original
            funcaoOriginal(abaId);
            
            // 2. Atualiza estado interno
            Produtividade.Filtros.abaAtiva = abaId;
            
            // 3. Ajusta a UI (Esconde/Mostra filtros)
            Produtividade.Filtros.ajustarVisibilidade(abaId);

            // 4. Reaplica a lógica de dados
            Produtividade.Filtros.aplicar();
        };
    },

    /**
     * Controla quais elementos HTML aparecem na tela
     */
    ajustarVisibilidade: function(abaId) {
        const container = document.getElementById('container-filtros-hud');
        if (!container) return;

        // Se não houver configuração para a aba, esconde o container inteiro
        const configs = this.configVisibilidade[abaId];
        if (!configs) {
            container.classList.add('hidden');
            return;
        }

        // Mostra o container principal
        container.classList.remove('hidden');

        // Mapa de elementos DOM
        const elementos = {
            'nome': document.getElementById('wrap-filtro-nome'),
            'funcao': document.getElementById('wrap-filtro-funcao'),
            'contrato': document.getElementById('wrap-filtro-contrato')
        };

        // Itera sobre os filtros possíveis e aplica a visibilidade
        Object.keys(elementos).forEach(chave => {
            const el = elementos[chave];
            if (el) {
                if (configs.includes(chave)) {
                    el.classList.remove('hidden');
                    el.classList.add('block'); // Garante display
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('block');
                    
                    // Reset opcional: se esconder, reseta o valor para não filtrar invisível?
                    // Por enquanto, mantemos o estado (user pode querer filtrar e mudar de aba)
                    // Mas visualmente ele some.
                }
            }
        });
        
        console.log(`👁️ [VISIBILIDADE] Ajustado para aba: ${abaId}`, configs);
    },

    aplicar: function() {
        try {
            this.estado.nome = document.getElementById('filtro-nome-prod')?.value.toLowerCase().trim() || '';
            this.estado.funcao = document.getElementById('filtro-funcao-prod')?.value || 'todos';
            this.estado.contrato = document.getElementById('filtro-contrato-prod')?.value || 'todos';

            switch (this.abaAtiva) {
                case 'geral': this.filtrarGeral(); break;
                case 'consolidado': this.filtrarConsolidado(); break;
                case 'performance': this.filtrarPerformance(); break;
                case 'matriz': this.filtrarMatriz(); break;
            }
        } catch (err) {
            console.error("[NEXUS] Erro no Filtro:", err);
        }
    },

    // --- ESTRATÉGIAS DE DADOS (Mantidas da versão anterior) ---

    filtrarGeral: function() {
        if (!Produtividade.Geral || !Produtividade.Geral.dadosOriginais) return;
        const filtrados = this.executarLogica(Produtividade.Geral.dadosOriginais);
        
        const bkp = Produtividade.Geral.dadosOriginais;
        if (typeof Produtividade.Geral.renderizarTabela === 'function') {
            Produtividade.Geral.dadosOriginais = filtrados;
            Produtividade.Geral.renderizarTabela(); 
            Produtividade.Geral.dadosOriginais = bkp;
            Produtividade.Geral.atualizarKPIsGlobal(filtrados, this.temFiltroAtivo());
        }
    },

    filtrarConsolidado: function() {
        if (!Produtividade.Consolidado) return;
        if (!Produtividade.Consolidado.dadosBackup && Produtividade.Consolidado.dados?.length) {
            Produtividade.Consolidado.dadosBackup = [...Produtividade.Consolidado.dados];
        }
        if (!Produtividade.Consolidado.dadosBackup) return;

        const filtrados = this.executarLogica(Produtividade.Consolidado.dadosBackup);
        if (typeof Produtividade.Consolidado.renderizarTabela === 'function') {
            Produtividade.Consolidado.dados = filtrados;
            Produtividade.Consolidado.renderizarTabela();
        }
    },

    filtrarPerformance: function() {
        if (!Produtividade.Performance) return;
        if (!Produtividade.Performance.dadosBackup && Produtividade.Performance.dadosGlobais?.length) {
            Produtividade.Performance.dadosBackup = [...Produtividade.Performance.dadosGlobais];
        }
        if (!Produtividade.Performance.dadosBackup) return;

        const filtrados = this.executarLogica(Produtividade.Performance.dadosBackup);
        if (typeof Produtividade.Performance.processarDados === 'function') {
            Produtividade.Performance.dadosGlobais = filtrados;
            Produtividade.Performance.renderizarDashboard(filtrados);
        }
    },

    filtrarMatriz: function() {
        if (!Produtividade.Matriz) return;
        if (!Produtividade.Matriz.dadosBackup && Produtividade.Matriz.dados?.length) {
            Produtividade.Matriz.dadosBackup = [...Produtividade.Matriz.dados];
        }
        if (!Produtividade.Matriz.dadosBackup) return;

        const filtrados = this.executarLogica(Produtividade.Matriz.dadosBackup);
        if (typeof Produtividade.Matriz.renderizarGrade === 'function') {
            Produtividade.Matriz.dados = filtrados;
            Produtividade.Matriz.renderizarGrade();
        }
    },

    executarLogica: function(lista) {
        if (!lista) return [];
        return lista.filter(item => {
            let u = item.usuario || item;
            if (!u.nome && item.nome) u = item;

            const nome = (u.nome || '').toLowerCase();
            const funcao = (u.funcao || 'ASSISTENTE').toUpperCase();
            const contrato = (u.contrato || 'PJ').toUpperCase();

            // Só aplica o filtro se o elemento estiver VISÍVEL na aba atual
            // Isso evita que um filtro "Contrato" escondido afete a "Matriz" inadvertidamente
            const cfg = this.configVisibilidade[this.abaAtiva] || [];
            
            const matchNome = !cfg.includes('nome') || nome.includes(this.estado.nome);
            const matchFuncao = !cfg.includes('funcao') || this.estado.funcao === 'todos' || funcao === this.estado.funcao;
            const matchContrato = !cfg.includes('contrato') || this.estado.contrato === 'todos' || contrato === this.estado.contrato;

            return matchNome && matchFuncao && matchContrato;
        });
    },

    temFiltroAtivo: function() {
        return this.estado.nome !== '' || this.estado.funcao !== 'todos' || this.estado.contrato !== 'todos';
    }
};

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => Produtividade.Filtros.init(), 300);
});