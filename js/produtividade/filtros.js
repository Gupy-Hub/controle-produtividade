/**
 * ARQUIVO: js/produtividade/filtros.js
 * FUNÇÃO: Orquestrador de Filtros Contextuais (HUD)
 * VERSÃO: 2.0 - Multi-Contexto
 */
window.Produtividade = window.Produtividade || {};

Produtividade.Filtros = {
    abaAtiva: 'geral', // Estado inicial padrão
    estado: {
        nome: '',
        funcao: 'todos',
        contrato: 'todos'
    },

    init: function() {
        console.log("🔍 [NEXUS] Engine de Filtros Dinâmicos Iniciada");
        this.configurarInterceptadorDeAbas();
        
        // Aplica filtros iniciais caso existam
        setTimeout(() => this.aplicar(), 500);
    },

    /**
     * Intercepta a mudança de abas para atualizar o contexto do filtro
     */
    configurarInterceptadorDeAbas: function() {
        const funcaoOriginal = Produtividade.mudarAba;
        
        Produtividade.mudarAba = function(abaId) {
            // 1. Executa a troca de aba original
            funcaoOriginal(abaId);
            
            // 2. Atualiza o contexto do filtro
            Produtividade.Filtros.abaAtiva = abaId;
            console.log(`🔄 [FILTRO] Contexto alterado para: ${abaId}`);
            
            // 3. Reaplica os filtros vigentes na nova aba
            Produtividade.Filtros.aplicar();
        };
    },

    /**
     * Captura inputs da UI e direciona para a estratégia correta
     */
    aplicar: function() {
        try {
            // Captura valores do DOM
            this.estado.nome = document.getElementById('filtro-nome-prod')?.value.toLowerCase().trim() || '';
            this.estado.funcao = document.getElementById('filtro-funcao-prod')?.value || 'todos';
            this.estado.contrato = document.getElementById('filtro-contrato-prod')?.value || 'todos';

            // Roteamento de Estratégia (Router)
            switch (this.abaAtiva) {
                case 'geral':
                    this.filtrarGeral();
                    break;
                case 'consolidado':
                    this.filtrarConsolidado();
                    break;
                case 'performance':
                    this.filtrarPerformance();
                    break;
                case 'matriz':
                    this.filtrarMatriz();
                    break;
                default:
                    console.warn(`[FILTRO] Nenhuma estratégia definida para a aba: ${this.abaAtiva}`);
            }
        } catch (err) {
            console.error("[NEXUS] Erro Crítico no Filtro:", err);
        }
    },

    // =========================================================================
    // ESTRATÉGIAS DE FILTRAGEM (Context Strategies)
    // =========================================================================

    /**
     * Lógica para aba GERAL (Validação)
     */
    filtrarGeral: function() {
        if (!Produtividade.Geral || !Produtividade.Geral.dadosOriginais) return;

        const filtrados = this.executarLogicaDeFiltragem(Produtividade.Geral.dadosOriginais);

        // Injeção de dependência temporária para renderização
        const originalDados = Produtividade.Geral.dadosOriginais;
        
        // Renderiza
        if (typeof Produtividade.Geral.renderizarTabela === 'function') {
            // Swap seguro: trocamos a referência, renderizamos e destrocamos
            Produtividade.Geral.dadosOriginais = filtrados;
            Produtividade.Geral.renderizarTabela(); 
            Produtividade.Geral.dadosOriginais = originalDados; // Restaura backup
            
            // Atualiza KPIs globais com base no subset
            Produtividade.Geral.atualizarKPIsGlobal(filtrados, this.filtrosAtivos());
        }
    },

    /**
     * Lógica para aba CONSOLIDADO
     */
    filtrarConsolidado: function() {
        if (!Produtividade.Consolidado) return;

        // Backup: Salva os dados originais na primeira execução
        if (!Produtividade.Consolidado.dadosBackup) {
            if (!Produtividade.Consolidado.dados || Produtividade.Consolidado.dados.length === 0) return;
            Produtividade.Consolidado.dadosBackup = [...Produtividade.Consolidado.dados];
        }

        const filtrados = this.executarLogicaDeFiltragem(Produtividade.Consolidado.dadosBackup);

        // Renderiza Consolidado
        if (typeof Produtividade.Consolidado.renderizarTabela === 'function') {
            Produtividade.Consolidado.dados = filtrados;
            Produtividade.Consolidado.renderizarTabela();
            // Restaura o original para a memória (opcional, dependendo de como o render funciona)
            // Mas no consolidado, geralmente sobrescrevemos 'dados' para a renderização funcionar
        }
    },

    /**
     * Lógica para aba PERFORMANCE (Gráficos e Listas)
     */
    filtrarPerformance: function() {
        if (!Produtividade.Performance) return;

        // Backup
        if (!Produtividade.Performance.dadosBackup) {
            if (!Produtividade.Performance.dadosGlobais || Produtividade.Performance.dadosGlobais.length === 0) return;
            Produtividade.Performance.dadosBackup = [...Produtividade.Performance.dadosGlobais];
        }

        const filtrados = this.executarLogicaDeFiltragem(Produtividade.Performance.dadosBackup);

        // Atualiza Performance
        if (typeof Produtividade.Performance.processarDados === 'function') {
            // Performance geralmente processa e renderiza no mesmo fluxo
            Produtividade.Performance.dadosGlobais = filtrados;
            Produtividade.Performance.renderizarDashboard(filtrados);
            // Nota: Se houver "drill-down" (clique no gráfico), ele deve respeitar esse subset
        }
    },

    /**
     * Lógica para aba MATRIZ
     */
    filtrarMatriz: function() {
        if (!Produtividade.Matriz) return;

        // Backup
        if (!Produtividade.Matriz.dadosBackup) {
            if (!Produtividade.Matriz.dados || Produtividade.Matriz.dados.length === 0) return;
            Produtividade.Matriz.dadosBackup = [...Produtividade.Matriz.dados];
        }

        const filtrados = this.executarLogicaDeFiltragem(Produtividade.Matriz.dadosBackup);

        // Renderiza Matriz
        if (typeof Produtividade.Matriz.renderizarGrade === 'function') {
            Produtividade.Matriz.dados = filtrados;
            Produtividade.Matriz.renderizarGrade();
        }
    },

    // =========================================================================
    // NÚCLEO LÓGICO (Core Logic)
    // =========================================================================

    /**
     * Aplica as regras de negócio (Nome, Função, Contrato) em uma lista genérica
     * Assumes que cada item da lista tem uma propriedade `usuario` ou é o próprio usuário
     */
    executarLogicaDeFiltragem: function(lista) {
        if (!lista) return [];

        return lista.filter(item => {
            // Normalização: Às vezes o dado está em item.usuario, às vezes no próprio item root
            // Tenta detectar onde estão os metadados do usuário
            let userObj = item.usuario || item;
            
            // Caso especial: Matriz ou Consolidado podem ter estrutura diferente
            // Se não achar 'nome' direto, tenta buscar em propriedades comuns
            if (!userObj.nome && item.nome) userObj = item;

            const nome = (userObj.nome || '').toLowerCase();
            const funcao = (userObj.funcao || 'ASSISTENTE').toUpperCase();
            const contrato = (userObj.contrato || 'PJ').toUpperCase();

            const matchNome = nome.includes(this.estado.nome);
            const matchFuncao = this.estado.funcao === 'todos' || funcao === this.estado.funcao;
            const matchContrato = this.estado.contrato === 'todos' || contrato === this.estado.contrato;

            return matchNome && matchFuncao && matchContrato;
        });
    },

    /**
     * Helper para saber se há filtros ativos além do padrão
     */
    filtrosAtivos: function() {
        return this.estado.nome !== '' || this.estado.funcao !== 'todos' || this.estado.contrato !== 'todos';
    }
};

// Inicialização segura após o carregamento do DOM
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => Produtividade.Filtros.init(), 300); // Delay leve para garantir que outros scripts carregaram
});