// ARQUIVO: js/produtividade/assertividade.js
window.Produtividade = window.Produtividade || {};

Produtividade.Assertividade = {
    init: function() {
        console.log("🛡️ Módulo de Assertividade Iniciado");
    },

    /**
     * Renderiza a célula da tabela com a Nota Média e a Quantidade de Auditorias.
     * @param {Object} auditoria - Objeto { qtd: 10, soma: 980 }
     * @param {Number} metaAlvo - Meta de assertividade (ex: 98.00)
     */
    renderizarCelula: function(auditoria, metaAlvo) {
        // Garante que os números sejam números
        const qtd = Number(auditoria?.qtd || 0);
        const soma = Number(auditoria?.soma || 0);
        const meta = Number(metaAlvo || 98);

        // 1. Se não tem auditoria, mostra traço discreto
        if (qtd === 0) {
            return '<div class="text-center text-slate-300 font-mono text-xs">-</div>';
        }

        // 2. Cálculo da Média
        const media = soma / qtd;
        const atingiu = media >= meta;

        // 3. Definição de Cores e Ícones
        // Verde (Emerald) se atingiu, Vermelho (Rose) se não
        const corTexto = atingiu ? 'text-emerald-700' : 'text-rose-700';
        const bgCor = atingiu ? 'bg-emerald-50' : 'bg-rose-50';
        const borda = atingiu ? 'border-emerald-100' : 'border-rose-100';
        const icone = atingiu ? '<i class="fas fa-check-circle"></i>' : '<i class="fas fa-exclamation-circle"></i>';

        // 4. Retorno do HTML (Visual Card Compacto)
        return `
            <div class="flex flex-col items-center justify-center py-1 px-2 rounded-lg ${bgCor} border ${borda} transition group cursor-help w-full" 
                 title="Média: ${media.toFixed(2)}% | Meta: ${meta}% | Total: ${qtd} Auditorias">
                
                <div class="flex items-center gap-1.5 ${corTexto} font-bold text-xs">
                    ${icone}
                    <span>${media.toFixed(2)}%</span>
                </div>
                
                <span class="text-[9px] text-slate-400 font-semibold uppercase tracking-wide group-hover:text-slate-600 transition-colors mt-0.5">
                    ${qtd} ${qtd === 1 ? 'Aud' : 'Auds'}
                </span>
            </div>
        `;
    }
};

// Inicializa
Produtividade.Assertividade.init();