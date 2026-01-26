// ARQUIVO: js/minha_area/assertividade.js
MinhaArea.Assertividade = {
    carregar: async function() {
        const periodo = MinhaArea.getPeriodo();
        const display = document.getElementById('assert-meta-display');
        
        if(!display) return;

        display.innerHTML = '<i class="fas fa-spinner fa-spin text-xs"></i>';

        try {
            if (!window.AssertividadeService) {
                throw new Error("Service não carregado");
            }

            // Usa a função centralizada para buscar a meta
            const metaValor = await window.AssertividadeService.buscarMetaVigente(periodo.fim);
            
            display.innerText = metaValor + "%";
            
        } catch (e) {
            console.warn("Erro ao buscar meta via Service:", e);
            display.innerText = "98%"; // Fallback seguro
        }
    }
};