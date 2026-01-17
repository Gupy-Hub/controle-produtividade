/**
 * ARQUIVO: js/produtividade/filtros.js
 * FUNÇÃO: Gestão de filtros dinâmicos da aba Produtividade
 */
window.Produtividade = window.Produtividade || {};

Produtividade.Filtros = {
    estado: {
        nome: '',
        funcao: 'todos',
        contrato: 'todos'
    },

    init: function() {
        console.log("🔍 [NEXUS] Engine de Filtros de Produtividade Ativada");
    },

    /**
     * Captura os valores da UI e dispara a re-renderização
     */
    aplicar: function() {
        try {
            this.estado.nome = document.getElementById('filtro-nome-prod')?.value.toLowerCase().trim() || '';
            this.estado.funcao = document.getElementById('filtro-funcao-prod')?.value || 'todos';
            this.estado.contrato = document.getElementById('filtro-contrato-prod')?.value || 'todos';

            this.executarFiltragem();
        } catch (err) {
            console.error("[NEXUS] Erro ao aplicar filtros:", err);
        }
    },

    /**
     * Filtra os dados originais sem disparar nova query ao Supabase (performance)
     */
    executarFiltragem: function() {
        if (!Produtividade.Geral || !Produtividade.Geral.dadosOriginais) return;

        const dadosFiltrados = Produtividade.Geral.dadosOriginais.filter(item => {
            const matchNome = item.usuario.nome.toLowerCase().includes(this.estado.nome);
            
            const funcaoItem = (item.usuario.funcao || 'ASSISTENTE').toUpperCase();
            const matchFuncao = this.estado.funcao === 'todos' || funcaoItem === this.estado.funcao;
            
            const contratoItem = (item.usuario.contrato || 'PJ').toUpperCase();
            const matchContrato = this.estado.contrato === 'todos' || contratoItem === this.estado.contrato;

            return matchNome && matchFuncao && matchContrato;
        });

        // Atualiza a tabela e os KPIs com o novo subset de dados
        this.renderizarResultados(dadosFiltrados);
    },

    renderizarResultados: function(lista) {
        // Injetamos a lista filtrada no renderizador oficial do módulo Geral
        // Para isso, precisamos que o renderizarTabela aceite um parâmetro opcional
        if (typeof Produtividade.Geral.renderizarTabela === 'function') {
            // Pequena modificação necessária no Geral.js para aceitar lista externa
            this.renderizarOverride(lista);
            Produtividade.Geral.atualizarKPIsGlobal(lista, this.estado.nome !== '' || this.estado.funcao !== 'todos');
        }
    },

    /**
     * Override temporário para não quebrar o fluxo do Geral.js enquanto ele não é atualizado
     */
    renderizarOverride: function(lista) {
        const tbody = document.getElementById('tabela-corpo');
        if (!tbody) return;

        if (lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center py-12 text-slate-400 italic">Nenhum assistente encontrado com os filtros aplicados.</td></tr>';
            document.getElementById('total-registros-footer').innerText = '0';
            return;
        }

        // Reutiliza a lógica de renderização original do Produtividade.Geral
        // Mas passando apenas a lista filtrada
        const originalDados = Produtividade.Geral.dadosOriginais;
        Produtividade.Geral.dadosOriginais = lista; // Swap temporário
        Produtividade.Geral.renderizarTabela();
        Produtividade.Geral.dadosOriginais = originalDados; // Restaura original
    }
};

// Inicialização segura
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => Produtividade.Filtros.init(), 200);
});