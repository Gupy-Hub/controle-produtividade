// ARQUIVO: js/produtividade/assertividade.js
window.Produtividade = window.Produtividade || {};

Produtividade.Assertividade = {
    init: function() {
        console.log("🛡️ Módulo de Assertividade Iniciado");
    },

    /**
     * Lógica validada: Soma das Notas / Quantidade
     * Ex: 3400 / 37 = 91.89%
     */
    calcularMedia: function(soma, qtd) {
        if (!qtd || qtd <= 0) return 0;
        return (soma / qtd);
    },

    /**
     * Renderiza o badge colorido na tabela
     */
    renderizarCelula: function(auditoria) {
        const qtd = parseInt(auditoria.qtd || 0);
        const soma = parseFloat(auditoria.soma || 0);
        
        let display = "-";
        let classeCor = "text-slate-300 border-slate-100 bg-slate-50"; 
        let tooltip = "Nenhuma auditoria realizada";

        if (qtd > 0) {
            const media = this.calcularMedia(soma, qtd);
            
            // Formata para o padrão brasileiro: "91,89%"
            display = media.toFixed(2).replace('.', ',') + "%";
            tooltip = `Auditorias: ${qtd} | Soma: ${soma} | Média: ${display}`;
            
            // Regras de Cores (SLA)
            if (media >= 98) classeCor = "text-emerald-700 font-bold bg-emerald-50 border-emerald-200";
            else if (media >= 95) classeCor = "text-blue-700 font-bold bg-blue-50 border-blue-200";
            else if (media >= 90) classeCor = "text-amber-700 font-bold bg-amber-50 border-amber-200";
            else classeCor = "text-rose-700 font-bold bg-rose-50 border-rose-200";
        }

        return `
            <div class="inline-block px-2 py-1 rounded border ${classeCor} shadow-sm cursor-help select-none" title="${tooltip}">
                ${display}
            </div>
        `;
    }
};

Produtividade.Assertividade.init();