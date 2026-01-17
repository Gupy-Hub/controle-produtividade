// ARQUIVO: js/produtividade/assertividade.js
window.Produtividade = window.Produtividade || {};

Produtividade.Assertividade = {
    init: function() {
        console.log("🛡️ Módulo de Assertividade Iniciado");
    },

    /**
     * Regra de Negócio: Média = (Soma das Notas / Quantidade de Auditorias)
     */
    calcularMedia: function(soma, qtd) {
        if (!qtd || qtd === 0) return 0;
        // Exemplo: 3400 / 37 = 91.8918...
        return (soma / qtd);
    },

    /**
     * Gera o HTML da célula para a tabela do Geral.js
     */
    renderizarCelula: function(auditoria) {
        // auditoria = { qtd: 37, soma: 3400, media: 91.89 } (Vindo do SQL ou calculado aqui)
        
        // Recalcula no Front para garantir a lógica visual
        const qtd = parseInt(auditoria.qtd || 0);
        const soma = parseFloat(auditoria.soma || 0);
        const media = this.calcularMedia(soma, qtd);

        let display = "-";
        let classeCor = "text-slate-300 border-slate-100 bg-slate-50"; 
        let tooltip = "Nenhuma auditoria realizada";

        if (qtd > 0) {
            display = media.toFixed(2).replace('.', ',') + "%";
            tooltip = `Auditorias: ${qtd} | Soma Notas: ${soma} | Média: ${display}`;
            
            // Regras de Cores (SLA)
            if (media >= 98) classeCor = "text-emerald-700 font-bold bg-emerald-50 border-emerald-200";
            else if (media >= 95) classeCor = "text-blue-700 font-bold bg-blue-50 border-blue-200";
            else if (media >= 90) classeCor = "text-amber-700 font-bold bg-amber-50 border-amber-200"; // Ex: 91.89 entra aqui
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