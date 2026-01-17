// ARQUIVO: js/produtividade/assertividade.js
window.Produtividade = window.Produtividade || {};

Produtividade.Assertividade = {
    init: function() {
        console.log("🛡️ Módulo de Assertividade Iniciado");
    },

    calcularMedia: function(soma, qtd) {
        if (!qtd || qtd <= 0) return 0;
        return (soma / qtd);
    },

    /**
     * Renderiza o badge com lógica Binária (Verde/Vermelho)
     * @param {Object} auditoria - Objeto com qtd e soma
     * @param {Number} metaAlvo - Meta definida no cadastro (Ex: 98)
     */
    renderizarCelula: function(auditoria, metaAlvo) {
        const qtd = parseInt(auditoria.qtd || 0);
        const soma = parseFloat(auditoria.soma || 0);
        const meta = parseFloat(metaAlvo || 95); // Default 95 se não tiver meta
        
        let display = "-";
        // Padrão (Sem dados)
        let classeCor = "text-slate-300 border-slate-100 bg-slate-50"; 
        let tooltip = "Nenhuma auditoria realizada";

        if (qtd > 0) {
            const media = this.calcularMedia(soma, qtd);
            
            display = media.toFixed(2).replace('.', ',') + "%";
            tooltip = `Média: ${display} | Meta: ${meta}% | Auditorias: ${qtd}`;
            
            // LÓGICA BINÁRIA: BATEU A META?
            if (media >= meta) {
                // VERDE (Sucesso)
                classeCor = "text-emerald-700 font-bold bg-emerald-50 border-emerald-200";
            } else {
                // VERMELHO (Falha)
                classeCor = "text-rose-700 font-bold bg-rose-50 border-rose-200";
            }
        }

        return `
            <div class="inline-block px-2 py-1 rounded border ${classeCor} shadow-sm cursor-help select-none" title="${tooltip}">
                ${display}
            </div>
        `;
    }
};

Produtividade.Assertividade.init();